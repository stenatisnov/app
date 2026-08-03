import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell";
import "../globals.css";

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
  return { title: t("name") };
}

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
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <AppShell user={session?.user ?? null}>{children}</AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
