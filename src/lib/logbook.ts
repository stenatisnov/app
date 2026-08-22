import { Prisma, type PrismaClient } from "@prisma/client";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { type LogbookSettings } from "./settings";

/** Long enough for the browser redirect + the Logbook backend's exchange call, no longer. */
const HANDOFF_CODE_EXPIRY_MS = 60_000;

export type LogbookUserSnapshot = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  suspended: boolean;
  status: string;
  /** User.birthDate — null for pre-existing accounts predating the field (see the doc comment on User.birthDate itself). Not sent for dependents — Dependent has no birthDate field on stena at all. */
  birthDate: Date | null;
  /** Everyone entered as this user's own companion/doprovod (see the `Dependent` model). Includes the stable `Dependent.id` so Logbook can attach its own per-dependent data (nickname, stats opt-in) that survives a rename on the stena side. */
  dependents: { id: string; name: string }[];
};

function toSnapshot(
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    suspended: boolean;
    status: string;
    birthDate: Date | null;
  },
  dependents: { id: string; name: string }[],
): LogbookUserSnapshot {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    suspended: user.suspended,
    status: user.status,
    birthDate: user.birthDate,
    dependents: dependents.map((d) => ({ id: d.id, name: d.name })),
  };
}

/**
 * Creates a one-time handoff code for `userId`. Prunes expired-but-never-consumed
 * codes first — this table is low-volume enough (one row per click of the
 * Logbook nav link) that a dedicated cleanup job isn't worth it.
 */
export async function createLogbookHandoffCode(userId: string, prisma: PrismaClient): Promise<string> {
  await prisma.logbookHandoffCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const code = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + HANDOFF_CODE_EXPIRY_MS);
  await prisma.logbookHandoffCode.create({ data: { code, userId, expiresAt } });
  return code;
}

/**
 * Consumes a handoff code — single-use, so the delete itself is the atomic
 * claim (two concurrent exchanges of the same code can't both succeed: only
 * one `delete` finds a row to remove, the other hits "not found"). Returns
 * `null` for an unknown or already-consumed code; also `null` (not the
 * deleted user) if it existed but had already expired.
 */
export async function exchangeLogbookHandoffCode(code: string, prisma: PrismaClient): Promise<LogbookUserSnapshot | null> {
  let row: Prisma.LogbookHandoffCodeGetPayload<{ include: { user: { include: { dependents: true } } } }>;
  try {
    row = await prisma.logbookHandoffCode.delete({
      where: { code },
      include: { user: { include: { dependents: true } } },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
    throw err;
  }
  if (row.expiresAt.getTime() < Date.now()) return null;
  return toSnapshot(row.user, row.user.dependents);
}

/** Plain lookup (nothing consumed) for Logbook's periodic role re-verification. */
export async function getLogbookUserSnapshot(userId: string, prisma: PrismaClient): Promise<LogbookUserSnapshot | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { dependents: true } });
  return user ? toSnapshot(user, user.dependents) : null;
}

/**
 * Authenticates a server-to-server call from Logbook via `Authorization: Bearer
 * <sharedSecret>`, constant-time compared to avoid a timing side-channel on
 * the secret. Both server-to-server routes (`exchange`, `verify`) use this.
 */
export function checkLogbookAuth(request: Request, settings: LogbookSettings): boolean {
  if (!settings.enabled || !settings.sharedSecret) return false;
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return false;
  const expected = Buffer.from(settings.sharedSecret);
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
