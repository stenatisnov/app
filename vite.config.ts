import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const wasmClient = fileURLToPath(new URL("./node_modules/.prisma/client/wasm.js", import.meta.url));

export default defineConfig({
  // cloudflare() runs the server code in the actual workerd runtime (via
  // Vite 6's Environment API) for both `dev` and `build` — real D1 access
  // in the loader/action from day one, not a Node-only approximation.
  plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), tailwindcss(), reactRouter(), tsconfigPaths()],
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
      // nodemailer (and its transitive deps) `require()` Node builtins by
      // their bare name (`events`, `stream`, ...), not the `node:`-prefixed
      // form. workerd's `nodejs_compat` only reliably resolves the prefixed
      // form through this Vite/Rollup pipeline — the bare specifier doesn't
      // resolve to the real module, so e.g. `class X extends EventEmitter`
      // throws "Class extends value #<Object> is not a constructor" at
      // import time (EventEmitter came back undefined). Redirecting every
      // bare Node builtin nodemailer touches to its `node:` form fixes it
      // at the source rather than patching nodemailer itself.
      ...["events", "stream"].map((mod) => ({ find: new RegExp(`^${mod}$`), replacement: `node:${mod}` })),
    ],
  },
});
