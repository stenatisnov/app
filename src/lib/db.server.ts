// Explicit `/wasm` entry point, not the bare `@prisma/client` specifier —
// see the matching `alias` entry in `wrangler.jsonc`: `@prisma/client`'s
// package.json exports map claims an ESM "./wasm" -> "./wasm.mjs" entry
// that isn't actually shipped, and wrangler's esbuild pass over the
// Workers entry fails resolving it unless aliased to the CJS `wasm.js`
// build, which does exist.
import { PrismaClient } from "@prisma/client/wasm";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getLoadContext } from "./request-context.server";

let cached: PrismaClient | undefined;

/**
 * Cloudflare D1. Unlike the other branches' `export const prisma`, this is
 * an async accessor — the D1 binding only lives on `context.cloudflare.env`,
 * which React Router only ever hands to a `loader`/`action` (via
 * `withLoadContext`, see `request-context.server.ts`), never available at
 * module-eval time. Every caller does `const prisma = await getPrisma();`
 * instead of importing a ready-made client.
 *
 * `cached` persists across requests within the same Worker isolate — cheap
 * to keep since the adapter itself is just a thin wrapper around the `DB`
 * binding, which is stable for the isolate's lifetime.
 */
export async function getPrisma(): Promise<PrismaClient> {
  if (cached) return cached;
  const context = getLoadContext();
  const adapter = new PrismaD1(context.cloudflare.env.DB);
  cached = new PrismaClient({
    adapter,
    log: import.meta.env.DEV ? ["error", "warn"] : ["error"],
  });
  return cached;
}
