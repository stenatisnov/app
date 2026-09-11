import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const wasmClient = fileURLToPath(new URL("./node_modules/.prisma/client/wasm.js", import.meta.url));

export default defineConfig(({ command }) => {
  // nodemailer (and its transitive deps) `require()` Node builtins by their
  // bare name (`events`, `stream`, ...), not the `node:`-prefixed form.
  // workerd's `nodejs_compat` only reliably resolves the prefixed form
  // through the Vite/Rollup **build** pipeline — the bare specifier doesn't
  // resolve to the real module in the deployed bundle, so e.g.
  // `class X extends EventEmitter` throws "Class extends value #<Object> is
  // not a constructor" at import time (EventEmitter came back undefined).
  // Redirecting the bare builtins nodemailer touches to their `node:` form
  // fixes the build at the source rather than patching nodemailer itself.
  //
  // Build-only, deliberately: in `vite serve` the cloudflare plugin's dev
  // module-runner cannot load `node:`-prefixed specifiers at all (see the
  // esbuild rewrite below) — in dev the same bare builtins map to unenv's
  // edge-ready polyfills, regular npm modules the runner loads fine (the
  // same family workerd's `nodejs_compat` itself is built on).
  const nodeCompatAliases = ["events", "stream"].map((mod) => ({
    find: new RegExp(`^${mod}$`),
    replacement: command === "build" ? `node:${mod}` : `unenv/node/${mod}`,
  }));

  // Dev-only esbuild plugin for the SSR dep optimizer. The optimizer
  // externalizes `node:`-prefixed imports verbatim (vite's `resolve.alias`
  // never sees them), so pre-bundled polyfill chunks — e.g.
  // `@cloudflare/unenv-preset/node/process` or unenv's readline, which both
  // `import { EventEmitter } from "node:events"` in their source — keep
  // their raw `node:` imports. The plugin's dev module-runner resolves
  // those to empty namespaces, and its export-type analysis then dies with
  // "Class extends value #<Object> is not a constructor" before the dev
  // server even starts. User esbuild plugins run before vite's own
  // builtin-externalization, so this onResolve rewrites `node:` specifiers
  // inside the pre-bundled chunks to unenv polyfills instead. Serve-only:
  // production builds must keep the real `node:` specifiers for workerd's
  // nodejs_compat at runtime.
  const devNodeBuiltinsToUnenv: Plugin = {
    name: "stena:dev-node-builtins-to-unenv",
    apply: "serve",
    config() {
      const resolveUnenv = (bare: string): string | undefined => {
        try {
          return fileURLToPath(import.meta.resolve(`unenv/node/${bare}`));
        } catch {
          // No unenv polyfill for this builtin (or an odd subpath) — fall
          // through to vite's default externalization for it.
          return undefined;
        }
      };
      return {
        environments: {
          ssr: {
            optimizeDeps: {
              esbuildOptions: {
                plugins: [
                  {
                    name: "stena:dev-node-builtins-to-unenv-esbuild",
                    setup(build) {
                      // unenv's async_hooks internals end up as an
                      // unextendable stub, and pre-bundled polyfill chunks
                      // do `class X extends AsyncResource` at module scope —
                      // serve them a minimal but constructible shim instead
                      // (the *app* imports node:async_hooks externally, so
                      // it still gets workerd's real implementation).
                      build.onResolve({ filter: /^node:async_hooks$/, }, (args) => ({
                        namespace: "stena-dev-shim",
                        path: args.path,
                      }));
                      // Node's `events` module exports the EventEmitter
                      // class *itself* (`module.exports = EventEmitter`),
                      // and nodemailer does `class Mail extends
                      // require('events')`. The generic ESM interop turns
                      // that into a namespace object and the extend dies —
                      // serve a CJS shim whose export IS the class.
                      build.onResolve({ filter: /^events$/, }, () => ({
                        namespace: "stena-dev-shim",
                        path: "events",
                      }));
                      // Same interop corruption hits `stream`:
                      // `require('stream').Stream` in pngjs (qrcode's dep)
                      // gets bundled as the whole module object, and
                      // `util.inherits(ChunkStream, Stream)` then receives
                      // a non-class. A CJS shim exporting a class with the
                      // named members keeps the property access intact.
                      build.onResolve({ filter: /^stream$/, }, () => ({
                        namespace: "stena-dev-shim",
                        path: "stream",
                      }));
                      build.onResolve({ filter: /^node:.*$/ }, (args) => {
                        const resolved = resolveUnenv(args.path.slice("node:".length));
                        return resolved ? { path: resolved } : undefined;
                      });
                      // Subpaths (`stream/promises`, `events/...`) don't hit
                      // the exact-match shims above and have no dedicated
                      // shim of their own — route them to unenv's polyfill
                      // when one exists, else fall through to vite's default
                      // externalization.
                      build.onResolve({ filter: /^(events|stream)\/.*$/ }, (args) => {
                        const resolved = resolveUnenv(args.path);
                        return resolved ? { path: resolved } : undefined;
                      });
                    },
                  },
                  {
                    name: "stena:dev-async-hooks-shim",
                    setup(build) {
                      build.onLoad({ filter: /.*/, namespace: "stena-dev-shim" }, (args) => {
                        if (args.path === "events") {
                          return {
                            loader: "js",
                            contents: [
                              'const { EventEmitter } = require("unenv/node/events");',
                              "module.exports = EventEmitter;",
                            ].join("\n"),
                          };
                        }
                        if (args.path === "stream") {
                          return {
                            loader: "js",
                            contents: [
                              'const s = require("unenv/node/stream");',
                              "class StreamShim {}",
                              "StreamShim.Stream = s.Stream;",
                              "StreamShim.Readable = s.Readable;",
                              "StreamShim.Writable = s.Writable;",
                              "StreamShim.Duplex = s.Duplex;",
                              "StreamShim.Transform = s.Transform;",
                              "StreamShim.PassThrough = s.PassThrough;",
                              "StreamShim.pipeline = s.pipeline;",
                              "StreamShim.finished = s.finished;",
                              "StreamShim.default = StreamShim;",
                              "module.exports = StreamShim;",
                            ].join("\n"),
                          };
                        }
                        return {
                          loader: "js",
                          contents: [
                            "export class AsyncResource {}",
                            "export class AsyncLocalStorage {",
                            "  run(_store, fn) { return fn(); }",
                            "  getStore() { return undefined; }",
                            "  enterWith() {}",
                            "  exit() {}",
                            "  disable() {}",
                            "  enable() {}",
                            "  bind(fn) { return fn; }",
                            "  snapshot() { return undefined; }",
                            "}",
                            "export function createHook() { return { enable() {}, disable() {} }; }",
                            "export function executionAsyncId() { return 0; }",
                            "export function executionAsyncResource() { return undefined; }",
                            "export function triggerAsyncId() { return 0; }",
                          ].join("\n"),
                        };
                      });
                    },
                  },
                ],
              },
            },
          },
        },
      };
    },
  };

  return {
    // cloudflare() runs the server code in the actual workerd runtime (via
    // Vite 6's Environment API) for both `dev` and `build` — real D1 access
    // in the loader/action from day one, not a Node-only approximation.
    plugins: [
      devNodeBuiltinsToUnenv,
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      tailwindcss(),
      reactRouter(),
      tsconfigPaths(),
    ],
    resolve: {
      // Every entry below is an *exact*-match regex (`^...$`), not a plain
      // string key — Vite's alias matching treats a plain string key as a
      // prefix match ("@prisma/client" would also swallow
      // "@prisma/client/adapter-d1" etc.), which would silently break
      // unrelated subpaths.
      //
      // The problem all of these route around: `@prisma/client` ships two
      // separate exports maps that disagree. The `/wasm` subpath's map
      // correctly conditions on "workerd" -> the wasm-compiler client. But
      // the *bare* `@prisma/client` import (used everywhere just for enums
      // like `Role`/`PaymentStatus` and the `Prisma` namespace) resolves
      // through `default.js` -> `.prisma/client/default` -> an internal
      // `#main-entry-point` package-imports condition that, in this Vite/
      // Rollup build, doesn't end up picking "workerd" either — it lands on
      // the Node-only `index.js`, which does `path.join(__dirname, ...)` to
      // locate the native query-engine binary. `__dirname` doesn't exist in
      // workerd, so this only fails at actual `wrangler deploy` upload time
      // (validation there is stricter than `--dry-run`), as
      // "Uncaught ReferenceError: __dirname is not defined". Since the enums
      // are plain objects with no engine dependency at all, redirecting
      // every entry point straight to the wasm-compiler client (which the
      // rest of the app already uses via `@prisma/client/wasm` in
      // db.server.ts/workers/app.ts) sidesteps the broken condition entirely
      // rather than trying to fix the condition resolution itself.
      alias: [
        { find: /^@prisma\/client$/, replacement: wasmClient },
        { find: /^@prisma\/client\/wasm$/, replacement: wasmClient },
        { find: /^\.prisma\/client\/wasm$/, replacement: wasmClient },
        { find: /^\.prisma\/client\/default$/, replacement: wasmClient },
        ...nodeCompatAliases,
      ],
    },
  };
});
