import type { Config } from "@react-router/dev/config";

export default {
  // Every route needs request-time data (session, locale, D1 on the deployable
  // branches) — nothing here is safe to prerender.
  ssr: true,
  // Required by @cloudflare/vite-plugin's environment-based build (see
  // vite.config.ts) — without it RR7's own build pipeline still expects
  // the legacy build/client output layout while the Cloudflare plugin
  // writes to its own per-environment directory, and the two disagree.
  future: {
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
