import type { Role } from "@prisma/client";

/** ADMIN and ROOT both reach the admin area; ROOT additionally gets settings/data/logs. */
export function isStaffRole(role: Role | string | null | undefined): boolean {
  return role === "ADMIN" || role === "ROOT";
}

export function isRootRole(role: Role | string | null | undefined): boolean {
  return role === "ROOT";
}
