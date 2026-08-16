import { useNavigate, useParams } from "react-router";
import { useTranslations } from "@/i18n/i18n.client";
import { locales, defaultLocale, isLocale } from "@/i18n/routing";
import { usePathname } from "@/i18n/navigation";

/** Small <select> that swaps the URL locale segment while staying on the same page. */
export function LocaleSwitcher() {
  const t = useTranslations("nav");
  const { locale: paramLocale } = useParams();
  const locale = isLocale(paramLocale) ? paramLocale : defaultLocale;
  const pathname = usePathname();
  const navigate = useNavigate();

  return (
    <label className="text-sm">
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={(e) => navigate(`/${e.target.value}${pathname === "/" ? "" : pathname}`)}
        className="rounded-lg border border-[var(--line)] bg-white px-2 py-1.5 text-sm text-[var(--ink)]"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
