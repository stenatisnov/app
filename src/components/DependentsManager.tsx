import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { addDependentAction, removeDependentAction, renameDependentAction } from "@/lib/actions/gate";
import { ConfirmDialog } from "./ConfirmDialog";

export type DependentSummary = {
  id: string;
  name: string;
  personTypeName: string | null;
  credits: number;
};

export type DependentPersonTypeOption = { id: string; name: string };

function DependentRow({
  dependent,
  removePending,
  removingThis,
  onRequestRemove,
}: {
  dependent: DependentSummary;
  removePending: boolean;
  removingThis: boolean;
  onRequestRemove: () => void;
}) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const renameFetcher = useFetcher<typeof renameDependentAction>();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dependent.name);
  const renaming = renameFetcher.state !== "idle";

  useEffect(() => {
    if (!editing) setName(dependent.name);
  }, [dependent.name, editing]);

  useEffect(() => {
    if (renameFetcher.state === "idle" && renameFetcher.data?.ok) setEditing(false);
  }, [renameFetcher.state, renameFetcher.data]);

  function submitRename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === dependent.name) {
      setEditing(false);
      setName(dependent.name);
      return;
    }
    const fd = new FormData();
    fd.set("intent", "renameDependent");
    fd.set("dependentId", dependent.id);
    fd.set("name", trimmed);
    renameFetcher.submit(fd, { method: "post" });
  }

  function cancelRename() {
    setEditing(false);
    setName(dependent.name);
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
      <div className="flex min-w-0 flex-col">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={name}
              disabled={renaming}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") cancelRename();
              }}
              maxLength={120}
              className="input !py-1 text-sm"
            />
            <button
              type="button"
              disabled={renaming}
              onClick={submitRename}
              className="btn btn-secondary !px-2 !py-1 text-xs disabled:opacity-50"
            >
              {renaming ? "…" : tCommon("save")}
            </button>
            <button
              type="button"
              disabled={renaming}
              onClick={cancelRename}
              className="btn btn-secondary !px-2 !py-1 text-xs disabled:opacity-50"
            >
              {tCommon("cancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="truncate text-left font-medium text-[var(--ink)] underline decoration-dotted underline-offset-2"
          >
            {dependent.name}
          </button>
        )}
        <span className="text-xs text-[var(--muted)]">
          {dependent.personTypeName ?? "—"} · {t("dependents.creditsLabel", { count: dependent.credits })}
        </span>
        {renameFetcher.data?.ok === false && <span className="text-xs text-red-600">{t("dependents.renameError")}</span>}
      </div>
      <button
        type="button"
        disabled={removePending}
        onClick={onRequestRemove}
        className="btn btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-50"
      >
        {removingThis ? "…" : t("dependents.remove")}
      </button>
    </li>
  );
}

export function DependentsManager({
  dependents,
  personTypes,
}: {
  dependents: DependentSummary[];
  personTypes: DependentPersonTypeOption[];
}) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const addFetcher = useFetcher<typeof addDependentAction>();
  const removeFetcher = useFetcher<typeof removeDependentAction>();
  const pending = addFetcher.state !== "idle" || removeFetcher.state !== "idle";
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmingDependent, setConfirmingDependent] = useState<DependentSummary | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (addFetcher.data?.ok) formRef.current?.reset();
  }, [addFetcher.data]);

  useEffect(() => {
    if (removeFetcher.state === "idle" && removeFetcher.data !== undefined) setRemovingId(null);
  }, [removeFetcher.state, removeFetcher.data]);

  function handleAdd(formData: FormData) {
    formData.set("intent", "addDependent");
    addFetcher.submit(formData, { method: "post" });
  }

  function confirmRemove() {
    const dependentId = confirmingDependent?.id;
    if (!dependentId) return;
    setConfirmingDependent(null);
    setRemovingId(dependentId);
    const fd = new FormData();
    fd.set("intent", "removeDependent");
    fd.set("dependentId", dependentId);
    removeFetcher.submit(fd, { method: "post" });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--muted)]">{t("dependents.hint")}</p>

      {dependents.length > 0 && (
        <ul className="flex flex-col gap-2">
          {dependents.map((dep) => (
            <DependentRow
              key={dep.id}
              dependent={dep}
              removePending={pending}
              removingThis={removingId === dep.id}
              onRequestRemove={() => setConfirmingDependent(dep)}
            />
          ))}
        </ul>
      )}
      {dependents.length === 0 && <p className="text-sm text-[var(--muted)]">{t("dependents.empty")}</p>}

      <ConfirmDialog
        open={confirmingDependent !== null}
        title={t("dependents.remove")}
        message={t("dependents.removeConfirm", { name: confirmingDependent?.name ?? "" })}
        confirmLabel={tCommon("confirm")}
        cancelLabel={tCommon("cancel")}
        onConfirm={confirmRemove}
        onCancel={() => setConfirmingDependent(null)}
      />

      <form ref={formRef} action={handleAdd} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("dependents.nameLabel")}
          <input name="name" required className="input !py-1.5 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("dependents.personTypeLabel")}
          <select name="personTypeId" required className="input !py-1.5 text-sm">
            <option value="">{t("dependents.personTypePlaceholder")}</option>
            {personTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary !px-3 !py-1.5 text-xs disabled:opacity-50">
          {t("dependents.addSubmit")}
        </button>
      </form>
    </div>
  );
}
