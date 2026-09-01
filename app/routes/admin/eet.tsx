import { data } from "react-router";
import type { Route } from "./+types/eet";
import { withLoadContext } from "@/lib/request-context.server";
import { fetchEetAdminData } from "@/lib/eet";
import { getEetSettingsStored } from "@/lib/settings";
import { useTranslations } from "@/i18n/translations";
import { EetSaleTable } from "@/components/EetSaleTable";

export async function loader({ context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const settings = await getEetSettingsStored();
    const result = await fetchEetAdminData(settings);
    return data({ enabled: settings.enabled, result });
  });
}

export default function AdminEetPage({ loaderData, params }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const dateLocale = params.locale === "en" ? "en-GB" : "cs-CZ";
  const { enabled, result } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("eet.title")}</h1>
      </div>

      {!enabled && <p className="card text-sm text-[var(--muted)]">{t("eet.disabled")}</p>}
      {enabled && !result.ok && (
        <p className="card text-sm text-[var(--danger)]">{t("eet.fetchError", { error: result.error })}</p>
      )}
      {enabled && result.ok && <EetSaleTable rows={result.rows} dateLocale={dateLocale} />}
    </div>
  );
}
