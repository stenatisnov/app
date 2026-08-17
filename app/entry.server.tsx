import { PassThrough } from "node:stream";
import type { AppLoadContext, EntryContext } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");

    const readyOption: "onAllReady" | "onShellReady" = userAgent && isbot(userAgent) ? "onAllReady" : "onShellReady";

    const { pipe, abort } = renderToPipeableStream(<ServerRouter context={routerContext} url={request.url} />, {
      [readyOption]: () => {
        shellRendered = true;
        const body = new PassThrough();
        const stream = createReadableStreamFromReadable(body);

        responseHeaders.set("Content-Type", "text/html");
        // Every page is session/settings-dependent (credits, gate state,
        // admin config, feature toggles like Google sign-in) — nothing here
        // is safe to cache. Without this, some clients cache the document
        // more aggressively than a normal tab load would suggest:
        // Android/Chrome's PWA host caches the `start_url` document for
        // fast launches, so an installed PWA can open showing a stale
        // snapshot from whenever it was last actually fetched, while a
        // plain browser tab (no such launch-cache heuristic) shows the
        // current state — e.g. a Google-sign-in toggle flipped in admin
        // settings after the PWA's last real fetch stayed invisible until
        // the next client-side navigation re-ran the loader. `no-store`
        // opts every document response out of that at the source.
        responseHeaders.set("Cache-Control", "no-store");

        resolve(
          new Response(stream, {
            headers: responseHeaders,
            status: responseStatusCode,
          }),
        );

        pipe(body);
      },
      onShellError(error: unknown) {
        reject(error);
      },
      onError(error: unknown) {
        responseStatusCode = 500;
        if (shellRendered) {
          console.error(error);
        }
      },
    });

    setTimeout(abort, streamTimeout + 1000);
  });
}
