import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/i18n.client";
import type { adminDeleteGuestPassesAction } from "@/lib/actions/admin-guests";
import { GuestPassCard, guestPassStatus, type GuestPassRow } from "./GuestPassCard";

type Filter = "all" | "valid" | "expired";

export function GuestPassList({ passes }: { passes: GuestPassRow[] }) {
  const t = useTranslations("admin");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const fetcher = useFetcher<typeof adminDeleteGuestPassesAction>();
  const pending = fetcher.state !== "idle";
  const prevStateRef = useRef(fetcher.state);

  useEffect(() => {
    if (prevStateRef.current !== "idle" && fetcher.state === "idle") {
      setSelected(new Set());
    }
    prevStateRef.current = fetcher.state;
  }, [fetcher.state]);

  const counts = useMemo(() => {
    let valid = 0;
    let expired = 0;
    for (const pass of passes) {
      if (guestPassStatus(pass) === "valid") valid += 1;
      else expired += 1;
    }
    return { all: passes.length, valid, expired };
  }, [passes]);

  const visible = useMemo(() => {
    if (filter === "all") return passes;
    return passes.filter((pass) => guestPassStatus(pass) === filter);
  }, [passes, filter]);

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
    const fd = new FormData();
    fd.set("intent", "deleteGuestPasses");
    for (const id of selected) fd.append("passIds", id);
    fetcher.submit(fd, { method: "post" });
  }

  const filterButtonClass = (active: boolean) =>
    `btn !px-3 !py-1.5 text-xs ${active ? "btn-primary" : "btn-secondary"}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setFilter("all")} className={filterButtonClass(filter === "all")}>
          {t("guests.filterAll")} ({counts.all})
        </button>
        <button type="button" onClick={() => setFilter("valid")} className={filterButtonClass(filter === "valid")}>
          {t("guests.filterValid")} ({counts.valid})
        </button>
        <button type="button" onClick={() => setFilter("expired")} className={filterButtonClass(filter === "expired")}>
          {t("guests.filterExpired")} ({counts.expired})
        </button>
      </div>

      {selected.size > 0 && (
        <button
          type="button"
          onClick={deleteSelected}
          disabled={pending}
          className="btn btn-danger w-fit !px-3 !py-1.5 text-xs"
        >
          {t("guests.deleteSelected")} ({selected.size})
        </button>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((pass) => (
          <GuestPassCard key={pass.id} pass={pass} selected={selected.has(pass.id)} onToggleSelect={toggle} />
        ))}
        {visible.length === 0 && <p className="text-sm text-[var(--muted)]">—</p>}
      </div>
    </div>
  );
}
