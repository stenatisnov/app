"use server";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  NavStyle,
  PackageKind,
  PaymentMethod,
  PaymentStatus,
  PeriodPreset,
  Role,
  UserStatus,
} from "@prisma/client";
import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isRootRole, isAdminRole, isStaffOrAbove, hasFreeGateEntry } from "@/lib/roles";
import { sendMail } from "@/lib/mail";
import {
  sendAdminCreatedUserEmail,
  sendPaymentPendingAdminEmails,
  sendRegistrationEmails,
} from "@/lib/registration-mail";
import { openGateForGuest, openGateForUser } from "@/lib/gate";
import { getGateStatus } from "@/lib/lock";
import { canUseApp } from "@/lib/session";
import {
  getConfigBackupSettingsStored,
  getDatabaseDumpSettingsStored,
  getEmailVerificationSettingsStored,
  getFioSettingsStored,
  getGoPaySettings,
  getGoPaySettingsStored,
  getLogCleanupSettingsStored,
  getPendingOrderCleanupSettingsStored,
  getQrPaymentSettings,
  getRegistrationSettings,
  getS3SettingsStored,
  getSmtpSettingsStored,
  getTransactionBackupSettingsStored,
  setSetting,
} from "@/lib/settings";
import { buildSpdPayload, qrDataUrl } from "@/lib/qr";
import { guestPassUrl } from "@/lib/app-url";
import { requestAppUrl } from "@/lib/request-url";
import {
  calculateAge,
  czechDateToIso,
  formatAppDate,
  isWithinWindows,
  parseAppLocalDate,
  parseAppLocalDateEndOfDay,
  parseAppLocalDateTime,
} from "@/lib/time";
import { confirmPaymentOrder } from "@/lib/payments";
import { importDataFromYaml, type ImportSummary } from "@/lib/data-transfer";
import { runConfigBackupIfDue, runDatabaseDumpIfDue, runTransactionBackupIfDue } from "@/lib/backup";
import { runLogCleanupIfDue } from "@/lib/log-cleanup";
import { runPendingOrderCleanupIfDue } from "@/lib/pending-order-cleanup";
import { sendVerificationEmail, runEmailVerificationSuspensionIfDue } from "@/lib/email-verification";
import { runFioPollIfDue } from "@/lib/fio";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").toLowerCase().trim();
  // Some mobile keyboards/password managers append a trailing space when
  // autofilling — trimming here (and everywhere a password is set) keeps
  // that from silently breaking sign-in on some devices but not others.
  const password = String(formData.get("password") || "").trim();
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (e) {
    if (e instanceof AuthError) {
      redirect("/login?error=invalid");
    }
    throw e;
  }
}

export async function googleSignInAction() {
  await signIn("google", { redirectTo: "/" });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function registerAction(formData: FormData) {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1).max(120),
    phone: z.string().max(30).optional().or(z.literal("")),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    agreedRules: z.literal("on"),
  });
  const confirmPassword = String(formData.get("confirmPassword") || "").trim();
  const birthDateIso = czechDateToIso(String(formData.get("birthDate") || "").trim());
  const parsed = schema.safeParse({
    email: String(formData.get("email") || "").toLowerCase().trim(),
    password: String(formData.get("password") || "").trim(),
    name: String(formData.get("name") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    birthDate: birthDateIso ?? "",
    agreedRules: String(formData.get("agreedRules") || ""),
  });
  if (!parsed.success || Number.isNaN(parseAppLocalDate(parsed.data.birthDate).getTime())) {
    redirect("/register?error=validation");
  }
  if (parsed.data.password !== confirmPassword) {
    redirect("/register?error=mismatch");
  }

  const age = calculateAge(parsed.data.birthDate);
  if (age < 15) {
    redirect("/register?error=tooYoung");
  }
  const isMinor = age < 18;

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    redirect("/register?error=exists");
  }

  const [defaultGroup, defaultPersonType, { autoApprove }] = await Promise.all([
    prisma.group.findFirst({ where: { isDefault: true } }),
    prisma.personType.findFirst({ where: { isDefault: true }, orderBy: { createdAt: "asc" } }),
    getRegistrationSettings(),
  ]);
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      birthDate: parseAppLocalDate(parsed.data.birthDate),
      passwordHash,
      status: !isMinor && autoApprove ? UserStatus.APPROVED : UserStatus.PENDING,
      role: Role.MEMBER,
      personTypeId: defaultPersonType?.id,
    },
  });

  if (defaultGroup) {
    await prisma.userGroup.create({ data: { userId: user.id, groupId: defaultGroup.id } });
  }

  await audit({ action: "user.register", success: true, userId: user.id, meta: { email: user.email } });

  try {
    await sendRegistrationEmails({ email: user.email, name: user.name }, { autoApproved: autoApprove });
  } catch (err) {
    console.error("[mail] registration emails failed:", err);
  }
  try {
    await sendVerificationEmail(user, prisma);
  } catch (err) {
    console.error("[mail] verification email failed:", err);
  }

  await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/" });
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  // Deliberately silent on unknown addresses — don't leak which emails are registered.
  if (user) {
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 1000 * 60 * 60);
    await prisma.passwordResetToken.create({ data: { token, userId: user.id, expires } });

    const url = `${process.env.APP_URL}/reset-password?token=${token}`;
    await sendMail({
      to: user.email,
      subject: "Nastavení hesla — Stěna Letňák Tišnov",
      text: `Pro nastavení hesla otevřete: ${url}`,
      html: `<p>Pro nastavení hesla otevřete:</p><p><a href="${url}">${url}</a></p>`,
    });

    await audit({ action: "user.password_reset_request", success: true, userId: user.id });
  }

  redirect("/forgot-password?sent=1");
}

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "").trim();
  if (password.length < 8) {
    redirect(`/reset-password?token=${token}&error=short`);
  }

  const row = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!row || row.expires < new Date()) {
    redirect(`/reset-password?token=${token}&error=invalid`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: row.userId } }),
  ]);

  await audit({ action: "user.password_reset", success: true, userId: row.userId });
  redirect("/login?reset=1");
}

export async function changePasswordAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (newPassword.length < 8) redirect("/account?error=short");
  if (newPassword !== confirmPassword) redirect("/account?error=mismatch");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");

  if (user.passwordHash) {
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) redirect("/account?error=current");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await audit({ action: "user.password_change", success: true, userId: user.id });
  redirect("/account?ok=1");
}

export async function verifyEmailAction(formData: FormData) {
  const token = String(formData.get("token") || "");

  const row = await prisma.emailVerificationToken.findUnique({ where: { token } });
  if (!row || row.expires < new Date()) {
    redirect(`/verify-email?token=${token}&error=invalid`);
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { emailVerified: new Date() } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: row.userId } }),
  ]);

  await audit({ action: "user.email_verified", success: true, userId: row.userId });
  redirect("/verify-email?success=1");
}

export type ResendVerificationResult = { ok: true } | { ok: false; message: string };

export async function resendVerificationEmailAction(): Promise<ResendVerificationResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "Nejste přihlášeni." };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { ok: false, message: "Nejste přihlášeni." };
  if (user.emailVerified) return { ok: true };

  try {
    await sendVerificationEmail(user, prisma);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Mobile menu style preference (Můj účet) — takes effect immediately, no re-login needed (re-read on every request in the auth jwt callback). */
export async function saveNavStylePreferenceAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const value = String(formData.get("navStyle") || "");
  const navStyle = value === "HAMBURGER" ? NavStyle.HAMBURGER : NavStyle.BUTTONS;

  await prisma.user.update({ where: { id: session.user.id }, data: { navStyle } });
  await audit({ action: "user.nav_style_change", success: true, userId: session.user.id, meta: { navStyle } });
  revalidatePath("/account");
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

export async function openGateAction(openGate: boolean = true, dependentIds: string[] = []) {
  const session = await auth();
  if (!session?.user) {
    return { ok: false as const, code: "UNAUTHORIZED", message: "Nejste přihlášeni" };
  }
  const access = canUseApp(session.user);
  if (!access.ok) {
    return {
      ok: false as const,
      code: access.reason === "suspended" ? "SUSPENDED" : "PENDING",
      message: access.reason === "suspended" ? "Účet je pozastaven" : "Účet čeká na schválení",
    };
  }
  return openGateForUser(session.user.id, { openGate, dependentIds });
}

// ---------------------------------------------------------------------------
// Dependents (companions, typically children, entered under a parent's login)
// ---------------------------------------------------------------------------

export async function addDependentAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "auth" as const };

  const schema = z.object({
    name: z.string().min(1).max(120),
    personTypeId: z.string().min(1),
  });
  const parsed = schema.safeParse({
    name: String(formData.get("name") || "").trim(),
    personTypeId: String(formData.get("personTypeId") || ""),
  });
  if (!parsed.success) return { ok: false as const, error: "validation" as const };

  const personType = await prisma.personType.findUnique({ where: { id: parsed.data.personTypeId } });
  if (!personType || !personType.visibleToUsers) return { ok: false as const, error: "person_type" as const };

  await prisma.dependent.create({
    data: { parentUserId: session.user.id, name: parsed.data.name, personTypeId: personType.id },
  });
  revalidatePath("/account");
  revalidatePath("/");
  revalidatePath("/buy");
  return { ok: true as const };
}

export async function removeDependentAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { ok: false as const };

  const dependentId = String(formData.get("dependentId") || "");
  await prisma.dependent.deleteMany({ where: { id: dependentId, parentUserId: session.user.id } });
  revalidatePath("/account");
  revalidatePath("/");
  revalidatePath("/buy");
  return { ok: true as const };
}

export async function openGuestGateAction(token: string, openGate: boolean = true) {
  return openGateForGuest(token, { openGate });
}

/** Live gate-reachability check for the entry dialog — public (no auth), same as the guest pass flow itself. */
export async function checkGateOnlineAction(): Promise<{ online: boolean }> {
  const status = await getGateStatus();
  return { online: status.online };
}

// ---------------------------------------------------------------------------
// Staff — pass verification
//
// A member proves they're on-site by showing the QR code generated on their
// own "Prokázat se obsluze" screen (which just encodes their email — no
// deduction happens there); STAFF looks that member up here — by scanning
// the code or typing the email — and only deducts the entry after an
// explicit confirm, via the same openGateForUser(..., { openGate: false })
// path the member's own self-service button used to call directly.
// ---------------------------------------------------------------------------

async function requireStaffSession() {
  const session = await auth();
  if (!session?.user || !isStaffOrAbove(session.user.role)) throw new Error("FORBIDDEN");
  return session;
}

type StaffEntryBlockedReason = "PENDING" | "SUSPENDED" | "NO_CREDITS" | "OUTSIDE_HOURS" | "COOLDOWN";

export type StaffEntryLookup =
  | {
      ok: true;
      userId: string;
      name: string | null;
      email: string;
      unlimitedAccess: boolean;
      hasActivePass: boolean;
      activePassUntil: Date | null;
      credits: number;
      canEnter: boolean;
      blockedReason?: StaffEntryBlockedReason;
      /** This member's registered companions — staff picks which are actually present before confirming. */
      dependents: { id: string; name: string; credits: number }[];
    }
  | { ok: false; error: "NOT_FOUND" };

export async function staffLookupUserForEntryAction(rawEmail: string): Promise<StaffEntryLookup> {
  await requireStaffSession();
  const email = rawEmail.toLowerCase().trim();
  if (!email) return { ok: false, error: "NOT_FOUND" };

  const user = await prisma.user.findUnique({
    where: { email },
    include: { groups: { include: { group: { include: { windows: true } } } } },
  });
  if (!user) return { ok: false, error: "NOT_FOUND" };

  const dependents = await prisma.dependent.findMany({
    where: { parentUserId: user.id },
    orderBy: { createdAt: "asc" },
  });

  const now = new Date();
  const unlimitedAccess = hasFreeGateEntry(user.role);
  const activePass = unlimitedAccess
    ? null
    : await prisma.userAccessPass.findFirst({
        where: { userId: user.id, validFrom: { lte: now }, validTo: { gte: now } },
        orderBy: { validTo: "desc" },
      });
  const hasActivePass = Boolean(activePass);
  const freeOpen = unlimitedAccess || hasActivePass;

  let blockedReason: StaffEntryBlockedReason | undefined;
  if (user.status !== "APPROVED") blockedReason = "PENDING";
  else if (user.suspended) blockedReason = "SUSPENDED";
  else if (!freeOpen && user.credits < 1) blockedReason = "NO_CREDITS";
  else if (user.cooldownUntil && user.cooldownUntil > now) blockedReason = "COOLDOWN";
  else if (!unlimitedAccess) {
    const inWindow = user.groups.some(({ group }) => isWithinWindows(group.windows, group.is24_7));
    if (!inWindow) blockedReason = "OUTSIDE_HOURS";
  }

  return {
    ok: true,
    userId: user.id,
    name: user.name,
    email: user.email,
    unlimitedAccess,
    hasActivePass,
    activePassUntil: activePass?.validTo ?? null,
    credits: user.credits,
    canEnter: !blockedReason,
    blockedReason,
    dependents: dependents.map((dep) => ({ id: dep.id, name: dep.name, credits: dep.credits })),
  };
}

/** Re-validates and deducts atomically inside openGateForUser — the lookup above is only a preview. */
export async function staffConfirmEntryAction(userId: string, dependentIds: string[] = []) {
  const session = await requireStaffSession();
  return openGateForUser(userId, { openGate: false, verifiedByStaffId: session.user.id, dependentIds });
}

type StaffGuestBlockedReason = "EXPIRED" | "USED_UP";

export type StaffGuestEntryLookup =
  | {
      ok: true;
      token: string;
      label: string | null;
      remaining: number;
      canEnter: boolean;
      blockedReason?: StaffGuestBlockedReason;
    }
  | { ok: false; error: "NOT_FOUND" };

/** Guest-pass counterpart to staffLookupUserForEntryAction — same preview-then-confirm flow, keyed by the pass token instead of an email. */
export async function staffLookupGuestForEntryAction(rawToken: string): Promise<StaffGuestEntryLookup> {
  await requireStaffSession();
  const token = rawToken.trim();
  if (!token) return { ok: false, error: "NOT_FOUND" };

  const pass = await prisma.guestPass.findUnique({ where: { token } });
  if (!pass) return { ok: false, error: "NOT_FOUND" };

  const now = new Date();
  let blockedReason: StaffGuestBlockedReason | undefined;
  if (pass.usedCount >= pass.maxUses) blockedReason = "USED_UP";
  else if (now < pass.validFrom || now > pass.validTo) blockedReason = "EXPIRED";

  return {
    ok: true,
    token: pass.token,
    label: pass.label,
    remaining: Math.max(pass.maxUses - pass.usedCount, 0),
    canEnter: !blockedReason,
    blockedReason,
  };
}

/** Re-validates and deducts atomically inside openGateForGuest — the lookup above is only a preview. */
export async function staffConfirmGuestEntryAction(token: string) {
  const session = await requireStaffSession();
  return openGateForGuest(token, { openGate: false, verifiedByStaffId: session.user.id });
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

/** Czech noun declension for "vstup" (entry/credit) after a count — 1 vstup, 2-4 vstupy, 0/5+ vstupů. */
function czVstupu(count: number): string {
  if (count === 1) return "vstup";
  if (count >= 2 && count <= 4) return "vstupy";
  return "vstupů";
}

export async function createPaymentOrderAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { error: "auth" as const };
  const access = canUseApp(session.user);
  if (!access.ok) return { error: access.reason as "pending" | "suspended" };

  const packageId = String(formData.get("packageId") || "");
  const method = String(formData.get("method") || "QR") as "QR" | "GOPAY";
  const dependentId = String(formData.get("dependentId") || "") || null;

  if (method === "GOPAY") {
    const gopaySettings = await getGoPaySettings();
    if (!gopaySettings.enabled) return { error: "gopay_not_configured" as const };
  }

  const pkg = await prisma.pricePackage.findUnique({ where: { id: packageId } });
  if (!pkg || !pkg.active) return { error: "package" as const };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { error: "person_type" as const };

  // Dependents (companions) are credits-only — buying a PERIOD pass "for" one isn't supported.
  let dependentName: string | null = null;
  if (dependentId) {
    if (pkg.kind === PackageKind.PERIOD) return { error: "person_type" as const };
    const dependent = await prisma.dependent.findFirst({ where: { id: dependentId, parentUserId: user.id } });
    if (!dependent || dependent.personTypeId !== pkg.personTypeId) return { error: "person_type" as const };
    dependentName = dependent.name;
  } else if (user.personTypeId !== pkg.personTypeId) {
    return { error: "person_type" as const };
  }

  const qrSettings = await getQrPaymentSettings();
  // The SPD QR payload (buildSpdPayload in qr.ts) truncates VS to the spec's
  // 10-digit max — generating anything longer here would create a payment
  // order whose stored variableSymbol can never match what the bank transfer
  // actually carries, so the Fio auto-confirm poll would never find it.
  const vsPrefixDigits = qrSettings.vsPrefix.replace(/\D/g, "").slice(0, 9);
  const vs = `${vsPrefixDigits}${Date.now().toString().slice(-(10 - vsPrefixDigits.length))}`;

  const order = await prisma.paymentOrder.create({
    data: {
      userId: user.id,
      dependentId,
      packageId: pkg.id,
      method: method === "GOPAY" ? PaymentMethod.GOPAY : PaymentMethod.QR,
      status: PaymentStatus.PENDING,
      credits: pkg.kind === PackageKind.PERIOD ? 0 : pkg.credits,
      amountCzk: pkg.priceCzk,
      variableSymbol: vs,
      note: pkg.kind === PackageKind.PERIOD ? `period:${pkg.periodPreset || "CUSTOM"}` : null,
    },
  });

  await audit({
    action: "payment.create",
    success: true,
    userId: user.id,
    meta: { orderId: order.id, method, amountCzk: order.amountCzk, packageKind: pkg.kind },
  });

  if (method === "QR") {
    try {
      await sendPaymentPendingAdminEmails({
        id: order.id,
        credits: order.credits,
        amountCzk: order.amountCzk,
        variableSymbol: order.variableSymbol,
        method: order.method,
        user: { email: user.email, name: user.name },
        dependentName,
        packageKind: pkg.kind,
        periodPreset: pkg.periodPreset,
      });
    } catch (err) {
      console.error("[mail] payment pending admin emails failed:", err);
    }

    if (!qrSettings.accountNumber || !qrSettings.bankCode) return { error: "qr_not_configured" as const };

    // Credits packages get a fixed "Platba za N vstupů" note instead of the
    // admin-configured template, so the bank statement itself says what the
    // payment was for. Constant symbol 1 marks every app-generated QR
    // payment, distinguishing it from ad-hoc transfers unrelated to a
    // package purchase (see payment-check's "unmatched" sections).
    const message =
      pkg.kind === PackageKind.CREDITS
        ? `Platba za ${pkg.credits} ${czVstupu(pkg.credits)}`
        : qrSettings.messageTemplate.replace("{vs}", vs);

    let payload: string;
    try {
      payload = buildSpdPayload({
        accountNumber: qrSettings.accountNumber,
        bankCode: qrSettings.bankCode,
        amountCzk: order.amountCzk,
        variableSymbol: vs,
        constantSymbol: "1",
        message,
      });
    } catch {
      return { error: "qr_account" as const };
    }
    const qr = await qrDataUrl(payload);
    return { ok: true as const, orderId: order.id, vs, amountCzk: order.amountCzk, qr, spd: payload, method: "QR" as const };
  }

  // GoPay: until the real checkout + webhook are wired up, treat order
  // creation as an immediately successful payment so the flow is testable.
  const confirmed = await confirmPaymentOrder(order.id, { source: "gopay" });
  revalidatePath("/");
  revalidatePath("/buy");

  return {
    ok: true as const,
    orderId: order.id,
    vs,
    amountCzk: order.amountCzk,
    method: "GOPAY" as const,
    confirmed: confirmed.ok,
    applied: confirmed.ok ? confirmed.applied : undefined,
  };
}

export type QuickPaymentQrResult = { ok: true; qr: string; spd: string } | { ok: false; error: string };

/**
 * Anonymous "pay for a walk-in entry right now" QR on the landing page —
 * no account, no PaymentOrder row, just the club's configured bank details
 * plus whatever amount the visitor types. Regenerated on every amount
 * change (debounced client-side), so it stays a cheap, side-effect-free
 * computation rather than something that needs its own audit trail.
 */
export async function generateQuickPaymentQrAction(amountCzk: number): Promise<QuickPaymentQrResult> {
  if (!Number.isFinite(amountCzk) || amountCzk <= 0) return { ok: false, error: "invalid_amount" };

  const qrSettings = await getQrPaymentSettings();
  if (!qrSettings.accountNumber || !qrSettings.bankCode) return { ok: false, error: "not_configured" };

  try {
    const message = qrSettings.messageTemplate.replace("{vs}", "").replace(/\s+/g, " ").trim();
    const spd = buildSpdPayload({
      accountNumber: qrSettings.accountNumber,
      bankCode: qrSettings.bankCode,
      amountCzk,
      message: message || undefined,
    });
    const qr = await qrDataUrl(spd);
    return { ok: true, qr, spd };
  } catch {
    return { ok: false, error: "account_error" };
  }
}

// ---------------------------------------------------------------------------
// Admin — helpers
// ---------------------------------------------------------------------------

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user || !isAdminRole(session.user.role)) throw new Error("FORBIDDEN");
  return session;
}

/** Stricter gate for the root-only sections (settings, data import). */
async function requireRootSession() {
  const session = await auth();
  if (!session?.user || !isRootRole(session.user.role)) throw new Error("FORBIDDEN");
  return session;
}

// ---------------------------------------------------------------------------
// Admin — users
// ---------------------------------------------------------------------------

export async function adminApproveUserAction(userId: string, approve: boolean) {
  await requireAdminSession();
  await prisma.user.update({ where: { id: userId }, data: { status: approve ? UserStatus.APPROVED : UserStatus.REJECTED } });
  await audit({ action: approve ? "admin.user.approve" : "admin.user.reject", success: true, userId });
  revalidatePath("/admin/users");
}

export async function adminToggleSuspendAction(userId: string, suspended: boolean) {
  await requireAdminSession();
  await prisma.user.update({ where: { id: userId }, data: { suspended } });
  await audit({ action: suspended ? "admin.user.suspend" : "admin.user.unsuspend", success: true, userId });
  revalidatePath("/admin/users");
}

/**
 * Only ROOT can grant or touch the ROOT role — an ADMIN actor can freely
 * move a MEMBER/ADMIN target between those two roles, but can neither
 * promote anyone to ROOT nor change a ROOT user's role at all.
 */
export async function adminSetRoleAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = String(formData.get("userId") || "");
  const roleRaw = String(formData.get("role") || "");
  if (!userId || !["MEMBER", "STAFF", "ADMIN", "ROOT"].includes(roleRaw)) return;
  const role = roleRaw as Role;

  const actorIsRoot = isRootRole(session.user.role);
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
  revalidatePath("/[locale]/admin/users", "page");
}

export async function adminCreateUserAction(formData: FormData) {
  const session = await requireAdminSession();

  const email = String(formData.get("email") || "").toLowerCase().trim();
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const password = String(formData.get("password") || "").trim();
  const roleRaw = String(formData.get("role") || "MEMBER");
  const role =
    roleRaw === "ROOT" && isRootRole(session.user.role)
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
    redirect("/admin/users?error=tooYoung");
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

  revalidatePath("/admin/users");
}

export async function adminSetPasswordAction(formData: FormData) {
  await requireAdminSession();
  const userId = String(formData.get("userId") || "");
  const password = String(formData.get("password") || "").trim();
  if (!userId || password.length < 8) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await audit({ action: "admin.user.set_password", success: true, userId });
  revalidatePath("/admin/users");
}

export async function adminDeleteUserAction(userId: string) {
  const session = await requireAdminSession();
  if (!userId || userId === session.user.id) return;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  if (user.role === Role.ROOT) {
    if (!isRootRole(session.user.role)) return; // only root can delete a root account
    const rootCount = await prisma.user.count({ where: { role: Role.ROOT } });
    if (rootCount <= 1) return; // never leave the app without a root
  }

  await audit({
    action: "admin.user.delete",
    success: true,
    userId: session.user.id,
    meta: { deletedUserId: user.id, email: user.email, role: user.role },
  });
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
}

export async function adminSetUserGroupsAction(formData: FormData) {
  await requireAdminSession();
  const userId = String(formData.get("userId") || "");
  const groupIds = formData.getAll("groupIds").map(String);
  await prisma.userGroup.deleteMany({ where: { userId } });
  if (groupIds.length) {
    await prisma.userGroup.createMany({ data: groupIds.map((groupId) => ({ userId, groupId })) });
  }
  revalidatePath("/admin/users");
}

export async function adminSetPersonTypeAction(formData: FormData) {
  await requireAdminSession();
  const userId = String(formData.get("userId") || "");
  const personTypeId = String(formData.get("personTypeId") || "") || null;
  await prisma.user.update({ where: { id: userId }, data: { personTypeId } });
  revalidatePath("/admin/users");
}

// ---------------------------------------------------------------------------
// Admin — credits & payments
// ---------------------------------------------------------------------------

/** `amount` may be negative — that removes entries instead of granting them. */
export async function adminAdjustEntriesAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = String(formData.get("userId") || "");
  const amount = Number(formData.get("amount") || 0);
  const note = String(formData.get("note") || "manual");
  if (!userId || !Number.isFinite(amount) || amount === 0) return;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { credits: { increment: amount } } });
    await tx.creditLedger.create({ data: { userId, delta: amount, reason: "manual", meta: { note, by: session.user.id } } });
    await tx.paymentOrder.create({
      data: {
        userId,
        method: PaymentMethod.MANUAL,
        status: PaymentStatus.CONFIRMED,
        credits: amount,
        amountCzk: 0,
        note,
        confirmedAt: new Date(),
        confirmedById: session.user.id,
      },
    });
  });

  await audit({ action: "admin.entries.adjust", success: true, userId, meta: { amount, note } });
  revalidatePath("/admin/users");
  revalidatePath("/admin/payments");
}

/**
 * Grants a catalog package to a user for free, as if an admin had manually
 * confirmed a purchase — reuses `confirmPaymentOrder` so credits vs. period
 * packages are applied through the exact same (D1-safe) code path as a real
 * purchase, instead of duplicating that logic here.
 */
export async function adminGrantPackageAction(formData: FormData) {
  const session = await requireAdminSession();
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

  const result = await confirmPaymentOrder(order.id, { source: "admin", confirmedById: session.user.id });
  if (!result.ok) return;

  await audit({ action: "admin.package.grant", success: true, userId, meta: { packageId, kind: pkg.kind } });
  revalidatePath("/admin/users");
  revalidatePath("/admin/payments");
}

/** Revokes an active/upcoming period pass early — credits-based packages have nothing to "remove" once applied (use adminAdjustEntriesAction instead). */
export async function adminRevokeAccessPassAction(passId: string) {
  await requireAdminSession();
  if (!passId) return;

  const pass = await prisma.userAccessPass.findUnique({ where: { id: passId } });
  if (!pass) return;

  await prisma.userAccessPass.delete({ where: { id: passId } });
  await audit({ action: "admin.access_pass.revoke", success: true, userId: pass.userId, meta: { passId } });
  revalidatePath("/admin/users");
}

export async function adminConfirmPaymentAction(orderId: string) {
  const session = await requireAdminSession();
  const result = await confirmPaymentOrder(orderId, { source: "admin", confirmedById: session.user.id });
  if (!result.ok) return;
  revalidatePath("/admin/payments");
  revalidatePath("/");
  revalidatePath("/buy");
}

/** Cancels a pending payment order that's never going to be paid (or was created in error) — soft-deleted via PaymentStatus.CANCELLED, not removed, so it stays in the audit trail. */
export async function adminCancelPaymentAction(orderId: string) {
  const session = await requireAdminSession();
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== PaymentStatus.PENDING) return;

  await prisma.paymentOrder.update({ where: { id: orderId }, data: { status: PaymentStatus.CANCELLED } });
  await audit({
    action: "admin.payment.cancel",
    success: true,
    userId: order.userId,
    meta: { orderId, amountCzk: order.amountCzk, method: order.method, variableSymbol: order.variableSymbol, by: session.user.id },
  });
  revalidatePath("/admin/payments");
  revalidatePath("/payment-check");
}

// ---------------------------------------------------------------------------
// Admin — settings
// ---------------------------------------------------------------------------

export async function adminSaveLockSettingsAction(formData: FormData) {
  await requireRootSession();
  await setSetting("lock", {
    agentUrl: String(formData.get("agentUrl") || "").trim(),
    agentToken: String(formData.get("agentToken") || "").trim(),
    cooldownSec: Number(formData.get("cooldownSec") || 60),
    timeoutMs: Number(formData.get("timeoutMs") || 15000),
  });
  await audit({ action: "admin.settings.lock", success: true });
  revalidatePath("/admin/settings");
}

/** Live EVOK status check for the settings page — fetched on demand, no background polling. */
export async function adminCheckGateStatusAction() {
  await requireRootSession();
  return getGateStatus();
}

export async function adminSaveQrSettingsAction(formData: FormData) {
  await requireRootSession();
  await setSetting("qrPayment", {
    accountNumber: String(formData.get("accountNumber") || ""),
    bankCode: String(formData.get("bankCode") || ""),
    messageTemplate: String(formData.get("messageTemplate") || "Stena Letnak {vs}"),
    // Digits only, capped so at least one timestamp digit is always left —
    // see the comment at the VS generation site above for why.
    vsPrefix: String(formData.get("vsPrefix") || "1").replace(/\D/g, "").slice(0, 9) || "1",
    quickPaymentEnabled: formData.get("quickPaymentEnabled") === "on",
  });
  revalidatePath("/admin/settings");
  revalidatePath("/");
  revalidatePath("/login");
}

export async function adminSaveRegistrationSettingsAction(formData: FormData) {
  await requireRootSession();
  const autoApprove = formData.get("autoApprove") === "on";
  await setSetting("registration", { autoApprove });
  revalidatePath("/admin/settings");
}

export async function adminSaveNotificationSettingsAction(formData: FormData) {
  await requireRootSession();
  const raw = String(formData.get("recipients") || "");
  const recipients = [...new Set(raw.split(/[\n,]/).map((e) => e.trim()).filter(Boolean))];
  await setSetting("notifications", { recipients });
  await audit({ action: "admin.settings.notifications", success: true, meta: { count: recipients.length } });
  revalidatePath("/admin/settings");
}

export async function adminSavePaymentControlSettingsAction(formData: FormData) {
  await requireRootSession();
  const periodDays = Math.max(1, Number(formData.get("periodDays") || 30));
  await setSetting("paymentControl", { periodDays });
  revalidatePath("/admin/settings");
  revalidatePath("/[locale]/payment-check", "page");
}

export async function adminSaveFioSettingsAction(formData: FormData) {
  await requireRootSession();
  const current = await getFioSettingsStored();
  const incomingToken = String(formData.get("token") || "").trim();
  // Fio's own API only recommends a 30s floor per token.
  const pollIntervalSeconds = Math.max(30, Number(formData.get("pollIntervalSeconds") || current.pollIntervalSeconds || 60));

  await setSetting("fio", {
    ...current,
    enabled: formData.get("enabled") === "on",
    // An empty token field means "keep the previously stored token".
    token: incomingToken || current.token,
    pollIntervalSeconds,
  });

  await audit({
    action: "admin.settings.fio",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", tokenUpdated: Boolean(incomingToken), pollIntervalSeconds },
  });
  revalidatePath("/admin/settings");
}

export async function adminSaveGoPaySettingsAction(formData: FormData) {
  await requireRootSession();
  const current = await getGoPaySettingsStored();
  const incomingSecret = String(formData.get("clientSecret") || "");

  await setSetting("gopay", {
    enabled: formData.get("enabled") === "on",
    goid: String(formData.get("goid") || "").trim(),
    clientId: String(formData.get("clientId") || "").trim(),
    // An empty secret field means "keep the previously stored secret".
    clientSecret: incomingSecret || current.clientSecret,
    sandbox: formData.get("sandbox") === "on",
  });

  await audit({
    action: "admin.settings.gopay",
    success: true,
    meta: {
      enabled: formData.get("enabled") === "on",
      goidSet: Boolean(String(formData.get("goid") || "").trim()),
      clientIdSet: Boolean(String(formData.get("clientId") || "").trim()),
      secretUpdated: Boolean(incomingSecret),
      sandbox: formData.get("sandbox") === "on",
    },
  });
  revalidatePath("/admin/settings");
}

export async function adminSaveSmtpSettingsAction(formData: FormData) {
  await requireRootSession();
  const current = await getSmtpSettingsStored();
  const incomingPass = String(formData.get("pass") || "");
  const host = String(formData.get("host") || "").trim();

  await setSetting("smtp", {
    host,
    port: Number(formData.get("port") || current.port || 587),
    user: String(formData.get("user") || "").trim(),
    // An empty password field means "keep the previously stored password".
    pass: incomingPass || current.pass,
    from: String(formData.get("from") || "").trim(),
    accountId: String(formData.get("accountId") || "").trim(),
  });

  await audit({
    action: "admin.settings.smtp",
    success: true,
    meta: { host, passUpdated: Boolean(incomingPass) },
  });
  revalidatePath("/admin/settings");
}

/** Trims, drops any leading slash, and ensures exactly one trailing slash (unless empty = bucket root). */
function normalizeBackupPath(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/** Strips an accidental "http(s)://" prefix and trailing slashes — easy to paste in from a provider's dashboard. */
function normalizeEndpoint(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

export async function adminSaveS3SettingsAction(formData: FormData) {
  await requireRootSession();
  const current = await getS3SettingsStored();
  const incomingSecret = String(formData.get("secretAccessKey") || "");
  const bucket = String(formData.get("bucket") || "").trim();

  await setSetting("s3", {
    bucket,
    region: String(formData.get("region") || "").trim() || "us-east-1",
    endpoint: normalizeEndpoint(String(formData.get("endpoint") || "")),
    accessKeyId: String(formData.get("accessKeyId") || "").trim(),
    // An empty secret field means "keep the previously stored secret".
    secretAccessKey: incomingSecret || current.secretAccessKey,
  });

  await audit({
    action: "admin.settings.s3",
    success: true,
    meta: { bucket, secretUpdated: Boolean(incomingSecret) },
  });
  revalidatePath("/admin/settings");
}

export async function adminSaveConfigBackupSettingsAction(formData: FormData) {
  await requireRootSession();
  const current = await getConfigBackupSettingsStored();
  const frequencyMinutes = Math.max(1, Number(formData.get("frequencyMinutes") || current.frequencyMinutes || 60));
  const keepCount = Math.max(1, Number(formData.get("keepCount") || current.keepCount || 10));
  const path = normalizeBackupPath(String(formData.get("path") || ""));

  await setSetting("backup", { ...current, enabled: formData.get("enabled") === "on", path, frequencyMinutes, keepCount });

  await audit({
    action: "admin.settings.backup",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", frequencyMinutes, keepCount },
  });
  revalidatePath("/admin/settings");
}

export async function adminSaveTransactionBackupSettingsAction(formData: FormData) {
  await requireRootSession();
  const current = await getTransactionBackupSettingsStored();
  const frequencyMinutes = Math.max(1, Number(formData.get("frequencyMinutes") || current.frequencyMinutes || 60));
  const keepCount = Math.max(1, Number(formData.get("keepCount") || current.keepCount || 10));
  const retentionDays = Math.max(1, Number(formData.get("retentionDays") || current.retentionDays || 90));
  const path = normalizeBackupPath(String(formData.get("path") || ""));

  await setSetting("transactionBackup", {
    ...current,
    enabled: formData.get("enabled") === "on",
    path,
    frequencyMinutes,
    keepCount,
    retentionDays,
  });

  await audit({
    action: "admin.settings.transaction_backup",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", frequencyMinutes, keepCount, retentionDays },
  });
  revalidatePath("/admin/settings");
}

export async function adminSaveDatabaseDumpSettingsAction(formData: FormData) {
  await requireRootSession();
  const current = await getDatabaseDumpSettingsStored();
  const frequencyDays = Math.max(1, Number(formData.get("frequencyDays") || current.frequencyDays || 1));
  const keepCount = Math.max(1, Number(formData.get("keepCount") || current.keepCount || 7));
  const path = normalizeBackupPath(String(formData.get("path") || ""));
  const rawTimeOfDay = String(formData.get("timeOfDay") || "");
  const timeOfDay = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTimeOfDay) ? rawTimeOfDay : current.timeOfDay;

  await setSetting("databaseDump", {
    ...current,
    enabled: formData.get("enabled") === "on",
    path,
    frequencyDays,
    timeOfDay,
    keepCount,
  });

  await audit({
    action: "admin.settings.database_dump",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", frequencyDays, timeOfDay, keepCount },
  });
  revalidatePath("/admin/settings");
}

export async function adminSaveLogCleanupSettingsAction(formData: FormData) {
  await requireRootSession();
  const current = await getLogCleanupSettingsStored();
  const maxAgeDays = Math.max(1, Number(formData.get("maxAgeDays") || current.maxAgeDays || 90));
  const frequencyDays = Math.max(1, Number(formData.get("frequencyDays") || current.frequencyDays || 1));
  const rawTimeOfDay = String(formData.get("timeOfDay") || "");
  const timeOfDay = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTimeOfDay) ? rawTimeOfDay : current.timeOfDay;

  await setSetting("logCleanup", { ...current, enabled: formData.get("enabled") === "on", maxAgeDays, timeOfDay, frequencyDays });

  await audit({
    action: "admin.settings.log_cleanup",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", maxAgeDays, timeOfDay, frequencyDays },
  });
  revalidatePath("/admin/settings");
}

export async function adminSavePendingOrderCleanupSettingsAction(formData: FormData) {
  await requireRootSession();
  const current = await getPendingOrderCleanupSettingsStored();
  const maxAgeDays = Math.max(1, Number(formData.get("maxAgeDays") || current.maxAgeDays || 7));
  const frequencyDays = Math.max(1, Number(formData.get("frequencyDays") || current.frequencyDays || 1));
  const rawTimeOfDay = String(formData.get("timeOfDay") || "");
  const timeOfDay = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTimeOfDay) ? rawTimeOfDay : current.timeOfDay;

  await setSetting("pendingOrderCleanup", {
    ...current,
    enabled: formData.get("enabled") === "on",
    maxAgeDays,
    timeOfDay,
    frequencyDays,
  });

  await audit({
    action: "admin.settings.pending_order_cleanup",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", maxAgeDays, timeOfDay, frequencyDays },
  });
  revalidatePath("/admin/settings");
}

export async function adminSaveEmailVerificationSettingsAction(formData: FormData) {
  await requireRootSession();
  const current = await getEmailVerificationSettingsStored();
  const graceDays = Math.max(1, Number(formData.get("graceDays") || current.graceDays || 7));
  const frequencyDays = Math.max(1, Number(formData.get("frequencyDays") || current.frequencyDays || 1));
  const rawTimeOfDay = String(formData.get("timeOfDay") || "");
  const timeOfDay = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTimeOfDay) ? rawTimeOfDay : current.timeOfDay;

  await setSetting("emailVerification", {
    ...current,
    enabled: formData.get("enabled") === "on",
    graceDays,
    timeOfDay,
    frequencyDays,
  });

  await audit({
    action: "admin.settings.email_verification",
    success: true,
    meta: { enabled: formData.get("enabled") === "on", graceDays, timeOfDay, frequencyDays },
  });
  revalidatePath("/admin/settings");
}

export type ManualBackupResult = { ok: true } | { ok: false; message: string };

export async function adminRunConfigBackupAction(): Promise<ManualBackupResult> {
  await requireRootSession();
  try {
    await runConfigBackupIfDue(prisma, { force: true });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function adminRunTransactionBackupAction(): Promise<ManualBackupResult> {
  await requireRootSession();
  try {
    await runTransactionBackupIfDue(prisma, { force: true });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function adminRunDatabaseDumpAction(): Promise<ManualBackupResult> {
  await requireRootSession();
  try {
    await runDatabaseDumpIfDue(prisma, { force: true });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export type ManualFioPollResult = { ok: true; matchedCount: number } | { ok: false; message: string };

export async function adminRunFioPollAction(): Promise<ManualFioPollResult> {
  await requireRootSession();
  try {
    await runFioPollIfDue(prisma, { force: true });
    const settings = await getFioSettingsStored();
    revalidatePath("/admin/settings");
    revalidatePath("/admin/payments");
    return { ok: true, matchedCount: settings.lastMatchedCount };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export type ManualLogCleanupResult = { ok: true; deletedCount: number } | { ok: false; message: string };

export async function adminRunLogCleanupAction(): Promise<ManualLogCleanupResult> {
  await requireRootSession();
  try {
    await runLogCleanupIfDue(prisma, { force: true });
    const settings = await getLogCleanupSettingsStored();
    revalidatePath("/admin/settings");
    revalidatePath("/admin/logs");
    return { ok: true, deletedCount: settings.lastDeletedCount };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export type ManualPendingOrderCleanupResult = { ok: true; deletedCount: number } | { ok: false; message: string };

export async function adminRunPendingOrderCleanupAction(): Promise<ManualPendingOrderCleanupResult> {
  await requireRootSession();
  try {
    await runPendingOrderCleanupIfDue(prisma, { force: true });
    const settings = await getPendingOrderCleanupSettingsStored();
    revalidatePath("/admin/settings");
    revalidatePath("/admin/payments");
    return { ok: true, deletedCount: settings.lastDeletedCount };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export type ManualEmailVerificationSuspensionResult = { ok: true; suspendedCount: number } | { ok: false; message: string };

export async function adminRunEmailVerificationSuspensionAction(): Promise<ManualEmailVerificationSuspensionResult> {
  await requireRootSession();
  try {
    await runEmailVerificationSuspensionIfDue(prisma, { force: true });
    const settings = await getEmailVerificationSettingsStored();
    revalidatePath("/admin/settings");
    revalidatePath("/admin/users");
    return { ok: true, suspendedCount: settings.lastSuspendedCount };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Admin — guest passes
// ---------------------------------------------------------------------------

export async function adminCreateGuestPassAction(formData: FormData) {
  const session = await requireAdminSession();
  const maxUses = Number(formData.get("maxUses") || 1);
  const validFrom = parseAppLocalDate(String(formData.get("validFrom") || ""));
  const validTo = parseAppLocalDateEndOfDay(String(formData.get("validTo") || ""));
  const label = String(formData.get("label") || "") || null;
  const token = randomBytes(16).toString("hex");

  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validTo.getTime())) return;
  if (validTo <= validFrom) return;

  const pass = await prisma.guestPass.create({
    data: {
      token,
      maxUses: Number.isFinite(maxUses) && maxUses > 0 ? maxUses : 1,
      validFrom,
      validTo,
      label,
      createdBy: session.user.id,
    },
  });

  await audit({ action: "admin.guest.create", success: true, meta: { passId: pass.id, maxUses: pass.maxUses } });
  revalidatePath("/admin/guests");
  return { ok: true as const, token: pass.token, id: pass.id };
}

export async function adminDeleteGuestPassAction(passId: string) {
  await requireAdminSession();
  if (!passId) return;

  const pass = await prisma.guestPass.findUnique({ where: { id: passId } });
  if (!pass) return;

  await prisma.guestPass.delete({ where: { id: passId } });
  await audit({ action: "admin.guest.delete", success: true, guestToken: pass.token, meta: { passId: pass.id, label: pass.label } });
  revalidatePath("/admin/guests");
}

export async function adminDeleteGuestPassesAction(passIds: string[]) {
  await requireAdminSession();
  const ids = [...new Set(passIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (ids.length === 0) return { ok: false as const, deleted: 0 };

  const passes = await prisma.guestPass.findMany({ where: { id: { in: ids } }, select: { id: true, token: true, label: true } });
  if (passes.length === 0) return { ok: false as const, deleted: 0 };

  await prisma.guestPass.deleteMany({ where: { id: { in: passes.map((p) => p.id) } } });
  await audit({
    action: "admin.guest.delete_bulk",
    success: true,
    meta: { count: passes.length, passIds: passes.map((p) => p.id), labels: passes.map((p) => p.label || p.token.slice(0, 8)) },
  });
  revalidatePath("/admin/guests");
  return { ok: true as const, deleted: passes.length };
}

export async function adminSendGuestPassEmailAction(formData: FormData) {
  await requireAdminSession();
  const passId = String(formData.get("passId") || "");
  const email = String(formData.get("email") || "").toLowerCase().trim();
  if (!passId || !z.string().email().safeParse(email).success) {
    return { ok: false as const, error: "invalid_email" as const };
  }

  const pass = await prisma.guestPass.findUnique({ where: { id: passId } });
  if (!pass) return { ok: false as const, error: "not_found" as const };

  const url = guestPassUrl(pass.token, "cs", await requestAppUrl());
  const qr = await qrDataUrl(url);
  const png = Buffer.from(qr.replace(/^data:image\/\w+;base64,/, ""), "base64");
  const label = pass.label?.trim() || pass.token.slice(0, 8);
  const validity = `${formatAppDate(pass.validFrom)} → ${formatAppDate(pass.validTo)}`;

  const result = await sendMail({
    to: email,
    subject: `Poukaz — Stěna Letňák Tišnov (${label})`,
    text: [
      "Zde je váš vstupní poukaz na Stěnu Letňák Tišnov.",
      "",
      `Odkaz: ${url}`,
      `Platnost: ${validity}`,
      `Počet vstupů: ${pass.maxUses}`,
      "",
      "QR kód je v příloze. Otevřením odkazu nebo naskenováním QR otevřete bránu v prohlížeči.",
    ].join("\n"),
    html: `
      <p>Zde je váš vstupní poukaz na <strong>Stěnu Letňák Tišnov</strong>.</p>
      <p><a href="${url}">${url}</a></p>
      <p>Platnost: ${validity}<br/>Počet vstupů: ${pass.maxUses}</p>
      <p><img src="cid:voucher-qr" alt="QR poukazu" width="220" height="220" /></p>
      <p>Otevřením odkazu nebo naskenováním QR otevřete bránu v prohlížeči.</p>
    `,
    attachments: [{ filename: "poukaz-qr.png", content: png, contentType: "image/png", cid: "voucher-qr" }],
  });

  await audit({
    action: "admin.guest.email",
    success: result.ok,
    guestToken: pass.token,
    meta: { passId: pass.id, email, ...(result.ok ? {} : { reason: result.reason }) },
  });

  if (!result.ok) return { ok: false as const, error: result.reason };
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Admin — pricing (person types & packages)
// ---------------------------------------------------------------------------

export async function adminCreatePersonTypeAction(formData: FormData) {
  await requireAdminSession();
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
  revalidatePath("/admin/pricing");
  revalidatePath("/admin/users");
  revalidatePath("/account");
}

export async function adminSetPersonTypeVisibilityAction(formData: FormData) {
  await requireAdminSession();
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
  revalidatePath("/admin/pricing");
  revalidatePath("/account");
}

export async function adminSetDefaultPersonTypeAction(formData: FormData) {
  await requireAdminSession();
  const personTypeId = String(formData.get("personTypeId") || "");
  if (!personTypeId) return;

  const type = await prisma.personType.findUnique({ where: { id: personTypeId } });
  if (!type) return;

  await prisma.$transaction([
    prisma.personType.updateMany({ data: { isDefault: false } }),
    prisma.personType.update({ where: { id: personTypeId }, data: { isDefault: true } }),
  ]);

  await audit({ action: "admin.person_type.set_default", success: true, meta: { personTypeId, name: type.name } });
  revalidatePath("/admin/pricing");
  revalidatePath("/admin/users");
}

export async function adminDeletePersonTypeAction(personTypeId: string) {
  await requireAdminSession();
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
  revalidatePath("/admin/pricing");
  revalidatePath("/admin/users");
}

export async function adminCreatePackageAction(formData: FormData) {
  await requireAdminSession();
  const personTypeId = String(formData.get("personTypeId") || "");
  const kind = String(formData.get("kind") || "CREDITS") === "PERIOD" ? PackageKind.PERIOD : PackageKind.CREDITS;
  const priceCzk = Number(formData.get("priceCzk") || 0);
  if (!personTypeId || priceCzk < 0) return;

  if (kind === PackageKind.CREDITS) {
    const credits = Number(formData.get("credits") || 0);
    if (credits < 1) return;
    await prisma.pricePackage.create({ data: { personTypeId, kind, credits, priceCzk } });
    revalidatePath("/admin/pricing");
    revalidatePath("/buy");
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
  revalidatePath("/admin/pricing");
  revalidatePath("/buy");
}

export async function adminDeletePackageAction(packageId: string) {
  await requireAdminSession();
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
  revalidatePath("/admin/pricing");
}

// ---------------------------------------------------------------------------
// Admin — groups & schedule windows
// ---------------------------------------------------------------------------

export async function adminCreateGroupAction(formData: FormData) {
  await requireAdminSession();
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
  revalidatePath("/admin/groups");
  revalidatePath("/admin/users");
}

export async function adminDeleteGroupAction(groupId: string) {
  await requireAdminSession();
  if (!groupId) return;

  const group = await prisma.group.findUnique({ where: { id: groupId }, include: { _count: { select: { members: true } } } });
  if (!group || group.isDefault) return;

  await prisma.group.delete({ where: { id: groupId } });
  await audit({ action: "admin.group.delete", success: true, meta: { groupId, name: group.name, membersRemoved: group._count.members } });
  revalidatePath("/admin/groups");
  revalidatePath("/admin/users");
}

export async function adminUpdateGroupWindowsAction(formData: FormData) {
  await requireAdminSession();
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

  revalidatePath("/admin/groups");
}

// ---------------------------------------------------------------------------
// Admin — data export/import
// ---------------------------------------------------------------------------

export type ImportDataResult =
  | { ok: true; summary: ImportSummary }
  | { ok: false; error: "empty" | "parse_error"; message: string };

export async function adminImportDataAction(formData: FormData): Promise<ImportDataResult> {
  await requireRootSession();

  const file = formData.get("file");
  const pasted = String(formData.get("yaml") || "");
  const text = file instanceof File && file.size > 0 ? await file.text() : pasted;

  if (!text.trim()) return { ok: false, error: "empty", message: "Nebyl zadán žádný obsah k importu." };

  let summary: ImportSummary;
  try {
    summary = await importDataFromYaml(prisma, text);
  } catch (err) {
    return { ok: false, error: "parse_error", message: err instanceof Error ? err.message : String(err) };
  }

  await audit({
    action: "admin.data.import",
    success: true,
    meta: {
      personTypes: summary.personTypes,
      packages: summary.packages,
      groups: summary.groups,
      users: summary.users,
      periodPasses: summary.periodPasses,
      dependents: summary.dependents,
      guestPasses: summary.guestPasses,
      errorCount: summary.errors.length,
    },
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/groups");
  revalidatePath("/admin/pricing");
  revalidatePath("/admin/guests");
  revalidatePath("/admin/data");

  return { ok: true, summary };
}
