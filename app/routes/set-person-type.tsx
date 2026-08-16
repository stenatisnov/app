import { Form, data } from "react-router";
import type { Route } from "./+types/set-person-type";
import { getPrisma } from "@/lib/db.server";
import { withLoadContext } from "@/lib/request-context.server";
import { requireStaffOrAbove } from "@/lib/session.server";
import { isStaffOnlyRole } from "@/lib/roles";
import { staffApproveUserAction, staffSetPersonTypeAction } from "@/lib/actions/staff";
import { SaveButton } from "@/components/SaveButton";
import { calculateAge, toAppDateValue } from "@/lib/time";
import { useTranslations } from "@/i18n/translations";

function cap(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

/** Age for a 15-17 year old (needs guardian consent to be approved), or null otherwise/if birth date is unknown — same rule as admin/users. */
function minorAge(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  const age = calculateAge(toAppDateValue(birthDate));
  return age >= 15 && age < 18 ? age : null;
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const session = await requireStaffOrAbove(request, params.locale!);
    const staffOnly = isStaffOnlyRole(session.role);
    const searchParams = new URL(request.url).searchParams;
    const q = searchParams.get("q")?.trim() ?? "";
    const pendingOnly = searchParams.get("pending") === "1";
    const minorOnly = searchParams.get("minor") === "1";

    const prisma = await getPrisma();
    const [allUsers, personTypes] = await Promise.all([
      prisma.user.findMany({
        where: {
          role: "MEMBER",
          ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
        },
        include: { personType: true },
        orderBy: { name: "asc" },
      }),
      prisma.personType.findMany({
        where: staffOnly ? { visibleToUsers: true } : undefined,
        orderBy: { name: "asc" },
      }),
    ]);
    const users = allUsers.filter(
      (user) => (!pendingOnly || user.status === "PENDING") && (!minorOnly || minorAge(user.birthDate) !== null),
    );
    const visiblePersonTypeIds = new Set(personTypes.map((pt) => pt.id));

    return data({
      q,
      pendingOnly,
      minorOnly,
      staffOnly,
      personTypes,
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        birthDate: user.birthDate,
        personTypeId: user.personTypeId,
        personTypeName: user.personType?.name ?? null,
        hiddenAssigned: staffOnly && Boolean(user.personTypeId) && !visiblePersonTypeIds.has(user.personTypeId!),
      })),
    });
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    await requireStaffOrAbove(request, params.locale!);
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "approveUser":
        return staffApproveUserAction(String(formData.get("userId") || ""), true);
      case "rejectUser":
        return staffApproveUserAction(String(formData.get("userId") || ""), false);
      case "setPersonType":
        return staffSetPersonTypeAction(formData);
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function SetPersonTypePage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("setPersonType");
  const tCommon = useTranslations("common");
  const { q, pendingOnly, minorOnly, personTypes, users } = loaderData;

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
              <div className="flex flex-wrap items-end gap-2">
                {user.status === "PENDING" && (
                  <>
                    <Form method="post">
                      <input type="hidden" name="intent" value="approveUser" />
                      <input type="hidden" name="userId" value={user.id} />
                      <button className="btn btn-primary !px-2 !py-1 text-xs">{t("approve")}</button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="rejectUser" />
                      <input type="hidden" name="userId" value={user.id} />
                      <button className="btn btn-secondary !px-2 !py-1 text-xs">{t("reject")}</button>
                    </Form>
                  </>
                )}
                {user.hiddenAssigned ? (
                  <span className="text-sm text-[var(--muted)]">{user.personTypeName}</span>
                ) : (
                  <Form method="post" className="flex items-end gap-2">
                    <input type="hidden" name="intent" value="setPersonType" />
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
                  </Form>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
