"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addDependentAction, removeDependentAction } from "@/app/actions";

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
  const t = useTranslations("account.dependents");
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      const result = await addDependentAction(formData);
      if (result.ok) formRef.current?.reset();
    });
  }

  function handleRemove(dependentId: string) {
    setRemovingId(dependentId);
    startTransition(async () => {
      await removeDependentAction((() => {
        const fd = new FormData();
        fd.set("dependentId", dependentId);
        return fd;
      })());
      setRemovingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--muted)]">{t("hint")}</p>

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
                  {dep.personTypeName ?? "—"} · {t("creditsLabel", { count: dep.credits })}
                </span>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleRemove(dep.id)}
                className="btn btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-50"
              >
                {removingId === dep.id ? "…" : t("remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {dependents.length === 0 && <p className="text-sm text-[var(--muted)]">{t("empty")}</p>}

      <form ref={formRef} action={handleAdd} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("nameLabel")}
          <input name="name" required className="input !py-1.5 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("personTypeLabel")}
          <select name="personTypeId" required className="input !py-1.5 text-sm">
            <option value="">{t("personTypePlaceholder")}</option>
            {personTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary !px-3 !py-1.5 text-xs disabled:opacity-50">
          {t("addSubmit")}
        </button>
      </form>
    </div>
  );
}
