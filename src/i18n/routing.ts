export const locales = ["cs", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "cs";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/** Strips a leading `/cs` or `/en` segment, e.g. for building a redirect after a locale switch. */
export function stripLocale(pathname: string): string {
  const match = pathname.match(/^\/(cs|en)(\/.*|$)/);
  return match ? match[2] || "/" : pathname;
}

export function localizedPath(locale: Locale, pathname: string): string {
  const bare = stripLocale(pathname);
  return `/${locale}${bare === "/" ? "" : bare}`;
}
