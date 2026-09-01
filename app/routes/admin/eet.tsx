import { data } from "react-router";
import type { Route } from "./+types/eet";
import { withLoadContext } from "@/lib/request-context.server";
import { fetchEetAdminData, parseEetAdminFilter, type EetAdminFilter } from "@/lib/eet";
import { getEetSettingsStored } from "@/lib/settings";
import { useTranslations } from "@/i18n/translations";
import { EetSaleTable } from "@/components/EetSaleTable";
import { toAppDateValue } from "@/lib/time";

const STATUSES = ["ALL", "PENDING", "SENT", "EXPIRED", "REJECTED"] as const;

export async function loader({ context, request }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const settings = await getEetSettingsStored();
    const filter = parseEetAdminFilter(new URL(request.url).searchParams, toAppDateValue());
    const result = await fetchEetAdminData(filter, settings);
    return data({ enabled: settings.enabled, result, filter });
  });
}

/** Preserves the rest of `filter` while switching only `status` — used by the status links below. */
function statusHref(filter: EetAdminFilter, status: (typeof STATUSES)[number]): string {
  const qs = new URLSearchParams({ status, dateFrom: filter.dateFrom, dateTo: filter.dateTo });
  return `?${qs}`;
}

export default function AdminEetPage({ loaderData, params }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const dateLocale = params.locale === "en" ? "en-GB" : "cs-CZ";
  const { enabled, result, filter } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("eet.title")}</h1>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-2">
        <input type="hidden" name="status" value={filter.status} />
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("eet.filterDateFrom")}
          <input type="date" name="dateFrom" defaultValue={filter.dateFrom} className="input !py-1 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t("eet.filterDateTo")}
          <input type="date" name="dateTo" defaultValue={filter.dateTo} className="input !py-1 text-sm" />
        </label>
        <button type="submit" className="btn btn-secondary !px-3 !py-1.5 text-xs">
          OK
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((status) => (
          <a
            key={status}
            href={statusHref(filter, status)}
            className={`btn !px-3 !py-1.5 text-xs ${filter.status === status ? "btn-primary" : "btn-secondary"}`}
          >
            {status === "ALL" ? t("eet.filterAll") : t(`eet.filter${status.charAt(0)}${status.slice(1).toLowerCase()}` as "eet.filterPending")}
          </a>
        ))}
      </div>

      {!enabled && <p className="card text-sm text-[var(--muted)]">{t("eet.disabled")}</p>}
      {enabled && !result.ok && (
        <p className="card text-sm text-[var(--danger)]">{t("eet.fetchError", { error: result.error })}</p>
      )}
      {enabled && result.ok && <EetSaleTable rows={result.rows} dateLocale={dateLocale} />}
    </div>
  );
}
