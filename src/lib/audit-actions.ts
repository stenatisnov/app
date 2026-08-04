/**
 * Central list of audit action identifiers. Keeping this as the single
 * source of truth means the admin "action" filter dropdown can never drift
 * from what `audit()` calls actually record.
 */
export const AUDIT_ACTIONS = [
  "user.register",
  "user.password_reset_request",
  "user.password_reset",
  "user.password_change",
  "gate.open",
  "guest.open",
  "payment.create",
  "payment.gopay.confirm",
  "admin.payment.confirm",
  "admin.user.approve",
  "admin.user.reject",
  "admin.user.suspend",
  "admin.user.unsuspend",
  "admin.user.role",
  "admin.user.create",
  "admin.user.set_password",
  "admin.user.delete",
  "admin.entries.adjust",
  "admin.package.grant",
  "admin.access_pass.revoke",
  "admin.settings.gopay",
  "admin.guest.create",
  "admin.guest.delete",
  "admin.guest.delete_bulk",
  "admin.guest.email",
  "admin.person_type.create",
  "admin.person_type.set_default",
  "admin.person_type.delete",
  "admin.package.delete",
  "admin.group.create",
  "admin.group.delete",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}
