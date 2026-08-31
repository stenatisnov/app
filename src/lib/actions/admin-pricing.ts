import { PackageKind, PeriodPreset } from "@prisma/client";
import { getPrisma } from "@/lib/db.server";
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
  const isSeniorCategory = formData.get("isSeniorCategory") === "on";

  // isChildCategory/isMinorCategory/isSeniorCategory are each exclusive to
  // one category at a time (a single category may hold more than one) —
  // see adminSetPersonTypeCategoryFlagsAction below for the same
  // clear-then-set pattern.
  if (isChildCategory) {
    await prisma.personType.updateMany({ where: { isChildCategory: true }, data: { isChildCategory: false } });
  }
  if (isMinorCategory) {
    await prisma.personType.updateMany({ where: { isMinorCategory: true }, data: { isMinorCategory: false } });
  }
  if (isSeniorCategory) {
    await prisma.personType.updateMany({ where: { isSeniorCategory: true }, data: { isSeniorCategory: false } });
  }

  const hasDefault = await prisma.personType.findFirst({ where: { isDefault: true } });
  await prisma.personType.create({
    data: { name, isDefault: !hasDefault, visibleToUsers, isChildCategory, isMinorCategory, isSeniorCategory },
  });
  await audit({
    action: "admin.person_type.create",
    success: true,
    meta: { name, isDefault: !hasDefault, visibleToUsers, isChildCategory, isMinorCategory, isSeniorCategory },
  });
}

/** Renames a category — the display name shown to members/staff everywhere (buy page, admin lists, ...). */
export async function adminRenamePersonTypeAction(formData: FormData) {
  const prisma = await getPrisma();
  const personTypeId = String(formData.get("personTypeId") || "");
  const name = String(formData.get("name") || "").trim();
  if (!personTypeId || !name) return;

  const type = await prisma.personType.findUnique({ where: { id: personTypeId } });
  if (!type || type.name === name) return;
  const collision = await prisma.personType.findUnique({ where: { name } });
  if (collision) return;

  await prisma.personType.update({ where: { id: personTypeId }, data: { name } });
  await audit({
    action: "admin.person_type.rename",
    success: true,
    meta: { personTypeId, previousName: type.name, name },
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

/**
 * Saves all three age/family classification flags for a category in one go
 * — see PersonType.isChildCategory/isMinorCategory/isSeniorCategory. Each
 * flag is exclusive to one category at a time: checking it here clears it
 * from whichever category had it before. A category may hold any
 * combination of the three — they're independent of each other.
 */
export async function adminSetPersonTypeCategoryFlagsAction(formData: FormData) {
  const prisma = await getPrisma();
  const personTypeId = String(formData.get("personTypeId") || "");
  if (!personTypeId) return;
  const isChildCategory = formData.get("isChildCategory") === "on";
  const isMinorCategory = formData.get("isMinorCategory") === "on";
  const isSeniorCategory = formData.get("isSeniorCategory") === "on";

  const type = await prisma.personType.findUnique({ where: { id: personTypeId } });
  if (!type) return;

  // Only steal a flag from other categories when it's actually being turned
  // on here — clearing all three unconditionally would also wipe unrelated
  // flags (e.g. isSeniorCategory) off other categories on every save.
  const ops = [];
  if (isChildCategory) {
    ops.push(prisma.personType.updateMany({ where: { id: { not: personTypeId } }, data: { isChildCategory: false } }));
  }
  if (isMinorCategory) {
    ops.push(prisma.personType.updateMany({ where: { id: { not: personTypeId } }, data: { isMinorCategory: false } }));
  }
  if (isSeniorCategory) {
    ops.push(prisma.personType.updateMany({ where: { id: { not: personTypeId } }, data: { isSeniorCategory: false } }));
  }
  ops.push(prisma.personType.update({ where: { id: personTypeId }, data: { isChildCategory, isMinorCategory, isSeniorCategory } }));
  await prisma.$transaction(ops);
  await audit({
    action: "admin.person_type.set_category_flags",
    success: true,
    meta: { personTypeId, name: type.name, isChildCategory, isMinorCategory, isSeniorCategory },
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

  // Batch array form, not the interactive `async (tx) => ...` callback — D1
  // doesn't support the latter. No step here reads a value written by an
  // earlier one, so the two forms are equivalent.
  await prisma.$transaction([
    prisma.user.updateMany({ where: { personTypeId }, data: { personTypeId: null } }),
    prisma.personType.delete({ where: { id: personTypeId } }),
  ]);

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

  // Batch array form — see adminDeletePersonTypeAction above.
  await prisma.$transaction([
    prisma.paymentOrder.updateMany({ where: { packageId }, data: { packageId: null } }),
    prisma.pricePackage.delete({ where: { id: packageId } }),
  ]);

  await audit({
    action: "admin.package.delete",
    success: true,
    meta: { packageId, personTypeId: pkg.personTypeId, credits: pkg.credits, priceCzk: pkg.priceCzk },
  });
}
