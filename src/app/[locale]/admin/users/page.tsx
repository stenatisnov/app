import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";
import {
  adminApproveUserAction,
  adminCreateUserAction,
  adminAddCreditsAction,
  adminDeleteUserAction,
  adminSetPasswordAction,
  adminSetPersonTypeAction,
  adminSetRoleAction,
  adminSetUserGroupsAction,
  adminToggleSuspendAction,
} from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

const inputClass = "input !py-1 text-sm";
const buttonClass = "btn btn-secondary !px-2 !py-1 text-xs";
const primaryButtonClass = "btn btn-primary !px-3 !py-1.5 text-xs";

export default async function AdminUsersPage() {
  const t = await getTranslations("admin.users");
  const tCommon = await getTranslations("common");
  const tAuth = await getTranslations("auth");

  const [users, groups, personTypes] = await Promise.all([
    prisma.user.findMany({
      include: { personType: true, groups: { include: { group: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.group.findMany({ orderBy: { name: "asc" } }),
    prisma.personType.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>

      <details className="card">
        <summary className="cursor-pointer font-medium">{t("createTitle")}</summary>
        <form action={adminCreateUserAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input name="name" placeholder={tCommon("name")} className={inputClass} />
          <input name="email" type="email" placeholder={tCommon("email")} required className={inputClass} />
          <input name="password" type="password" placeholder={tAuth("password")} required minLength={8} className={inputClass} />
          <select name="role" defaultValue="MEMBER" className={inputClass}>
            <option value="MEMBER">MEMBER</option>
            <option value="ADMIN">ADMIN</option>
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

      <div className="flex flex-col gap-4">
        {users.map((user) => (
          <div key={user.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{user.name || user.email}</p>
                <p className="text-sm text-[var(--muted)]">{user.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5">
                  {t(`status${cap(user.status)}` as "statusPending")}
                </span>
                <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5">{user.role}</span>
                {user.suspended && (
                  <span className="rounded-full bg-[var(--danger-bg)] px-2 py-0.5 text-[var(--danger)]">
                    {t("suspended")}
                  </span>
                )}
                <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5">
                  {tCommon("credits")}: {user.credits}
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
              <form action={adminToggleSuspendAction.bind(null, user.id, !user.suspended)}>
                <button className={buttonClass}>{user.suspended ? t("unsuspend") : t("suspend")}</button>
              </form>
              <form action={adminSetRoleAction.bind(null, user.id, user.role === "ADMIN" ? Role.MEMBER : Role.ADMIN)}>
                <button className={buttonClass}>{user.role === "ADMIN" ? t("makeMember") : t("makeAdmin")}</button>
              </form>
              <form action={adminDeleteUserAction.bind(null, user.id)}>
                <ConfirmSubmitButton
                  confirmMessage={t("deleteConfirm", { email: user.email })}
                  className={`${buttonClass} text-[var(--danger)]`}
                >
                  {tCommon("delete")}
                </ConfirmSubmitButton>
              </form>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <form action={adminSetPersonTypeAction} className="flex items-center gap-1">
                <input type="hidden" name="userId" value={user.id} />
                <select name="personTypeId" defaultValue={user.personTypeId ?? ""} className={inputClass}>
                  <option value="">{t("personType")}</option>
                  {personTypes.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.name}
                    </option>
                  ))}
                </select>
                <button className={buttonClass}>{tCommon("save")}</button>
              </form>

              <form action={adminAddCreditsAction} className="flex items-center gap-1">
                <input type="hidden" name="userId" value={user.id} />
                <input name="amount" type="number" placeholder={t("amount")} className={`${inputClass} w-20`} required />
                <input name="note" placeholder={t("note")} className={`${inputClass} w-24`} />
                <button className={buttonClass}>{t("addCredits")}</button>
              </form>

              <form action={adminSetPasswordAction} className="flex items-center gap-1">
                <input type="hidden" name="userId" value={user.id} />
                <input name="password" type="password" placeholder={t("setPassword")} minLength={8} className={inputClass} />
                <button className={buttonClass}>{t("setPassword")}</button>
              </form>
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
        ))}
      </div>
    </div>
  );
}

function cap(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}
