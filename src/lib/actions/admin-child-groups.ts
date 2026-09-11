import { randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/db.server";
import { audit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Admin — Dětské skupiny (child groups)
// ---------------------------------------------------------------------------

function generateInviteToken(): string {
  return randomBytes(16).toString("hex");
}

export type LeaderCandidate = { id: string; label: string };

/** Lowercased, diacritics-stripped, for case/diacritics-insensitive substring matching — same normalization `buildSpdPayload` (qr.ts) uses on the recipient message. */
function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Backs the leader/member picker's search-as-you-add field. Matched in
 * application code rather than a DB query: Prisma's `mode: "insensitive"`
 * is Postgres-only and wouldn't port to the D1 branch, and it wouldn't
 * strip diacritics either way (a search for "Cerna" should still find
 * "Černá") — same tradeoff as staffLookupChildGroupForEntryAction's group
 * name match. User count here is admin-tool scale, so fetching everyone's
 * name/email once per search click stays cheap.
 */
export async function adminSearchUsersForLeaderAction(rawQuery: string): Promise<LeaderCandidate[]> {
  const prisma = await getPrisma();
  const q = rawQuery.trim();
  if (!q) return [];
  const needle = normalizeForSearch(q);
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return users
    .filter((u) => normalizeForSearch(u.name ?? "").includes(needle) || normalizeForSearch(u.email).includes(needle))
    .slice(0, 10)
    .map((u) => ({ id: u.id, label: u.name ? `${u.name} (${u.email})` : u.email }));
}

export async function adminCreateChildGroupAction(formData: FormData) {
  const prisma = await getPrisma();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const leaderIds = formData.getAll("leaderIds").map(String).filter(Boolean);

  const group = await prisma.childGroup.create({
    data: {
      name,
      inviteToken: generateInviteToken(),
      leaders: leaderIds.length > 0 ? { create: leaderIds.map((userId) => ({ userId })) } : undefined,
    },
  });

  await audit({ action: "admin.child_group.create", success: true, meta: { groupId: group.id, name, leaderIds } });
}

/** Updates the name and replaces the full leader set (same replace-all pattern as adminUpdateGroupWindowsAction). */
export async function adminUpdateChildGroupAction(formData: FormData) {
  const prisma = await getPrisma();
  const groupId = String(formData.get("groupId") || "");
  const name = String(formData.get("name") || "").trim();
  if (!groupId) return;
  const leaderIds = formData.getAll("leaderIds").map(String).filter(Boolean);

  await prisma.$transaction([
    prisma.childGroup.update({ where: { id: groupId }, data: { name: name || undefined } }),
    prisma.childGroupLeader.deleteMany({ where: { childGroupId: groupId } }),
    ...(leaderIds.length > 0
      ? [prisma.childGroupLeader.createMany({ data: leaderIds.map((userId) => ({ childGroupId: groupId, userId })) })]
      : []),
  ]);

  await audit({ action: "admin.child_group.update", success: true, meta: { groupId, name, leaderIds } });
}

export async function adminRegenerateChildGroupInviteAction(groupId: string) {
  const prisma = await getPrisma();
  if (!groupId) return;
  const token = generateInviteToken();
  await prisma.childGroup.update({ where: { id: groupId }, data: { inviteToken: token } });
  await audit({ action: "admin.child_group.regenerate_invite", success: true, meta: { groupId } });
}

export async function adminDeleteChildGroupAction(groupId: string) {
  const prisma = await getPrisma();
  if (!groupId) return;
  const group = await prisma.childGroup.findUnique({ where: { id: groupId }, include: { _count: { select: { members: true } } } });
  if (!group) return;
  // Members aren't deleted — User.childGroupId just goes back to null (onDelete: SetNull).
  await prisma.childGroup.delete({ where: { id: groupId } });
  await audit({ action: "admin.child_group.delete", success: true, meta: { groupId, name: group.name, membersFreed: group._count.members } });
}

/** Moves a member to a different group, or removes them from any group (`childGroupId: null`). Covers both reassignment and removal from the group's own member list. */
export async function adminSetUserChildGroupAction(formData: FormData) {
  const prisma = await getPrisma();
  const userId = String(formData.get("userId") || "");
  const childGroupId = String(formData.get("childGroupId") || "") || null;
  if (!userId) return;
  await prisma.user.update({ where: { id: userId }, data: { childGroupId } });
  await audit({ action: "admin.child_group.set_member", success: true, userId, meta: { childGroupId } });
}
