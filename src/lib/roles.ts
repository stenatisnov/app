import type { Role } from "@prisma/client";

/** ADMIN and ROOT both reach the admin area; ROOT additionally gets settings/data/logs. */
export function isAdminRole(role: Role | string | null | undefined): boolean {
  return role === "ADMIN" || role === "ROOT";
}

export function isRootRole(role: Role | string | null | undefined): boolean {
  return role === "ROOT";
}

/** STAFF, ADMIN, and ROOT all get free/unlimited gate entry, bypassing credits and the group schedule. Only ADMIN/ROOT also reach the admin area — see `isAdminRole`. */
export function hasFreeGateEntry(role: Role | string | null | undefined): boolean {
  return role === "STAFF" || role === "ADMIN" || role === "ROOT";
}
