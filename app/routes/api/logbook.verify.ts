import { data } from "react-router";
import type { Route } from "./+types/logbook.verify";
import { getPrisma } from "@/lib/db.server";
import { withLoadContext } from "@/lib/request-context.server";
import { getLogbookSettingsStored } from "@/lib/settings";
import { checkLogbookAuth, getLogbookUserSnapshot } from "@/lib/logbook";

/**
 * Server-to-server only. Plain lookup by `userId` — nothing consumed, called
 * repeatedly — used by Logbook to periodically refresh its cached copy of a
 * user's role/status so a revoked role or suspension takes effect without
 * waiting for the Logbook session itself to expire.
 */
export async function action({ request, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const settings = await getLogbookSettingsStored();
    if (!checkLogbookAuth(request, settings)) {
      return data({ error: "unauthorized" }, { status: 401 });
    }

    let body: { userId?: string };
    try {
      body = await request.json();
    } catch {
      return data({ error: "invalid_json" }, { status: 400 });
    }
    const userId = String(body.userId || "").trim();
    if (!userId) return data({ error: "missing_userId" }, { status: 400 });

    const prisma = await getPrisma();
    const user = await getLogbookUserSnapshot(userId, prisma);
    if (!user) return data({ error: "not_found" }, { status: 404 });

    return data(user);
  });
}
