import { useState } from "react";
import { data } from "react-router";
import type { Route } from "./+types/payment-check";
import { getPrisma } from "@/lib/db";
import { withLoadContext } from "@/lib/request-context.server";
import { startOfAppDaysAgo } from "@/lib/time";
import { getPaymentControlSettings } from "@/lib/settings";
import { requireStaffOrAbove } from "@/lib/session.server";
import { fetchPaymentReviewData } from "@/lib/payment-review";
import { adminSendUnmatchedReceiptAction } from "@/lib/actions/admin-payments";
import { SendReceiptDialog } from "@/components/SendReceiptDialog";
import { useTranslations } from "@/i18n/translations";

function cap(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    await requireStaffOrAbove(request, params.locale!);
    const dateLocale = params.locale === "en" ? "en-GB" : "cs-CZ";

    const prisma = await getPrisma();
    const { periodDays } = await getPaymentControlSettings();
    const since = startOfAppDaysAgo(periodDays - 1);
    const reviewData = await fetchPaymentReviewData(prisma, { since, until: new Date() }, dateLocale);

    return data({ periodDays, ...reviewData });
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
