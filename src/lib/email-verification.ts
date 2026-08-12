import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { audit } from "./audit";
import { sendMail } from "./mail";
import { appUrl } from "./app-url";
import { isDueOnDailySchedule } from "./schedule";
import { getEmailVerificationSettingsStored, setSetting, type EmailVerificationSettings } from "./settings";

/** Generous on purpose — the account stays usable while unverified, so there's no urgency pressuring a short expiry the way a password-reset link has. */
const TOKEN_EXPIRY_MS = 30 * 86_400_000;

export async function sendVerificationEmail(
  user: { id: string; email: string },
  prisma: PrismaClient,
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_EXPIRY_MS);
  await prisma.emailVerificationToken.create({ data: { token, userId: user.id, expires } });

  const url = `${appUrl()}/verify-email?token=${token}`;
  await sendMail({
    to: user.email,
    subject: "Potvrďte svůj e-mail — Stěna Letňák Tišnov",
    text: `Pro potvrzení e-mailové adresy otevřete: ${url}`,
    html: `<p>Pro potvrzení e-mailové adresy otevřete:</p><p><a href="${url}">${url}</a></p>`,
  });
}

async function sendSuspensionNotice(user: { email: string }): Promise<void> {
  await sendMail({
    to: user.email,
    subject: "Účet pozastaven — Stěna Letňák Tišnov",
    text: "Váš účet byl automaticky pozastaven, protože jste si v požadované lhůtě neověřili e-mailovou adresu. Pro obnovení přístupu kontaktujte prosím administrátora.",
    html: "<p>Váš účet byl automaticky pozastaven, protože jste si v požadované lhůtě neověřili e-mailovou adresu.</p><p>Pro obnovení přístupu kontaktujte prosím administrátora.</p>",
  });
}

/**
 * Suspends MEMBER accounts still unverified `graceDays` after registration —
 * same once-a-day-at-`timeOfDay` schedule shape as the other cleanup jobs
 * (see `isDueOnDailySchedule`). Scoped to `role: MEMBER` since that's the
 * only path that ever creates a user with `emailVerified: null` in the
 * first place (admin-created accounts and Google sign-ins are marked
 * verified at creation) — excluding other roles is just defense in depth
 * against suspending an account later promoted to STAFF/ADMIN that never
 * got around to verifying.
 */
export async function runEmailVerificationSuspensionIfDue(prisma: PrismaClient, opts: { force?: boolean } = {}): Promise<void> {
  const settings = await getEmailVerificationSettingsStored(prisma);
  if (!opts.force && !settings.enabled) return;

  const now = new Date();
  if (!opts.force && !isDueOnDailySchedule(settings, now)) return;

  try {
    const cutoff = new Date(now.getTime() - Math.max(1, settings.graceDays) * 86_400_000);
    const overdue = await prisma.user.findMany({
      where: { emailVerified: null, suspended: false, role: "MEMBER", createdAt: { lt: cutoff } },
      select: { id: true, email: true },
    });

    if (overdue.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: overdue.map((u) => u.id) } },
        data: { suspended: true },
      });
      for (const u of overdue) {
        await audit(
          { action: "user.auto_suspend_unverified", success: true, userId: u.id, meta: { email: u.email } },
          prisma,
        );
        try {
          await sendSuspensionNotice(u);
        } catch (err) {
          console.error("[mail] account suspended email failed:", err);
        }
      }
    }

    const next: EmailVerificationSettings = {
      ...settings,
      lastRunAt: now.toISOString(),
      lastSuspendedCount: overdue.length,
      lastError: "",
      lastErrorAt: "",
    };
    await setSetting("emailVerification", next, prisma);
    await audit(
      { action: "admin.users.suspend_unverified", success: true, meta: { suspendedCount: overdue.length } },
      prisma,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const next: EmailVerificationSettings = { ...settings, lastError: message, lastErrorAt: now.toISOString() };
    await setSetting("emailVerification", next, prisma);
    await audit({ action: "admin.users.suspend_unverified", success: false, message }, prisma);
    throw err;
  }
}
