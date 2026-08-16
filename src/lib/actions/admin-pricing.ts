import { PackageKind, PeriodPreset } from "@prisma/client";
import { getPrisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseAppLocalDateTime } from "@/lib/time";

// ---------------------------------------------------------------------------
// Admin — pricing (person types & packages)
// ---------------------------------------------------------------------------

export async function adminCreatePersonTypeAction(formData: FormData) {
  const prisma = await getPrisma();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  if (await prisma.personType.findUnique({ where: { name } })) return;
  const visibleToUsers = formData.get("visibleToUsers") === "on";

  const hasDefault = await prisma.personType.findFirst({ where: { isDefault: true } });
  await prisma.personType.create({ data: { name, isDefault: !hasDefault, visibleToUsers } });
  await audit({
    action: "admin.person_type.create",
    success: true,
    meta: { name, isDefault: !hasDefault, visibleToUsers },
  });
}

export async function adminSetPersonTypeVisibilityAction(formData: FormData) {
  const prisma = await getPrisma();
  const personTypeId = String(formData.get("personTypeId") || "");
  if (!personTypeId) return;
  const visibleToUsers = formData.get("visibleToUsers") === "on";

  const type = await prisma.personType.findUnique({ where: { id: personTypeId } });
  if (!type) return;

  await prisma.personType.update({ where: { id: personTypeId }, data: { visibleToUsers } });
  await audit({
    action: "admin.person_type.set_visibility",
    success: true,
    meta: { personTypeId, name: type.name, visibleToUsers },
  });
}

export async function adminSetDefaultPersonTypeAction(formData: FormData) {
  const prisma = await getPrisma();
  const personTypeId = String(formData.get("personTypeId") || "");
  if (!personTypeId) return;

  const type = await prisma.personType.findUnique({ where: { id: personTypeId } });
  if (!type) return;

  await prisma.$transaction([
    prisma.personType.updateMany({ data: { isDefault: false } }),
    prisma.personType.update({ where: { id: personTypeId }, data: { isDefault: true } }),
  ]);

  await audit({ action: "admin.person_type.set_default", success: true, meta: { personTypeId, name: type.name } });
}

export async function adminDeletePersonTypeAction(personTypeId: string) {
  const prisma = await getPrisma();
  if (!personTypeId) return;

  const type = await prisma.personType.findUnique({
    where: { id: personTypeId },
    include: { _count: { select: { users: true, packages: true } } },
  });
  if (!type || type.isDefault) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({ where: { personTypeId }, data: { personTypeId: null } });
    await tx.personType.delete({ where: { id: personTypeId } });
  });

  await audit({
    action: "admin.person_type.delete",
    success: true,
    meta: { name: type.name, usersCleared: type._count.users, packagesRemoved: type._count.packages },
  });
}

export async function adminCreatePackageAction(formData: FormData) {
  const prisma = await getPrisma();
  const personTypeId = String(formData.get("personTypeId") || "");
  const kind = String(formData.get("kind") || "CREDITS") === "PERIOD" ? PackageKind.PERIOD : PackageKind.CREDITS;
  const priceCzk = Number(formData.get("priceCzk") || 0);
  if (!personTypeId || priceCzk < 0) return;

  if (kind === PackageKind.CREDITS) {
    const credits = Number(formData.get("credits") || 0);
    if (credits < 1) return;
    await prisma.pricePackage.create({ data: { personTypeId, kind, credits, priceCzk } });
    return;
  }

  const presetRaw = String(formData.get("periodPreset") || "WEEK");
  const periodPreset =
    presetRaw === "MONTH" ? PeriodPreset.MONTH : presetRaw === "YEAR" ? PeriodPreset.YEAR : presetRaw === "CUSTOM" ? PeriodPreset.CUSTOM : PeriodPreset.WEEK;

  let periodFrom: Date | null = null;
  let periodTo: Date | null = null;
  if (periodPreset === PeriodPreset.CUSTOM) {
    periodFrom = parseAppLocalDateTime(String(formData.get("periodFrom") || ""));
    periodTo = parseAppLocalDateTime(String(formData.get("periodTo") || ""));
    if (Number.isNaN(periodFrom.getTime()) || Number.isNaN(periodTo.getTime()) || periodTo <= periodFrom) return;
  }

  await prisma.pricePackage.create({
    data: { personTypeId, kind, credits: 0, priceCzk, periodPreset, periodFrom, periodTo },
  });
}

export async function adminDeletePackageAction(packageId: string) {
  const prisma = await getPrisma();
  if (!packageId) return;

  const pkg = await prisma.pricePackage.findUnique({ where: { id: packageId } });
  if (!pkg) return;

  await prisma.$transaction(async (tx) => {
    await tx.paymentOrder.updateMany({ where: { packageId }, data: { packageId: null } });
    await tx.pricePackage.delete({ where: { id: packageId } });
  });

  await audit({
    action: "admin.package.delete",
    success: true,
    meta: { packageId, personTypeId: pkg.personTypeId, credits: pkg.credits, priceCzk: pkg.priceCzk },
  });
}
