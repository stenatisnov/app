import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // cloudflare() runs the server code in the actual workerd runtime (via
  // Vite 6's Environment API) for both `dev` and `build` — real D1 access
  // in the loader/action from day one, not a Node-only approximation.
  plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), tailwindcss(), reactRouter(), tsconfigPaths()],
  resolve: {
    alias: {
      // `@prisma/client`'s package.json exports map claims an ESM
      // "./wasm" -> "./wasm.mjs" entry that isn't actually shipped in this
      // version — only the CJS `wasm.js` exists, which Rollup can't
      // resolve through the (broken) exports map on its own. Aliasing
      // straight to the file sidesteps it; Rollup/esbuild bundle CJS fine.
      "@prisma/client/wasm": fileURLToPath(new URL("./node_modules/@prisma/client/wasm.js", import.meta.url)),
      // `@prisma/client/wasm.js` (and `index.js`/`default.js`) then do
      // `require('.prisma/client/wasm')` / `require('.prisma/client/default')`
      // — a second bare-specifier hop into the *generated* client at
      // node_modules/.prisma/client/, which Rollup also can't resolve on
      // its own and silently treated as an external (only caught by a real
      // `wrangler deploy` upload, not `--dry-run`: "No such module
      // .prisma/client/wasm"). Same fix, one level deeper.
      ".prisma/client/wasm": fileURLToPath(new URL("./node_modules/.prisma/client/wasm.js", import.meta.url)),
      ".prisma/client/default": fileURLToPath(new URL("./node_modules/.prisma/client/default.js", import.meta.url)),
    },
  },
});
