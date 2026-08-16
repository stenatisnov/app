import { data } from "react-router";
import type { Route } from "./+types/logs";
import { getPrisma } from "@/lib/db";
import { withLoadContext } from "@/lib/request-context.server";
import { requireRoot } from "@/lib/session.server";
import { AUDIT_ACTIONS } from "@/lib/audit-actions";
import { buildAuditLogWhere, fetchAuditLogsWithUser, parseAuditLogFilters } from "@/lib/audit-log-filters";
import { formatAppDateTime } from "@/lib/time";
import { useTranslations } from "@/i18n/i18n.client";

const inputClass = "input !py-1 text-sm";
const buttonClass = "btn btn-secondary !px-3 !py-1.5 text-xs";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    await requireRoot(request, params.locale!);
    const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
    const filters = parseAuditLogFilters(searchParams);

    const prisma = await getPrisma();
    const logs = await fetchAuditLogsWithUser(prisma, buildAuditLogWhere(filters), 200);

    const csvQuery = new URLSearchParams(Object.entries(filters).filter(([, v]) => Boolean(v)) as [string, string][]).toString();

    return data({
      filters,
      csvQuery,
      logs: logs.map((log) => ({
        id: log.id,
        createdAt: log.createdAt,
        action: log.action,
        success: log.success,
        userEmail: log.user?.email ?? null,
        guestToken: log.guestToken,
        message: log.message,
      })),
    });
  });
}

export default function AdminLogsPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const { filters, csvQuery, logs } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("logs.title")}</h1>

      <form method="get" className="card flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("logs.filterAction")}
          <select name="action" defaultValue={filters.action ?? ""} className={inputClass}>
            <option value="">—</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("logs.filterResult")}
          <select name="result" defaultValue={filters.result ?? ""} className={inputClass}>
            <option value="">{t("logs.resultAll")}</option>
            <option value="success">{t("logs.resultSuccess")}</option>
            <option value="failure">{t("logs.resultFailure")}</option>
          </select>
        </label>
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("logs.filterDateFrom")}
          <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("logs.filterDateTo")}
          <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ""} className={inputClass} />
        </label>
        <button type="submit" className={buttonClass}>
          OK
        </button>
        <a href={`/api/admin/logs.csv${csvQuery ? `?${csvQuery}` : ""}`} className={buttonClass}>
          {t("logs.exportCsv")}
        </a>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="pb-2 font-normal">{t("logs.columnTime")}</th>
              <th className="pb-2 font-normal">{t("logs.columnAction")}</th>
              <th className="pb-2 font-normal">{t("logs.columnResult")}</th>
              <th className="pb-2 font-normal">{t("logs.columnUser")}</th>
              <th className="pb-2 font-normal">{t("logs.columnMessage")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] text-[var(--ink)]">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="py-1.5 whitespace-nowrap">{formatAppDateTime(log.createdAt)}</td>
                <td className="py-1.5">{log.action}</td>
                <td className="py-1.5">
                  <span className={log.success ? "text-[var(--ok)]" : "text-[var(--danger)]"}>
                    {log.success ? "✓" : "✗"}
                  </span>
                </td>
                <td className="py-1.5">{log.userEmail ?? log.guestToken?.slice(0, 8) ?? "—"}</td>
                <td className="py-1.5 text-[var(--muted)]">{log.message ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
