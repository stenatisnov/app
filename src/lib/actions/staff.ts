import { UserStatus } from "@prisma/client";
import { getPrisma } from "@/lib/db.server";
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
export async function staffConfirmEntryAction(request: Request, userId: string, dependentIds: string[] = []) {
  const staffUser = await getSessionUser(request);
  return openGateForUser(userId, { openGate: false, verifiedByStaffId: staffUser?.id, dependentIds });
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
