import "server-only";
import { headers } from "next/headers";
import { appUrl } from "./app-url";

/**
 * Base URL derived from the incoming request (proxy-aware), so server-generated
 * links point at the actual host the user is on. Server-side only. Falls back to
 * {@link appUrl} when request headers are unavailable.
 */
export async function requestAppUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || "https";
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  } catch {
    // headers() unavailable (e.g. outside a request scope) — fall through.
  }
  return appUrl();
}
