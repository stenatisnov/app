import { UserStatus } from "@prisma/client";
import { getPrisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sendAccountActivationEmail } from "@/lib/registration-mail";
import { openGateForGuest, openGateForUser } from "@/lib/gate";
import { hasFreeGateEntry } from "@/lib/roles";
import { getSessionUser } from "@/lib/session.server";
import { isWithinWindows } from "@/lib/time";

// ---------------------------------------------------------------------------
// Staff — pass verification
//
// A member proves they're on-site by showing the QR code generated on their
// own "Prokázat se obsluze" screen (which just encodes their email — no
// deduction happens there); STAFF looks that member up here — by scanning
// the code or typing the email — and only deducts the entry after an
// explicit confirm, via the same openGateForUser(..., { openGate: false })
// path the member's own self-service button used to call directly.
// ---------------------------------------------------------------------------

type StaffEntryBlockedReason = "PENDING" | "SUSPENDED" | "NO_CREDITS" | "OUTSIDE_HOURS" | "COOLDOWN";

export type StaffEntryLookup =
  | {
      ok: true;
      userId: string;
      name: string | null;
      email: string;
      unlimitedAccess: boolean;
      hasActivePass: boolean;
      activePassUntil: Date | null;
      credits: number;
      canEnter: boolean;
      blockedReason?: StaffEntryBlockedReason;
      /** This member's registered companions — staff picks which are actually present before confirming. */
      dependents: { id: string; name: string; credits: number }[];
    }
  | { ok: false; error: "NOT_FOUND" };

export async function staffLookupUserForEntryAction(rawEmail: string): Promise<StaffEntryLookup> {
  const prisma = await getPrisma();
  const email = rawEmail.toLowerCase().trim();
  if (!email) return { ok: false, error: "NOT_FOUND" };

  const user = await prisma.user.findUnique({
    where: { email },
    include: { groups: { include: { group: { include: { windows: true } } } } },
  });
  if (!user) return { ok: false, error: "NOT_FOUND" };

  const dependents = await prisma.dependent.findMany({
    where: { parentUserId: user.id },
    orderBy: { createdAt: "asc" },
  });

  const now = new Date();
  const unlimitedAccess = hasFreeGateEntry(user.role);
  const activePass = unlimitedAccess
    ? null
    : await prisma.userAccessPass.findFirst({
        where: { userId: user.id, validFrom: { lte: now }, validTo: { gte: now } },
        orderBy: { validTo: "desc" },
      });
  const hasActivePass = Boolean(activePass);
  const freeOpen = unlimitedAccess || hasActivePass;

  let blockedReason: StaffEntryBlockedReason | undefined;
  if (user.status !== "APPROVED") blockedReason = "PENDING";
  else if (user.suspended) blockedReason = "SUSPENDED";
  else if (!freeOpen && user.credits < 1) blockedReason = "NO_CREDITS";
  else if (user.cooldownUntil && user.cooldownUntil > now) blockedReason = "COOLDOWN";
  else if (!unlimitedAccess) {
    const inWindow = user.groups.some(({ group }) => isWithinWindows(group.windows, group.is24_7));
    if (!inWindow) blockedReason = "OUTSIDE_HOURS";
  }

  return {
    ok: true,
    userId: user.id,
    name: user.name,
    email: user.email,
    unlimitedAccess,
    hasActivePass,
    activePassUntil: activePass?.validTo ?? null,
    credits: user.credits,
    canEnter: !blockedReason,
    blockedReason,
    dependents: dependents.map((dep) => ({ id: dep.id, name: dep.name, credits: dep.credits })),
  };
}

/** Re-validates and deducts atomically inside openGateForUser — the lookup above is only a preview. */
export async function staffConfirmEntryAction(
  request: Request,
  userId: string,
  dependentIds: string[] = [],
  quantity = 1,
  dependentQuantities: Record<string, number> = {},
  includeSelf = true,
) {
  const staffUser = await getSessionUser(request);
  return openGateForUser(userId, {
    openGate: false,
    verifiedByStaffId: staffUser?.id,
    dependentIds,
    quantity,
    dependentQuantities,
    includeSelf,
  });
}

/** Staff-facing counterpart to adminSetPersonTypeAction — same effect, but reachable without full admin access (Nastavení uživatele page). */
export async function staffSetPersonTypeAction(formData: FormData) {
  const prisma = await getPrisma();
  const userId = String(formData.get("userId") || "");
  const personTypeId = String(formData.get("personTypeId") || "") || null;
  await prisma.user.update({ where: { id: userId }, data: { personTypeId } });
}

/** Staff-facing counterpart to adminApproveUserAction — lets STAFF clear the pending-approval backlog without full admin access. */
export async function staffApproveUserAction(userId: string, approve: boolean) {
  const prisma = await getPrisma();
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: approve ? UserStatus.APPROVED : UserStatus.REJECTED },
  });
  if (approve) await sendAccountActivationEmail(user);
  await audit({ action: approve ? "staff.user.approve" : "staff.user.reject", success: true, userId });
}

type StaffGuestBlockedReason = "EXPIRED" | "USED_UP";

export type StaffGuestEntryLookup =
  | {
      ok: true;
      token: string;
      label: string | null;
      remaining: number;
      canEnter: boolean;
      blockedReason?: StaffGuestBlockedReason;
    }
  | { ok: false; error: "NOT_FOUND" };

/** Guest-pass counterpart to staffLookupUserForEntryAction — same preview-then-confirm flow, keyed by the pass token instead of an email. */
export async function staffLookupGuestForEntryAction(rawToken: string): Promise<StaffGuestEntryLookup> {
  const prisma = await getPrisma();
  const token = rawToken.trim();
  if (!token) return { ok: false, error: "NOT_FOUND" };

  const pass = await prisma.guestPass.findUnique({ where: { token } });
  if (!pass) return { ok: false, error: "NOT_FOUND" };

  const now = new Date();
  let blockedReason: StaffGuestBlockedReason | undefined;
  if (pass.usedCount >= pass.maxUses) blockedReason = "USED_UP";
  else if (now < pass.validFrom || now > pass.validTo) blockedReason = "EXPIRED";

  return {
    ok: true,
    token: pass.token,
    label: pass.label,
    remaining: Math.max(pass.maxUses - pass.usedCount, 0),
    canEnter: !blockedReason,
    blockedReason,
  };
}

/** Re-validates and deducts atomically inside openGateForGuest — the lookup above is only a preview. */
export async function staffConfirmGuestEntryAction(request: Request, token: string) {
  const staffUser = await getSessionUser(request);
  return openGateForGuest(token, { openGate: false, verifiedByStaffId: staffUser?.id });
}

// ---------------------------------------------------------------------------
// Staff — child-group batch check-in
//
// A ChildGroup (Admin → Dětské skupiny) is a set of accounts that can't
// self-open the gate (see openGateForUser's childGroupId check) — staff
// look the group up by name (on Ověřit permanentku) or pick it from the
// list (on the Dětské skupiny staff page), then check off which members are
// actually present before confirming, same preview-then-confirm shape as
// the individual/guest lookups above.
// ---------------------------------------------------------------------------

export type StaffChildGroupEntryLookup =
  | {
      ok: true;
      groupId: string;
      groupName: string;
      members: {
        userId: string;
        name: string | null;
        email: string;
        credits: number;
        canEnter: boolean;
        blockedReason?: StaffEntryBlockedReason;
      }[];
    }
  | { ok: false; error: "NOT_FOUND" };

async function buildChildGroupEntryLookup(group: { id: string; name: string }): Promise<StaffChildGroupEntryLookup> {
  const prisma = await getPrisma();
  const members = await prisma.user.findMany({
    where: { childGroupId: group.id },
    include: { groups: { include: { group: { include: { windows: true } } } } },
    orderBy: { name: "asc" },
  });
  const now = new Date();
  const results = await Promise.all(
    members.map(async (user) => {
      const activePass = await prisma.userAccessPass.findFirst({
        where: { userId: user.id, validFrom: { lte: now }, validTo: { gte: now } },
        orderBy: { validTo: "desc" },
      });
      const freeOpen = Boolean(activePass);
      let blockedReason: StaffEntryBlockedReason | undefined;
      if (user.status !== "APPROVED") blockedReason = "PENDING";
      else if (user.suspended) blockedReason = "SUSPENDED";
      else if (!freeOpen && user.credits < 1) blockedReason = "NO_CREDITS";
      else if (user.cooldownUntil && user.cooldownUntil > now) blockedReason = "COOLDOWN";
      else {
        const inWindow = user.groups.some(({ group }) => isWithinWindows(group.windows, group.is24_7));
        if (!inWindow) blockedReason = "OUTSIDE_HOURS";
      }
      return { userId: user.id, name: user.name, email: user.email, credits: user.credits, canEnter: !blockedReason, blockedReason };
    }),
  );
  return { ok: true, groupId: group.id, groupName: group.name, members: results };
}

/** Keyed by group name — used by Ověřit permanentku's single lookup field (see staffLookupGuestOrGroupAction). */
export async function staffLookupChildGroupForEntryAction(rawName: string): Promise<StaffChildGroupEntryLookup> {
  const prisma = await getPrisma();
  const name = rawName.trim();
  if (!name) return { ok: false, error: "NOT_FOUND" };
  // Matched in application code, not a DB case-insensitive query — SQLite/D1
  // doesn't support Prisma's `mode: "insensitive"` the way Postgres does,
  // and the group count here is small (admin-managed), so this stays cheap.
  const groups = await prisma.childGroup.findMany({ select: { id: true, name: true } });
  const group = groups.find((g) => g.name.trim().toLowerCase() === name.toLowerCase());
  if (!group) return { ok: false, error: "NOT_FOUND" };
  return buildChildGroupEntryLookup(group);
}

/** Keyed by group id — used by the Dětské skupiny staff page, where the group is picked from a list rather than typed. */
export async function staffLookupChildGroupByIdForEntryAction(groupId: string): Promise<StaffChildGroupEntryLookup> {
  const prisma = await getPrisma();
  const group = await prisma.childGroup.findUnique({ where: { id: groupId }, select: { id: true, name: true } });
  if (!group) return { ok: false, error: "NOT_FOUND" };
  return buildChildGroupEntryLookup(group);
}

/** Re-validates and deducts atomically inside openGateForUser, once per selected member — the lookup above is only a preview. */
export async function staffConfirmChildGroupEntryAction(request: Request, userIds: string[]) {
  const staffUser = await getSessionUser(request);
  const results = await Promise.all(
    userIds.map((userId) => openGateForUser(userId, { openGate: false, verifiedByStaffId: staffUser?.id })),
  );
  return { ok: results.every((r) => r.ok), results: userIds.map((userId, i) => ({ userId, result: results[i] })) };
}

/**
 * Ověřit permanentku's single non-email field now covers both a guest-pass
 * token and a child-group name — tries the guest pass first (tokens are
 * random hex, effectively never collide with a typed group name), falling
 * back to the group lookup.
 */
export type StaffGuestOrGroupLookup =
  | { kind: "guest"; data: Extract<StaffGuestEntryLookup, { ok: true }> }
  | { kind: "group"; data: Extract<StaffChildGroupEntryLookup, { ok: true }> }
  | { kind: "notFound" };

export async function staffLookupGuestOrGroupAction(raw: string): Promise<StaffGuestOrGroupLookup> {
  const guest = await staffLookupGuestForEntryAction(raw);
  if (guest.ok) return { kind: "guest", data: guest };
  const group = await staffLookupChildGroupForEntryAction(raw);
  if (group.ok) return { kind: "group", data: group };
  return { kind: "notFound" };
}
