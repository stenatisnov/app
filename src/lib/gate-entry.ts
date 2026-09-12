import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "./db";

/**
 * Appends one row to the gate-entry history.
 *
 * Deliberately its own table rather than reading the `gate.open` audit rows:
 * the log cleanup (`src/lib/log-cleanup.ts`, `LogCleanupSettings`) deletes
 * `AuditLog` wholesale by age, which used to take the entry statistics'
 * entire history with it — the yearly chart silently lost everything past
 * the retention window. `GateEntry` is never cleaned up; it is the
 * statistics' source of truth and is meant to be kept indefinitely.
 *
 * Written alongside the matching `audit()` call at both successful
 * `gate.open` sites in `openGateForUser` — the audit row stays the general
 * action trail, this is the entry record. Failed opens, guest passes
 * (`guest.open`), and logins never reach here.
 *
 * Like `audit()`, every nullable field is written explicitly (real value or
 * `null`), never `undefined`/omitted — see the long note in `audit.ts`.
 *
 * `client` lets callers that already have their own Prisma client supply it
 * explicitly, same as `audit()`.
 */
export async function recordGateEntry(
  params: {
    /** Null only for an entry with no account behind it — nothing in the app does that today, but the column tolerates it. */
    userId: string | null;
    /** Set when a staff member checked the entry in; absent for a self-service open. */
    verifiedByStaffId?: string | null;
    message?: string | null;
    /** False for staff-verified entries, which record the entry without driving the lock. */
    gateOpened: boolean;
    simulated?: boolean;
    usedPass?: boolean;
    usedAdmin?: boolean;
    creditsUsed?: boolean;
    /** The rest of what the audit row carried (creditsLeft, dependents, …). */
    meta?: Prisma.InputJsonValue | null;
  },
  client?: PrismaClient,
) {
  const c = client ?? (await getPrisma());
  await c.gateEntry.create({
    data: {
      userId: params.userId,
      verifiedByStaffId: params.verifiedByStaffId ?? null,
      message: params.message ?? null,
      gateOpened: params.gateOpened,
      simulated: params.simulated ?? false,
      usedPass: params.usedPass ?? false,
      usedAdmin: params.usedAdmin ?? false,
      creditsUsed: params.creditsUsed ?? false,
      meta: params.meta ?? Prisma.DbNull,
    },
  });
}

export type GateEntryWithUser = {
  createdAt: Date;
  userId: string | null;
  simulated: boolean;
  /**
   * The row's raw JSON blob, carried along so the statistics can tell how many
   * people the open admitted (`entriesPerOpen` in `stats.ts` reads the
   * `dependents`/`entries` keys) and the CSV export can read `simulated`'s
   * lock result. Nothing else here interprets it.
   */
  meta: Prisma.JsonValue | null;
  user: { email: string; name: string | null } | null;
};

/**
 * Fetches entry rows and attaches each row's `user` as two separate queries
 * instead of `include: { user: true }`. Postgres would happily do the JOIN,
 * but this mirrors `fetchAuditLogsWithUser` in `audit-log-filters.ts` (where
 * the split is a hard D1 requirement) so the two branches' implementations
 * stay the same shape. Also how a deleted account stays counted: the row
 * survives with a null user, it just drops out of the "top users" list.
 */
export async function fetchGateEntriesWithUser(
  prisma: PrismaClient,
  where: Prisma.GateEntryWhereInput,
): Promise<GateEntryWithUser[]> {
  const entries = await prisma.gateEntry.findMany({
    where,
    select: { createdAt: true, userId: true, simulated: true, meta: true },
  });

  const userIds = Array.from(new Set(entries.map((e) => e.userId).filter((id): id is string => id !== null)));
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  return entries.map((entry) => ({
    ...entry,
    user: entry.userId ? (userById.get(entry.userId) ?? null) : null,
  }));
}
