import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireStaffOrAbove } from "@/lib/session";
import { staffSetPersonTypeAction } from "@/app/actions";
import { SaveButton } from "@/components/SaveButton";

export default async function SetPersonTypePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireStaffOrAbove();
  const [{ q: qParam }, t, tCommon] = await Promise.all([
    searchParams,
    getTranslations("setPersonType"),
    getTranslations("common"),
  ]);
  const q = qParam?.trim() ?? "";

  const [users, personTypes] = await Promise.all([
    prisma.user.findMany({
      where: q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : undefined,
      include: { personType: true },
      orderBy: { name: "asc" },
    }),
    prisma.personType.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("hint")}</p>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("searchLabel")}
          <input name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="input !py-1 w-64 text-sm" />
        </label>
        <button type="submit" className="btn btn-secondary !px-2 !py-1 text-xs">
          {t("searchSubmit")}
        </button>
        {q && (
          <a href="?" className="btn btn-secondary !px-2 !py-1 text-xs">
            {t("searchClear")}
          </a>
        )}
      </form>

      {q && users.length === 0 && <p className="text-sm text-[var(--muted)]">{t("searchNoResults")}</p>}

      <div className="flex flex-col gap-3">
        {users.map((user) => (
          <div key={user.id} className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-[var(--ink)]">{user.name || user.email}</p>
              <p className="text-sm text-[var(--muted)]">{user.email}</p>
            </div>
            <form action={staffSetPersonTypeAction} className="flex items-center gap-2">
              <input type="hidden" name="userId" value={user.id} />
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
              <SaveButton
                label={tCommon("save")}
                savedLabel={tCommon("saved")}
                buttonClassName="btn btn-secondary !px-2 !py-1 text-xs"
              />
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
