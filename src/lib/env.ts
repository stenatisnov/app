/**
 * Per-branch seam, same idea as `db.ts`'s `getPrisma()` — how env vars/secrets
 * are read differs by deploy target. On `app-rr` (no live deploy target)
 * this just reads `process.env`. The D1/Cloudflare branch (`stena-rr7-d1sql`)
 * overrides this file to read `getLoadContext().cloudflare.env` instead,
 * since Workers secrets set via `wrangler secret put` never land on
 * `process.env`. Zero-arg on every branch — see `request-context.server.ts`.
 */
import { getLoadContext } from "./request-context.server";

export function getEnv(): Record<string, string | undefined> {
  getLoadContext(); // keeps this branch's call shape identical to the D1 branch's env.ts
  return process.env as unknown as Record<string, string | undefined>;
}
