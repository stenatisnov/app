import { useEffect, useState } from "react";
import { Form, useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type {
  adminDeleteChildGroupAction,
  adminRegenerateChildGroupInviteAction,
  adminSetUserChildGroupAction,
} from "@/lib/actions/admin-child-groups";
import { childGroupJoinPath, childGroupJoinUrl } from "@/lib/app-url";
import { LeaderPicker } from "./LeaderPicker";

const inputClass = "input !py-1 text-sm";
const primaryButtonClass = "btn btn-primary !px-3 !py-1.5 text-xs";
const secondaryButtonClass = "btn btn-secondary !px-2 !py-1 text-xs";

export type ChildGroupRow = {
  id: string;
  name: string;
  inviteToken: string;
  leaders: { id: string; label: string }[];
  members: { id: string; name: string | null; email: string; credits: number }[];
};

export function ChildGroupCard({
  group,
  groups,
}: {
  group: ChildGroupRow;
  groups: { id: string; name: string }[];
}) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const regenerateFetcher = useFetcher<typeof adminRegenerateChildGroupInviteAction>();
  const deleteFetcher = useFetcher<typeof adminDeleteChildGroupAction>();
  const moveFetcher = useFetcher<typeof adminSetUserChildGroupAction>();
  const pending = regenerateFetcher.state !== "idle" || deleteFetcher.state !== "idle" || moveFetcher.state !== "idle";

  // Start from the env/SSR fallback, then switch to the real browser origin
  // once mounted — same pattern as GuestPassCard's invite link.
  const [link, setLink] = useState(() => childGroupJoinUrl(group.inviteToken));
  useEffect(() => {
    setLink(window.location.origin + childGroupJoinPath(group.inviteToken));
  }, [group.inviteToken]);

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
  }

  function handleRegenerate() {
    if (!window.confirm(t("childGroups.regenerateConfirm"))) return;
    const fd = new FormData();
    fd.set("intent", "regenerateChildGroupInvite");
    fd.set("groupId", group.id);
    regenerateFetcher.submit(fd, { method: "post" });
  }

  function handleDelete() {
    if (!window.confirm(t("childGroups.deleteConfirm", { name: group.name }))) return;
    const fd = new FormData();
    fd.set("intent", "deleteChildGroup");
    fd.set("groupId", group.id);
    deleteFetcher.submit(fd, { method: "post" });
  }

  function handleMove(userId: string, childGroupId: string) {
    const fd = new FormData();
    fd.set("intent", "setUserChildGroup");
    fd.set("userId", userId);
    fd.set("childGroupId", childGroupId);
    moveFetcher.submit(fd, { method: "post" });
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="font-medium">{group.name}</p>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span>{t("childGroups.memberCount", { count: group.members.length })}</span>
          <button type="button" onClick={handleDelete} disabled={pending} className="text-[var(--danger)]">
            {tCommon("delete")}
          </button>
        </div>
      </div>

      <Form method="post" className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="intent" value="updateChildGroup" />
        <input type="hidden" name="groupId" value={group.id} />
        <div className="flex flex-wrap items-center gap-3">
          <input name="name" defaultValue={group.name} className={inputClass} />
        </div>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          {t("childGroups.leaders")}
          <LeaderPicker name="leaderIds" initialLeaders={group.leaders} />
        </label>
        <button className={`${primaryButtonClass} w-fit`}>{tCommon("save")}</button>
      </Form>

      <div className="mt-3 flex items-center gap-2">
        <input readOnly value={link} className={`${inputClass} flex-1`} />
        <button type="button" onClick={handleCopy} className={secondaryButtonClass}>
          {tCommon("copyLink")}
        </button>
        <button type="button" onClick={handleRegenerate} disabled={pending} className={secondaryButtonClass}>
          {t("childGroups.regenerateInvite")}
        </button>
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium text-[var(--muted)]">
          {t("childGroups.membersTitle")} ({group.members.length})
        </p>
        {group.members.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--muted)]">{t("childGroups.noMembers")}</p>
        ) : (
          <ul className="mt-1.5 flex flex-col divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
            {group.members.map((member) => (
              <li key={member.id} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--ink)]">{member.name || member.email}</p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {member.name ? member.email : null}
                    {member.name && " · "}
                    {t("childGroups.memberCredits", { count: member.credits })}
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--muted)]">
                  {t("childGroups.moveMemberLabel")}
                  <select
                    defaultValue={group.id}
                    disabled={pending}
                    onChange={(e) => handleMove(member.id, e.target.value)}
                    className={`${inputClass} w-auto`}
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                    <option value="">{t("childGroups.noGroupOption")}</option>
                  </select>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
