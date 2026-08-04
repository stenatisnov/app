import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";

/**
 * Appends one row to the immutable audit trail. Every gate open, login,
 * payment, and admin action goes through this — never update or delete
 * `AuditLog` rows elsewhere.
 *
 * `client` lets callers that already have their own Prisma client supply
 * it explicitly instead of relying on this module's own resolution — e.g.
 * the D1 branch's scheduled backup job, which runs outside the fetch
 * request lifecycle `getPrisma()` depends on there.
 */
export async function audit(
  params: {
    action: string;
    success: boolean;
    userId?: string | null;
    guestToken?: string | null;
    message?: string;
    meta?: Prisma.InputJsonValue;
  },
  client: PrismaClient = prisma,
) {
  await client.auditLog.create({
    data: {
      action: params.action,
      success: params.success,
      userId: params.userId ?? undefined,
      guestToken: params.guestToken ?? undefined,
      message: params.message,
      meta: params.meta,
    },
  });
}
