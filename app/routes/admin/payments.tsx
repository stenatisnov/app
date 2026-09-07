import { useState } from "react";
import { Form, data } from "react-router";
import type { Route } from "./+types/payments";
import { getPrisma } from "@/lib/db.server";
import { withLoadContext } from "@/lib/request-context.server";
import { parseAppLocalDate, parseAppLocalDateEndOfDay, toAppDateValue } from "@/lib/time";
import { fetchPaymentReviewData, capStatus } from "@/lib/payment-review";
import { adminCancelPaymentAction, adminConfirmPaymentAction, adminSendUnmatchedReceiptAction } from "@/lib/actions/admin-payments";
import { SendReceiptDialog } from "@/components/SendReceiptDialog";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { useTranslations } from "@/i18n/translations";

const inputClass = "input !py-1 text-sm";
const filterButtonClass = "btn btn-secondary !px-3 !py-1.5 text-xs";
const primaryButtonClass = "btn btn-primary !px-3 !py-1.5 text-xs";
const dangerButtonClass = "btn btn-danger !px-3 !py-1.5 text-xs";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const dateLocale = params.locale === "en" ? "en-GB" : "cs-CZ";
    const today = toAppDateValue();
    const searchParams = new URL(request.url).searchParams;
    const dateFrom = searchParams.get("dateFrom") || today;
    const dateTo = searchParams.get("dateTo") || today;

    const prisma = await getPrisma();
    const since = parseAppLocalDate(dateFrom);
    const until = parseAppLocalDateEndOfDay(dateTo);
    const reviewData = await fetchPaymentReviewData(prisma, { since, until }, dateLocale);

    return data({ dateFrom, dateTo, ...reviewData });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "confirmPayment":
        return adminConfirmPaymentAction(String(formData.get("orderId") || ""), request);
      case "cancelPayment":
        return adminCancelPaymentAction(String(formData.get("orderId") || ""), request);
      case "sendUnmatchedReceipt":
        return adminSendUnmatchedReceiptAction(formData, request, params.locale!);
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function AdminPaymentsPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("paymentCheck");
  const tAdmin = useTranslations("admin");
  const { dateFrom, dateTo, unmatchedOutsideApp, pending, unmatchedPassPayments, confirmedOrders, prepaidEntries } = loaderData;
  const [sendReceiptFor, setSendReceiptFor] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{tAdmin("payments.title")}</h1>
      </div>

      <Form method="get" className="card flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {tAdmin("payments.filterDateFrom")}
          <input type="date" name="dateFrom" defaultValue={dateFrom} className={inputClass} />
        </label>
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {tAdmin("payments.filterDateTo")}
          <input type="date" name="dateTo" defaultValue={dateTo} className={inputClass} />
        </label>
        <button type="submit" className={filterButtonClass}>
          OK
        </button>
      </Form>

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
                {tAdmin(`payments.status${capStatus(order.status)}` as "payments.statusConfirmed")}
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
              <div className="flex items-center gap-2">
                <Form method="post">
                  <input type="hidden" name="intent" value="confirmPayment" />
                  <input type="hidden" name="orderId" value={order.id} />
                  <button type="submit" className={primaryButtonClass}>
                    {tAdmin("payments.confirm")}
                  </button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="intent" value="cancelPayment" />
                  <input type="hidden" name="orderId" value={order.id} />
                  <ConfirmSubmitButton
                    confirmMessage={tAdmin("payments.cancelConfirm", { amount: order.amountCzk })}
                    className={dangerButtonClass}
                  >
                    {tAdmin("payments.cancel")}
                  </ConfirmSubmitButton>
                </Form>
              </div>
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
