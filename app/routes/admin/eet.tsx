import { data } from "react-router";
import type { Route } from "./+types/eet";
import { withLoadContext } from "@/lib/request-context.server";
import { fetchEetAdminData } from "@/lib/eet";
import { getEetSettingsStored } from "@/lib/settings";
import { formatAppDateTime } from "@/lib/time";
import { useTranslations } from "@/i18n/translations";

export async function loader({ context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const settings = await getEetSettingsStored();
    const result = await fetchEetAdminData(settings);
    return data({ enabled: settings.enabled, result });
  });
}

const statusBadgeClass: Record<string, string> = {
  SENT: "bg-[var(--bg-accent)]",
  PENDING: "bg-[var(--warn-bg,_var(--bg-accent))] text-[var(--warn,_var(--ink))]",
  REJECTED: "bg-[var(--danger-bg)] text-[var(--danger)]",
  EXPIRED: "bg-[var(--danger-bg)] text-[var(--danger)]",
};

export default function AdminEetPage({ loaderData, params }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const dateLocale = params.locale === "en" ? "en-GB" : "cs-CZ";
  const { enabled, result } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("eet.title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("eet.hint")}</p>
      </div>

      {!enabled && <p className="card text-sm text-[var(--muted)]">{t("eet.disabled")}</p>}
      {enabled && !result.ok && (
        <p className="card text-sm text-[var(--danger)]">{t("eet.fetchError", { error: result.error })}</p>
      )}
      {enabled && result.ok && result.rows.length === 0 && (
        <p className="card text-sm text-[var(--muted)]">{t("eet.empty")}</p>
      )}

      {enabled && result.ok && result.rows.length > 0 && (
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
              {result.rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="py-2 pr-3 font-mono text-xs">{row.reference}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass[row.status] ?? "bg-[var(--bg-accent)]"}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{row.amountCzk} Kč</td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.pok ?? "—"}</td>
                  <td className="py-2 pr-3">{row.attempts}</td>
                  <td className="py-2 pr-3 text-xs text-[var(--danger)]">
                    {row.lastErrorCode != null ? `${row.lastErrorCode}: ${row.lastErrorMessage ?? ""}` : "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs text-[var(--muted)]">{formatAppDateTime(new Date(`${row.updatedAt.replace(" ", "T")}Z`), dateLocale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
