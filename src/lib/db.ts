/**
 * Database-variant seam.
 *
 * This file does not exist on the `app-rr` branch on purpose — the rest of
 * the codebase only ever imports `{ getPrisma }` from `@/lib/db`, never
 * touches a concrete driver. `getPrisma()` is async and **zero-arg**
 * everywhere (not just on D1) — it reads the current request's Cloudflare
 * env via `getLoadContext()` (`request-context.server.ts`), the same ambient
 * lookup `getCloudflareContext()` does on the real D1 branch. That's what
 * lets call sites (and files like `gate.ts`/`payments.ts`) stay identical
 * across branches — see `stena-rr7-d1sql`'s version of this file.
 */
export {};
