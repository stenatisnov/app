import path from "node:path";
import { defineConfig } from "prisma/config";
import "dotenv/config";

export default defineConfig({
  schema: path.join("prisma", "schema"),
  migrations: {
    // Only used for local authoring (`npm run db:migrate`) — see
    // migrations/ (wrangler format) for what's actually applied to D1.
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
