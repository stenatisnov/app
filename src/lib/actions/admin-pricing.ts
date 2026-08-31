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
  const isChildCategory = formData.get("isChildCategory") === "on";
  const isMinorCategory = formData.get("isMinorCategory") === "on";

  const hasDefault = await prisma.personType.findFirst({ where: { isDefault: true } });
  await prisma.personType.create({
    data: { name, isDefault: !hasDefault, visibleToUsers, isChildCategory, isMinorCategory },
  });
  await audit({
    action: "admin.person_type.create",
    success: true,
    meta: { name, isDefault: !hasDefault, visibleToUsers, isChildCategory, isMinorCategory },
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

/** Whether companions assigned this category count as "child" for a FAMILY package's picker — see PersonType.isChildCategory. */
export async function adminSetPersonTypeChildCategoryAction(formData: FormData) {
  const prisma = await getPrisma();
  const personTypeId = String(formData.get("personTypeId") || "");
  if (!personTypeId) return;
  const isChildCategory = formData.get("isChildCategory") === "on";

  const type = await prisma.personType.findUnique({ where: { id: personTypeId } });
  if (!type) return;

  await prisma.personType.update({ where: { id: personTypeId }, data: { isChildCategory } });
  await audit({
    action: "admin.person_type.set_child_category",
    success: true,
    meta: { personTypeId, name: type.name, isChildCategory },
  });
}

/** Whether 15-17-year-old self-registrations get auto-assigned this category — see PersonType.isMinorCategory. */
export async function adminSetPersonTypeMinorCategoryAction(formData: FormData) {
  const prisma = await getPrisma();
  const personTypeId = String(formData.get("personTypeId") || "");
  if (!personTypeId) return;
  const isMinorCategory = formData.get("isMinorCategory") === "on";

  const type = await prisma.personType.findUnique({ where: { id: personTypeId } });
  if (!type) return;

  await prisma.personType.update({ where: { id: personTypeId }, data: { isMinorCategory } });
  await audit({
    action: "admin.person_type.set_minor_category",
    success: true,
    meta: { personTypeId, name: type.name, isMinorCategory },
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
  const kindRaw = String(formData.get("kind") || "CREDITS");
  const kind = kindRaw === "PERIOD" ? PackageKind.PERIOD : kindRaw === "FAMILY" ? PackageKind.FAMILY : PackageKind.CREDITS;
  const priceCzk = Number(formData.get("priceCzk") || 0);
  if (!personTypeId || priceCzk < 0) return;

  if (kind === PackageKind.CREDITS) {
    const credits = Number(formData.get("credits") || 0);
    if (credits < 1) return;
    await prisma.pricePackage.create({ data: { personTypeId, kind, credits, priceCzk } });
    return;
  }

  if (kind === PackageKind.FAMILY) {
    // Fixed shape ("2 dospělí + max 3 děti") — 1 is always the buyer's own
    // credit, never admin-configurable; the up-to-4 companion credits are
    // applied on confirmation, not stored per package.
    await prisma.pricePackage.create({ data: { personTypeId, kind, credits: 1, priceCzk } });
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
