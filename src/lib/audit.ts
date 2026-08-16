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
 * On the D1 branches, this call's `data` object is deliberately given
 * every field explicitly (real value or `null`), never `undefined`/omitted:
 * on real dev/prod data, `gate.open` rows written through this function had
 * `userId` come back `NULL` in roughly half of cases even though a real id
 * was passed in — every time, for every caller — while `CreditLedger.create`
 * calls made moments earlier in the very same request, whose `data` object
 * always has every field present, never lost theirs. That's consistent with
 * the D1 adapter's query compiler caching a compiled statement keyed by
 * which fields are *present*, since this function is the only one in the
 * codebase sometimes called with `userId` and sometimes with only
 * `guestToken` (member vs. guest entries) — a later call can apparently
 * reuse an earlier call's plan and silently drop a column that plan didn't
 * have. Keeping the field set identical on every call sidesteps that rather
 * than truly fixing it upstream; worth revisiting if a Prisma/D1 adapter
 * update addresses it.
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
