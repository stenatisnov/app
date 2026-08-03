import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { PaymentStatus } from "@prisma/client";
import { formatAppDateTime } from "@/lib/time";
import { adminConfirmPaymentAction } from "@/app/actions";

const primaryButtonClass = "rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white";

export default async function AdminPaymentsPage() {
  const t = await getTranslations("admin.payments");

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

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <section>
        <h2 className="text-lg font-medium">{t("pendingTitle")}</h2>
        <div className="mt-3 flex flex-col gap-2">
          {pending.map((order) => (
            <div
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
            >
              <span>
                {order.user.name || order.user.email} — {order.amountCzk} Kč — {order.method}
                {order.variableSymbol && ` — VS ${order.variableSymbol}`}
              </span>
              <form action={adminConfirmPaymentAction.bind(null, order.id)}>
                <button className={primaryButtonClass}>{t("confirm")}</button>
              </form>
            </div>
          ))}
          {pending.length === 0 && <p className="text-neutral-400">—</p>}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">{t("statusConfirmed")}</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-neutral-500">
            <tr>
              <th className="pb-2 font-normal">{t("user")}</th>
              <th className="pb-2 font-normal">{t("amount")}</th>
              <th className="pb-2 font-normal">{t("status")}</th>
              <th className="pb-2 font-normal">{t("confirmedBy")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {recent.map((order) => (
              <tr key={order.id}>
                <td className="py-1.5">{order.user.name || order.user.email}</td>
                <td className="py-1.5">{order.amountCzk} Kč</td>
                <td className="py-1.5">{t(`status${cap(order.status)}` as "statusConfirmed")}</td>
                <td className="py-1.5 text-neutral-500">
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

function cap(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}
