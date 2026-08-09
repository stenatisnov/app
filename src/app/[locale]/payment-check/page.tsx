import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { PaymentStatus } from "@prisma/client";
import { formatAppDateTime } from "@/lib/time";
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
  const since = new Date(Date.now() - periodDays * 86_400_000);

  const [pending, confirmedOrders, entries, unmatchedFio] = await Promise.all([
    prisma.paymentOrder.findMany({
      where: { status: PaymentStatus.PENDING },
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

  const prepaidEntries = entries.filter((e) => usedPrepaidEntry(e.meta));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("periodHint", { days: periodDays })}</p>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("entriesTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("entriesHint")}</p>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="pb-2 font-normal">{t("name")}</th>
              <th className="pb-2 font-normal">{t("email")}</th>
              <th className="pb-2 font-normal">{t("date")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] text-[var(--ink)]">
            {prepaidEntries.map((entry) => (
              <tr key={entry.id}>
                <td className="py-1.5">{entry.user?.name || "—"}</td>
                <td className="py-1.5">{entry.user?.email || "—"}</td>
                <td className="py-1.5 text-[var(--muted)]">{formatAppDateTime(entry.createdAt, dateLocale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {prepaidEntries.length === 0 && <p className="mt-3 text-[var(--muted)]">—</p>}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("unmatchedFioTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{t("unmatchedFioHint")}</p>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="pb-2 font-normal">{t("date")}</th>
              <th className="pb-2 font-normal">{tPayments("amount")}</th>
              <th className="pb-2 font-normal">{tPayments("vs")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] text-[var(--ink)]">
            {unmatchedFio.map((row) => (
              <tr key={row.id}>
                <td className="py-1.5 text-[var(--muted)]">{formatAppDateTime(row.createdAt, dateLocale)}</td>
                <td className="py-1.5">{metaField(row.meta, "amountCzk")} Kč</td>
                <td className="py-1.5">{metaField(row.meta, "variableSymbol")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {unmatchedFio.length === 0 && <p className="mt-3 text-[var(--muted)]">—</p>}
      </section>

      <section className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("unconfirmedTitle")}</h2>
        <div className="mt-3 flex flex-col gap-2">
          {pending.map((order) => (
            <div
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
            >
              <span className="text-[var(--ink)]">
                {order.user.name || order.user.email} — {order.amountCzk} Kč — {order.method}
                {order.variableSymbol && ` — VS ${order.variableSymbol}`}
              </span>
              <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5 text-xs text-[var(--ink)]">
                {tPayments("statusPending")}
              </span>
            </div>
          ))}
          {pending.length === 0 && <p className="text-[var(--muted)]">—</p>}
        </div>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("confirmedOrdersTitle")}</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="pb-2 font-normal">{tPayments("user")}</th>
              <th className="pb-2 font-normal">{tPayments("amount")}</th>
              <th className="pb-2 font-normal">{tPayments("status")}</th>
              <th className="pb-2 font-normal">{tPayments("confirmedBy")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] text-[var(--ink)]">
            {confirmedOrders.map((order) => (
              <tr key={order.id}>
                <td className="py-1.5">{order.user.name || order.user.email}</td>
                <td className="py-1.5">{order.amountCzk} Kč</td>
                <td className="py-1.5">{tPayments(`status${cap(order.status)}` as "statusConfirmed")}</td>
                <td className="py-1.5 text-[var(--muted)]">
                  {order.confirmedBy?.email ?? "—"}
                  {order.confirmedAt && ` (${formatAppDateTime(order.confirmedAt, dateLocale)})`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {confirmedOrders.length === 0 && <p className="mt-3 text-[var(--muted)]">—</p>}
      </section>
    </div>
  );
}
