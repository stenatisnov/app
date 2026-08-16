import type { Config } from "@react-router/dev/config";

export default {
  // Every route needs request-time data (session, locale, D1 on the deployable
  // branches) — nothing here is safe to prerender.
  ssr: true,
} satisfies Config;
