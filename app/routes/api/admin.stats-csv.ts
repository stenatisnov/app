import { data } from "react-router";
import type { Route } from "./+types/admin.stats-csv";
import { getPrisma } from "@/lib/db.server";
import { fetchGateEntriesWithUser } from "@/lib/gate-entry";
import { startOfAppYear } from "@/lib/stats";
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

    const prisma = await getPrisma();
    // Same source as the statistics page (`GateEntry`, not the `gate.open`
    // audit rows) so the export survives the log cleanup too — and so the
    // two can't disagree about what counts as an entry.
    const opens = await fetchGateEntriesWithUser(prisma, { createdAt: { gte: startOfAppYear() } });
    opens.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const lines = ["datetime,user,simulated"];
    for (const row of opens) {
      const rowUser = row.user ? (row.user.name ? `${row.user.name} <${row.user.email}>` : row.user.email) : "";
      lines.push([formatAppDateTime(row.createdAt), rowUser, row.simulated ? "true" : "false"].join(","));
    }

    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="stats.csv"',
      },
    });
  });
}
