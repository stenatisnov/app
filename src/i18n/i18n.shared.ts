import i18next from "i18next";
import ICU from "i18next-icu";
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
 * requests. `createInstance()` + a synchronous `initImmediate: false` init
 * keeps every request's translations isolated and avoids any async I/O
 * (the dictionaries are already bundled, not fetched).
 *
 * `.use(ICU)`: `messages/cs.json`/`messages/en.json` are reused byte-for-byte
 * from the next-intl branches, which means plural/interpolation strings use
 * ICU MessageFormat syntax (`"{count, plural, one {# vstup} other {#
 * vstupů}}"`, single braces) — i18next's own default interpolator only
 * understands `{{var}}` and doesn't parse embedded ICU at all, so without
 * this plugin those strings render completely literally instead of being
 * formatted. `i18next-icu` (backed by `intl-messageformat`) makes i18next's
 * formatting engine ICU-compatible, so the message files don't need touching.
 */
export function createI18nInstance(locale: Locale) {
  const instance = i18next.createInstance();
  instance.use(ICU).init({
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
