import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireStaffOrAbove } from "@/lib/session";
import { isStaffOnlyRole } from "@/lib/roles";
import { staffApproveUserAction, staffSetPersonTypeAction } from "@/app/actions";
import { SaveButton } from "@/components/SaveButton";
import { calculateAge, toAppDateValue } from "@/lib/time";

function cap(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

/** Age for a 15-17 year old (needs guardian consent to be approved), or null otherwise/if birth date is unknown — same rule as admin/users. */
function minorAge(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  const age = calculateAge(toAppDateValue(birthDate));
  return age >= 15 && age < 18 ? age : null;
}

export default async function SetPersonTypePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pending?: string; minor?: string }>;
}) {
  const session = await requireStaffOrAbove();
  const staffOnly = isStaffOnlyRole(session.user.role);
  const [{ q: qParam, pending: pendingParam, minor: minorParam }, t, tCommon] = await Promise.all([
    searchParams,
    getTranslations("setPersonType"),
    getTranslations("common"),
  ]);
  const q = qParam?.trim() ?? "";
  const pendingOnly = pendingParam === "1";
  const minorOnly = minorParam === "1";

  const [allUsers, personTypes] = await Promise.all([
    prisma.user.findMany({
      where: q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : undefined,
      include: { personType: true },
      orderBy: { name: "asc" },
    }),
    // STAFF only assigns publicly-visible price lists; ADMIN/ROOT can also
    // assign hidden ones (visibleToUsers: false — see the PersonType model).
    prisma.personType.findMany({
      where: staffOnly ? { visibleToUsers: true } : undefined,
      orderBy: { name: "asc" },
    }),
  ]);
  const users = allUsers.filter(
    (user) => (!pendingOnly || user.status === "PENDING") && (!minorOnly || minorAge(user.birthDate) !== null),
  );
  const visiblePersonTypeIds = new Set(personTypes.map((pt) => pt.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("hint")}</p>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("searchLabel")}
          <input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="input !py-1 w-64 text-sm" />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-sm">
          <input type="checkbox" name="pending" value="1" defaultChecked={pendingOnly} />
          {t("filterPending")}
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-sm">
          <input type="checkbox" name="minor" value="1" defaultChecked={minorOnly} />
          {t("filterMinor")}
        </label>
        <button type="submit" className="btn btn-secondary !px-2 !py-1 text-xs">
          {t("searchSubmit")}
        </button>
        {(q || pendingOnly || minorOnly) && (
          <a href="?" className="btn btn-secondary !px-2 !py-1 text-xs">
            {t("searchClear")}
          </a>
        )}
      </form>

      {users.length === 0 && <p className="text-sm text-[var(--muted)]">{t("searchNoResults")}</p>}

      <div className="flex flex-col gap-3">
        {users.map((user) => {
          const age = minorAge(user.birthDate);
          // A hidden price list already assigned to this user (by an admin) must not
          // silently disappear from the <select> and get cleared on save — STAFF just
          // can't change it here.
          const hiddenAssigned = staffOnly && Boolean(user.personTypeId) && !visiblePersonTypeIds.has(user.personTypeId!);
          return (
          <div key={user.id} className="card flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <p className="font-medium text-[var(--ink)]">{user.name || user.email}</p>
                <p className="text-sm text-[var(--muted)]">{user.email}</p>
              </div>
              <span className="rounded-full bg-[var(--bg-accent)] px-2 py-0.5 text-xs">
                {t(`status${cap(user.status)}` as "statusPending")}
              </span>
              {age !== null && (
                <span className="rounded-full bg-[var(--danger-bg)] px-2 py-0.5 text-xs text-[var(--danger)]">
                  {t("minor", { age })}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {user.status === "PENDING" && (
                <>
                  <form action={staffApproveUserAction.bind(null, user.id, true)}>
                    <button className="btn btn-primary !px-2 !py-1 text-xs">{t("approve")}</button>
                  </form>
                  <form action={staffApproveUserAction.bind(null, user.id, false)}>
                    <button className="btn btn-secondary !px-2 !py-1 text-xs">{t("reject")}</button>
                  </form>
                </>
              )}
              {hiddenAssigned ? (
                <span className="text-sm text-[var(--muted)]">{user.personType?.name}</span>
              ) : (
                <form action={staffSetPersonTypeAction} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={user.id} />
                  <label className="flex flex-col text-xs text-[var(--muted)]">
                    {t("personTypeLabel")}
                    <select
                      key={user.personTypeId}
                      name="personTypeId"
                      defaultValue={user.personTypeId ?? ""}
                      className="input !py-1 text-sm"
                    >
                      <option value="">{t("personType")}</option>
                      {personTypes.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SaveButton
                    label={tCommon("save")}
                    savedLabel={tCommon("saved")}
                    buttonClassName="btn btn-secondary !px-2 !py-1 text-xs"
                  />
                </form>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
