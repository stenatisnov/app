import { Outlet, data } from "react-router";
import type { Route } from "./+types/_shell";
import { isLocale } from "@/i18n/routing";
import { getSessionUser } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

/** Locale-prefixed layout — every route under `/:locale/*` gets the session-dependent chrome (AppShell) from here, same job `[locale]/layout.tsx` + `AppShell.tsx` did together on the Next.js branches. */
export async function loader({ params, request, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    if (!isLocale(params.locale)) throw data(null, { status: 404 });
    const user = await getSessionUser(request);
    return { user };
  });
}

export default function LocaleShell({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <ServiceWorkerRegister />
      <AppShell user={loaderData.user}>
        <Outlet />
      </AppShell>
    </>
  );
}
