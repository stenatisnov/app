import { data } from "react-router";
import type { Route } from "./+types/admin.stats-csv";
import { getPrisma } from "@/lib/db.server";
import { fetchOpensInRange } from "@/lib/stats-source";
import { countsEntry, entriesPerOpen } from "@/lib/stats";
import { parseStatsFilter } from "@/lib/stats-filter";
import { formatAppDateTime } from "@/lib/time";
import { isAdminRole } from "@/lib/roles";
import { getSessionUser } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const user = await getSessionUser(request);
    if (!user || !isAdminRole(user.role)) {
      return data({ error: "FORBIDDEN" }, { status: 403 });
    }

    // The same filter the page runs on, parsed from the same query string — the
    // link carries the page's current filter, so the file always holds the
    // period the charts are showing. Without parameters it is the page's own
    // default: the current year.
    const filter = parseStatsFilter(new URL(request.url).searchParams);

    const prisma = await getPrisma();
    // Same source as the statistics page (`src/lib/stats-source.ts`) so the two
    // can't disagree about what counts as an entry — and, on the database
    // branches, so the export survives the log cleanup too.
    const rows = await fetchOpensInRange(prisma, filter);

    // Same rule as the page the export sits on (`countsEntry`): member entries
    // that were paid for, so the file sums to the totals the charts show.
    const opens = rows.filter(countsEntry);
    opens.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // `entries` is how many people the row's single open admitted, so the
    // export sums to the same totals the statistics page charts — one row per
    // open, but not one entry per row.
    const lines = ["datetime,user,simulated,entries"];
    for (const row of opens) {
      const rowUser = row.user ? (row.user.name ? `${row.user.name} <${row.user.email}>` : row.user.email) : "";
      lines.push(
        [formatAppDateTime(row.createdAt), rowUser, row.simulated ? "true" : "false", String(entriesPerOpen(row.meta))].join(","),
      );
    }

    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="stats.csv"',
      },
    });
  });
}
