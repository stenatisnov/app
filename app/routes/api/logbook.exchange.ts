import { data } from "react-router";
import type { Route } from "./+types/logbook.exchange";
import { getPrisma } from "@/lib/db.server";
import { withLoadContext } from "@/lib/request-context.server";
import { getLogbookSettingsStored } from "@/lib/settings";
import { checkLogbookAuth, exchangeLogbookHandoffCode } from "@/lib/logbook";

/**
 * Server-to-server only — called by the Logbook backend, never the browser.
 * Consumes the one-time code minted by `app/routes/logbook.tsx` and returns
 * the user it belonged to. See `app/routes/api/logbook.verify.ts` for the
 * non-consuming counterpart Logbook polls afterwards to keep role/status fresh.
 */
export async function action({ request, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const settings = await getLogbookSettingsStored();
    if (!checkLogbookAuth(request, settings)) {
      return data({ error: "unauthorized" }, { status: 401 });
    }

    let body: { code?: string };
    try {
      body = await request.json();
    } catch {
      return data({ error: "invalid_json" }, { status: 400 });
    }
    const code = String(body.code || "").trim();
    if (!code) return data({ error: "missing_code" }, { status: 400 });

    const prisma = await getPrisma();
    const user = await exchangeLogbookHandoffCode(code, prisma);
    if (!user) return data({ error: "invalid_or_expired_code" }, { status: 404 });

    return data(user);
  });
}
