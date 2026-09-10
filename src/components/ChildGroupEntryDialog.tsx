import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { staffConfirmChildGroupEntryAction, StaffChildGroupEntryLookup } from "@/lib/actions/staff";
import { StatusBanner } from "./StatusBanner";

type GroupData = Extract<StaffChildGroupEntryLookup, { ok: true }>;
type Member = GroupData["members"][number];

/**
 * Shared child-group check-in dialog — driven by an already-resolved
 * `group` lookup (by name from PassVerificationCard, by id from the
 * Dětské skupiny staff list page), so both callers reuse the exact same
 * checkbox-list + confirm/result UI. Submits to whichever route renders it
 * (`useFetcher` with no explicit `action`) — both `verify-pass` and
 * `child-groups` route actions handle the same "confirmChildGroupEntry"
 * intent via `staffConfirmChildGroupEntryAction`.
 */
export function ChildGroupEntryDialog({ group, onClose }: { group: GroupData | null; onClose: () => void }) {
  const t = useTranslations("paymentCheck");
  const tDash = useTranslations("dashboard");
  const confirmFetcher = useFetcher<typeof staffConfirmChildGroupEntryAction>();
  const pending = confirmFetcher.state !== "idle";
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [members, setMembers] = useState<Member[]>(group?.members ?? []);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Members already successfully checked in during this dialog session —
  // re-submitting one would deduct a second entry, so once confirmed their
  // checkbox is locked instead of just left checked.
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());

  // Only resets when the group itself changes — group.members is
  // intentionally excluded, since the confirm-result effect below updates
  // `members` in place (credits after a deduction) and re-including it here
  // would wipe that update and the in-progress selection right back out.
  useEffect(() => {
    setMembers(group?.members ?? []);
    setSelectedIds([]);
    setConfirmedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.groupId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (group && !dialog.open) dialog.showModal();
    if (!group && dialog.open) dialog.close();
  }, [group]);

  useEffect(() => {
    if (!confirmFetcher.data) return;
    const succeeded = new Map(
      confirmFetcher.data.results.filter((r) => r.result.ok).map((r) => [r.userId, r.result] as const),
    );
    setMembers((prev) =>
      prev.map((m) => {
        const res = succeeded.get(m.userId);
        return res && res.ok ? { ...m, credits: res.creditsLeft } : m;
      }),
    );
    setConfirmedIds((prev) => new Set([...prev, ...succeeded.keys()]));
    setSelectedIds((prev) => prev.filter((id) => !succeeded.has(id)));
  }, [confirmFetcher.data]);

  function toggle(userId: string) {
    setSelectedIds((prev) => (prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]));
  }

  function handleConfirm() {
    if (!group || selectedIds.length === 0) return;
    const fd = new FormData();
    fd.set("intent", "confirmChildGroupEntry");
    fd.set("groupId", group.groupId);
    for (const id of selectedIds) fd.append("userIds", id);
    confirmFetcher.submit(fd, { method: "post" });
  }

  const result = confirmFetcher.data;
  const failedCount = result ? result.results.filter((r) => !r.result.ok).length : 0;
  const succeededCount = result ? result.results.length - failedCount : 0;

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      {group && (
        <div className="flex flex-col gap-3 text-center">
          <h3 className="text-base font-semibold text-[var(--ink)]">{group.groupName}</h3>

          {members.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{t("groupNoMembers")}</p>
          ) : (
            <fieldset className="flex max-h-72 flex-col gap-1.5 overflow-y-auto rounded-lg border border-[var(--line)] px-3 py-2.5 text-left text-sm">
              <legend className="px-1 text-xs font-medium text-[var(--muted)]">{t("groupMembersLegend")}</legend>
              {members.map((member) => {
                const confirmed = confirmedIds.has(member.userId);
                const disabled = !member.canEnter || confirmed;
                return (
                  <label
                    key={member.userId}
                    className={`flex items-center justify-between gap-2 ${disabled ? "opacity-50" : "text-[var(--ink)]"}`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={confirmed || selectedIds.includes(member.userId)}
                        disabled={disabled}
                        onChange={() => toggle(member.userId)}
                      />
                      {member.name || member.email}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      {confirmed
                        ? t("groupMemberConfirmed")
                        : !member.canEnter && member.blockedReason
                          ? tDash(`errors.${member.blockedReason}` as Parameters<typeof tDash>[0])
                          : `${tDash("creditsLabel")}: ${member.credits}`}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}

          {result && failedCount === 0 && succeededCount > 0 && (
            <StatusBanner tone="info">{t("groupEntrySuccess", { count: succeededCount })}</StatusBanner>
          )}
          {result && failedCount > 0 && (
            <StatusBanner tone="danger">{t("groupEntryPartialFailure", { success: succeededCount, failed: failedCount })}</StatusBanner>
          )}

          <div className="flex justify-center gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || selectedIds.length === 0}
              onClick={handleConfirm}
            >
              {t("confirmConfirm")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t("confirmCancel")}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
