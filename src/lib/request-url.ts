import { appUrl } from "./app-url";

/**
 * Base URL derived from the incoming request (proxy-aware), so server-generated
 * links point at the actual host the user is on. Falls back to {@link appUrl}
 * when the request carries no host header.
 */
export function requestAppUrl(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${host}`.replace(/\/+$/, "");
  }
  return appUrl();
}
