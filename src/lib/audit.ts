import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "./db.server";

/**
 * Appends one row to the immutable audit trail. Every gate open, login,
 * payment, and admin action goes through this — never update or delete
 * `AuditLog` rows elsewhere.
 *
 * `client` lets callers that already have their own Prisma client supply
 * it explicitly instead of relying on this module's own resolution — e.g.
 * the D1 branch's scheduled backup job, which runs outside the fetch
 * request lifecycle `getPrisma()` depends on there.
 *
 * Every nullable field is written explicitly (real value or `null`/`DbNull`),
 * never `undefined`/omitted. Historical note: on real dev/prod data, some
 * `gate.open` rows had `userId = NULL` despite a real id being passed, which
 * was once attributed to the D1 adapter caching a compiled statement keyed by
 * which fields are present (member vs. guest call shapes). That theory does
 * not hold for the Prisma 6.19.x this project runs: its client engine has no
 * query-plan cache (verified in source — it compiles every query fresh),
 * `@prisma/adapter-d1` caches nothing, and Cloudflare D1 keys prepared
 * statements by full SQL text, so differing column lists can't collide. A
 * repro script alternating the pre-fix member/guest shapes 400× against a
 * real local D1 confirmed no column is ever dropped. The only mechanism by
 * which a "definitely passed" value becomes NULL in 6.x is `undefined` at
 * runtime — Prisma omits `undefined` fields by design — so the historical
 * NULLs were most likely runtime-undefined values, not a cache. The explicit
 * normalization stays anyway: it keeps `AuditLog` rows unambiguous and is
 * cheap insurance for a future Prisma 7.4+ upgrade, where a real query-plan
 * cache exists (disable-able via `queryPlanCacheMaxSize: 0` since 7.8.0).
 */
export async function audit(
  params: {
    action: string;
    success: boolean;
    userId?: string | null;
    guestToken?: string | null;
    message?: string | null;
    meta?: Prisma.InputJsonValue | null;
  },
  client?: PrismaClient,
) {
  const c = client ?? (await getPrisma());
  await c.auditLog.create({
    data: {
      action: params.action,
      success: params.success,
      userId: params.userId ?? null,
      guestToken: params.guestToken ?? null,
      message: params.message ?? null,
      meta: params.meta ?? Prisma.DbNull,
    },
  });
}
