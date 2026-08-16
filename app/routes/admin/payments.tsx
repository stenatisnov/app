import { PaymentStatus } from "@prisma/client";
import { Form, data } from "react-router";
import type { Route } from "./+types/payments";
import { getPrisma } from "@/lib/db";
import { withLoadContext } from "@/lib/request-context.server";
import { formatAppDateTime } from "@/lib/time";
import { adminCancelPaymentAction, adminConfirmPaymentAction } from "@/lib/actions/admin-payments";
import { useTranslations } from "@/i18n/translations";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

const primaryButtonClass = "btn btn-primary !px-3 !py-1.5 text-xs";
const dangerButtonClass = "btn btn-danger !px-3 !py-1.5 text-xs";

export async function loader({ context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const prisma = await getPrisma();
    const [pending, recent] = await Promise.all([
      prisma.paymentOrder.findMany({
        where: { status: PaymentStatus.PENDING },
        include: { user: true, package: { include: { personType: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.paymentOrder.findMany({
        where: { status: { not: PaymentStatus.PENDING } },
        include: { user: true, confirmedBy: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);
    return data({ pending, recent });
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    const orderId = String(formData.get("orderId") || "");
    switch (intent) {
      case "confirmPayment":
        return adminConfirmPaymentAction(orderId, request);
      case "cancelPayment":
        return adminCancelPaymentAction(orderId, request);
      default:
        throw data(null, { status: 400 });
    }
  });
}

function cap(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default function AdminPaymentsPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const { pending, recent } = loaderData;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("payments.title")}</h1>

      <section className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("payments.pendingTitle")}</h2>
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
              <div className="flex gap-2">
                <Form method="post">
                  <input type="hidden" name="intent" value="confirmPayment" />
                  <input type="hidden" name="orderId" value={order.id} />
                  <button className={primaryButtonClass}>{t("payments.confirm")}</button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="intent" value="cancelPayment" />
                  <input type="hidden" name="orderId" value={order.id} />
                  <ConfirmSubmitButton
                    confirmMessage={t("payments.cancelConfirm", { amount: order.amountCzk })}
                    className={dangerButtonClass}
                  >
                    {t("payments.cancel")}
                  </ConfirmSubmitButton>
                </Form>
              </div>
            </div>
          ))}
          {pending.length === 0 && <p className="text-[var(--muted)]">—</p>}
        </div>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("payments.statusConfirmed")}</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="pb-2 font-normal">{t("payments.user")}</th>
              <th className="pb-2 font-normal">{t("payments.amount")}</th>
              <th className="pb-2 font-normal">{t("payments.status")}</th>
              <th className="pb-2 font-normal">{t("payments.confirmedBy")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] text-[var(--ink)]">
            {recent.map((order) => (
              <tr key={order.id}>
                <td className="py-1.5">{order.user.name || order.user.email}</td>
                <td className="py-1.5">{order.amountCzk} Kč</td>
                <td className="py-1.5">{t(`payments.status${cap(order.status)}` as "payments.statusConfirmed")}</td>
                <td className="py-1.5 text-[var(--muted)]">
                  {order.confirmedBy?.email ?? "—"}
                  {order.confirmedAt && ` (${formatAppDateTime(order.confirmedAt)})`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
