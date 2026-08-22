import { redirect } from "react-router";
import type { Route } from "./+types/logbook";
import { getPrisma } from "@/lib/db.server";
import { requireSession } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";
import { getLogbookSettingsStored } from "@/lib/settings";
import { createLogbookHandoffCode } from "@/lib/logbook";

/**
 * No page of its own — just mints a one-time handoff code and bounces the
 * already-authenticated user straight to Logbook's `/sso?code=...`. See
 * `src/lib/logbook.ts` and `app/routes/api/logbook.exchange.ts` for the
 * server-to-server side of the handoff.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const session = await requireSession(request, params.locale!);
    const settings = await getLogbookSettingsStored();
    if (!settings.enabled || !settings.url) {
      throw redirect(`/${params.locale}`);
    }
    const prisma = await getPrisma();
    const code = await createLogbookHandoffCode(session.id, prisma);
    throw redirect(`${settings.url}/sso?code=${code}`);
  });
}
