import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { staffLookupChildGroupByIdForEntryAction, StaffChildGroupEntryLookup } from "@/lib/actions/staff";
import { ChildGroupEntryDialog } from "./ChildGroupEntryDialog";

type GroupData = Extract<StaffChildGroupEntryLookup, { ok: true }>;

/** Staff-facing "Dětské skupiny" page — pick a group from the list to open the same check-in dialog Ověřit permanentku's group lookup uses. */
export function ChildGroupsStaffList({ groups }: { groups: { id: string; name: string; memberCount: number }[] }) {
  const t = useTranslations("childGroupsStaff");
  const lookupFetcher = useFetcher<typeof staffLookupChildGroupByIdForEntryAction>();
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [groupData, setGroupData] = useState<GroupData | null>(null);

  useEffect(() => {
    if (lookupFetcher.data?.ok) setGroupData(lookupFetcher.data);
  }, [lookupFetcher.data]);

  function openGroup(id: string) {
    setOpenGroupId(id);
    setGroupData(null);
    const fd = new FormData();
    fd.set("intent", "lookupChildGroupById");
    fd.set("groupId", id);
    lookupFetcher.submit(fd, { method: "post" });
  }

  function close() {
    setOpenGroupId(null);
    setGroupData(null);
  }

  return (
    <section className="card">
      <h2 className="text-lg font-medium text-[var(--ink)]">{t("title")}</h2>
      {groups.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">{t("noGroups")}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => openGroup(g.id)}
              disabled={lookupFetcher.state !== "idle" && openGroupId === g.id}
              className="btn btn-secondary w-full !justify-between !px-3 !py-2.5 text-sm"
            >
              <span>{g.name}</span>
              <span className="text-xs text-[var(--muted)]">{t("memberCount", { count: g.memberCount })}</span>
            </button>
          ))}
        </div>
      )}

      <ChildGroupEntryDialog group={groupData} onClose={close} />
    </section>
  );
}
