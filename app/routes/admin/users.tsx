import { Form, data } from "react-router";
import type { Prisma, Role } from "@prisma/client";
import type { Route } from "./+types/users";
import { getPrisma } from "@/lib/db";
import { withLoadContext } from "@/lib/request-context.server";
import { getSessionUser } from "@/lib/session.server";
import {
  adminAdjustEntriesAction,
  adminApproveUserAction,
  adminCreateUserAction,
  adminDeleteUserAction,
  adminGrantPackageAction,
  adminImpersonateAction,
  adminRevokeAccessPassAction,
  adminSetPasswordAction,
  adminSetPersonTypeAction,
  adminSetRoleAction,
  adminSetUserGroupsAction,
  adminToggleSuspendAction,
} from "@/lib/actions/admin-users";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { BirthDateInput } from "@/components/BirthDateInput";
import { periodLabelKey } from "@/lib/access-pass";
import { calculateAge, formatAppDateTime, toAppDateValue } from "@/lib/time";
import { isRootRole } from "@/lib/roles";
import { useTranslations } from "@/i18n/translations";

const inputClass = "input !py-1 text-sm";
const buttonClass = "btn btn-secondary !px-2 !py-1 text-xs";
const primaryButtonClass = "btn btn-primary !px-3 !py-1.5 text-xs";

function cap(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

const ROLE_VALUES = ["MEMBER", "STAFF", "ADMIN", "ROOT"] as const;
const CATEGORY_VALUES = ["minor", "child", "student", "senior"] as const;
type CategoryFilter = (typeof CATEGORY_VALUES)[number];

function getAge(birthDate: Date | null): number | null {
  return birthDate ? calculateAge(toAppDateValue(birthDate)) : null;
}

/** Age in years for a 15-17 year old (needs guardian consent to be approved), or null otherwise/if birth date is unknown. */
function minorAge(birthDate: Date | null): number | null {
  const age = getAge(birthDate);
  return age !== null && age >= 15 && age < 18 ? age : null;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const dateLocale = params.locale === "en" ? "en-GB" : "cs-CZ";
    const sessionUser = await getSessionUser(request);
    const actorIsRoot = isRootRole(sessionUser?.role);
    const now = new Date();
    const searchParams = new URL(request.url).searchParams;
    const q = searchParams.get("q")?.trim() ?? "";
    const errorParam = searchParams.get("error") ?? undefined;
    const roleParam = searchParams.get("role") ?? "";
    const roleFilter = (ROLE_VALUES as readonly string[]).includes(roleParam) ? (roleParam as Role) : "";
    const approvedFilter = searchParams.get("approved") ?? "";
    const categoryParam = searchParams.get("category") ?? "";
    const categoryFilter = (CATEGORY_VALUES as readonly string[]).includes(categoryParam)
      ? (categoryParam as CategoryFilter)
      : "";

    const where: Prisma.UserWhereInput = {};
    if (q) where.OR = [{ name: { contains: q } }, { email: { contains: q } }];
    if (roleFilter) where.role = roleFilter;
    if (approvedFilter === "yes") where.status = "APPROVED";
    if (approvedFilter === "no") where.status = { not: "APPROVED" };
    // "student"/"senior" are PersonType flags on the assigned price list (see
    // pricing.tsx's isMinorCategory/isSeniorCategory checkboxes — labelled
    // "Student"/"Senior 60+" there despite the isMinorCategory field name).
    // "minor"/"child" are age brackets computed from birthDate below instead,
    // since there's no DB column for them.
    if (categoryFilter === "student") where.personType = { isMinorCategory: true };
    if (categoryFilter === "senior") where.personType = { isSeniorCategory: true };

    const prisma = await getPrisma();
    const [usersRaw, groups, personTypes, packages] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          personType: true,
          groups: { include: { group: true } },
          accessPasses: { where: { validTo: { gte: now } }, orderBy: { validTo: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.group.findMany({ orderBy: { name: "asc" } }),
      prisma.personType.findMany({ orderBy: { name: "asc" } }),
      prisma.pricePackage.findMany({
        // FAMILY packages credit multiple people (self + companions) — this
        // tool grants one package to exactly one user, no companion picker,
        // so it has no coherent meaning here.
        where: { active: true, kind: { not: "FAMILY" } },
        include: { personType: true },
        orderBy: [{ personType: { name: "asc" } }, { kind: "asc" }, { priceCzk: "asc" }],
      }),
    ]);

    function packageLabel(pkg: (typeof packages)[number]) {
      if (pkg.kind === "PERIOD") {
        const period =
          pkg.periodPreset === "CUSTOM" && pkg.periodFrom && pkg.periodTo
            ? `${formatAppDateTime(pkg.periodFrom, dateLocale)} → ${formatAppDateTime(pkg.periodTo, dateLocale)}`
            : periodLabelKey(pkg.periodPreset);
        return { kind: "PERIOD" as const, period, price: pkg.priceCzk };
      }
      return { kind: "CREDITS" as const, credits: pkg.credits, price: pkg.priceCzk };
    }

    // "minor"/"child" have no DB column (they're age brackets derived from
    // birthDate), so they're applied here instead of in the `where` above.
    const usersFiltered =
      categoryFilter === "minor" || categoryFilter === "child"
        ? usersRaw.filter((user) => {
            const age = getAge(user.birthDate);
            if (age === null) return false;
            return categoryFilter === "minor" ? age >= 15 && age < 18 : age < 15;
          })
        : usersRaw;

    return data({
      q,
      errorParam,
      roleFilter,
      approvedFilter,
      categoryFilter,
      actorIsRoot,
      sessionUserId: sessionUser?.id ?? null,
      groups,
      personTypes,
      packages: packages.map((pkg) => ({
        id: pkg.id,
        personTypeName: pkg.personType.name,
        label: packageLabel(pkg),
      })),
      users: usersFiltered.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        role: user.role,
        suspended: user.suspended,
        credits: user.credits,
        birthDate: user.birthDate,
        personTypeId: user.personTypeId,
        groupIds: user.groups.map((ug) => ug.groupId),
        accessPasses: user.accessPasses.map((pass) => ({ id: pass.id, validTo: pass.validTo })),
      })),
    });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "approveUser":
        return adminApproveUserAction(String(formData.get("userId") || ""), true);
      case "rejectUser":
        return adminApproveUserAction(String(formData.get("userId") || ""), false);
      case "setRole":
        return adminSetRoleAction(formData, request);
      case "createUser":
        return adminCreateUserAction(formData, request, params.locale!);
      case "toggleSuspend":
        return adminToggleSuspendAction(String(formData.get("userId") || ""), formData.get("suspended") === "true");
      case "deleteUser":
        return adminDeleteUserAction(String(formData.get("userId") || ""), request);
      case "impersonate":
        return adminImpersonateAction(formData, request, params.locale!);
      case "setPersonType":
        return adminSetPersonTypeAction(formData);
      case "adjustEntries":
        return adminAdjustEntriesAction(formData, request);
      case "setPassword":
        return adminSetPasswordAction(formData);
      case "grantPackage":
        return adminGrantPackageAction(formData, request);
      case "revokeAccessPass":
        return adminRevokeAccessPassAction(String(formData.get("passId") || ""));
      case "setUserGroups":
        return adminSetUserGroupsAction(formData);
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function AdminUsersPage({ loaderData, params }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const tBuy = useTranslations("buy");
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth");
  const dateLocale = params.locale === "en" ? "en-GB" : "cs-CZ";
  const { q, errorParam, roleFilter, approvedFilter, categoryFilter, actorIsRoot, sessionUserId, groups, personTypes, packages, users } =
    loaderData;
  const hasFilters = Boolean(q || roleFilter || approvedFilter || categoryFilter);

  function packageLabelText(pkg: (typeof packages)[number]) {
    return pkg.label.kind === "PERIOD"
      ? t("pricing.packagePeriodLabel", { period: tBuy(pkg.label.period as Parameters<typeof tBuy>[0]), price: pkg.label.price })
      : `${tBuy("creditsPackage", { count: pkg.label.credits })} — ${tBuy("priceLabel", { price: pkg.label.price })}`;
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("users.title")}</h1>

      <form method="get" className="card flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("users.searchLabel")}
          <input name="q" defaultValue={q} placeholder={t("users.searchPlaceholder")} className={`${inputClass} w-64`} />
        </label>
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("users.filterRole")}
          <select name="role" defaultValue={roleFilter} className={inputClass}>
            <option value="">{t("users.filterAll")}</option>
            <option value="MEMBER">MEMBER</option>
            <option value="STAFF">STAFF</option>
            <option value="ADMIN">ADMIN</option>
            <option value="ROOT">ROOT</option>
          </select>
        </label>
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("users.filterApproved")}
          <select name="approved" defaultValue={approvedFilter} className={inputClass}>
            <option value="">{t("users.filterAll")}</option>
            <option value="yes">{t("users.filterApprovedYes")}</option>
            <option value="no">{t("users.filterApprovedNo")}</option>
          </select>
        </label>
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("users.filterCategory")}
          <select name="category" defaultValue={categoryFilter} className={inputClass}>
            <option value="">{t("users.filterAll")}</option>
            <option value="minor">{t("users.filterCategoryMinor")}</option>
            <option value="child">{t("users.filterCategoryChild")}</option>
            <option value="student">{t("users.filterCategoryStudent")}</option>
            <option value="senior">{t("users.filterCategorySenior")}</option>
          </select>
        </label>
        <button type="submit" className={buttonClass}>
          {t("users.searchSubmit")}
        </button>
        {hasFilters && (
          <a href="?" className={buttonClass}>
            {t("users.searchClear")}
          </a>
        )}
      </form>

      <details className="card" open={errorParam === "tooYoung"}>
        <summary className="cursor-pointer font-medium">{t("users.createTitle")}</summary>
        {errorParam === "tooYoung" && (
          <p className="mt-2 rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
            {t("users.createErrorTooYoung")}
          </p>
        )}
        <Form method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="intent" value="createUser" />
          <input name="name" placeholder={tCommon("name")} className={inputClass} />
          <input name="email" type="email" placeholder={tCommon("email")} required className={inputClass} />
          <input name="phone" type="tel" placeholder={tCommon("phone")} className={inputClass} />
          <BirthDateInput label={tCommon("birthDate")} required pickerLabel={tCommon("pickDate")} inputClassName={inputClass} />
          <input name="password" type="password" placeholder={tAuth("password")} required minLength={8} className={inputClass} />
          <select name="role" defaultValue="MEMBER" className={inputClass}>
            <option value="MEMBER">MEMBER</option>
            <option value="STAFF">STAFF</option>
            <option value="ADMIN">ADMIN</option>
            {actorIsRoot && <option value="ROOT">ROOT</option>}
          </select>
          <select name="personTypeId" defaultValue="" className={inputClass}>
            <option value="">{t("users.personType")}</option>
            {personTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
          <button type="submit" className={`${primaryButtonClass} sm:col-span-2`}>
            {t("users.createSubmit")}
          </button>
        </Form>
      </details>

      {q && users.length === 0 && <p className="text-sm text-[var(--muted)]">{t("users.searchNoResults")}</p>}

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
                    {t(`users.status${cap(user.status)}` as "users.statusPending")}
                  </span>
                  <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5">{user.role}</span>
                  {age !== null && (
                    <span className="rounded-full bg-[var(--danger-bg)] px-2 py-0.5 text-[var(--danger)]">
                      {t("users.minor", { age })}
                    </span>
                  )}
                  {user.suspended && (
                    <span className="rounded-full bg-[var(--danger-bg)] px-2 py-0.5 text-[var(--danger)]">
                      {t("users.suspended")}
                    </span>
                  )}
                  <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5">
                    {t("users.entries")}: {user.credits}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {user.status === "PENDING" && (
                  <>
                    <Form method="post">
                      <input type="hidden" name="intent" value="approveUser" />
                      <input type="hidden" name="userId" value={user.id} />
                      <button className={primaryButtonClass}>{t("users.approve")}</button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="rejectUser" />
                      <input type="hidden" name="userId" value={user.id} />
                      <button className={buttonClass}>{t("users.reject")}</button>
                    </Form>
                  </>
                )}
                {(actorIsRoot || user.role !== "ROOT") && (
                  <Form method="post" className="flex items-center gap-1">
                    <input type="hidden" name="intent" value="setRole" />
                    <input type="hidden" name="userId" value={user.id} />
                    <select key={user.role} name="role" defaultValue={user.role} className={inputClass}>
                      <option value="MEMBER">MEMBER</option>
                      <option value="STAFF">STAFF</option>
                      <option value="ADMIN">ADMIN</option>
                      {actorIsRoot && <option value="ROOT">ROOT</option>}
                    </select>
                    <button className={buttonClass}>{tCommon("save")}</button>
                  </Form>
                )}
                {user.role !== "ROOT" && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="toggleSuspend" />
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="suspended" value={String(!user.suspended)} />
                    <button className={buttonClass}>{user.suspended ? t("users.unsuspend") : t("users.suspend")}</button>
                  </Form>
                )}
                {user.id !== sessionUserId && (actorIsRoot || user.role !== "ROOT") && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="deleteUser" />
                    <input type="hidden" name="userId" value={user.id} />
                    <ConfirmSubmitButton
                      confirmMessage={t("users.deleteConfirm", { email: user.email })}
                      className="btn btn-danger !px-2 !py-1 text-xs"
                    >
                      {tCommon("delete")}
                    </ConfirmSubmitButton>
                  </Form>
                )}
                {actorIsRoot && user.id !== sessionUserId && user.role !== "ROOT" && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="impersonate" />
                    <input type="hidden" name="userId" value={user.id} />
                    <ConfirmSubmitButton
                      confirmMessage={t("users.impersonateConfirm", { email: user.email })}
                      className={buttonClass}
                    >
                      {t("users.impersonate")}
                    </ConfirmSubmitButton>
                  </Form>
                )}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Form method="post" className="flex items-center gap-1">
                  <input type="hidden" name="intent" value="setPersonType" />
                  <input type="hidden" name="userId" value={user.id} />
                  <select key={user.personTypeId} name="personTypeId" defaultValue={user.personTypeId ?? ""} className={inputClass}>
                    <option value="">{t("users.personType")}</option>
                    {personTypes.map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        {pt.name}
                      </option>
                    ))}
                  </select>
                  <button className={buttonClass}>{tCommon("save")}</button>
                </Form>

                <Form method="post" className="flex items-center gap-1">
                  <input type="hidden" name="intent" value="adjustEntries" />
                  <input type="hidden" name="userId" value={user.id} />
                  <input name="amount" type="number" placeholder={t("users.amount")} className={`${inputClass} w-20`} required />
                  <input name="note" placeholder={t("users.note")} className={`${inputClass} w-24`} />
                  <button className={buttonClass}>{t("users.addEntries")}</button>
                </Form>

                <Form method="post" className="flex items-center gap-1">
                  <input type="hidden" name="intent" value="setPassword" />
                  <input type="hidden" name="userId" value={user.id} />
                  <input name="password" type="password" placeholder={t("users.setPassword")} minLength={8} className={inputClass} />
                  <button className={buttonClass}>{t("users.setPassword")}</button>
                </Form>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">{t("users.amountHint")}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
                <span className="text-sm text-[var(--muted)]">{t("users.packagesTitle")}:</span>
                <Form method="post" className="flex items-center gap-1">
                  <input type="hidden" name="intent" value="grantPackage" />
                  <input type="hidden" name="userId" value={user.id} />
                  <select name="packageId" defaultValue="" required className={inputClass}>
                    <option value="" disabled>
                      {t("users.selectPackage")}
                    </option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.personTypeName} — {packageLabelText(pkg)}
                      </option>
                    ))}
                  </select>
                  <button className={buttonClass}>{t("users.grantPackage")}</button>
                </Form>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[var(--muted)]">{t("users.activePasses")}:</span>
                {user.accessPasses.length === 0 && <span className="text-[var(--muted)]">{t("users.noActivePasses")}</span>}
                {user.accessPasses.map((pass) => (
                  <Form
                    key={pass.id}
                    method="post"
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-accent)] px-2 py-0.5"
                  >
                    <input type="hidden" name="intent" value="revokeAccessPass" />
                    <input type="hidden" name="passId" value={pass.id} />
                    <span>{t("users.passValidUntil", { date: formatAppDateTime(pass.validTo, dateLocale) })}</span>
                    <ConfirmSubmitButton
                      confirmMessage={t("users.revokePassConfirm", { date: formatAppDateTime(pass.validTo, dateLocale) })}
                      className="text-[var(--danger)]"
                    >
                      {t("users.revokePass")}
                    </ConfirmSubmitButton>
                  </Form>
                ))}
              </div>

              <Form method="post" className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <input type="hidden" name="intent" value="setUserGroups" />
                <input type="hidden" name="userId" value={user.id} />
                <span className="text-[var(--muted)]">{t("users.groups")}:</span>
                {groups.map((g) => (
                  <label key={g.id} className="flex items-center gap-1">
                    <input type="checkbox" name="groupIds" value={g.id} defaultChecked={user.groupIds.includes(g.id)} />
                    {g.name}
                  </label>
                ))}
                <button className={buttonClass}>{tCommon("save")}</button>
              </Form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
