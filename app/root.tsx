import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
  useRouteLoaderData,
  isRouteErrorResponse,
} from "react-router";
import type { Route } from "./+types/root";
import { defaultLocale, isLocale } from "@/i18n/routing";
import { getFixedT } from "@/i18n/i18n.server";
import { I18nProvider } from "@/i18n/i18n.client";
import "./app.css";

// Every route needs request-time data (session, D1 on the deployable
// branches) — nothing in this app is safe to prerender, so the locale is
// read straight off the URL rather than from any build-time state.
export function loader({ request }: Route.LoaderArgs) {
  const segment = new URL(request.url).pathname.split("/")[1];
  const locale = isLocale(segment) ? segment : defaultLocale;
  const t = getFixedT(locale, "app");
  return { locale, title: t("name") };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.title ?? "Stěna Letňák Tišnov" }];
}

export function links() {
  return [
    { rel: "manifest", href: "/manifest.webmanifest" },
    { rel: "icon", href: "/favicon.ico" },
    { rel: "icon", href: "/icon-32.png", sizes: "32x32", type: "image/png" },
    { rel: "icon", href: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { rel: "icon", href: "/icon-512.png", sizes: "512x512", type: "image/png" },
    { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,200..900;1,200..900&family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900&display=swap",
    },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const locale = data?.locale ?? defaultLocale;

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#145238" />
        {/* iOS Safari still needs the Apple-prefixed tag (not just the unprefixed one) to launch "Add to Home Screen" in standalone mode. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <Meta />
        <Links />
      </head>
      <body className="antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  const { locale } = useLoaderData<typeof loader>();
  return (
    <I18nProvider locale={locale}>
      <Outlet />
    </I18nProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unknown error";

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Něco se pokazilo</h1>
      <p className="mt-2 text-[var(--muted)]">{message}</p>
    </div>
  );
}
