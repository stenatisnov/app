import { useMemo, useState } from "react";
import { useTranslations } from "@/i18n/translations";
import type { EetSaleRow } from "@/lib/eet";
import { formatAppDateTime } from "@/lib/time";

type Filter = "ALL" | "PENDING" | "SENT" | "EXPIRED" | "REJECTED";

const STATUS_BADGE_CLASS: Record<string, string> = {
  SENT: "bg-[var(--bg-accent)]",
  PENDING: "bg-[var(--warn-bg,_var(--bg-accent))] text-[var(--warn,_var(--ink))]",
  REJECTED: "bg-[var(--danger-bg)] text-[var(--danger)]",
  EXPIRED: "bg-[var(--danger-bg)] text-[var(--danger)]",
};

export function EetSaleTable({ rows, dateLocale }: { rows: EetSaleRow[]; dateLocale: string }) {
  const t = useTranslations("admin");
  const [filter, setFilter] = useState<Filter>("ALL");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const row of rows) c[row.status] = (c[row.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => (filter === "ALL" ? rows : rows.filter((row) => row.status === filter)), [rows, filter]);

  const filterButtonClass = (active: boolean) => `btn !px-3 !py-1.5 text-xs ${active ? "btn-primary" : "btn-secondary"}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setFilter("ALL")} className={filterButtonClass(filter === "ALL")}>
          {t("eet.filterAll")} ({rows.length})
        </button>
        {(["PENDING", "SENT", "EXPIRED", "REJECTED"] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={filterButtonClass(filter === status)}
          >
            {t(`eet.filter${status.charAt(0)}${status.slice(1).toLowerCase()}` as "eet.filterPending")} ({counts[status] ?? 0})
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className="text-sm text-[var(--muted)]">{t("eet.empty")}</p>}

      {visible.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-xs text-[var(--muted)]">
                <th className="py-2 pr-3 font-medium">{t("eet.reference")}</th>
                <th className="py-2 pr-3 font-medium">{t("eet.status")}</th>
                <th className="py-2 pr-3 font-medium">{t("eet.amount")}</th>
                <th className="py-2 pr-3 font-medium">{t("eet.pok")}</th>
                <th className="py-2 pr-3 font-medium">{t("eet.attempts")}</th>
                <th className="py-2 pr-3 font-medium">{t("eet.lastError")}</th>
                <th className="py-2 pr-3 font-medium">{t("eet.updatedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="py-2 pr-3 font-mono text-xs">{row.reference}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE_CLASS[row.status] ?? "bg-[var(--bg-accent)]"}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{row.amountCzk} Kč</td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.pok ?? "—"}</td>
                  <td className="py-2 pr-3">{row.attempts}</td>
                  <td className="py-2 pr-3 text-xs text-[var(--danger)]">
                    {row.lastErrorCode != null ? `${row.lastErrorCode}: ${row.lastErrorMessage ?? ""}` : "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs text-[var(--muted)]">
                    {formatAppDateTime(new Date(`${row.updatedAt.replace(" ", "T")}Z`), dateLocale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
