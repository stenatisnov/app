import { useEffect, useState } from "react";
import { I18nextProvider, useTranslation as useI18nextTranslation } from "react-i18next";
import { createI18nInstance } from "./i18n.shared";
import type { Locale } from "./routing";

/**
 * One i18next instance per mounted app tree, seeded with the locale the
 * server already resolved (root loader) — `useState(() => ...)` runs the
 * factory once, so hydration reuses the same instance shape the server
 * rendered with instead of re-initializing (which would content-mismatch).
 *
 * `locale` can still change later without a full remount — client-side
 * navigation (e.g. LocaleSwitcher) swaps the `:locale` URL segment, which
 * re-runs the root loader and hands this component a new `locale` prop, but
 * `I18nProvider` itself stays mounted. Without this effect the `useState`
 * initializer above never re-runs, so the instance would keep speaking
 * whatever language it started in until a full page reload re-mounted
 * everything from scratch — `changeLanguage` is what makes every
 * `useTranslations()` call site re-render with the new language instead.
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [instance] = useState(() => createI18nInstance(locale));
  useEffect(() => {
    if (instance.language !== locale) void instance.changeLanguage(locale);
  }, [instance, locale]);
  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}

/** Client-side equivalent of next-intl's `useTranslations(ns)` — same call-site shape, react-i18next underneath. */
export function useTranslations(ns: string) {
  const { t, i18n } = useI18nextTranslation(ns);
  // next-intl's `t` exposes `t.has(key)` to check whether a key resolves
  // without throwing/falling back — a handful of call sites (error-code
  // lookups with a generic fallback message) rely on it. react-i18next's
  // equivalent lives on the `i18n` instance (`i18n.exists`), not on `t`
  // itself, so it's attached here to keep every other call site unchanged.
  return Object.assign(t, {
    has: (key: string) => i18n.exists(key, { ns }),
  });
}

export { Trans } from "react-i18next";
