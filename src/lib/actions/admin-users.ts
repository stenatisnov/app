import { redirect } from "react-router";
import bcrypt from "bcryptjs";
import { PackageKind, PaymentMethod, PaymentStatus, Role, UserStatus } from "@prisma/client";
import { getPrisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sendAccountActivationEmail, sendAdminCreatedUserEmail } from "@/lib/registration-mail";
import { isRootRole } from "@/lib/roles";
import { getSessionUser } from "@/lib/session.server";
import { calculateAge, czechDateToIso, parseAppLocalDate } from "@/lib/time";
import { confirmPaymentOrder } from "@/lib/payments";

// ---------------------------------------------------------------------------
// Admin — users
// ---------------------------------------------------------------------------

export async function adminApproveUserAction(userId: string, approve: boolean) {
  const prisma = await getPrisma();
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: approve ? UserStatus.APPROVED : UserStatus.REJECTED },
  });
  if (approve) await sendAccountActivationEmail(user);
  await audit({ action: approve ? "admin.user.approve" : "admin.user.reject", success: true, userId });
}

export async function adminToggleSuspendAction(userId: string, suspended: boolean) {
  const prisma = await getPrisma();
  await prisma.user.update({ where: { id: userId }, data: { suspended } });
  await audit({ action: suspended ? "admin.user.suspend" : "admin.user.unsuspend", success: true, userId });
}

/**
 * Only ROOT can grant or touch the ROOT role — an ADMIN actor can freely
 * move a MEMBER/ADMIN target between those two roles, but can neither
 * promote anyone to ROOT nor change a ROOT user's role at all.
 */
export async function adminSetRoleAction(formData: FormData, request: Request) {
  const prisma = await getPrisma();
  const actor = await getSessionUser(request);
  const userId = String(formData.get("userId") || "");
  const roleRaw = String(formData.get("role") || "");
  if (!userId || !["MEMBER", "STAFF", "ADMIN", "ROOT"].includes(roleRaw)) return;
  const role = roleRaw as Role;

  const actorIsRoot = isRootRole(actor?.role);
  if (role === Role.ROOT && !actorIsRoot) return;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return;
  if (!actorIsRoot && target.role === Role.ROOT) return;

  if (target.role === Role.ROOT && role !== Role.ROOT) {
    const rootCount = await prisma.user.count({ where: { role: Role.ROOT } });
    if (rootCount <= 1) return; // never leave the app without a root
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  await audit({ action: "admin.user.role", success: true, userId, meta: { role } });
}

export async function adminCreateUserAction(formData: FormData, request: Request, locale: string) {
  const prisma = await getPrisma();
  const actor = await getSessionUser(request);

  const email = String(formData.get("email") || "").toLowerCase().trim();
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const password = String(formData.get("password") || "").trim();
  const roleRaw = String(formData.get("role") || "MEMBER");
  const role =
    roleRaw === "ROOT" && isRootRole(actor?.role)
      ? Role.ROOT
      : roleRaw === "ADMIN"
        ? Role.ADMIN
        : roleRaw === "STAFF"
          ? Role.STAFF
          : Role.MEMBER;
  const personTypeId = String(formData.get("personTypeId") || "") || null;
  const birthDateValue = czechDateToIso(String(formData.get("birthDate") || "").trim());

  if (!email || !password || password.length < 8) return;
  if (!birthDateValue || Number.isNaN(parseAppLocalDate(birthDateValue).getTime())) return;
  if (await prisma.user.findUnique({ where: { email } })) return;

  const age = calculateAge(birthDateValue);
  if (age < 15) {
    throw redirect(`/${locale}/admin/users?error=tooYoung`);
  }
  const isMinor = age < 18;

  let resolvedPersonTypeId = personTypeId;
  if (resolvedPersonTypeId) {
    if (!(await prisma.personType.findUnique({ where: { id: resolvedPersonTypeId } }))) return;
  } else {
    const defaultPersonType = await prisma.personType.findFirst({ where: { isDefault: true }, orderBy: { createdAt: "asc" } });
    resolvedPersonTypeId = defaultPersonType?.id ?? null;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const defaultGroup = await prisma.group.findFirst({ where: { isDefault: true } });

  const user = await prisma.user.create({
    data: {
      email,
      name: name || null,
      phone: phone || null,
      birthDate: parseAppLocalDate(birthDateValue),
      passwordHash,
      role,
      status: isMinor ? UserStatus.PENDING : UserStatus.APPROVED,
      personTypeId: resolvedPersonTypeId,
      // Admin vouches for the address directly — no self-registration
      // verification link needed, same as a Google sign-in's email being
      // pre-verified by Google.
      emailVerified: new Date(),
    },
  });

  if (defaultGroup) {
    await prisma.userGroup.create({ data: { userId: user.id, groupId: defaultGroup.id } });
  }

  await audit({ action: "admin.user.create", success: true, userId: user.id, meta: { email, role } });

  try {
    await sendAdminCreatedUserEmail({ email: user.email, name: user.name, password });
  } catch (err) {
    console.error("[mail] admin-created user email failed:", err);
  }
}

export async function adminSetPasswordAction(formData: FormData) {
  const prisma = await getPrisma();
  const userId = String(formData.get("userId") || "");
  const password = String(formData.get("password") || "").trim();
  if (!userId || password.length < 8) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await audit({ action: "admin.user.set_password", success: true, userId });
}

export async function adminDeleteUserAction(userId: string, request: Request) {
  const prisma = await getPrisma();
  const actor = await getSessionUser(request);
  if (!userId || userId === actor?.id) return;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  if (user.role === Role.ROOT) {
    if (!isRootRole(actor?.role)) return; // only root can delete a root account
    const rootCount = await prisma.user.count({ where: { role: Role.ROOT } });
    if (rootCount <= 1) return; // never leave the app without a root
  }

  await audit({
    action: "admin.user.delete",
    success: true,
    userId: actor?.id,
    meta: { deletedUserId: user.id, email: user.email, role: user.role },
  });
  await prisma.user.delete({ where: { id: userId } });
}

export async function adminSetUserGroupsAction(formData: FormData) {
  const prisma = await getPrisma();
  const userId = String(formData.get("userId") || "");
  const groupIds = formData.getAll("groupIds").map(String);
  await prisma.userGroup.deleteMany({ where: { userId } });
  if (groupIds.length) {
    await prisma.userGroup.createMany({ data: groupIds.map((groupId) => ({ userId, groupId })) });
  }
}

export async function adminSetPersonTypeAction(formData: FormData) {
  const prisma = await getPrisma();
  const userId = String(formData.get("userId") || "");
  const personTypeId = String(formData.get("personTypeId") || "") || null;
  await prisma.user.update({ where: { id: userId }, data: { personTypeId } });
}

// ---------------------------------------------------------------------------
// Admin — credits & packages
// ---------------------------------------------------------------------------

/** `amount` may be negative — that removes entries instead of granting them. */
export async function adminAdjustEntriesAction(formData: FormData, request: Request) {
  const prisma = await getPrisma();
  const actor = await getSessionUser(request);
  const userId = String(formData.get("userId") || "");
  const amount = Number(formData.get("amount") || 0);
  const note = String(formData.get("note") || "manual");
  if (!userId || !Number.isFinite(amount) || amount === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { credits: { increment: amount } } });
    await tx.creditLedger.create({ data: { userId, delta: amount, reason: "manual", meta: { note, by: actor?.id } } });
    await tx.paymentOrder.create({
      data: {
        userId,
        method: PaymentMethod.MANUAL,
        status: PaymentStatus.CONFIRMED,
        credits: amount,
        amountCzk: 0,
        note,
        confirmedAt: new Date(),
        confirmedById: actor?.id,
      },
    });
  });

  await audit({ action: "admin.entries.adjust", success: true, userId, meta: { amount, note } });
}

/**
 * Grants a catalog package to a user for free, as if an admin had manually
 * confirmed a purchase — reuses `confirmPaymentOrder` so credits vs. period
 * packages are applied through the exact same (D1-safe) code path as a real
 * purchase, instead of duplicating that logic here.
 */
export async function adminGrantPackageAction(formData: FormData, request: Request) {
  const prisma = await getPrisma();
  const actor = await getSessionUser(request);
  const userId = String(formData.get("userId") || "");
  const packageId = String(formData.get("packageId") || "");
  if (!userId || !packageId) return;

  const pkg = await prisma.pricePackage.findUnique({ where: { id: packageId } });
  if (!pkg) return;

  const order = await prisma.paymentOrder.create({
    data: {
      userId,
      packageId,
      method: PaymentMethod.MANUAL,
      status: PaymentStatus.PENDING,
      credits: pkg.kind === PackageKind.CREDITS ? pkg.credits : 0,
      amountCzk: 0,
      note: "admin grant",
    },
  });

  const result = await confirmPaymentOrder(order.id, { source: "admin", confirmedById: actor?.id });
  if (!result.ok) return;

  await audit({ action: "admin.package.grant", success: true, userId, meta: { packageId, kind: pkg.kind } });
}

/** Revokes an active/upcoming period pass early — credits-based packages have nothing to "remove" once applied (use adminAdjustEntriesAction instead). */
export async function adminRevokeAccessPassAction(passId: string) {
  const prisma = await getPrisma();
  if (!passId) return;

  const pass = await prisma.userAccessPass.findUnique({ where: { id: passId } });
  if (!pass) return;

  await prisma.userAccessPass.delete({ where: { id: passId } });
  await audit({ action: "admin.access_pass.revoke", success: true, userId: pass.userId, meta: { passId } });
}
