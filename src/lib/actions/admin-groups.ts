import { getPrisma } from "@/lib/db";
import { audit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Admin — groups & schedule windows
// ---------------------------------------------------------------------------

export async function adminCreateGroupAction(formData: FormData) {
  const prisma = await getPrisma();
  const name = String(formData.get("name") || "").trim();
  const is24_7 = formData.get("is24_7") === "on";
  if (!name) return;

  const group = await prisma.group.create({
    data: {
      name,
      isDefault: false,
      is24_7,
      windows: is24_7
        ? undefined
        : { create: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, fromMin: 6 * 60, toMin: 22 * 60 })) },
    },
  });

  await audit({ action: "admin.group.create", success: true, meta: { groupId: group.id, name } });
}

export async function adminDeleteGroupAction(groupId: string) {
  const prisma = await getPrisma();
  if (!groupId) return;

  const group = await prisma.group.findUnique({ where: { id: groupId }, include: { _count: { select: { members: true } } } });
  if (!group || group.isDefault) return;

  await prisma.group.delete({ where: { id: groupId } });
  await audit({ action: "admin.group.delete", success: true, meta: { groupId, name: group.name, membersRemoved: group._count.members } });
}

export async function adminUpdateGroupWindowsAction(formData: FormData) {
  const prisma = await getPrisma();
  const groupId = String(formData.get("groupId") || "");
  const is24_7 = formData.get("is24_7") === "on";
  const name = String(formData.get("name") || "").trim();

  await prisma.group.update({ where: { id: groupId }, data: { name: name || undefined, is24_7 } });
  await prisma.groupWindow.deleteMany({ where: { groupId } });

  if (!is24_7) {
    const windows = [];
    for (let day = 0; day < 7; day++) {
      // Unchecked days are dropped from the schedule entirely (no window at
      // all — the gate stays closed all day), not just given a default time.
      if (formData.get(`enabled_${day}`) !== "on") continue;

      const from = String(formData.get(`from_${day}`) || "");
      const to = String(formData.get(`to_${day}`) || "");
      if (!from || !to) {
        windows.push({ groupId, dayOfWeek: day, fromMin: 6 * 60, toMin: 22 * 60 });
        continue;
      }
      const [fh, fm] = from.split(":").map(Number);
      const [th, tm] = to.split(":").map(Number);
      windows.push({ groupId, dayOfWeek: day, fromMin: fh * 60 + fm, toMin: th * 60 + tm });
    }
    if (windows.length) await prisma.groupWindow.createMany({ data: windows });
  }
}
