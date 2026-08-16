import i18next, { type TFunction } from "i18next";
import cs from "../../messages/cs.json";
import en from "../../messages/en.json";
import { type Locale, defaultLocale } from "./routing";

const resources = { cs, en } as const;

const namespaces = Object.keys(resources[defaultLocale]);

/**
 * One instance per request, not a shared global — `i18next.init()` mutates
 * process-wide state (current language), which would race across concurrent
 * requests on Workers. `createInstance()` + a synchronous `initImmediate:
 * false` init keeps every request's translations isolated and avoids any
 * async I/O (the dictionaries are already bundled, not fetched).
 */
export function createI18nInstance(locale: Locale) {
  const instance = i18next.createInstance();
  instance.init({
    resources,
    lng: locale,
    fallbackLng: defaultLocale,
    ns: namespaces,
    defaultNS: "common",
    interpolation: { escapeValue: false },
    initImmediate: false,
    react: { useSuspense: false },
  });
  return instance;
}

/** Server-only equivalent of next-intl's `getTranslations(ns)` — locale comes from the route param, not implicit request context. */
export function getFixedT(locale: Locale, ns: string): TFunction {
  return createI18nInstance(locale).getFixedT(locale, ns);
}

export function getMessages(locale: Locale): typeof resources.cs {
  return resources[locale];
}
