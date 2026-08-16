import { data } from "react-router";
import type { Route } from "./+types/admin.logs-csv";
import { getPrisma } from "@/lib/db.server";
import { auditLogsToCsv, buildAuditLogWhere, fetchAuditLogsWithUser, parseAuditLogFilters } from "@/lib/audit-log-filters";
import { isRootRole } from "@/lib/roles";
import { getSessionUser } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const user = await getSessionUser(request);
    if (!user || !isRootRole(user.role)) {
      return data({ error: "FORBIDDEN" }, { status: 403 });
    }

    const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
    const filters = parseAuditLogFilters(searchParams);

    const prisma = await getPrisma();
    const logs = await fetchAuditLogsWithUser(prisma, buildAuditLogWhere(filters), 5000);

    const csv = auditLogsToCsv(logs);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="audit-log.csv"',
      },
    });
  });
}
