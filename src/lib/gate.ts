import { prisma } from "./db";
import { audit } from "./audit";
import { openLock } from "./lock";
import { getLockSettings } from "./settings";
import { isWithinWindows } from "./time";
import { hasFreeGateEntry } from "./roles";

export type OpenGateResult =
  | {
      ok: true;
      simulated?: boolean;
      /** False when the caller chose "enter without opening" — the entry was recorded but the lock was never called. */
      gateOpened: boolean;
      creditsLeft: number;
      cooldownSec: number;
      usedPass?: boolean;
      usedAdmin?: boolean;
      /** Remaining credits for each dependent included in this entry, in the order requested. */
      dependentsLeft?: { dependentId: string; creditsLeft: number }[];
    }
  | { ok: false; code: string; message: string; dependentName?: string };

/**
 * Opens the gate for a logged-in member.
 *
 * The credit/cooldown check-and-decrement happens inside one DB transaction
 * so two concurrent open requests can never both succeed on a single
 * remaining credit. The lock call itself happens *after* that transaction
 * commits (an HTTP call has no place inside a DB transaction); if the lock
 * fails, a second transaction refunds the credit and clears the cooldown.
 */
export async function openGateForUser(
  userId: string,
  opts: { openGate?: boolean; verifiedByStaffId?: string; dependentIds?: string[] } = {},
): Promise<OpenGateResult> {
  const openGate = opts.openGate ?? true;
  const dependentIds = opts.dependentIds ?? [];
  const lock = await getLockSettings();

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { groups: { include: { group: { include: { windows: true } } } } },
    });

    if (!user) {
      return { fail: true as const, code: "NOT_FOUND", message: "Uživatel nenalezen" };
    }
    if (user.status !== "APPROVED") {
      return { fail: true as const, code: "PENDING", message: "Účet čeká na schválení" };
    }
    if (user.suspended) {
      return { fail: true as const, code: "SUSPENDED", message: "Účet je pozastaven" };
    }

    const now = new Date();
    const isAdmin = hasFreeGateEntry(user.role);

    // Admins/staff always open for free; members may also have a purchased period pass.
    const activePass = isAdmin
      ? null
      : await tx.userAccessPass.findFirst({
          where: { userId, validFrom: { lte: now }, validTo: { gte: now } },
          orderBy: { validTo: "desc" },
        });
    const usePass = Boolean(activePass);
    const freeOpen = isAdmin || usePass;

    if (!freeOpen && user.credits < 1) {
      return { fail: true as const, code: "NO_CREDITS", message: "Nedostatek kreditů" };
    }

    // Dependents (companions, typically children) are credits-only — no
    // passes, no admin bypass. All of them must have at least one credit or
    // the whole entry (self included) is rejected before anything changes.
    let dependents: { id: string; name: string; credits: number }[] = [];
    if (dependentIds.length > 0) {
      dependents = await tx.dependent.findMany({ where: { id: { in: dependentIds }, parentUserId: userId } });
      if (dependents.length !== dependentIds.length) {
        return { fail: true as const, code: "NOT_FOUND", message: "Doprovod nenalezen" };
      }
      const short = dependents.find((d) => d.credits < 1);
      if (short) {
        return {
          fail: true as const,
          code: "NO_CREDITS_DEPENDENT",
          message: "Nedostatek kreditů",
          dependentName: short.name,
        };
      }
    }

    if (user.cooldownUntil && user.cooldownUntil > now) {
      return { fail: true as const, code: "COOLDOWN", message: "Počkejte před dalším otevřením" };
    }
    // Admins bypass the group schedule entirely (24/7 access for staff).
    if (!isAdmin) {
      const inWindow = user.groups.some(({ group }) => isWithinWindows(group.windows, group.is24_7));
      if (!inWindow) {
        return { fail: true as const, code: "OUTSIDE_HOURS", message: "Mimo povolený čas rozvrhu" };
      }
    }

    const cooldownUntil = new Date(Date.now() + lock.cooldownSec * 1000);
    const updated = await tx.user.update({
      where: { id: userId },
      data: freeOpen ? { cooldownUntil } : { credits: { decrement: 1 }, cooldownUntil },
    });

    await tx.creditLedger.create({
      data: {
        userId,
        delta: freeOpen ? 0 : -1,
        reason: isAdmin ? "gate_open_admin" : usePass ? "gate_open_pass" : "gate_open",
        meta: usePass ? { passId: activePass!.id } : isAdmin ? { admin: true } : undefined,
      },
    });

    const dependentsLeft: { dependentId: string; creditsLeft: number }[] = [];
    for (const dep of dependents) {
      await tx.dependent.update({ where: { id: dep.id }, data: { credits: { decrement: 1 } } });
      await tx.creditLedger.create({
        data: { userId, dependentId: dep.id, delta: -1, reason: "gate_open_dependent", meta: { name: dep.name } },
      });
      dependentsLeft.push({ dependentId: dep.id, creditsLeft: dep.credits - 1 });
    }

    return {
      fail: false as const,
      creditsLeft: updated.credits,
      usedPass: usePass,
      usedAdmin: isAdmin,
      freeOpen,
      dependentsLeft,
    };
  });

  if (result.fail) {
    await audit({
      action: "gate.open",
      success: false,
      userId,
      message: result.message,
      meta: { code: result.code, dependentName: result.dependentName },
    });
    return { ok: false, code: result.code, message: result.message, dependentName: result.dependentName };
  }

  if (!openGate) {
    await audit({
      action: "gate.open",
      success: true,
      userId,
      message: opts.verifiedByStaffId ? "Vstup ověřen obsluhou" : "Vstup bez otevření brány",
      meta: {
        gateOpened: false,
        creditsLeft: result.creditsLeft,
        usedPass: result.usedPass,
        usedAdmin: result.usedAdmin,
        verifiedByStaffId: opts.verifiedByStaffId,
      },
    });
    return {
      ok: true,
      gateOpened: false,
      creditsLeft: result.creditsLeft,
      cooldownSec: lock.cooldownSec,
      usedPass: result.usedPass,
      usedAdmin: result.usedAdmin,
      dependentsLeft: result.dependentsLeft,
    };
  }

  const lockResult = await openLock(lock);

  if (!lockResult.ok) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: result.freeOpen ? { cooldownUntil: null } : { credits: { increment: 1 }, cooldownUntil: null },
      });
      await tx.creditLedger.create({
        data: {
          userId,
          delta: result.freeOpen ? 0 : 1,
          reason: "gate_open_rollback",
          meta: { error: lockResult.error },
        },
      });
      for (const dep of result.dependentsLeft) {
        await tx.dependent.update({ where: { id: dep.dependentId }, data: { credits: { increment: 1 } } });
        await tx.creditLedger.create({
          data: {
            userId,
            dependentId: dep.dependentId,
            delta: 1,
            reason: "gate_open_rollback",
            meta: { error: lockResult.error },
          },
        });
      }
    });
    await audit({ action: "gate.open", success: false, userId, message: "Zámek neodpověděl", meta: { lockResult } });
    return {
      ok: false,
      code: result.freeOpen ? "LOCK_FAILED" : "LOCK_FAILED_REFUND",
      message: result.freeOpen ? "Zámek je nedostupný" : "Zámek je nedostupný, kredit byl vrácen",
    };
  }

  await audit({
    action: "gate.open",
    success: true,
    userId,
    message: lockResult.simulated ? "Simulované otevření" : "Otevřeno",
    meta: { lockResult, creditsLeft: result.creditsLeft, usedPass: result.usedPass, usedAdmin: result.usedAdmin },
  });

  return {
    ok: true,
    simulated: lockResult.simulated,
    gateOpened: true,
    creditsLeft: result.creditsLeft,
    cooldownSec: lock.cooldownSec,
    usedPass: result.usedPass,
    usedAdmin: result.usedAdmin,
    dependentsLeft: result.dependentsLeft,
  };
}

/**
 * Opens the gate for an anonymous guest pass holder. No credits or cooldown
 * involved — just the pass's own use counter and validity window.
 */
export async function openGateForGuest(
  token: string,
  opts: { openGate?: boolean; verifiedByStaffId?: string } = {},
): Promise<OpenGateResult> {
  const openGate = opts.openGate ?? true;
  const lock = await getLockSettings();
  const now = new Date();

  const pass = await prisma.guestPass.findUnique({ where: { token } });
  if (!pass) {
    await audit({ action: "guest.open", success: false, guestToken: token, message: "Neplatný kód" });
    return { ok: false, code: "INVALID", message: "Neplatný poukaz" };
  }
  if (now < pass.validFrom || now > pass.validTo) {
    await audit({ action: "guest.open", success: false, guestToken: token, message: "Mimo platnost" });
    return { ok: false, code: "EXPIRED", message: "Kód je mimo platnost" };
  }
  if (pass.usedCount >= pass.maxUses) {
    await audit({ action: "guest.open", success: false, guestToken: token, message: "Vyčerpáno" });
    return { ok: false, code: "USED_UP", message: "Kód byl vyčerpán" };
  }

  const updated = await prisma.guestPass.update({
    where: { id: pass.id },
    data: { usedCount: { increment: 1 } },
  });

  if (!openGate) {
    await audit({
      action: "guest.open",
      success: true,
      guestToken: token,
      message: opts.verifiedByStaffId ? "Vstup ověřen obsluhou" : undefined,
      meta: {
        gateOpened: false,
        usedCount: updated.usedCount,
        maxUses: updated.maxUses,
        verifiedByStaffId: opts.verifiedByStaffId,
      },
    });
    return {
      ok: true,
      gateOpened: false,
      creditsLeft: updated.maxUses - updated.usedCount,
      cooldownSec: 0,
    };
  }

  const lockResult = await openLock(lock);
  if (!lockResult.ok) {
    await prisma.guestPass.update({ where: { id: pass.id }, data: { usedCount: { decrement: 1 } } });
    await audit({ action: "guest.open", success: false, guestToken: token, message: "Zámek nedostupný", meta: { lockResult } });
    return { ok: false, code: "LOCK_FAILED", message: "Zámek je nedostupný" };
  }

  await audit({
    action: "guest.open",
    success: true,
    guestToken: token,
    meta: { usedCount: updated.usedCount, maxUses: updated.maxUses },
  });

  return {
    ok: true,
    simulated: lockResult.simulated,
    gateOpened: true,
    creditsLeft: updated.maxUses - updated.usedCount,
    cooldownSec: 0,
  };
}
