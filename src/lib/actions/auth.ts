import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { redirect } from "react-router";
import { z } from "zod";
import { Role, UserStatus } from "@prisma/client";
import { getPrisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { sendAccountActivationEmail, sendRegistrationEmails } from "@/lib/registration-mail";
import { sendVerificationEmail } from "@/lib/email-verification";
import { getRegistrationSettings } from "@/lib/settings";
import { calculateAge, czechDateToIso, parseAppLocalDate, toAppDateValue } from "@/lib/time";
import { createUserSession, destroySession, getSessionUser } from "@/lib/session.server";
import { resetPasswordUrl } from "@/lib/app-url";

/**
 * Every action here takes `(formData, request, locale)` — `request` is what
 * the session cookie needs, `locale` is read once by the calling route
 * loader/action from `params.locale` so every redirect stays on the
 * visitor's current language. `getPrisma()` is zero-arg/ambient (see
 * `request-context.server.ts`) — the calling route already wrapped this
 * call in `withLoadContext(context, ...)`, so no `context` param is needed
 * here or in any function this file calls.
 */

export async function loginAction(formData: FormData, request: Request, locale: string): Promise<never> {
  const email = String(formData.get("email") || "").toLowerCase().trim();
  // Some mobile keyboards/password managers append a trailing space when
  // autofilling — trimming here (and everywhere a password is set) keeps
  // that from silently breaking sign-in on some devices but not others.
  const password = String(formData.get("password") || "").trim();

  const prisma = await getPrisma();
  const user = email && password ? await prisma.user.findUnique({ where: { email } }) : null;
  const valid = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) throw redirect(`/${locale}/login?error=invalid`);

  throw await createUserSession(user.id, `/${locale}`, request);
}

export async function logoutAction(request: Request, locale: string): Promise<never> {
  throw await destroySession(`/${locale}/login`, request);
}

export async function registerAction(formData: FormData, request: Request, locale: string): Promise<never> {
  const prisma = await getPrisma();
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
    throw redirect(`/${locale}/register?error=validation`);
  }
  if (parsed.data.password !== confirmPassword) {
    throw redirect(`/${locale}/register?error=mismatch`);
  }

  const age = calculateAge(parsed.data.birthDate);
  if (age < 15) {
    throw redirect(`/${locale}/register?error=tooYoung`);
  }
  const isMinor = age < 18;

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    throw redirect(`/${locale}/register?error=exists`);
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
    // `autoApprove` never applies to minors (see `status` above) — pass the
    // effective per-user outcome, not the raw setting, so the email text
    // matches what actually happened to this account.
    await sendRegistrationEmails({ email: user.email, name: user.name }, { autoApproved: !isMinor && autoApprove, isMinor });
  } catch (err) {
    console.error("[mail] registration emails failed:", err);
  }
  try {
    await sendVerificationEmail(user, prisma);
  } catch (err) {
    console.error("[mail] verification email failed:", err);
  }

  throw await createUserSession(user.id, `/${locale}`, request);
}

export async function requestPasswordResetAction(formData: FormData, locale: string): Promise<never> {
  const prisma = await getPrisma();
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  // Deliberately silent on unknown addresses — don't leak which emails are registered.
  if (user) {
    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 1000 * 60 * 60);
    await prisma.passwordResetToken.create({ data: { token, userId: user.id, expires } });

    const url = resetPasswordUrl(token, locale);
    await sendMail({
      to: user.email,
      subject: "Nastavení hesla — Stěna Letňák Tišnov",
      text: `Pro nastavení hesla otevřete: ${url}`,
      html: `<p>Pro nastavení hesla otevřete:</p><p><a href="${url}">${url}</a></p>`,
    });

    await audit({ action: "user.password_reset_request", success: true, userId: user.id });
  }

  throw redirect(`/${locale}/forgot-password?sent=1`);
}

export async function resetPasswordAction(formData: FormData, locale: string): Promise<never> {
  const prisma = await getPrisma();
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "").trim();
  if (password.length < 8) {
    throw redirect(`/${locale}/reset-password?token=${token}&error=short`);
  }

  const row = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!row || row.expires < new Date()) {
    throw redirect(`/${locale}/reset-password?token=${token}&error=invalid`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: row.userId } }),
  ]);

  await audit({ action: "user.password_reset", success: true, userId: row.userId });
  throw redirect(`/${locale}/login?reset=1`);
}

export async function changePasswordAction(formData: FormData, request: Request, locale: string): Promise<never> {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) throw redirect(`/${locale}/login`);

  const prisma = await getPrisma();
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (newPassword.length < 8) throw redirect(`/${locale}/account?error=short`);
  if (newPassword !== confirmPassword) throw redirect(`/${locale}/account?error=mismatch`);

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) throw redirect(`/${locale}/login`);

  if (user.passwordHash) {
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw redirect(`/${locale}/account?error=current`);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await audit({ action: "user.password_change", success: true, userId: user.id });
  throw redirect(`/${locale}/account?ok=1`);
}

/**
 * Verifying the email is what approves the account now — the admin/staff
 * approval queue only still applies to minors (15-17), who need a legal
 * guardian's consent that verifying an email can't stand in for; see
 * `registerAction`'s `!isMinor && autoApprove` and the `pendingMinor` vs.
 * `pending` dashboard banners.
 */
export async function verifyEmailAction(formData: FormData, locale: string): Promise<never> {
  const prisma = await getPrisma();
  const token = String(formData.get("token") || "");

  const row = await prisma.emailVerificationToken.findUnique({ where: { token }, include: { user: true } });
  if (!row || row.expires < new Date()) {
    throw redirect(`/${locale}/verify-email?token=${token}&error=invalid`);
  }

  const isMinor = row.user.birthDate !== null && calculateAge(toAppDateValue(row.user.birthDate)) < 18;
  const shouldAutoApprove = row.user.status === UserStatus.PENDING && !isMinor;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { emailVerified: new Date(), ...(shouldAutoApprove ? { status: UserStatus.APPROVED } : {}) },
    }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: row.userId } }),
  ]);

  await audit({ action: "user.email_verified", success: true, userId: row.userId });
  if (shouldAutoApprove) {
    await audit({ action: "user.auto_approve", success: true, userId: row.userId });
    try {
      await sendAccountActivationEmail(row.user);
    } catch (err) {
      console.error("[mail] activation email failed:", err);
    }
  }
  throw redirect(shouldAutoApprove ? `/${locale}/verify-email?success=1&approved=1` : `/${locale}/verify-email?success=1`);
}

export type ResendVerificationResult = { ok: true } | { ok: false; message: string };

export async function resendVerificationEmailAction(request: Request): Promise<ResendVerificationResult> {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) return { ok: false, message: "Nejste přihlášeni." };

  const prisma = await getPrisma();
  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return { ok: false, message: "Nejste přihlášeni." };
  if (user.emailVerified) return { ok: true };

  try {
    await sendVerificationEmail(user, prisma);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
