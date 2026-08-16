import i18next from "i18next";
import cs from "../../messages/cs.json";
import en from "../../messages/en.json";
import { type Locale, defaultLocale } from "./routing";

// No `.server` suffix — createI18nInstance() runs on both the server
// (getFixedT, SSR hydration seed) and the client (I18nProvider), so it
// can't live in a server-only file or the client bundle build fails
// ("Server-only module referenced by client").
export const resources = { cs, en } as const;

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
