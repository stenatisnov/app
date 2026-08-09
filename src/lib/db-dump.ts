import type { PrismaClient } from "@prisma/client";

/**
 * Raw SQL dump of every row in every table, as plain `INSERT` statements —
 * a real "restore the database" backup, unlike the config/transaction
 * backups (curated YAML views over specific business data). Deliberately
 * data-only, not schema+data: generating correct `CREATE TABLE` DDL from
 * Prisma's runtime metadata (types, defaults, FK actions) is exactly the
 * kind of thing that's easy to get subtly wrong, whereas the real schema
 * already exists as exact, hand-verified SQL in `prisma/migrations/`. The
 * restore procedure is therefore: run migrations against an empty
 * database, then load this dump — not `sqlite3 db < dump.sql` from
 * scratch on its own.
 *
 * Tables are listed parent-before-child so the statements can be replayed
 * in order without tripping foreign-key constraints; `prisma.<model>.findMany()`
 * is used for every table (same as the rest of the app) rather than a raw
 * query, so this works identically across the D1/libSQL/libSQL-local
 * branches without any per-branch override.
 */
const DUMP_TABLES = [
  { model: "personType", table: "PersonType" },
  { model: "group", table: "Group" },
  { model: "guestPass", table: "GuestPass" },
  { model: "appSetting", table: "AppSetting" },
  { model: "user", table: "User" },
  { model: "dependent", table: "Dependent" },
  { model: "pricePackage", table: "PricePackage" },
  { model: "groupWindow", table: "GroupWindow" },
  { model: "userGroup", table: "UserGroup" },
  { model: "account", table: "Account" },
  { model: "session", table: "Session" },
  { model: "verificationToken", table: "VerificationToken" },
  { model: "passwordResetToken", table: "PasswordResetToken" },
  { model: "paymentOrder", table: "PaymentOrder" },
  { model: "userAccessPass", table: "UserAccessPass" },
  { model: "creditLedger", table: "CreditLedger" },
  { model: "auditLog", table: "AuditLog" },
] as const;

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Prisma's SQLite connector stores DateTime as ISO-8601 text and JSON fields as their JSON.stringify text — matching that here is what makes a raw INSERT round-trip through Prisma correctly afterwards. */
function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Date) return sqlString(v.toISOString());
  if (typeof v === "object") return sqlString(JSON.stringify(v));
  return sqlString(String(v));
}

function insertStatement(table: string, row: Record<string, unknown>): string {
  const columns = Object.keys(row);
  const values = columns.map((c) => sqlValue(row[c]));
  return `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${values.join(", ")});`;
}

export async function exportDatabaseDumpToSql(prisma: PrismaClient): Promise<string> {
  const lines: string[] = [
    `-- Stěna Letňák data dump — ${new Date().toISOString()}`,
    "-- Data only. Restore: run migrations against an empty database first, then load this file.",
    "BEGIN TRANSACTION;",
  ];

  const client = prisma as unknown as Record<string, { findMany: () => Promise<Record<string, unknown>[]> }>;

  for (const { model, table } of DUMP_TABLES) {
    const rows = await client[model].findMany();
    if (rows.length === 0) continue;
    lines.push(`-- ${table} (${rows.length})`);
    for (const row of rows) {
      lines.push(insertStatement(table, row));
    }
  }

  lines.push("COMMIT;");
  return lines.join("\n") + "\n";
}
