import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { WEEK_DAYS, minutesToTimeLabel } from "@/lib/time";
import { adminCreateGroupAction, adminDeleteGroupAction, adminUpdateGroupWindowsAction } from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

const inputClass = "input !py-1 text-sm";
const primaryButtonClass = "btn btn-primary !px-3 !py-1.5 text-xs";

export default async function AdminGroupsPage() {
  const t = await getTranslations("admin.groups");
  const tCommon = await getTranslations("common");

  const groups = await prisma.group.findMany({
    include: { windows: true, _count: { select: { members: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>

      <details className="card">
        <summary className="cursor-pointer font-medium">{t("createTitle")}</summary>
        <form action={adminCreateGroupAction} className="mt-3 flex flex-wrap items-center gap-3">
          <input name="name" placeholder={t("name")} required className={inputClass} />
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="is24_7" />
            {t("is24_7")}
          </label>
          <button className={primaryButtonClass}>{t("createSubmit")}</button>
        </form>
      </details>

      <div className="flex flex-col gap-4">
        {groups.map((group) => {
          const byDay = new Map(group.windows.map((w) => [w.dayOfWeek, w]));
          return (
            <div key={group.id} className="card">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {group.name} {group.isDefault && <span className="text-xs text-[var(--muted)]">({t("default")})</span>}
                </p>
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <span>{group._count.members}</span>
                  {!group.isDefault && (
                    <form action={adminDeleteGroupAction.bind(null, group.id)}>
                      <ConfirmSubmitButton
                        confirmMessage={t("deleteConfirm", { name: group.name })}
                        className="text-[var(--danger)]"
                      >
                        {tCommon("delete")}
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </div>
              </div>

              <form action={adminUpdateGroupWindowsAction} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="groupId" value={group.id} />
                <div className="flex flex-wrap items-center gap-3">
                  <input name="name" defaultValue={group.name} className={inputClass} />
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name="is24_7" defaultChecked={group.is24_7} />
                    {t("is24_7")}
                  </label>
                </div>
                <div className="grid gap-1 text-sm">
                  {WEEK_DAYS.map((day) => {
                    const w = byDay.get(day);
                    return (
                      <div key={day} className="flex items-center gap-2">
                        <span className="w-24 text-[var(--muted)]">{t(`days.${day}` as "days.0")}</span>
                        <input
                          type="time"
                          name={`from_${day}`}
                          defaultValue={minutesToTimeLabel(w?.fromMin ?? 6 * 60)}
                          className={inputClass}
                        />
                        <span>–</span>
                        <input
                          type="time"
                          name={`to_${day}`}
                          defaultValue={minutesToTimeLabel(w?.toMin ?? 22 * 60)}
                          className={inputClass}
                        />
                      </div>
                    );
                  })}
                </div>
                <button className={`${primaryButtonClass} w-fit`}>{t("saveWindows")}</button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
