import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { PaymentStatus } from "@prisma/client";
import { formatAppDateTime, startOfAppDaysAgo } from "@/lib/time";
import { getPaymentControlSettings } from "@/lib/settings";
import { requireStaffOrAbove } from "@/lib/session";
import { fetchAuditLogsWithUser } from "@/lib/audit-log-filters";

/** True for a genuine member-paid entry — credits or a period pass — excludes staff/admin free entries, which set usedAdmin (see gate.ts). */
function usedPrepaidEntry(meta: unknown): boolean {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  return (meta as Record<string, unknown>).usedAdmin !== true;
}

function metaField(meta: unknown, key: string): string {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const value = (meta as Record<string, unknown>)[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return "—";
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

export default async function PaymentCheckPage() {
  await requireStaffOrAbove();
  const [t, tPayments, locale] = await Promise.all([
    getTranslations("paymentCheck"),
    getTranslations("admin.payments"),
    getLocale(),
  ]);
  const dateLocale = locale === "en" ? "en-GB" : "cs-CZ";

  const { periodDays } = await getPaymentControlSettings();
  const since = startOfAppDaysAgo(periodDays - 1);

  const [pending, confirmedOrders, entries, unmatchedFio] = await Promise.all([
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
  ]);

  // Every app-generated QR payment carries constant symbol 1 (see
  // createPaymentOrderAction) — an unmatched transfer with no constant symbol
  // is real money for something outside the app (cash-alternative entry,
  // rental, ...), while one with constant symbol 1 should have matched a
  // package order and didn't, which is worth a dedicated section.
  const unmatchedOutsideApp = unmatchedFio.filter((row) => !metaField(row.meta, "constantSymbol") || metaField(row.meta, "constantSymbol") === "—");
  const unmatchedPassPayments = unmatchedFio.filter((row) => metaField(row.meta, "constantSymbol") === "1");

  const prepaidEntries: { key: string; name: string; email: string; createdAt: Date }[] = [];
  for (const e of entries) {
    if (usedPrepaidEntry(e.meta)) {
      prepaidEntries.push({
        key: e.id,
        name: e.user?.name || "—",
        email: e.user?.email || "—",
        createdAt: e.createdAt,
      });
    }
    for (const dep of metaDependents(e.meta)) {
      prepaidEntries.push({
        key: `${e.id}-${dep.id}`,
        name: t("dependentEntryLabel", { name: dep.name }),
        email: "—",
        createdAt: e.createdAt,
      });
    }
  }

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
          {unmatchedOutsideApp.map((row) => {
            const message = metaField(row.meta, "message");
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
              >
                <span className="text-[var(--ink)]">
                  {formatAppDateTime(row.createdAt, dateLocale)} — {metaField(row.meta, "senderName")} —{" "}
                  {metaField(row.meta, "amountCzk")} Kč
                  {message !== "—" && ` — ${message}`}
                </span>
              </div>
            );
          })}
          {unmatchedOutsideApp.length === 0 && <p className="text-[var(--muted)]">—</p>}
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
                {order.user.name || order.user.email} — {order.amountCzk} Kč — {order.method}
                {order.variableSymbol && ` — VS ${order.variableSymbol}`} — {t("orderCredits", { count: order.credits })} —{" "}
                {formatAppDateTime(order.createdAt, dateLocale)}
                {order.note && ` — ${order.note}`}
              </span>
              <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5 text-xs text-[var(--ink)]">
                {tPayments("statusPending")}
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
          {unmatchedPassPayments.map((row) => {
            const comment = metaField(row.meta, "message");
            const vs = metaField(row.meta, "variableSymbol");
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
              >
                <span className="text-[var(--ink)]">
                  {formatAppDateTime(row.createdAt, dateLocale)} — {metaField(row.meta, "senderName")} —{" "}
                  {metaField(row.meta, "amountCzk")} Kč
                  {vs !== "—" && ` — VS ${vs}`}
                  {comment !== "—" && ` — ${comment}`}
                </span>
              </div>
            );
          })}
          {unmatchedPassPayments.length === 0 && <p className="text-[var(--muted)]">—</p>}
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
                {order.user.name || order.user.email} — {order.amountCzk} Kč
                {order.confirmedBy?.email && ` — ${order.confirmedBy.email}`}
                {order.confirmedAt && ` (${formatAppDateTime(order.confirmedAt, dateLocale)})`}
                {order.note && ` — ${order.note}`}
              </span>
              <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5 text-xs text-[var(--ink)]">
                {tPayments(`status${cap(order.status)}` as "statusConfirmed")}
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
                {entry.name}
                {entry.email !== "—" && ` — ${entry.email}`} — {formatAppDateTime(entry.createdAt, dateLocale)}
              </span>
            </div>
          ))}
          {prepaidEntries.length === 0 && <p className="text-[var(--muted)]">—</p>}
        </div>
      </section>
    </div>
  );
}
