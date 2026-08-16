import { data } from "react-router";
import type { Route } from "./+types/admin.stats-csv";
import { getPrisma } from "@/lib/db";
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
    const opens = await prisma.auditLog.findMany({
      where: { action: "gate.open", success: true, createdAt: { gte: startOfAppYear() } },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });

    const lines = ["datetime,user,simulated"];
    for (const row of opens) {
      const rowUser = row.user ? (row.user.name ? `${row.user.name} <${row.user.email}>` : row.user.email) : "";
      const simulated = Boolean((row.meta as { lockResult?: { simulated?: boolean } } | null)?.lockResult?.simulated);
      lines.push([formatAppDateTime(row.createdAt), rowUser, simulated ? "true" : "false"].join(","));
    }

    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="stats.csv"',
      },
    });
  });
}
