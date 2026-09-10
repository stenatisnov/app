import { Form, data } from "react-router";
import type { Route } from "./+types/child-groups";
import { getPrisma } from "@/lib/db.server";
import { withLoadContext } from "@/lib/request-context.server";
import {
  adminCreateChildGroupAction,
  adminDeleteChildGroupAction,
  adminRegenerateChildGroupInviteAction,
  adminSetUserChildGroupAction,
  adminUpdateChildGroupAction,
} from "@/lib/actions/admin-child-groups";
import { useTranslations } from "@/i18n/translations";
import { ChildGroupCard } from "@/components/ChildGroupCard";

const inputClass = "input !py-1 text-sm";
const primaryButtonClass = "btn btn-primary !px-3 !py-1.5 text-xs";

export async function loader({ context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const prisma = await getPrisma();
    const [groups, users] = await Promise.all([
      prisma.childGroup.findMany({
        include: {
          leaders: { select: { userId: true } },
          members: { select: { id: true, name: true, email: true, credits: true }, orderBy: { name: "asc" } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    ]);
    return data({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        inviteToken: g.inviteToken,
        leaderIds: g.leaders.map((l) => l.userId),
        members: g.members,
      })),
      users: users.map((u) => ({ id: u.id, label: u.name ? `${u.name} (${u.email})` : u.email })),
    });
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "createChildGroup":
        return adminCreateChildGroupAction(formData);
      case "updateChildGroup":
        return adminUpdateChildGroupAction(formData);
      case "regenerateChildGroupInvite":
        return adminRegenerateChildGroupInviteAction(String(formData.get("groupId") || ""));
      case "deleteChildGroup":
        return adminDeleteChildGroupAction(String(formData.get("groupId") || ""));
      case "setUserChildGroup":
        return adminSetUserChildGroupAction(formData);
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function AdminChildGroupsPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const { groups, users } = loaderData;
  // The member "move to" dropdown offers every existing group, plus the
  // current one — ChildGroupCard renders it as a plain <select>.
  const groupOptions = groups.map((g) => ({ id: g.id, name: g.name }));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("childGroups.title")}</h1>

      <details className="card">
        <summary className="cursor-pointer font-medium">{t("childGroups.createTitle")}</summary>
        <Form method="post" className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="intent" value="createChildGroup" />
          <input name="name" placeholder={t("childGroups.name")} required className={inputClass} />
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            {t("childGroups.leaders")}
            <select multiple name="leaderIds" className={`${inputClass} h-24`}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <button className={`${primaryButtonClass} w-fit`}>{t("childGroups.createSubmit")}</button>
        </Form>
      </details>

      <div className="flex flex-col gap-4">
        {groups.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{t("childGroups.noGroups")}</p>
        ) : (
          groups.map((group) => <ChildGroupCard key={group.id} group={group} users={users} groups={groupOptions} />)
        )}
      </div>
    </div>
  );
}
