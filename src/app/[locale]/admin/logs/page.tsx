import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { AUDIT_ACTIONS } from "@/lib/audit-actions";
import { buildAuditLogWhere, parseAuditLogFilters } from "@/lib/audit-log-filters";
import { formatAppDateTime } from "@/lib/time";

const inputClass = "rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700";
const buttonClass = "rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700";

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("admin.logs");
  const filters = parseAuditLogFilters(sp);

  const logs = await prisma.auditLog.findMany({
    where: buildAuditLogWhere(filters),
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const csvQuery = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => Boolean(v)) as [string, string][],
  ).toString();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-neutral-500">
          {t("filterAction")}
          <select name="action" defaultValue={filters.action ?? ""} className={inputClass}>
            <option value="">—</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-neutral-500">
          {t("filterResult")}
          <select name="result" defaultValue={filters.result ?? ""} className={inputClass}>
            <option value="">{t("resultAll")}</option>
            <option value="success">{t("resultSuccess")}</option>
            <option value="failure">{t("resultFailure")}</option>
          </select>
        </label>
        <label className="flex flex-col text-xs text-neutral-500">
          {t("filterDateFrom")}
          <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col text-xs text-neutral-500">
          {t("filterDateTo")}
          <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ""} className={inputClass} />
        </label>
        <button type="submit" className={buttonClass}>
          OK
        </button>
        <a href={`/api/admin/logs.csv${csvQuery ? `?${csvQuery}` : ""}`} className={buttonClass}>
          {t("exportCsv")}
        </a>
      </form>

      <table className="w-full text-left text-sm">
        <thead className="text-neutral-500">
          <tr>
            <th className="pb-2 font-normal">{t("columnTime")}</th>
            <th className="pb-2 font-normal">{t("columnAction")}</th>
            <th className="pb-2 font-normal">{t("columnResult")}</th>
            <th className="pb-2 font-normal">{t("columnUser")}</th>
            <th className="pb-2 font-normal">{t("columnMessage")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="py-1.5 whitespace-nowrap">{formatAppDateTime(log.createdAt)}</td>
              <td className="py-1.5">{log.action}</td>
              <td className="py-1.5">
                <span className={log.success ? "text-emerald-600" : "text-red-600"}>{log.success ? "✓" : "✗"}</span>
              </td>
              <td className="py-1.5">{log.user?.email ?? log.guestToken?.slice(0, 8) ?? "—"}</td>
              <td className="py-1.5 text-neutral-500">{log.message ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
