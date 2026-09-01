import { PackageKind, type PeriodPreset, type PrismaClient } from "@prisma/client";
import { sendMail } from "./mail";
import { adminPaymentsUrl, adminUsersUrl, loginUrl } from "./app-url";
import { getNotificationSettingsStored, getPaymentReceiptSettingsStored } from "./settings";
import { generateReceiptPdf } from "./receipt-pdf";
import { formatAppDateFull } from "./time";

/** Configured in Admin > Nastavení > Notifikace — not tied to `role: ADMIN` anymore. */
async function notificationRecipients(): Promise<string[]> {
  const settings = await getNotificationSettingsStored();
  return settings.recipients;
}

/**
 * Welcome email to the new member. Three cases: `autoApproved` (the
 * testing-only registration setting — nothing left to do), `isMinor` (still
 * needs staff approval + a guardian consent form, so also notifies the
 * configured notification recipients), or the new default — the account is
 * approved automatically once the separate verification email (sent right
 * after this one, see `sendVerificationEmail`) is confirmed, so no admin
 * action and no notification needed.
 */
export async function sendRegistrationEmails(
  user: { email: string; name: string | null },
  opts: { autoApproved?: boolean; isMinor?: boolean } = {},
) {
  const text = opts.autoApproved
    ? "Děkujeme za registraci. Váš účet je nyní aktivní, můžete se rovnou přihlásit."
    : opts.isMinor
      ? "Děkujeme za registraci. Protože je vám 15–17 let, účet bude aktivován až po schválení administrátorem a doložení souhlasu zákonného zástupce."
      : "Děkujeme za registraci. Účet se aktivuje automaticky, jakmile potvrdíte svou e-mailovou adresu — v samostatném e-mailu, který jsme právě odeslali, klikněte na ověřovací odkaz. Pokud ho ve schránce nevidíte, zkontrolujte prosím i složku Spam.";
  const html = opts.autoApproved
    ? "<p>Děkujeme za registraci. Váš účet je nyní aktivní, můžete se rovnou přihlásit.</p>"
    : opts.isMinor
      ? "<p>Děkujeme za registraci. Protože je vám 15–17 let, účet bude aktivován až po schválení administrátorem a doložení souhlasu zákonného zástupce.</p>"
      : "<p>Děkujeme za registraci. Účet se aktivuje automaticky, jakmile potvrdíte svou e-mailovou adresu — v samostatném e-mailu, který jsme právě odeslali, klikněte na ověřovací odkaz.</p><p>Pokud ho ve schránce nevidíte, zkontrolujte prosím i složku Spam.</p>";

  await sendMail({ to: user.email, subject: "Registrace přijata — Stěna Letňák Tišnov", text, html });

  if (opts.autoApproved || !opts.isMinor) return;

  const recipients = await notificationRecipients();
  if (recipients.length === 0) return;

  const who = user.name ? `${user.name} <${user.email}>` : user.email;
  await Promise.all(
    recipients.map((to) =>
      sendMail({
        to,
        subject: "Nová registrace čeká na schválení",
        text: `Nový uživatel ${who} čeká na schválení: ${adminUsersUrl()}`,
        html: `<p>Nový uživatel <strong>${who}</strong> čeká na schválení.</p><p><a href="${adminUsersUrl()}">Otevřít administraci</a></p>`,
      }),
    ),
  );
}

/** Notifies the configured notification recipients that a QR bank-transfer order is waiting for manual confirmation. */
export async function sendPaymentPendingAdminEmails(order: {
  id: string;
  credits: number;
  amountCzk: number;
  variableSymbol: string | null;
  method: string;
  user: { email: string; name: string | null };
  /** Set when the order was bought for a dependent (companion) rather than the account holder. */
  dependentName?: string | null;
  packageKind: PackageKind | null;
  periodPreset: PeriodPreset | null;
  /** Set for a Platba order (multi-person purchase) — a ready-made description in place of packageKind/credits. */
  platbaSummary?: string;
}) {
  const recipients = await notificationRecipients();
  if (recipients.length === 0) return;

  const who = order.dependentName
    ? `${order.dependentName} (doprovod, přes ${order.user.name ? `${order.user.name} <${order.user.email}>` : order.user.email})`
    : order.user.name
      ? `${order.user.name} <${order.user.email}>`
      : order.user.email;
  const what = order.platbaSummary
    ? order.platbaSummary
    : order.packageKind === PackageKind.PERIOD
      ? `časový balíček (${order.periodPreset ?? "CUSTOM"})`
      : order.packageKind === PackageKind.FAMILY
        ? "rodinné vstupné (+ doprovod)"
        : `${order.credits} kreditů`;

  await Promise.all(
    recipients.map((to) =>
      sendMail({
        to,
        subject: `Nová platba QR čeká na potvrzení (VS ${order.variableSymbol ?? "-"})`,
        text: `${who} objednal(a) ${what} za ${order.amountCzk} Kč, VS ${order.variableSymbol}. Potvrďte v administraci: ${adminPaymentsUrl()}`,
        html: `<p><strong>${who}</strong> objednal(a) ${what} za ${order.amountCzk} Kč (VS ${order.variableSymbol}).</p><p><a href="${adminPaymentsUrl()}">Potvrdit platbu</a></p>`,
      }),
    ),
  );
}

/** Human-readable label for the `{PAYMENT_TYPE}` template variable and the PDF receipt. */
function paymentTypeLabel(method: string): string {
  switch (method) {
    case "QR":
      return "QR platba";
    case "GOPAY":
      return "GoPay";
    case "MANUAL":
      return "Manuální";
    case "CASH":
      return "Hotovost";
    default:
      return method;
  }
}

/** Substitutes the admin-facing template variables into a subject/body string. */
function applyReceiptTemplate(
  template: string,
  vars: { PAYMENT_TYPE: string; AMOUNT: string; CREDITS: string; VS: string; DATE: string; POK: string },
): string {
  return template
    .replaceAll("{PAYMENT_TYPE}", vars.PAYMENT_TYPE)
    .replaceAll("{AMOUNT}", vars.AMOUNT)
    .replaceAll("{CREDITS}", vars.CREDITS)
    .replaceAll("{VS}", vars.VS)
    .replaceAll("{DATE}", vars.DATE)
    .replaceAll("{POK}", vars.POK);
}

/**
 * Sent to the buyer the moment their payment is confirmed (admin, GoPay, or
 * Fio auto-match). The email itself is just a fixed one-line notice; all
 * the admin-configurable wording (Admin > Nastavení, with its
 * `{PAYMENT_TYPE}`/`{AMOUNT}`/`{CREDITS}` placeholders) goes into the
 * attached PDF "účtenka" instead.
 *
 * Takes an explicit `client` to forward to `sendMail()`/settings lookups —
 * the Fio auto-match runs from the D1 branch's scheduled Cron Trigger,
 * which has no request-scoped context for the default settings-resolution
 * path to fall back on (see `mail.ts`).
 */
export async function sendPaymentReceiptEmail(
  order: {
    id: string;
    credits: number;
    amountCzk: number;
    method: string;
    variableSymbol: string | null;
    /** EET 2.0 confirmation code (POK), when the eet integration is enabled and reported this sale before the receipt was sent — null otherwise (including when reporting is still pending/queued for retry, since the receipt is sent synchronously right after confirmation). */
    pok?: string | null;
    user: { email: string };
  },
  client?: PrismaClient,
) {
  const settings = await getPaymentReceiptSettingsStored(client);
  const vars = {
    PAYMENT_TYPE: paymentTypeLabel(order.method),
    AMOUNT: `${order.amountCzk} Kč`,
    CREDITS: String(order.credits),
    VS: order.variableSymbol ?? "—",
    DATE: formatAppDateFull(new Date()),
    POK: order.pok ?? "—",
  };
  const subject = applyReceiptTemplate(settings.subject, vars);
  const pdfMessage = applyReceiptTemplate(settings.pdfText, vars);
  const pdfBytes = await generateReceiptPdf(pdfMessage);

  const text = "Vaše platba byla přijata. Účtenka je přiložena jako PDF.";

  await sendMail(
    {
      to: order.user.email,
      subject,
      text,
      html: `<p>${text}</p>`,
      attachments: [
        {
          filename: `uctenka-${order.id}.pdf`,
          content: Buffer.from(pdfBytes),
          contentType: "application/pdf",
        },
      ],
    },
    client,
  );
}

/** Sent to the member the moment their pending registration is approved by staff or an admin. */
export async function sendAccountActivationEmail(user: { email: string; name: string | null }) {
  const greeting = user.name ? `Ahoj ${user.name}` : "Dobrý den";
  await sendMail({
    to: user.email,
    subject: "Účet aktivován — Stěna Letňák Tišnov",
    text: [
      `${greeting},`,
      "",
      "váš účet byl schválen a je nyní aktivní. Můžete se přihlásit a začít appku používat.",
      "",
      `Přihlaste se na: ${loginUrl()}`,
    ].join("\n"),
    html: `
      <p>${greeting},</p>
      <p>váš účet byl schválen a je nyní aktivní. Můžete se přihlásit a začít appku používat.</p>
      <p><a href="${loginUrl()}">Přihlásit se</a></p>
    `,
  });
}

/** Sends login credentials to a member account created directly by an admin. */
export async function sendAdminCreatedUserEmail(params: { email: string; name: string | null; password: string }) {
  const greeting = params.name ? `Ahoj ${params.name}` : "Dobrý den";
  await sendMail({
    to: params.email,
    subject: "Účet vytvořen — Stěna Letňák Tišnov",
    text: [
      `${greeting},`,
      "",
      "administrátor pro vás založil účet do aplikace Stěna Letňák Tišnov.",
      `Přihlašovací e-mail: ${params.email}`,
      `Heslo: ${params.password}`,
      "",
      `Přihlaste se na: ${loginUrl()}`,
      "Doporučujeme si po prvním přihlášení heslo změnit.",
    ].join("\n"),
    html: `
      <p>${greeting},</p>
      <p>administrátor pro vás založil účet do aplikace <strong>Stěna Letňák Tišnov</strong>.</p>
      <p>Přihlašovací e-mail: <strong>${params.email}</strong><br/>Heslo: <strong>${params.password}</strong></p>
      <p><a href="${loginUrl()}">Přihlásit se</a></p>
      <p>Doporučujeme si po prvním přihlášení heslo změnit.</p>
    `,
  });
}
