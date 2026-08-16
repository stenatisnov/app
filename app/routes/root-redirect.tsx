import { redirect } from "react-router";
import type { Route } from "./+types/root-redirect";
import { defaultLocale, locales } from "@/i18n/routing";

/** Bare `/` — mirrors next-intl middleware's locale detection + redirect (`localePrefix: "always"`, nothing ever renders without a `/cs`/`/en` prefix). */
export function loader({ request }: Route.LoaderArgs) {
  const cookieLocale = request.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)locale=(cs|en)/)?.[1];
  if (cookieLocale) throw redirect(`/${cookieLocale}`);

  const acceptLanguage = request.headers.get("Accept-Language") ?? "";
  const detected = locales.find((l) => acceptLanguage.toLowerCase().includes(l));
  throw redirect(`/${detected ?? defaultLocale}`);
}
