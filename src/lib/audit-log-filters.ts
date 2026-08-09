import type { AuditLog, Prisma, PrismaClient } from "@prisma/client";
import { isAuditAction } from "./audit-actions";

export type AuditLogFilters = {
  userId?: string;
  action?: string;
  /** "success" | "failure" | undefined (= any) */
  result?: string;
  /** inclusive, parsed from an `<input type="date">` value */
  dateFrom?: string;
  /** inclusive, parsed from an `<input type="date">` value */
  dateTo?: string;
};

/** Reads filter values out of Next.js `searchParams`, ignoring unknown/empty ones. */
export function parseAuditLogFilters(
  searchParams: Record<string, string | string[] | undefined>,
): AuditLogFilters {
  const get = (key: string) => {
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] : v;
  };
  return {
    userId: get("userId") || undefined,
    action: get("action") || undefined,
    result: get("result") || undefined,
    dateFrom: get("dateFrom") || undefined,
    dateTo: get("dateTo") || undefined,
  };
}

/** Builds a Prisma `AuditLog` where-clause shared by the admin list page and the CSV export. */
export function buildAuditLogWhere(filters: AuditLogFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters.userId) where.userId = filters.userId;
  if (filters.action && isAuditAction(filters.action)) where.action = filters.action;
  if (filters.result === "success") where.success = true;
  if (filters.result === "failure") where.success = false;

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00`) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999`) } : {}),
    };
  }

  return where;
}

export type AuditLogWithUser = AuditLog & { user: { id: string; email: string; name: string | null } | null };

/**
 * Fetches audit log rows and attaches each row's `user` as two separate
 * queries instead of `include: { user: true }`. The D1 adapter's query
 * compiler mis-maps columns for a LEFT JOIN through a nullable relation once
 * a `where` filter is applied to the query (reproduced with a `createdAt`
 * range filter: `DataMapperError: Missing data field 'id'`) — splitting the
 * fetch avoids the JOIN entirely and works identically on every branch.
 */
export async function fetchAuditLogsWithUser(
  prisma: PrismaClient,
  where: Prisma.AuditLogWhereInput,
  take?: number,
): Promise<AuditLogWithUser[]> {
  const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take });

  const userIds = Array.from(new Set(logs.map((l) => l.userId).filter((id): id is string => id !== null)));
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  return logs.map((log) => ({ ...log, user: log.userId ? (userById.get(log.userId) ?? null) : null }));
}

export type AuditLogCsvRow = {
  createdAt: Date;
  action: string;
  success: boolean;
  message: string | null;
  user: { email: string; name: string | null } | null;
  guestToken: string | null;
  meta: unknown;
};

const CSV_HEADER = ["datetime", "action", "success", "user", "guestToken", "message", "meta"];

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Renders audit log rows as CSV text (used by `/api/admin/logs.csv`). */
export function auditLogsToCsv(rows: AuditLogCsvRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.createdAt.toISOString(),
        row.action,
        row.success ? "true" : "false",
        row.user ? row.user.name ? `${row.user.name} <${row.user.email}>` : row.user.email : "",
        row.guestToken ?? "",
        row.message ?? "",
        row.meta ? JSON.stringify(row.meta) : "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n");
}
