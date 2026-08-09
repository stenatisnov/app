import type { Role } from "@prisma/client";

/** ADMIN and ROOT both reach the admin area; ROOT additionally gets settings/data/logs. */
export function isAdminRole(role: Role | string | null | undefined): boolean {
  return role === "ADMIN" || role === "ROOT";
}

export function isRootRole(role: Role | string | null | undefined): boolean {
  return role === "ROOT";
}

/** STAFF and above — used where a grant extends to STAFF but doesn't reach the full admin area (see `isAdminRole`), e.g. free gate entry or the payment-control page. */
export function isStaffOrAbove(role: Role | string | null | undefined): boolean {
  return role === "STAFF" || role === "ADMIN" || role === "ROOT";
}

/** Exactly STAFF — not ADMIN/ROOT even though they're `isStaffOrAbove`. Used only for the staff-manual nav link, which is deliberately staff-only, not staff-and-up. */
export function isStaffOnlyRole(role: Role | string | null | undefined): boolean {
  return role === "STAFF";
}

/** STAFF, ADMIN, and ROOT all get free/unlimited gate entry, bypassing credits and the group schedule. Only ADMIN/ROOT also reach the admin area — see `isAdminRole`. */
export function hasFreeGateEntry(role: Role | string | null | undefined): boolean {
  return isStaffOrAbove(role);
}
