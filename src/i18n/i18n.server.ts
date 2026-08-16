import type { TFunction } from "i18next";
import { type Locale } from "./routing";
import { createI18nInstance, resources } from "./i18n.shared";

/** Server-only equivalent of next-intl's `getTranslations(ns)` — locale comes from the route param, not implicit request context. */
export function getFixedT(locale: Locale, ns: string): TFunction {
  return createI18nInstance(locale).getFixedT(locale, ns);
}

export function getMessages(locale: Locale): typeof resources.cs {
  return resources[locale];
}
