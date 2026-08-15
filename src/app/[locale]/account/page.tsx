import { getLocale, getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatAppDateTime } from "@/lib/time";
import { changePasswordAction } from "@/app/actions";
import { StatusBanner } from "@/components/StatusBanner";
import { DependentsManager } from "@/components/DependentsManager";
import { getWcCodeSettingsStored } from "@/lib/settings";
import type { CreditLedger } from "@prisma/client";

type LedgerRow = CreditLedger & { dependent: { name: string } | null };

function metaField(meta: CreditLedger["meta"], key: string): string | undefined {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const value = (meta as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const session = await requireSession();
  const [tAccount, tLedger, locale] = await Promise.all([
    getTranslations("account"),
    getTranslations("account.ledger"),
    getLocale(),
  ]);
  const dateLocale = locale === "en" ? "en-GB" : "cs-CZ";

  const [user, ledger, dependents, personTypes, wcCode] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, include: { personType: true } }),
    prisma.creditLedger.findMany({
      where: { userId: session.user.id },
      include: { dependent: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.dependent.findMany({
      where: { parentUserId: session.user.id },
      include: { personType: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.personType.findMany({ where: { visibleToUsers: true }, orderBy: { name: "asc" } }),
    getWcCodeSettingsStored(),
  ]);
  if (!user) return null;

  function describeLedgerEntry(row: LedgerRow): { title: string; detail?: string } {
    const method = metaField(row.meta, "method");
    const methodLabel =
      method === "QR" || method === "GOPAY" || method === "MANUAL" ? tLedger(`method${method}`) : undefined;
    const dependentName = row.dependent?.name;

    switch (row.reason) {
      case "payment_confirmed":
        return {
          title: tLedger("paymentConfirmed"),
          detail: methodLabel ? tLedger("viaMethod", { method: methodLabel }) : undefined,
        };
      case "payment_confirmed_dependent":
        return {
          title: dependentName ? tLedger("forDependentPurchase", { name: dependentName }) : tLedger("paymentConfirmed"),
          detail: methodLabel ? tLedger("viaMethod", { method: methodLabel }) : undefined,
        };
      case "payment_confirmed_pass": {
        const validTo = metaField(row.meta, "validTo");
        return {
          title: tLedger("paymentConfirmedPass"),
          detail: validTo ? tLedger("validUntil", { date: formatAppDateTime(new Date(validTo), dateLocale) }) : undefined,
        };
      }
      case "manual": {
        const note = metaField(row.meta, "note");
        return {
          title: row.delta >= 0 ? tLedger("manualAdd") : tLedger("manualRemove"),
          detail: note && note !== "manual" ? tLedger("note", { note }) : undefined,
        };
      }
      case "gate_open_admin":
        return { title: tLedger("gateOpenAdmin") };
      case "gate_open_pass":
        return { title: tLedger("gateOpenPass") };
      case "gate_open":
        return { title: tLedger("gateOpen") };
      case "gate_open_dependent":
        return { title: dependentName ? tLedger("forDependentEntry", { name: dependentName }) : tLedger("gateOpen") };
      case "gate_open_rollback":
        return {
          title: dependentName ? tLedger("gateOpenRollbackFor", { name: dependentName }) : tLedger("gateOpenRollback"),
        };
      default:
        return { title: tLedger("other") };
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
      <form action={changePasswordAction} className="mt-3 flex max-w-sm flex-col gap-3">
        {user.passwordHash && (
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
      </form>
    </>
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-8">
      <div className="card">
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{tAccount("title")}</h1>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-[var(--ink)]">
          <dt className="text-[var(--muted)]">{tAccount("email")}</dt>
          <dd>{user.email}</dd>
          {user.phone && (
            <>
              <dt className="text-[var(--muted)]">{tAccount("phone")}</dt>
              <dd>{user.phone}</dd>
            </>
          )}
          <dt className="text-[var(--muted)]">{tAccount("personType")}</dt>
          <dd>{user.personType?.name ?? "—"}</dd>
          <dt className="text-[var(--muted)]">{tAccount("credits")}</dt>
          <dd>{user.credits}</dd>
        </dl>
      </div>

      {wcCode.code && (
        <div className="card hidden sm:block">
          <h2 className="text-lg font-medium text-[var(--ink)]">{tAccount("wcCode.title")}</h2>
          <p className="mt-2 text-2xl font-semibold tracking-widest text-[var(--ink)]">{wcCode.code}</p>
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-medium text-[var(--ink)]">{tAccount("dependents.title")}</h2>
        <DependentsManager
          dependents={dependents.map((dep) => ({
            id: dep.id,
            name: dep.name,
            personTypeName: dep.personType?.name ?? null,
            credits: dep.credits,
          }))}
          personTypes={personTypes.map((pt) => ({ id: pt.id, name: pt.name }))}
        />
      </div>

      <div className="card hidden sm:block">
        <h2 className="text-lg font-medium text-[var(--ink)]">{tAccount("changePasswordTitle")}</h2>
        {changePasswordForm}
      </div>

      {/* Mobile only — WC-code + change-password are low-frequency, collapsed to save scroll length; both stay full standalone cards on desktop above. */}
      <details className="card sm:hidden">
        <summary className="cursor-pointer text-lg font-medium text-[var(--ink)]">{tAccount("settingsTitle")}</summary>
        <div className="mt-3 flex flex-col gap-4">
          {wcCode.code && (
            <div>
              <h3 className="text-sm font-medium text-[var(--ink)]">{tAccount("wcCode.title")}</h3>
              <p className="mt-1 text-xl font-semibold tracking-widest text-[var(--ink)]">{wcCode.code}</p>
            </div>
          )}
          <div>
            <h3 className="text-sm font-medium text-[var(--ink)]">{tAccount("changePasswordTitle")}</h3>
            {changePasswordForm}
          </div>
        </div>
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
