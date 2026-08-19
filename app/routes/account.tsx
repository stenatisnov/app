import { PaymentStatus } from "@prisma/client";
import type { CreditLedger } from "@prisma/client";
import { Form, data } from "react-router";
import type { Route } from "./+types/account";
import { getPrisma } from "@/lib/db.server";
import { requireSession } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";
import { formatAppDateTime } from "@/lib/time";
import { changePasswordAction } from "@/lib/actions/auth";
import { addDependentAction, removeDependentAction } from "@/lib/actions/gate";
import { regeneratePaymentQrAction } from "@/lib/actions/payments";
import { getWcCodeSettingsStored, getPendingOrderCleanupSettingsStored } from "@/lib/settings";
import { useTranslations } from "@/i18n/translations";
import { StatusBanner } from "@/components/StatusBanner";
import { DependentsManager } from "@/components/DependentsManager";
import { PendingPaymentQr } from "@/components/PendingPaymentQr";

type LedgerRow = CreditLedger & { dependent: { name: string } | null };

function metaField(meta: CreditLedger["meta"], key: string): string | undefined {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const value = (meta as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const searchParams = new URL(request.url).searchParams;
    const error = searchParams.get("error") ?? undefined;
    const ok = searchParams.get("ok") ?? undefined;
    const session = await requireSession(request, params.locale!);

    const prisma = await getPrisma();
    const now = new Date();
    const [user, ledger, dependents, personTypes, wcCode, activePasses, pendingOrders, pendingOrderCleanupSettings] =
      await Promise.all([
        prisma.user.findUnique({ where: { id: session.id }, include: { personType: true } }),
        prisma.creditLedger.findMany({
          where: { userId: session.id },
          include: { dependent: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.dependent.findMany({
          where: { parentUserId: session.id },
          include: { personType: true },
          orderBy: { createdAt: "asc" },
        }),
        prisma.personType.findMany({ where: { visibleToUsers: true }, orderBy: { name: "asc" } }),
        getWcCodeSettingsStored(),
        prisma.userAccessPass.findMany({
          where: { userId: session.id, validFrom: { lte: now }, validTo: { gte: now } },
          orderBy: { validTo: "asc" },
        }),
        prisma.paymentOrder.findMany({
          where: { userId: session.id, status: PaymentStatus.PENDING },
          orderBy: { createdAt: "asc" },
        }),
        getPendingOrderCleanupSettingsStored(),
      ]);
    if (!user) throw data(null, { status: 404 });

    return data({
      error,
      ok,
      email: user.email,
      phone: user.phone,
      personTypeName: user.personType?.name ?? null,
      credits: user.credits,
      hasPassword: Boolean(user.passwordHash),
      wcCode: wcCode.code,
      activePasses: activePasses.map((pass) => ({ id: pass.id, label: pass.label, validTo: pass.validTo })),
      dependents: dependents.map((dep) => ({
        id: dep.id,
        name: dep.name,
        personTypeName: dep.personType?.name ?? null,
        credits: dep.credits,
      })),
      personTypes: personTypes.map((pt) => ({ id: pt.id, name: pt.name })),
      ledger: ledger as LedgerRow[],
      pendingOrders: pendingOrders.map((order) => ({
        id: order.id,
        amountCzk: order.amountCzk,
        credits: order.credits,
        variableSymbol: order.variableSymbol,
        method: order.method,
        createdAt: order.createdAt,
      })),
      pendingOrderCleanupSettings,
    });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = formData.get("intent");
    if (intent === null) {
      return changePasswordAction(formData, request, params.locale!);
    }
    switch (String(intent)) {
      case "addDependent":
        return addDependentAction(formData, request);
      case "removeDependent":
        return removeDependentAction(formData, request);
      case "regeneratePaymentQr":
        return regeneratePaymentQrAction(String(formData.get("orderId")), request);
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function AccountPage({ loaderData, params }: Route.ComponentProps) {
  const tAccount = useTranslations("account");
  const dateLocale = params.locale === "en" ? "en-GB" : "cs-CZ";
  const {
    error,
    ok,
    email,
    phone,
    personTypeName,
    credits,
    hasPassword,
    wcCode,
    activePasses,
    dependents,
    personTypes,
    ledger,
    pendingOrders,
    pendingOrderCleanupSettings,
  } = loaderData;

  function describeLedgerEntry(row: LedgerRow): { title: string; detail?: string } {
    const method = metaField(row.meta, "method");
    const methodLabel =
      method === "QR" || method === "GOPAY" || method === "MANUAL" ? tAccount(`ledger.method${method}`) : undefined;
    const dependentName = row.dependent?.name;

    switch (row.reason) {
      case "payment_confirmed":
        return {
          title: tAccount("ledger.paymentConfirmed"),
          detail: methodLabel ? tAccount("ledger.viaMethod", { method: methodLabel }) : undefined,
        };
      case "payment_confirmed_dependent":
        return {
          title: dependentName
            ? tAccount("ledger.forDependentPurchase", { name: dependentName })
            : tAccount("ledger.paymentConfirmed"),
          detail: methodLabel ? tAccount("ledger.viaMethod", { method: methodLabel }) : undefined,
        };
      case "payment_confirmed_pass": {
        const validTo = metaField(row.meta, "validTo");
        return {
          title: tAccount("ledger.paymentConfirmedPass"),
          detail: validTo
            ? tAccount("ledger.validUntil", { date: formatAppDateTime(new Date(validTo), dateLocale) })
            : undefined,
        };
      }
      case "manual": {
        const note = metaField(row.meta, "note");
        return {
          title: row.delta >= 0 ? tAccount("ledger.manualAdd") : tAccount("ledger.manualRemove"),
          detail: note && note !== "manual" ? tAccount("ledger.note", { note }) : undefined,
        };
      }
      case "gate_open_admin":
        return { title: tAccount("ledger.gateOpenAdmin") };
      case "gate_open_pass":
        return { title: tAccount("ledger.gateOpenPass") };
      case "gate_open":
        return { title: tAccount("ledger.gateOpen") };
      case "gate_open_dependent":
        return {
          title: dependentName ? tAccount("ledger.forDependentEntry", { name: dependentName }) : tAccount("ledger.gateOpen"),
        };
      case "gate_open_rollback":
        return {
          title: dependentName
            ? tAccount("ledger.gateOpenRollbackFor", { name: dependentName })
            : tAccount("ledger.gateOpenRollback"),
        };
      default:
        return { title: tAccount("ledger.other") };
    }
  }

  const changePasswordForm = (
    <>
      {ok === "1" && (
        <div className="mt-2">
          <StatusBanner tone="info">{tAccount("changePasswordSuccess")}</StatusBanner>
        </div>
      )}
      {error && (
        <div className="mt-2">
          <StatusBanner tone="danger">
            {tAccount(`errors.${error}` as "errors.short" | "errors.mismatch" | "errors.current")}
          </StatusBanner>
        </div>
      )}
      <Form method="post" className="mt-3 flex max-w-sm flex-col gap-3">
        {hasPassword && (
          <input type="password" name="currentPassword" placeholder={tAccount("currentPassword")} required className="input" />
        )}
        <input type="password" name="newPassword" placeholder={tAccount("newPassword")} required minLength={8} className="input" />
        <input
          type="password"
          name="confirmPassword"
          placeholder={tAccount("confirmNewPassword")}
          required
          minLength={8}
          className="input"
        />
        <button type="submit" className="btn btn-primary">
          {tAccount("changePasswordSubmit")}
        </button>
      </Form>
    </>
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-8">
      <div className="card">
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{tAccount("title")}</h1>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-[var(--ink)]">
          <dt className="text-[var(--muted)]">{tAccount("email")}</dt>
          <dd>{email}</dd>
          {phone && (
            <>
              <dt className="text-[var(--muted)]">{tAccount("phone")}</dt>
              <dd>{phone}</dd>
            </>
          )}
          <dt className="text-[var(--muted)]">{tAccount("personType")}</dt>
          <dd>{personTypeName ?? "—"}</dd>
          <dt className="text-[var(--muted)]">{tAccount("credits")}</dt>
          <dd>{credits}</dd>
          {activePasses.length > 0 && (
            <>
              <dt className="text-[var(--muted)]">{tAccount("activePasses.title")}</dt>
              <dd>
                <ul className="flex flex-col gap-0.5">
                  {activePasses.map((pass) => (
                    <li key={pass.id}>
                      {pass.label || tAccount("activePasses.unnamed")} —{" "}
                      {tAccount("activePasses.until", { date: formatAppDateTime(pass.validTo, dateLocale) })}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
        </dl>
      </div>

      {pendingOrders.length > 0 && (
        <div id="pending-payments" className="card scroll-mt-4">
          <h2 className="text-lg font-medium text-[var(--ink)]">{tAccount("pendingPayments.title")}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{tAccount("pendingPayments.payHereHint")}</p>
          <ul className="mt-3 divide-y divide-[var(--line)] text-sm text-[var(--ink)]">
            {pendingOrders.map((order) => (
              <li key={order.id} className="flex flex-col gap-1 py-1.5">
                <div className="flex items-center justify-between">
                  <span>
                    {tAccount("pendingPayments.amount", { amount: order.amountCzk })}
                    {order.credits > 0 && ` — ${tAccount("pendingPayments.credits", { count: order.credits })}`}
                  </span>
                  {order.variableSymbol && (
                    <span className="text-[var(--muted)]">{tAccount("pendingPayments.vs", { vs: order.variableSymbol })}</span>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {tAccount("pendingPayments.createdAt", { date: formatAppDateTime(order.createdAt, dateLocale) })}
                </p>
                {order.method === "QR" && (
                  <div className="flex justify-end">
                    <PendingPaymentQr orderId={order.id} amountCzk={order.amountCzk} variableSymbol={order.variableSymbol} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {pendingOrderCleanupSettings.enabled && (
            <div className="mt-3">
              <StatusBanner tone="warning">
                {tAccount("pendingPayments.autoCancelHint", { hours: pendingOrderCleanupSettings.maxAgeHours })}
              </StatusBanner>
            </div>
          )}
        </div>
      )}

      {wcCode && (
        <div className="card">
          <h2 className="text-lg font-medium text-[var(--ink)]">{tAccount("wcCode.title")}</h2>
          <p className="mt-2 text-2xl font-semibold tracking-widest text-[var(--ink)]">{wcCode}</p>
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{tAccount("dependents.title")}</h2>
        <DependentsManager dependents={dependents} personTypes={personTypes} />
      </div>

      <div className="card hidden sm:block">
        <h2 className="text-lg font-medium text-[var(--ink)]">{tAccount("changePasswordTitle")}</h2>
        {changePasswordForm}
      </div>

      {/* Mobile only — password change is low-frequency, collapsed to save scroll length; stays a full standalone card on desktop above. */}
      <details className="card sm:hidden">
        <summary className="cursor-pointer text-lg font-medium text-[var(--ink)]">{tAccount("passwordSettingsTitle")}</summary>
        <div className="mt-3">{changePasswordForm}</div>
      </details>

      <div className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{tAccount("historyTitle")}</h2>
        <ul className="mt-3 divide-y divide-[var(--line)] text-sm">
          {ledger.map((row) => {
            const { title, detail } = describeLedgerEntry(row);
            return (
              <li key={row.id} className="flex items-start justify-between gap-3 py-2 text-[var(--ink)]">
                <div className="flex flex-col">
                  <span>{title}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {formatAppDateTime(row.createdAt, dateLocale)}
                    {detail ? ` — ${detail}` : ""}
                  </span>
                </div>
                <span className={`shrink-0 font-medium ${row.delta > 0 ? "text-[var(--ok)]" : "text-[var(--muted)]"}`}>
                  {row.delta > 0 ? `+${row.delta}` : row.delta}
                </span>
              </li>
            );
          })}
          {ledger.length === 0 && <li className="py-2 text-[var(--muted)]">{tAccount("historyEmpty")}</li>}
        </ul>
      </div>
    </div>
  );
}
