import type { Role } from "@prisma/client";

/** ADMIN and ROOT both reach the admin area; ROOT additionally gets settings/data/logs. */
export function isAdminRole(role: Role | string | null | undefined): boolean {
  return role === "ADMIN" || role === "ROOT";
}

export function isRootRole(role: Role | string | null | undefined): boolean {
  return role === "ROOT";
}

/** STAFF and above — used where a grant extends to STAFF but doesn't reach the full admin area (see `isAdminRole`), e.g. verifying a member's pass at the door or the payment-control page. */
export function isStaffOrAbove(role: Role | string | null | undefined): boolean {
  return role === "STAFF" || role === "ADMIN" || role === "ROOT";
}

/** Exactly STAFF — not ADMIN/ROOT even though they're `isStaffOrAbove`. Used only for the staff-manual nav link, which is deliberately staff-only, not staff-and-up. */
export function isStaffOnlyRole(role: Role | string | null | undefined): boolean {
  return role === "STAFF";
}

/**
 * Only ADMIN and ROOT get free/unlimited gate entry, bypassing credits and
 * the group schedule. STAFF enters like a MEMBER — buys credits/passes,
 * agrees to the operating rules, and is subject to the group schedule —
 * since staff shifts don't imply climbing access.
 */
export function hasFreeGateEntry(role: Role | string | null | undefined): boolean {
  return isAdminRole(role);
}
