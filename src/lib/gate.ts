import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "./db.server";
import { audit } from "./audit";
import { openLock } from "./lock";
import { getLockSettings } from "./settings";
import { isWithinWindows, startOfAppDaysAgo } from "./time";
import { hasFreeGateEntry } from "./roles";

/** Ledger reasons that represent a real (non-rollback) gate entry for the account holder — used to detect "already entered today" for `dailyUnlimitedEntries`. */
const GATE_ENTRY_REASONS = ["gate_open", "gate_open_pass", "gate_open_admin"];

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
      dependentsLeft?: { dependentId: string; name: string; creditsLeft: number }[];
    }
  | { ok: false; code: string; message: string; dependentName?: string };

/**
 * Opens the gate for a logged-in member.
 *
 * Cloudflare D1 doesn't support Prisma's interactive transactions
 * (`$transaction(async (tx) => ...)`), only the batch array form — and a
 * batch can't branch on a value it just read, which rules out "read
 * balance, decide, then write" as one atomic unit. Instead, the actual
 * credit/cooldown check-and-decrement is a single conditional
 * `updateMany` whose `where` re-asserts the guard (credits ≥ 1, cooldown
 * elapsed) at write time: it's inherently atomic as one statement, so two
 * concurrent opens can never both succeed off a single remaining credit —
 * the second one's `updateMany` simply matches zero rows. Approval/
 * suspension/schedule are read first since they don't need that same
 * race protection (losing that particular race just means an admin
 * change or a schedule boundary takes effect a moment later than it
 * otherwise would, not a double-spent credit).
 *
 * Dependents (companions) get the same atomic-`updateMany`-per-row claim.
 * Since D1 can't wrap the self claim and every dependent claim in one
 * cross-row transaction, a dependent running out of credits mid-way is
 * handled as a compensating rollback: refund whatever was already claimed
 * (self + any earlier dependents) and report the shortfall, rather than
 * true all-or-nothing atomicity. The window for that to matter is a
 * concurrent request racing the exact same entry at the exact same
 * instant — same trade-off this file already accepts for the lock
 * hardware failing after credits were claimed, just below.
 */
export async function openGateForUser(
  userId: string,
  opts: { openGate?: boolean; verifiedByStaffId?: string; dependentIds?: string[] } = {},
): Promise<OpenGateResult> {
  const openGate = opts.openGate ?? true;
  const dependentIds = opts.dependentIds ?? [];
  const prisma = await getPrisma();
  const lock = await getLockSettings();
  const now = new Date();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { groups: { include: { group: { include: { windows: true } } } } },
  });
  if (!user) {
    await audit({ action: "gate.open", success: false, userId, message: "Uživatel nenalezen", meta: { code: "NOT_FOUND" } });
    return { ok: false, code: "NOT_FOUND", message: "Uživatel nenalezen" };
  }
  if (user.status !== "APPROVED") {
    await audit({ action: "gate.open", success: false, userId, message: "Účet čeká na schválení", meta: { code: "PENDING" } });
    return { ok: false, code: "PENDING", message: "Účet čeká na schválení" };
  }
  if (user.suspended) {
    await audit({ action: "gate.open", success: false, userId, message: "Účet je pozastaven", meta: { code: "SUSPENDED" } });
    return { ok: false, code: "SUSPENDED", message: "Účet je pozastaven" };
  }

  const isAdmin = hasFreeGateEntry(user.role);
  // Admins always open for free; members (including STAFF) may also have a purchased period pass.
  const activePass = isAdmin
    ? null
    : await prisma.userAccessPass.findFirst({
        where: { userId, validFrom: { lte: now }, validTo: { gte: now } },
        orderBy: { validTo: "desc" },
      });
  const usePass = Boolean(activePass);

  // "Daily unlimited entries": once a member has a real gate entry today
  // (self-open or staff-verified — both call this function), further
  // entries the same calendar day (Europe/Prague) are free.
  const alreadyEnteredToday =
    !isAdmin &&
    !usePass &&
    lock.dailyUnlimitedEntries &&
    (await prisma.creditLedger.findFirst({
      where: {
        userId,
        dependentId: null,
        reason: { in: GATE_ENTRY_REASONS },
        createdAt: { gte: startOfAppDaysAgo(0) },
      },
      select: { id: true },
    })) !== null;

  const freeOpen = isAdmin || usePass || alreadyEnteredToday;

  // Dependents (companions, typically children) are credits-only — no
  // passes, no admin bypass. This read is just for a friendly "which one
  // is short" error; the actual claim below is the atomic step.
  let dependents: { id: string; name: string; credits: number }[] = [];
  if (dependentIds.length > 0) {
    dependents = await prisma.dependent.findMany({ where: { id: { in: dependentIds }, parentUserId: userId } });
    if (dependents.length !== dependentIds.length) {
      await audit({ action: "gate.open", success: false, userId, message: "Doprovod nenalezen", meta: { code: "NOT_FOUND" } });
      return { ok: false, code: "NOT_FOUND", message: "Doprovod nenalezen" };
    }
    const short = dependents.find((d) => d.credits < 1);
    if (short) {
      await audit({
        action: "gate.open",
        success: false,
        userId,
        message: "Nedostatek kreditů",
        meta: { code: "NO_CREDITS_DEPENDENT", dependentName: short.name },
      });
      return { ok: false, code: "NO_CREDITS_DEPENDENT", message: "Nedostatek kreditů", dependentName: short.name };
    }
  }

  // Admins bypass the group schedule entirely (24/7 access).
  if (!isAdmin) {
    const inWindow = user.groups.some(({ group }) => isWithinWindows(group.windows, group.is24_7));
    if (!inWindow) {
      await audit({ action: "gate.open", success: false, userId, message: "Mimo povolený čas rozvrhu", meta: { code: "OUTSIDE_HOURS" } });
      return { ok: false, code: "OUTSIDE_HOURS", message: "Mimo povolený čas rozvrhu" };
    }
  }

  const cooldownUntil = new Date(now.getTime() + lock.cooldownSec * 1000);
  const cooldownElapsed = { OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }] };

  const claimed = await prisma.user.updateMany({
    where: freeOpen
      ? { id: userId, ...cooldownElapsed }
      : { id: userId, credits: { gte: 1 }, ...cooldownElapsed },
    data: freeOpen ? { cooldownUntil } : { credits: { decrement: 1 }, cooldownUntil },
  });

  if (claimed.count === 0) {
    // Lost the race (or state changed between the read above and here) —
    // re-read to report the right reason.
    const fresh = await prisma.user.findUnique({ where: { id: userId } });
    const stillInCooldown = Boolean(fresh?.cooldownUntil && fresh.cooldownUntil > now);
    const code = stillInCooldown ? "COOLDOWN" : "NO_CREDITS";
    const message = stillInCooldown ? "Počkejte před dalším otevřením" : "Nedostatek kreditů";
    await audit({ action: "gate.open", success: false, userId, message, meta: { code } });
    return { ok: false, code, message };
  }

  // Claim each dependent's credit the same atomic-per-row way. If one runs
  // short mid-way, refund everything already claimed (self + earlier
  // dependents) — see the function doc comment for why this is a
  // compensating rollback rather than a real cross-row transaction.
  const claimedDependentIds: string[] = [];
  let dependentShortfall: string | null = null;
  for (const dep of dependents) {
    const depClaimed = await prisma.dependent.updateMany({
      where: { id: dep.id, credits: { gte: 1 } },
      data: { credits: { decrement: 1 } },
    });
    if (depClaimed.count === 0) {
      dependentShortfall = dep.name;
      break;
    }
    claimedDependentIds.push(dep.id);
  }

  if (dependentShortfall) {
    await prisma.user.update({
      where: { id: userId },
      data: freeOpen ? { cooldownUntil: null } : { credits: { increment: 1 }, cooldownUntil: null },
    });
    for (const depId of claimedDependentIds) {
      await prisma.dependent.update({ where: { id: depId }, data: { credits: { increment: 1 } } });
    }
    await audit({
      action: "gate.open",
      success: false,
      userId,
      message: "Nedostatek kreditů",
      meta: { code: "NO_CREDITS_DEPENDENT", dependentName: dependentShortfall },
    });
    return { ok: false, code: "NO_CREDITS_DEPENDENT", message: "Nedostatek kreditů", dependentName: dependentShortfall };
  }

  const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.creditLedger.create({
    data: {
      userId,
      delta: freeOpen ? 0 : -1,
      reason: isAdmin ? "gate_open_admin" : usePass ? "gate_open_pass" : "gate_open",
      meta: usePass
        ? { passId: activePass!.id }
        : isAdmin
          ? { admin: true }
          : alreadyEnteredToday
            ? { dailyUnlimitedReentry: true }
            : undefined,
    },
  });

  const dependentsLeft: { dependentId: string; name: string; creditsLeft: number }[] = [];
  for (const dep of dependents) {
    await prisma.creditLedger.create({
      data: { userId, dependentId: dep.id, delta: -1, reason: "gate_open_dependent", meta: { name: dep.name } },
    });
    dependentsLeft.push({ dependentId: dep.id, name: dep.name, creditsLeft: dep.credits - 1 });
  }

  if (!openGate) {
    await audit({
      action: "gate.open",
      success: true,
      userId,
      message: opts.verifiedByStaffId ? "Vstup ověřen obsluhou" : "Vstup bez otevření brány",
      meta: {
        gateOpened: false,
        creditsLeft: updated.credits,
        usedPass: usePass,
        usedAdmin: isAdmin,
        creditsUsed: !freeOpen,
        verifiedByStaffId: opts.verifiedByStaffId,
        dependents: dependentsLeft.map((d) => ({ id: d.dependentId, name: d.name })),
      },
    });
    return {
      ok: true,
      gateOpened: false,
      creditsLeft: updated.credits,
      cooldownSec: lock.cooldownSec,
      usedPass: usePass,
      usedAdmin: isAdmin,
      dependentsLeft,
    };
  }

  const lockResult = await openLock(lock);

  if (!lockResult.ok) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: freeOpen ? { cooldownUntil: null } : { credits: { increment: 1 }, cooldownUntil: null },
      }),
      prisma.creditLedger.create({
        data: {
          userId,
          delta: freeOpen ? 0 : 1,
          reason: "gate_open_rollback",
          meta: { error: lockResult.error },
        },
      }),
      ...dependents.flatMap((dep) => [
        prisma.dependent.update({ where: { id: dep.id }, data: { credits: { increment: 1 } } }),
        prisma.creditLedger.create({
          data: {
            userId,
            dependentId: dep.id,
            delta: 1,
            reason: "gate_open_rollback",
            meta: { error: lockResult.error },
          },
        }),
      ]),
    ]);
    await audit({ action: "gate.open", success: false, userId, message: "Zámek neodpověděl", meta: { lockResult } });
    return {
      ok: false,
      code: freeOpen ? "LOCK_FAILED" : "LOCK_FAILED_REFUND",
      message: freeOpen ? "Zámek je nedostupný" : "Zámek je nedostupný, kredit byl vrácen",
    };
  }

  await audit({
    action: "gate.open",
    success: true,
    userId,
    message: lockResult.simulated ? "Simulované otevření" : "Otevřeno",
    meta: {
      lockResult,
      creditsLeft: updated.credits,
      usedPass: usePass,
      usedAdmin: isAdmin,
      creditsUsed: !freeOpen,
      dependents: dependentsLeft.map((d) => ({ id: d.dependentId, name: d.name })),
    },
  });

  return {
    ok: true,
    simulated: lockResult.simulated,
    gateOpened: true,
    creditsLeft: updated.credits,
    cooldownSec: lock.cooldownSec,
    usedPass: usePass,
    usedAdmin: isAdmin,
    dependentsLeft,
  };
}

/**
 * Whether `userId` gets a free "daily unlimited entries" re-open right now —
 * a real gate entry already happened today and the admin setting is on.
 * Mirrors the check `openGateForUser` applies when actually opening;
 * exposed separately so the dashboard can show the open button as
 * available (and skip the "no credits" banner) for the rest of the day,
 * not just tolerate it once the button is pressed.
 */
export async function hasFreeReentryToday(userId: string, prisma: PrismaClient): Promise<boolean> {
  const lock = await getLockSettings();
  if (!lock.dailyUnlimitedEntries) return false;
  return (
    (await prisma.creditLedger.findFirst({
      where: {
        userId,
        dependentId: null,
        reason: { in: GATE_ENTRY_REASONS },
        createdAt: { gte: startOfAppDaysAgo(0) },
      },
      select: { id: true },
    })) !== null
  );
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
  const prisma = await getPrisma();
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

  // Same conditional-update-as-atomic-guard pattern as openGateForUser:
  // `usedCount < maxUses` is re-asserted in the WHERE clause so two
  // concurrent opens of the last remaining use can't both succeed.
  const claimed = await prisma.guestPass.updateMany({
    where: { id: pass.id, usedCount: { lt: pass.maxUses } },
    data: { usedCount: { increment: 1 } },
  });
  if (claimed.count === 0) {
    await audit({ action: "guest.open", success: false, guestToken: token, message: "Vyčerpáno" });
    return { ok: false, code: "USED_UP", message: "Kód byl vyčerpán" };
  }

  const updated = await prisma.guestPass.findUniqueOrThrow({ where: { id: pass.id } });

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
