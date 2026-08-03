import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Appends one row to the immutable audit trail. Every gate open, login,
 * payment, and admin action goes through this — never update or delete
 * `AuditLog` rows elsewhere.
 */
export async function audit(params: {
  action: string;
  success: boolean;
  userId?: string | null;
  guestToken?: string | null;
  message?: string;
  meta?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
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
