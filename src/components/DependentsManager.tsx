import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/i18n.client";
import type { addDependentAction, removeDependentAction } from "@/lib/actions/gate";
import { ConfirmDialog } from "./ConfirmDialog";

export type DependentSummary = {
  id: string;
  name: string;
  personTypeName: string | null;
  credits: number;
};

export type DependentPersonTypeOption = { id: string; name: string };

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
            <li
              key={dep.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium text-[var(--ink)]">{dep.name}</span>
                <span className="text-xs text-[var(--muted)]">
                  {dep.personTypeName ?? "—"} · {t("dependents.creditsLabel", { count: dep.credits })}
                </span>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmingDependent(dep)}
                className="btn btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-50"
              >
                {removingId === dep.id ? "…" : t("dependents.remove")}
              </button>
            </li>
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
