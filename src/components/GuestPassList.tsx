"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminDeleteGuestPassesAction } from "@/app/actions";
import { GuestPassCard, type GuestPassRow } from "./GuestPassCard";

export function GuestPassList({ passes }: { passes: GuestPassRow[] }) {
  const t = useTranslations("admin.guests");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function deleteSelected() {
    if (selected.size === 0) return;
    startTransition(async () => {
      await adminDeleteGuestPassesAction([...selected]);
      setSelected(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 && (
        <button
          type="button"
          onClick={deleteSelected}
          disabled={pending}
          className="btn btn-danger w-fit !px-3 !py-1.5 text-xs"
        >
          {t("deleteSelected")} ({selected.size})
        </button>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {passes.map((pass) => (
          <GuestPassCard key={pass.id} pass={pass} selected={selected.has(pass.id)} onToggleSelect={toggle} />
        ))}
      </div>
    </div>
  );
}
