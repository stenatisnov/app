import { useState } from "react";
import { PaymentStatus } from "@prisma/client";
import { data } from "react-router";
import type { Route } from "./+types/payment-check";
import { getPrisma } from "@/lib/db";
import { withLoadContext } from "@/lib/request-context.server";
import { formatAppDate, formatAppDateTime, parseAppLocalDate, startOfAppDaysAgo } from "@/lib/time";
import { getPaymentControlSettings } from "@/lib/settings";
import { requireStaffOrAbove } from "@/lib/session.server";
import { fetchAuditLogsWithUser } from "@/lib/audit-log-filters";
import { adminSendUnmatchedReceiptAction } from "@/lib/actions/admin-payments";
import { SendReceiptDialog } from "@/components/SendReceiptDialog";
import { useTranslations } from "@/i18n/translations";

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

function metaField(meta: unknown, key: string): string {
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

function cap(status: string) {
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

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    await requireStaffOrAbove(request, params.locale!);
    const dateLocale = params.locale === "en" ? "en-GB" : "cs-CZ";

    const prisma = await getPrisma();
    const { periodDays } = await getPaymentControlSettings();
    const since = startOfAppDaysAgo(periodDays - 1);

    const [pending, confirmedOrders, entries, unmatchedFio, gateLedgerRows] = await Promise.all([
      prisma.paymentOrder.findMany({
        where: { status: PaymentStatus.PENDING, createdAt: { gte: since } },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.paymentOrder.findMany({
        where: { status: PaymentStatus.CONFIRMED, createdAt: { gte: since } },
        include: { user: true, confirmedBy: true },
        orderBy: { createdAt: "desc" },
      }),
      fetchAuditLogsWithUser(prisma, { action: "gate.open", success: true, createdAt: { gte: since } }),
      prisma.auditLog.findMany({
        where: { action: "payment.fio.unmatched", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.creditLedger.findMany({
        where: { dependentId: null, reason: { in: GATE_ENTRY_REASONS }, createdAt: { gte: since } },
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
    // matched neither filter and vanished from this page entirely, even
    // though they were still correctly registered with EET.
    const unmatchedPassPayments = unmatchedFio.filter((row) => metaField(row.meta, "constantSymbol") === "1");
    const unmatchedOutsideApp = unmatchedFio.filter((row) => metaField(row.meta, "constantSymbol") !== "1");

    const prepaidEntries: {
      key: string;
      kind: "self" | "dependent";
      userName: string;
      dependentName: string | null;
      email: string;
      createdAt: Date;
    }[] = [];
    for (const e of entries) {
      const userName = e.user?.name || e.user?.email || "—";
      if (creditWasDeducted(e.meta, e.userId, e.createdAt, ledgerByUser)) {
        prepaidEntries.push({
          key: e.id,
          kind: "self",
          userName,
          dependentName: null,
          email: e.user?.email || "—",
          createdAt: e.createdAt,
        });
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

    return data({
      periodDays,
      unmatchedOutsideApp: unmatchedOutsideApp.map((row) => ({
        id: row.id,
        dateLabel: fioDateLabel(row, dateLocale),
        senderName: metaField(row.meta, "senderName"),
        amountCzk: metaField(row.meta, "amountCzk"),
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
      unmatchedPassPayments: unmatchedPassPayments.map((row) => ({
        id: row.id,
        dateLabel: fioDateLabel(row, dateLocale),
        senderName: metaField(row.meta, "senderName"),
        amountCzk: metaField(row.meta, "amountCzk"),
        variableSymbol: metaField(row.meta, "variableSymbol"),
        message: metaField(row.meta, "message"),
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
      prepaidEntries: prepaidEntries.map((entry) => ({
        ...entry,
        createdAtLabel: formatAppDateTime(entry.createdAt, dateLocale),
      })),
    });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "sendUnmatchedReceipt":
        return adminSendUnmatchedReceiptAction(formData, request, params.locale!);
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function PaymentCheckPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("paymentCheck");
  const tPayments = useTranslations("admin");
  const { periodDays, unmatchedOutsideApp, pending, unmatchedPassPayments, confirmedOrders, prepaidEntries } = loaderData;
  const [sendReceiptFor, setSendReceiptFor] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("periodHint", { days: periodDays })}</p>
      </div>

      <section className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("unmatchedFioTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("unmatchedFioHint")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {unmatchedOutsideApp.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
            >
              <span className="text-[var(--ink)]">
                {row.dateLabel} — {row.senderName} — {row.amountCzk} Kč
                {row.message !== "—" && ` — ${row.message}`}
              </span>
              <button
                type="button"
                className="btn btn-secondary !px-2 !py-1 text-xs"
                onClick={() => setSendReceiptFor(row.id)}
              >
                {t("sendReceiptButton")}
              </button>
            </div>
          ))}
          {unmatchedOutsideApp.length === 0 && <p className="text-[var(--muted)]">—</p>}
          {sendReceiptFor && (
            <SendReceiptDialog
              key={sendReceiptFor}
              open
              auditLogId={sendReceiptFor}
              title={t("sendReceiptTitle")}
              emailLabel={t("sendReceiptEmailLabel")}
              submitLabel={t("sendReceiptSubmit")}
              sendingLabel={t("sendReceiptSending")}
              cancelLabel={t("sendReceiptCancel")}
              closeLabel={t("sendReceiptClose")}
              successMessage={(email) => t("sendReceiptSuccess", { email })}
              errorMessage={t("sendReceiptErrorGeneric")}
              onClose={() => setSendReceiptFor(null)}
            />
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("confirmedOrdersTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("confirmedOrdersHint")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {confirmedOrders.map((order) => (
            <div
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
            >
              <span className="text-[var(--ink)]">
                {order.label} — {order.amountCzk} Kč — {order.method}
                {order.variableSymbol && ` — VS ${order.variableSymbol}`} — {t("orderCredits", { count: order.credits })}
                {order.confirmedByEmail && ` — ${order.confirmedByEmail}`}
                {order.confirmedAtLabel && ` (${order.confirmedAtLabel})`}
                {order.note && ` — ${order.note}`}
              </span>
              <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5 text-xs text-[var(--ink)]">
                {tPayments(`payments.status${cap(order.status)}` as "payments.statusConfirmed")}
              </span>
            </div>
          ))}
          {confirmedOrders.length === 0 && <p className="text-[var(--muted)]">—</p>}
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("entriesTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("entriesHint")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {prepaidEntries.map((entry) => (
            <div
              key={entry.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
            >
              <span className="text-[var(--ink)]">
                {entry.userName}
                {entry.dependentName
                  ? ` — ${t("dependentEntryLabel", { name: entry.dependentName })}`
                  : entry.email !== "—" && ` — ${entry.email}`}{" "}
                — {entry.createdAtLabel}
              </span>
            </div>
          ))}
          {prepaidEntries.length === 0 && <p className="text-[var(--muted)]">—</p>}
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("unconfirmedTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("unconfirmedHint")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {pending.map((order) => (
            <div
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
            >
              <span className="text-[var(--ink)]">
                {order.label} — {order.amountCzk} Kč — {order.method}
                {order.variableSymbol && ` — VS ${order.variableSymbol}`} — {t("orderCredits", { count: order.credits })} —{" "}
                {order.createdAtLabel}
                {order.note && ` — ${order.note}`}
              </span>
              <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5 text-xs text-[var(--ink)]">
                {tPayments("payments.statusPending")}
              </span>
            </div>
          ))}
          {pending.length === 0 && <p className="text-[var(--muted)]">—</p>}
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("unmatchedPassTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("unmatchedPassHint")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {unmatchedPassPayments.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
            >
              <span className="text-[var(--ink)]">
                {row.dateLabel} — {row.senderName} — {row.amountCzk} Kč
                {row.variableSymbol !== "—" && ` — VS ${row.variableSymbol}`}
                {row.message !== "—" && ` — ${row.message}`}
              </span>
            </div>
          ))}
          {unmatchedPassPayments.length === 0 && <p className="text-[var(--muted)]">—</p>}
        </div>
      </section>
    </div>
  );
}
