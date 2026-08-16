/**
 * Per-branch seam, same idea as `db.ts`'s `getPrisma()` — how env vars/secrets
 * are read differs by deploy target. Workers secrets set via
 * `wrangler secret put` (and plain `vars` in `wrangler.jsonc`) never land on
 * `process.env` — they only exist on `context.cloudflare.env`, reachable
 * through the same ambient `getLoadContext()` lookup `db.ts` uses. Zero-arg
 * on every branch — see `request-context.server.ts`.
 */
import { getLoadContext } from "./request-context.server";

export function getEnv(): Record<string, string | undefined> {
  const context = getLoadContext();
  return context.cloudflare.env as unknown as Record<string, string | undefined>;
}
