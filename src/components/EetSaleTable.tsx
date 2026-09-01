import { useTranslations } from "@/i18n/translations";
import type { EetSaleRow } from "@/lib/eet";
import { formatAppDateTime } from "@/lib/time";

const STATUS_BADGE_CLASS: Record<string, string> = {
  SENT: "bg-[var(--bg-accent)]",
  PENDING: "bg-[var(--warn-bg,_var(--bg-accent))] text-[var(--warn,_var(--ink))]",
  REJECTED: "bg-[var(--danger-bg)] text-[var(--danger)]",
  EXPIRED: "bg-[var(--danger-bg)] text-[var(--danger)]",
};

export function EetSaleTable({ rows, dateLocale }: { rows: EetSaleRow[]; dateLocale: string }) {
  const t = useTranslations("admin");

  if (rows.length === 0) return <p className="text-sm text-[var(--muted)]">{t("eet.empty")}</p>;

  return (
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
          {rows.map((row) => (
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
  );
}
