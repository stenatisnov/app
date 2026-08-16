import { useState } from "react";
import { I18nextProvider, useTranslation as useI18nextTranslation } from "react-i18next";
import { createI18nInstance } from "./i18n.server";
import type { Locale } from "./routing";

/**
 * One i18next instance per mounted app tree, seeded with the locale the
 * server already resolved (root loader) — `useState(() => ...)` runs the
 * factory once, so hydration reuses the same instance shape the server
 * rendered with instead of re-initializing (which would content-mismatch).
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [instance] = useState(() => createI18nInstance(locale));
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

/** Client-side equivalent of next-intl's `useTranslations(ns)` — same call-site shape, react-i18next underneath. */
export function useTranslations(ns: string) {
  const { t } = useI18nextTranslation(ns);
  return t;
}

export { Trans } from "react-i18next";
