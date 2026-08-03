/**
 * Database-variant seam.
 *
 * This file does not exist on the `app` branch on purpose — the rest of the
 * codebase only ever imports `{ prisma }` from `@/lib/db`, never touches a
 * concrete driver. Each database branch (`d1sql`, `libsql`, `libsql-local`)
 * adds its own version of this file that constructs a `PrismaClient` with
 * the matching driver adapter. See that branch's `src/lib/db.ts` and
 * `prisma/schema/datasource.prisma`.
 */
export {};
