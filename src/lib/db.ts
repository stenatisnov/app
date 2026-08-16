import { PrismaClient } from "@prisma/client";

/**
 * PostgreSQL over a standard TCP connection (local `docker compose` in
 * development, Railway's managed Postgres plugin in production). Unlike
 * the D1 branch, this needs no Prisma driver adapter — a plain
 * `PrismaClient` talks to `DATABASE_URL` directly, and the native engine
 * works fine in a real Node.js process (no wasm, no `__dirname` workarounds).
 *
 * `getPrisma()` stays async and zero-arg to match every other branch's call
 * sites (`await getPrisma()` throughout `gate.ts`, `payments.ts`, every
 * action file, ...) — here it's just an instant resolve around a client
 * built once at module load, since there's no per-request context to read
 * (env vars are always globally available in a Node process).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Vite's dev server hot-reloads modules, which would otherwise create a new
// PrismaClient (and a new DB connection pool) on every save.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function getPrisma(): Promise<PrismaClient> {
  return prisma;
}
