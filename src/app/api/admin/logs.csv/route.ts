import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { auditLogsToCsv, buildAuditLogWhere, parseAuditLogFilters } from "@/lib/audit-log-filters";
import { isRootRole } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !isRootRole(session.user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const filters = parseAuditLogFilters(searchParams);

  const logs = await prisma.auditLog.findMany({
    where: buildAuditLogWhere(filters),
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const csv = auditLogsToCsv(logs);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-log.csv"',
    },
  });
}
