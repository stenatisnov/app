import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { startOfAppYear } from "@/lib/stats";
import { formatAppDateTime } from "@/lib/time";
import { isStaffRole } from "@/lib/roles";

export async function GET() {
  const session = await auth();
  if (!session?.user || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const opens = await prisma.auditLog.findMany({
    where: { action: "gate.open", success: true, createdAt: { gte: startOfAppYear() } },
    include: { user: { select: { email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const lines = ["datetime,user,simulated"];
  for (const row of opens) {
    const user = row.user ? row.user.name ? `${row.user.name} <${row.user.email}>` : row.user.email : "";
    const simulated = Boolean((row.meta as { lockResult?: { simulated?: boolean } } | null)?.lockResult?.simulated);
    lines.push([formatAppDateTime(row.createdAt), user, simulated ? "true" : "false"].join(","));
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="stats.csv"',
    },
  });
}
