import {
  Link as RRLink,
  redirect as rrRedirect,
  useLocation,
  useNavigate,
  useParams,
  type LinkProps as RRLinkProps,
} from "react-router";
import { forwardRef } from "react";
import { defaultLocale, isLocale, stripLocale, type Locale } from "./routing";

function currentLocale(paramLocale: string | undefined): Locale {
  return isLocale(paramLocale) ? paramLocale : defaultLocale;
}

type LinkProps = Omit<RRLinkProps, "to"> & { href: RRLinkProps["to"] };

/** Locale-prefixed equivalent of next-intl's `<Link>` — same `href` prop name (not RR7's native `to`), given locale-agnostic (e.g. `/account`), so call sites are unchanged from the Next.js branches. */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, ...rest }, ref) {
  const { locale: paramLocale } = useParams();
  const locale = currentLocale(paramLocale);
  const path = typeof href === "string" ? `/${locale}${href === "/" ? "" : href}` : href;
  return <RRLink ref={ref} to={path} {...rest} />;
});

/** Current path with the `/cs`/`/en` prefix stripped — mirrors next-intl's locale-agnostic `usePathname`. */
export function usePathname(): string {
  return stripLocale(useLocation().pathname);
}

export function useRouter() {
  const navigate = useNavigate();
  const { locale: paramLocale } = useParams();
  const locale = currentLocale(paramLocale);
  const prefixed = (href: string) => `/${locale}${href === "/" ? "" : href}`;
  return {
    push: (href: string) => navigate(prefixed(href)),
    replace: (href: string) => navigate(prefixed(href), { replace: true }),
  };
}

export function getPathname({ href, locale }: { href: string; locale: Locale }): string {
  return `/${locale}${href === "/" ? "" : href}`;
}

/** Server-side (loader/action) redirect to a locale-agnostic path — throws, same as `react-router`'s `redirect`. */
export function redirect(href: string, locale: Locale = defaultLocale): never {
  throw rrRedirect(`/${locale}${href === "/" ? "" : href}`);
}
