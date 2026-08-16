import { AsyncLocalStorage } from "node:async_hooks";
import type { AppLoadContext } from "react-router";

const als = new AsyncLocalStorage<AppLoadContext>();

/**
 * Every route's `loader`/`action` wraps its whole body in this, once, right
 * where it receives `context` from React Router — that's what lets
 * `getPrisma()`/`getEnv()` be zero-arg ambient lookups instead of `context`
 * getting threaded through every lib function's signature. This is what
 * makes it possible for `gate.ts`/`payments.ts` (and everything else) to
 * port onto the D1 branch **verbatim** — the real `d1sql` branch's
 * `getPrisma()` is zero-arg too (backed by `getCloudflareContext()`'s own
 * ambient storage); this file is what reproduces that same shape in RR7,
 * which has no built-in equivalent.
 */
export function withLoadContext<T>(context: AppLoadContext, fn: () => T): T {
  return als.run(context, fn);
}

export function getLoadContext(): AppLoadContext {
  const context = als.getStore();
  if (!context) {
    throw new Error(
      "getLoadContext() called outside a request — the calling route's loader/action must wrap its body in withLoadContext(context, ...).",
    );
  }
  return context;
}
