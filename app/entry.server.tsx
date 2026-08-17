import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";

// Workers-target entry — renderToReadableStream (Web Streams API) instead
// of app-rr's Node-target renderToPipeableStream/PassThrough pipeline,
// which needs @react-router/node and doesn't run in workerd.
export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  let shellRendered = false;
  const userAgent = request.headers.get("user-agent");

  const body = await renderToReadableStream(<ServerRouter context={routerContext} url={request.url} />, {
    onError(error: unknown) {
      responseStatusCode = 500;
      // Log streaming rendering errors from inside the shell. Don't log
      // errors encountered during initial shell rendering since they'll
      // reject and get logged in handleDocumentRequest.
      if (shellRendered) {
        console.error(error);
      }
    },
  });
  shellRendered = true;

  // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
  // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
  if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  // Every page is session/settings-dependent (credits, gate state, admin
  // config, feature toggles like Google sign-in) — nothing here is safe to
  // cache. Without this, some clients cache the document more aggressively
  // than a normal tab load would suggest: Android/Chrome's PWA host caches
  // the `start_url` document for fast launches, so an installed PWA can
  // open showing a stale snapshot from whenever it was last actually
  // fetched, while a plain browser tab (no such launch-cache heuristic)
  // shows the current state — e.g. a Google-sign-in toggle flipped in
  // admin settings after the PWA's last real fetch stayed invisible until
  // the next client-side navigation re-ran the loader. `no-store` opts
  // every document response out of that at the source.
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
