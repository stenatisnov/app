import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Source_Sans_3, Fraunces } from "next/font/google";
import { routing } from "@/i18n/routing";
import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "../globals.css";

const sans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  variable: "--font-display",
});

const display = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-brand",
});

// Every page under this layout renders the session-dependent header
// (AppShell/AppHeader), and several routes (dashboard vs. marketing
// landing on `/`, admin pages) show different content per visitor. Next.js
// doesn't reliably detect `auth()` alone as a reason to skip static
// generation — without this, the layout can get frozen into one static
// HTML snapshot at build time and served to every visitor regardless of
// who's actually signed in.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: t("name"),
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
      shortcut: ["/favicon.ico"],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: t("name"),
    },
    other: {
      // Next's `appleWebApp.capable` only emits the newer, unprefixed
      // `mobile-web-app-capable` tag — iOS Safari still needs this
      // Apple-prefixed one to launch "Add to Home Screen" in standalone
      // mode (no browser chrome) rather than opening a regular Safari tab.
      "apple-mobile-web-app-capable": "yes",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#145238",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const [messages, session] = await Promise.all([getMessages(), auth()]);

  return (
    <html lang={locale} className={`${sans.variable} ${display.variable}`}>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          <ServiceWorkerRegister />
          <AppShell user={session?.user ?? null}>{children}</AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
