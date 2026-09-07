import type { PrismaClient } from "@prisma/client";
import { PaymentStatus } from "@prisma/client";
import { formatAppDate, formatAppDateTime, parseAppLocalDate } from "./time";
import { fetchAuditLogsWithUser } from "./audit-log-filters";

/**
 * Shared query + shaping logic behind "Kontrola plateb" and Admin →
 * Platby — both pages show the same picture of what's been paid/unpaid/
 * unmatched, just over a different date range (a rolling `periodDays`
 * window vs. an explicit admin-picked date). Kept in one place so a future
 * fix (e.g. the constantSymbol "0000" partitioning bug) only needs
 * applying once.
 */

/** Ledger reasons written by a self gate-open (mirrors gate.ts's own `GATE_ENTRY_REASONS`) — used to reconstruct `creditsUsed` for audit rows predating that field. */
const GATE_ENTRY_REASONS = ["gate_open", "gate_open_pass", "gate_open_admin"];

/**
 * True only when a credit was actually deducted for this entry — excludes
 * admin/pass free entries and daily-unlimited re-entries (see gate.ts's
 * `freeOpen`). Audit rows written before `creditsUsed` existed have no such
 * field at all — for those, look up the CreditLedger row gate.ts wrote a few
 * seconds earlier in the same call (same user, no dependent, one of the
 * reasons above, shortly before this audit row) and use its `delta`: a real
 * credit deduction is `-1`, a free open (admin/pass/daily re-entry) is `0`.
 */
function creditWasDeducted(
  meta: unknown,
  userId: string | null,
  createdAt: Date,
  ledgerByUser: Map<string, { createdAt: Date; delta: number }[]>,
): boolean {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const m = meta as Record<string, unknown>;
  if (typeof m.creditsUsed === "boolean") return m.creditsUsed;

  const candidates = (userId && ledgerByUser.get(userId)) || [];
  const matchWindowMs = 5 * 60 * 1000;
  let closest: { createdAt: Date; delta: number } | null = null;
  for (const row of candidates) {
    if (row.createdAt > createdAt) continue;
    if (createdAt.getTime() - row.createdAt.getTime() > matchWindowMs) continue;
    if (!closest || row.createdAt > closest.createdAt) closest = row;
  }
  if (closest) return closest.delta !== 0;

  return m.usedAdmin !== true;
}

export function metaField(meta: unknown, key: string): string {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const value = (meta as Record<string, unknown>)[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return "—";
}

/**
 * Fio only reports a calendar date for a transaction (never a time-of-day),
 * so the bank-side date is shown without a time — unlike `row.createdAt`,
 * which is merely when our poll picked it up. Older audit rows recorded
 * before this field existed fall back to the poll timestamp.
 */
function fioDateLabel(row: { createdAt: Date; meta: unknown }, dateLocale: string): string {
  const raw = metaField(row.meta, "fioDate");
  if (raw !== "—") {
    const parsed = parseAppLocalDate(raw);
    if (!Number.isNaN(parsed.getTime())) return formatAppDate(parsed, dateLocale);
  }
  return formatAppDateTime(row.createdAt, dateLocale);
}

/** Companions (see gate.ts) recorded on the same gate-open entry as the member — each one used its own credit, so it counts as its own row here. */
function metaDependents(meta: unknown): { id: string; name: string }[] {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return [];
  const value = (meta as Record<string, unknown>).dependents;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (d): d is { id: string; name: string } =>
      Boolean(d) && typeof d === "object" && typeof (d as Record<string, unknown>).name === "string",
  );
}

export function capStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

/**
 * A FAMILY-package order stores `credits` as the *per-person* amount (used
 * directly to credit the buyer — see payments.ts's FAMILY branch), while
 * each companion in `familyCompanionIds` always gets a fixed +1 regardless
 * of that value. The order lists show one combined count, so add the
 * companions back in here purely for display — never feed this back into
 * any crediting logic.
 */
function totalOrderCredits(order: { credits: number; familyCompanionIds: unknown }): number {
  const companionCount = Array.isArray(order.familyCompanionIds) ? order.familyCompanionIds.length : 0;
  return order.credits + companionCount;
}

export type UnmatchedFioRow = { id: string; dateLabel: string; senderName: string; amountCzk: string; message: string };
export type UnmatchedPassRow = UnmatchedFioRow & { variableSymbol: string };
export type PendingOrderRow = {
  id: string;
  label: string;
  amountCzk: number;
  method: string;
  variableSymbol: string | null;
  credits: number;
  createdAtLabel: string;
  note: string | null;
};
export type ConfirmedOrderRow = {
  id: string;
  label: string;
  amountCzk: number;
  method: string;
  variableSymbol: string | null;
  credits: number;
  confirmedByEmail: string | null;
  confirmedAtLabel: string | null;
  note: string | null;
  status: PaymentStatus;
};
export type PrepaidEntryRow = {
  key: string;
  kind: "self" | "dependent";
  userName: string;
  dependentName: string | null;
  email: string;
  createdAtLabel: string;
};

export type PaymentReviewData = {
  unmatchedOutsideApp: UnmatchedFioRow[];
  unmatchedPassPayments: UnmatchedPassRow[];
  pending: PendingOrderRow[];
  confirmedOrders: ConfirmedOrderRow[];
  prepaidEntries: PrepaidEntryRow[];
};

/** Inclusive date range — both bounds compared against each record's own `createdAt`. */
export async function fetchPaymentReviewData(
  prisma: PrismaClient,
  range: { since: Date; until: Date },
  dateLocale: string,
): Promise<PaymentReviewData> {
  const { since, until } = range;
  const createdAt = { gte: since, lte: until };

  const [pending, confirmedOrders, entries, unmatchedFio, gateLedgerRows] = await Promise.all([
    prisma.paymentOrder.findMany({
      where: { status: PaymentStatus.PENDING, createdAt },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.paymentOrder.findMany({
      where: { status: PaymentStatus.CONFIRMED, createdAt },
      include: { user: true, confirmedBy: true },
      orderBy: { createdAt: "desc" },
    }),
    fetchAuditLogsWithUser(prisma, { action: "gate.open", success: true, createdAt }),
    prisma.auditLog.findMany({
      where: { action: "payment.fio.unmatched", createdAt },
      orderBy: { createdAt: "desc" },
    }),
    prisma.creditLedger.findMany({
      where: { dependentId: null, reason: { in: GATE_ENTRY_REASONS }, createdAt },
      select: { userId: true, createdAt: true, delta: true },
    }),
  ]);

  const ledgerByUser = new Map<string, { createdAt: Date; delta: number }[]>();
  for (const row of gateLedgerRows) {
    const list = ledgerByUser.get(row.userId) ?? [];
    list.push({ createdAt: row.createdAt, delta: row.delta });
    ledgerByUser.set(row.userId, list);
  }

  // Complementary partition on purpose — every unmatched row must land in
  // exactly one of the two sections below. `unmatchedPassPayments` is the
  // narrow, exact match (the app's own QR-generated payments always carry
  // constant symbol "1" — see createPaymentOrderAction); everything else
  // is "outside app". A previous version of this split treated only a
  // missing/null constantSymbol as "outside app", which silently dropped
  // any row where Fio reports a placeholder value instead of leaving the
  // field empty (observed in production: Fio sends "0000" — not null —
  // for plain transfers with no real constant symbol) — those rows
  // matched neither filter and vanished from the page entirely, even
  // though they were still correctly registered with EET.
  const unmatchedPassPayments = unmatchedFio.filter((row) => metaField(row.meta, "constantSymbol") === "1");
  const unmatchedOutsideApp = unmatchedFio.filter((row) => metaField(row.meta, "constantSymbol") !== "1");

  const prepaidEntries: { key: string; kind: "self" | "dependent"; userName: string; dependentName: string | null; email: string; createdAt: Date }[] =
    [];
  for (const e of entries) {
    const userName = e.user?.name || e.user?.email || "—";
    if (creditWasDeducted(e.meta, e.userId, e.createdAt, ledgerByUser)) {
      prepaidEntries.push({ key: e.id, kind: "self", userName, dependentName: null, email: e.user?.email || "—", createdAt: e.createdAt });
    }
    for (const dep of metaDependents(e.meta)) {
      prepaidEntries.push({
        key: `${e.id}-${dep.id}`,
        kind: "dependent",
        userName,
        dependentName: dep.name,
        email: "—",
        createdAt: e.createdAt,
      });
    }
  }

  return {
    unmatchedOutsideApp: unmatchedOutsideApp.map((row) => ({
      id: row.id,
      dateLabel: fioDateLabel(row, dateLocale),
      senderName: metaField(row.meta, "senderName"),
      amountCzk: metaField(row.meta, "amountCzk"),
      message: metaField(row.meta, "message"),
    })),
    unmatchedPassPayments: unmatchedPassPayments.map((row) => ({
      id: row.id,
      dateLabel: fioDateLabel(row, dateLocale),
      senderName: metaField(row.meta, "senderName"),
      amountCzk: metaField(row.meta, "amountCzk"),
      variableSymbol: metaField(row.meta, "variableSymbol"),
      message: metaField(row.meta, "message"),
    })),
    pending: pending.map((order) => ({
      id: order.id,
      label: order.user.name || order.user.email,
      amountCzk: order.amountCzk,
      method: order.method,
      variableSymbol: order.variableSymbol,
      credits: totalOrderCredits(order),
      createdAtLabel: formatAppDateTime(order.createdAt, dateLocale),
      note: order.note,
    })),
    confirmedOrders: confirmedOrders.map((order) => ({
      id: order.id,
      label: order.user.name || order.user.email,
      amountCzk: order.amountCzk,
      method: order.method,
      variableSymbol: order.variableSymbol,
      credits: totalOrderCredits(order),
      confirmedByEmail: order.confirmedBy?.email ?? null,
      confirmedAtLabel: order.confirmedAt ? formatAppDateTime(order.confirmedAt, dateLocale) : null,
      note: order.note,
      status: order.status,
    })),
    prepaidEntries: prepaidEntries.map((entry) => ({ ...entry, createdAtLabel: formatAppDateTime(entry.createdAt, dateLocale) })),
  };
}
