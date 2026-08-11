import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  adminApproveUserAction,
  adminCreateUserAction,
  adminAdjustEntriesAction,
  adminGrantPackageAction,
  adminRevokeAccessPassAction,
  adminDeleteUserAction,
  adminSetPasswordAction,
  adminSetPersonTypeAction,
  adminSetRoleAction,
  adminSetUserGroupsAction,
  adminToggleSuspendAction,
} from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { BirthDateInput } from "@/components/BirthDateInput";
import { periodLabelKey } from "@/lib/access-pass";
import { calculateAge, formatAppDateTime, toAppDateValue } from "@/lib/time";
import { isRootRole } from "@/lib/roles";

const inputClass = "input !py-1 text-sm";
const buttonClass = "btn btn-secondary !px-2 !py-1 text-xs";
const primaryButtonClass = "btn btn-primary !px-3 !py-1.5 text-xs";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, t, tPricing, tBuy, tCommon, tAuth, locale, session] = await Promise.all([
    searchParams,
    getTranslations("admin.users"),
    getTranslations("admin.pricing"),
    getTranslations("buy"),
    getTranslations("common"),
    getTranslations("auth"),
    getLocale(),
    auth(),
  ]);
  const dateLocale = locale === "en" ? "en-GB" : "cs-CZ";
  const actorIsRoot = isRootRole(session?.user.role);
  const now = new Date();
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? "";
  const errorParam = Array.isArray(sp.error) ? sp.error[0] : sp.error;

  const [users, groups, personTypes, packages] = await Promise.all([
    prisma.user.findMany({
      where: q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : undefined,
      include: {
        personType: true,
        groups: { include: { group: true } },
        accessPasses: {
          where: { validTo: { gte: now } },
          orderBy: { validTo: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.group.findMany({ orderBy: { name: "asc" } }),
    prisma.personType.findMany({ orderBy: { name: "asc" } }),
    prisma.pricePackage.findMany({
      where: { active: true },
      include: { personType: true },
      orderBy: [{ personType: { name: "asc" } }, { kind: "asc" }, { priceCzk: "asc" }],
    }),
  ]);

  function packageLabel(pkg: (typeof packages)[number]) {
    if (pkg.kind === "PERIOD") {
      const period =
        pkg.periodPreset === "CUSTOM" && pkg.periodFrom && pkg.periodTo
          ? `${formatAppDateTime(pkg.periodFrom, dateLocale)} → ${formatAppDateTime(pkg.periodTo, dateLocale)}`
          : tBuy(periodLabelKey(pkg.periodPreset));
      return tPricing("packagePeriodLabel", { period, price: pkg.priceCzk });
    }
    return `${tBuy("creditsPackage", { count: pkg.credits })} — ${tBuy("priceLabel", { price: pkg.priceCzk })}`;
  }

  /** Age in years for a 15-17 year old (needs guardian consent to be approved), or null otherwise/if birth date is unknown. */
  function minorAge(birthDate: Date | null): number | null {
    if (!birthDate) return null;
    const age = calculateAge(toAppDateValue(birthDate));
    return age >= 15 && age < 18 ? age : null;
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>

      <form method="get" className="card flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("searchLabel")}
          <input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className={`${inputClass} w-64`} />
        </label>
        <button type="submit" className={buttonClass}>
          {t("searchSubmit")}
        </button>
        {q && (
          <a href="?" className={buttonClass}>
            {t("searchClear")}
          </a>
        )}
      </form>

      <details className="card" open={errorParam === "tooYoung"}>
        <summary className="cursor-pointer font-medium">{t("createTitle")}</summary>
        {errorParam === "tooYoung" && (
          <p className="mt-2 rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
            {t("createErrorTooYoung")}
          </p>
        )}
        <form action={adminCreateUserAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input name="name" placeholder={tCommon("name")} className={inputClass} />
          <input name="email" type="email" placeholder={tCommon("email")} required className={inputClass} />
          <input name="phone" type="tel" placeholder={tCommon("phone")} className={inputClass} />
          <BirthDateInput
            label={tCommon("birthDate")}
            required
            pickerLabel={tCommon("pickDate")}
            inputClassName={inputClass}
          />
          <input name="password" type="password" placeholder={tAuth("password")} required minLength={8} className={inputClass} />
          <select name="role" defaultValue="MEMBER" className={inputClass}>
            <option value="MEMBER">MEMBER</option>
            <option value="STAFF">STAFF</option>
            <option value="ADMIN">ADMIN</option>
            {actorIsRoot && <option value="ROOT">ROOT</option>}
          </select>
          <select name="personTypeId" defaultValue="" className={inputClass}>
            <option value="">{t("personType")}</option>
            {personTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
          <button type="submit" className={`${primaryButtonClass} sm:col-span-2`}>
            {t("createSubmit")}
          </button>
        </form>
      </details>

      {q && users.length === 0 && <p className="text-sm text-[var(--muted)]">{t("searchNoResults")}</p>}

      <div className="flex flex-col gap-4">
        {users.map((user) => {
          const age = minorAge(user.birthDate);
          return (
          <div key={user.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{user.name || user.email}</p>
                <p className="text-sm text-[var(--muted)]">{user.email}</p>
                {user.phone && <p className="text-sm text-[var(--muted)]">{user.phone}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5">
                  {t(`status${cap(user.status)}` as "statusPending")}
                </span>
                <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5">{user.role}</span>
                {age !== null && (
                  <span className="rounded-full bg-[var(--danger-bg)] px-2 py-0.5 text-[var(--danger)]">
                    {t("minor", { age })}
                  </span>
                )}
                {user.suspended && (
                  <span className="rounded-full bg-[var(--danger-bg)] px-2 py-0.5 text-[var(--danger)]">
                    {t("suspended")}
                  </span>
                )}
                <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5">
                  {t("entries")}: {user.credits}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {user.status === "PENDING" && (
                <>
                  <form action={adminApproveUserAction.bind(null, user.id, true)}>
                    <button className={primaryButtonClass}>{t("approve")}</button>
                  </form>
                  <form action={adminApproveUserAction.bind(null, user.id, false)}>
                    <button className={buttonClass}>{t("reject")}</button>
                  </form>
                </>
              )}
              {(actorIsRoot || user.role !== "ROOT") && (
                <form action={adminSetRoleAction} className="flex items-center gap-1">
                  <input type="hidden" name="userId" value={user.id} />
                  <select key={user.role} name="role" defaultValue={user.role} className={inputClass}>
                    <option value="MEMBER">MEMBER</option>
                    <option value="STAFF">STAFF</option>
                    <option value="ADMIN">ADMIN</option>
                    {actorIsRoot && <option value="ROOT">ROOT</option>}
                  </select>
                  <button className={buttonClass}>{tCommon("save")}</button>
                </form>
              )}
              <form action={adminToggleSuspendAction.bind(null, user.id, !user.suspended)}>
                <button className={buttonClass}>{user.suspended ? t("unsuspend") : t("suspend")}</button>
              </form>
              {user.id !== session?.user.id && (
                <form action={adminDeleteUserAction.bind(null, user.id)}>
                  <ConfirmSubmitButton
                    confirmMessage={t("deleteConfirm", { email: user.email })}
                    className="btn btn-danger !px-2 !py-1 text-xs"
                  >
                    {tCommon("delete")}
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <form action={adminSetPersonTypeAction} className="flex items-center gap-1">
                <input type="hidden" name="userId" value={user.id} />
                <select key={user.personTypeId} name="personTypeId" defaultValue={user.personTypeId ?? ""} className={inputClass}>
                  <option value="">{t("personType")}</option>
                  {personTypes.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.name}
                    </option>
                  ))}
                </select>
                <button className={buttonClass}>{tCommon("save")}</button>
              </form>

              <form action={adminAdjustEntriesAction} className="flex items-center gap-1">
                <input type="hidden" name="userId" value={user.id} />
                <input name="amount" type="number" placeholder={t("amount")} className={`${inputClass} w-20`} required />
                <input name="note" placeholder={t("note")} className={`${inputClass} w-24`} />
                <button className={buttonClass}>{t("addEntries")}</button>
              </form>

              <form action={adminSetPasswordAction} className="flex items-center gap-1">
                <input type="hidden" name="userId" value={user.id} />
                <input name="password" type="password" placeholder={t("setPassword")} minLength={8} className={inputClass} />
                <button className={buttonClass}>{t("setPassword")}</button>
              </form>
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">{t("amountHint")}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
              <span className="text-sm text-[var(--muted)]">{t("packagesTitle")}:</span>
              <form action={adminGrantPackageAction} className="flex items-center gap-1">
                <input type="hidden" name="userId" value={user.id} />
                <select name="packageId" defaultValue="" required className={inputClass}>
                  <option value="" disabled>
                    {t("selectPackage")}
                  </option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.personType.name} — {packageLabel(pkg)}
                    </option>
                  ))}
                </select>
                <button className={buttonClass}>{t("grantPackage")}</button>
              </form>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[var(--muted)]">{t("activePasses")}:</span>
              {user.accessPasses.length === 0 && <span className="text-[var(--muted)]">{t("noActivePasses")}</span>}
              {user.accessPasses.map((pass) => (
                <form
                  key={pass.id}
                  action={adminRevokeAccessPassAction.bind(null, pass.id)}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-accent)] px-2 py-0.5"
                >
                  <span>{t("passValidUntil", { date: formatAppDateTime(pass.validTo, dateLocale) })}</span>
                  <ConfirmSubmitButton
                    confirmMessage={t("revokePassConfirm", { date: formatAppDateTime(pass.validTo, dateLocale) })}
                    className="text-[var(--danger)]"
                  >
                    {t("revokePass")}
                  </ConfirmSubmitButton>
                </form>
              ))}
            </div>

            <form action={adminSetUserGroupsAction} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <input type="hidden" name="userId" value={user.id} />
              <span className="text-[var(--muted)]">{t("groups")}:</span>
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    name="groupIds"
                    value={g.id}
                    defaultChecked={user.groups.some((ug) => ug.groupId === g.id)}
                  />
                  {g.name}
                </label>
              ))}
              <button className={buttonClass}>{tCommon("save")}</button>
            </form>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function cap(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}
