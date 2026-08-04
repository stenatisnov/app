import * as yaml from "js-yaml";
import type { PrismaClient } from "@prisma/client";

/**
 * The transaction log isn't a table of its own — it's a YAML view over data
 * that's already recorded: `PaymentOrder` (purchases + admin confirmations)
 * and `CreditLedger` / `AuditLog` (credit-based entry usage, including guest
 * passes). Regenerating it from those on every backup, rather than
 * maintaining a growing file, is what makes the retention window
 * (`TransactionBackupSettings.retentionDays`) trivial: it's just a
 * `createdAt` filter, and there's never anything to prune from a live file.
 */

type PurchaseEntry = {
  type: "purchase";
  at: string;
  userName: string | null;
  userEmail: string;
  orderId: string;
  package: string;
  method: string;
  amountCzk: number;
  credits: number;
  status: string;
};

type ConfirmEntry = {
  type: "confirm";
  at: string;
  userName: string | null;
  userEmail: string;
  orderId: string;
  amountCzk: number;
  confirmedByName: string | null;
  confirmedByEmail: string | null;
};

type EntryUseEntry = {
  type: "entry_use";
  at: string;
  userName: string | null;
  userEmail: string | null;
  guestPassLabel: string | null;
};

export type TransactionLogEntry = PurchaseEntry | ConfirmEntry | EntryUseEntry;

function packageLabel(order: {
  note: string | null;
  package: { kind: string; credits: number; periodPreset: string | null; personType: { name: string } } | null;
}): string {
  if (!order.package) return order.note ?? "manuální";
  const { kind, credits, periodPreset, personType } = order.package;
  const detail = kind === "PERIOD" ? periodPreset ?? "období" : `${credits} kreditů`;
  return `${personType.name} – ${detail}`;
}

/**
 * Builds the full transaction log YAML for the last `sinceDate..now` window.
 * `sinceDate` is normally `now - retentionDays` (see `runTransactionBackupIfDue`
 * in backup.ts) — the exported file only ever contains that trailing window,
 * so it can't grow without bound.
 */
export async function exportTransactionLogToYaml(prisma: PrismaClient, sinceDate: Date): Promise<string> {
  const [orders, ledgerEntries, guestOpens] = await Promise.all([
    prisma.paymentOrder.findMany({
      where: { createdAt: { gte: sinceDate } },
      include: { user: true, confirmedBy: true, package: { include: { personType: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.creditLedger.findMany({
      where: { createdAt: { gte: sinceDate }, reason: "gate_open" },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { createdAt: { gte: sinceDate }, action: "guest.open", success: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const guestTokens = Array.from(
    new Set(guestOpens.map((g) => g.guestToken).filter((t): t is string => Boolean(t))),
  );
  const guestPasses = guestTokens.length
    ? await prisma.guestPass.findMany({ where: { token: { in: guestTokens } } })
    : [];
  const guestLabelByToken = new Map(guestPasses.map((gp) => [gp.token, gp.label]));

  const purchases: PurchaseEntry[] = orders.map((o) => ({
    type: "purchase",
    at: o.createdAt.toISOString(),
    userName: o.user.name,
    userEmail: o.user.email,
    orderId: o.id,
    package: packageLabel(o),
    method: o.method,
    amountCzk: o.amountCzk,
    credits: o.credits,
    status: o.status,
  }));

  // Only orders an admin actually confirmed by hand — GoPay's instant
  // auto-confirm has no separate "confirmation" moment worth logging beyond
  // the purchase entry itself (same order, virtually the same timestamp).
  const confirmations: ConfirmEntry[] = orders
    .filter((o) => o.confirmedAt && o.confirmedById)
    .map((o) => ({
      type: "confirm",
      at: o.confirmedAt!.toISOString(),
      userName: o.user.name,
      userEmail: o.user.email,
      orderId: o.id,
      amountCzk: o.amountCzk,
      confirmedByName: o.confirmedBy?.name ?? null,
      confirmedByEmail: o.confirmedBy?.email ?? null,
    }));

  const memberEntryUses: EntryUseEntry[] = ledgerEntries.map((l) => ({
    type: "entry_use",
    at: l.createdAt.toISOString(),
    userName: l.user.name,
    userEmail: l.user.email,
    guestPassLabel: null,
  }));

  const guestEntryUses: EntryUseEntry[] = guestOpens.map((g) => ({
    type: "entry_use",
    at: g.createdAt.toISOString(),
    userName: null,
    userEmail: null,
    guestPassLabel: (g.guestToken && guestLabelByToken.get(g.guestToken)) || g.guestToken,
  }));

  const all: TransactionLogEntry[] = [...purchases, ...confirmations, ...memberEntryUses, ...guestEntryUses].sort(
    (a, b) => a.at.localeCompare(b.at),
  );

  return yaml.dump(all, { noRefs: true, sortKeys: false, lineWidth: 100 });
}
