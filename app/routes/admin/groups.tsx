import { Form, data } from "react-router";
import type { Route } from "./+types/groups";
import { getPrisma } from "@/lib/db";
import { withLoadContext } from "@/lib/request-context.server";
import { WEEK_DAYS, minutesToTimeLabel } from "@/lib/time";
import { adminCreateGroupAction, adminDeleteGroupAction, adminUpdateGroupWindowsAction } from "@/lib/actions/admin-groups";
import { useTranslations } from "@/i18n/translations";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

const inputClass = "input !py-1 text-sm";
const primaryButtonClass = "btn btn-primary !px-3 !py-1.5 text-xs";

export async function loader({ context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const prisma = await getPrisma();
    const groups = await prisma.group.findMany({
      include: { windows: true, _count: { select: { members: true } } },
      orderBy: { name: "asc" },
    });
    return data({ groups });
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "createGroup":
        return adminCreateGroupAction(formData);
      case "deleteGroup":
        return adminDeleteGroupAction(String(formData.get("groupId") || ""));
      case "updateGroupWindows":
        return adminUpdateGroupWindowsAction(formData);
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function AdminGroupsPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const { groups } = loaderData;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("groups.title")}</h1>

      <details className="card">
        <summary className="cursor-pointer font-medium">{t("groups.createTitle")}</summary>
        <Form method="post" className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="intent" value="createGroup" />
          <input name="name" placeholder={t("groups.name")} required className={inputClass} />
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="is24_7" />
            {t("groups.is24_7")}
          </label>
          <button className={primaryButtonClass}>{t("groups.createSubmit")}</button>
        </Form>
      </details>

      <div className="flex flex-col gap-4">
        {groups.map((group) => {
          const byDay = new Map(group.windows.map((w) => [w.dayOfWeek, w]));
          return (
            <div key={group.id} className="card">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {group.name} {group.isDefault && <span className="text-xs text-[var(--muted)]">({t("groups.default")})</span>}
                </p>
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <span>{group._count.members}</span>
                  {!group.isDefault && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="deleteGroup" />
                      <input type="hidden" name="groupId" value={group.id} />
                      <ConfirmSubmitButton
                        confirmMessage={t("groups.deleteConfirm", { name: group.name })}
                        className="text-[var(--danger)]"
                      >
                        {tCommon("delete")}
                      </ConfirmSubmitButton>
                    </Form>
                  )}
                </div>
              </div>

              <Form method="post" className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="intent" value="updateGroupWindows" />
                <input type="hidden" name="groupId" value={group.id} />
                <div className="flex flex-wrap items-center gap-3">
                  <input name="name" defaultValue={group.name} className={inputClass} />
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name="is24_7" defaultChecked={group.is24_7} />
                    {t("groups.is24_7")}
                  </label>
                </div>
                <div className="grid gap-1.5 text-sm">
                  {WEEK_DAYS.map((day) => {
                    const w = byDay.get(day);
                    return (
                      <div
                        key={day}
                        className="flex flex-wrap items-center gap-2 has-[input[type=checkbox]:not(:checked)]:opacity-40"
                      >
                        <label className="flex w-20 shrink-0 items-center gap-1.5 text-[var(--muted)]">
                          <input type="checkbox" name={`enabled_${day}`} defaultChecked={byDay.has(day)} />
                          {t(`groups.days.${day}` as "groups.days.0")}
                        </label>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <input
                            type="time"
                            name={`from_${day}`}
                            defaultValue={minutesToTimeLabel(w?.fromMin ?? 6 * 60)}
                            className={`${inputClass} min-w-0 flex-1`}
                          />
                          <span className="shrink-0">–</span>
                          <input
                            type="time"
                            name={`to_${day}`}
                            defaultValue={minutesToTimeLabel(w?.toMin ?? 22 * 60)}
                            className={`${inputClass} min-w-0 flex-1`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-[var(--muted)]">{t("groups.daysHint")}</p>
                <button className={`${primaryButtonClass} w-fit`}>{t("groups.saveWindows")}</button>
              </Form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
