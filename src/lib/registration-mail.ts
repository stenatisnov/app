import { PackageKind, type PeriodPreset, type PrismaClient } from "@prisma/client";
import { sendMail } from "./mail";
import { appUrl } from "./app-url";
import { getNotificationSettingsStored, getPaymentReceiptSettingsStored } from "./settings";
import { formatAppDateTime } from "./time";
import { generateReceiptPdf } from "./receipt-pdf";

/** Configured in Admin > Nastavení > Notifikace — not tied to `role: ADMIN` anymore. */
async function notificationRecipients(): Promise<string[]> {
  const settings = await getNotificationSettingsStored();
  return settings.recipients;
}

/**
 * Welcome email to the new member, plus (unless auto-approved — nothing to
 * approve there) a heads-up to the configured notification recipients that
 * someone is pending approval.
 */
export async function sendRegistrationEmails(
  user: { email: string; name: string | null },
  opts: { autoApproved?: boolean } = {},
) {
  await sendMail({
    to: user.email,
    subject: "Registrace přijata — Stěna Letňák Tišnov",
    text: opts.autoApproved
      ? "Děkujeme za registraci. Váš účet je nyní aktivní, můžete se rovnou přihlásit."
      : "Děkujeme za registraci. Váš účet nyní čeká na schválení administrátorem.",
    html: opts.autoApproved
      ? "<p>Děkujeme za registraci. Váš účet je nyní aktivní, můžete se rovnou přihlásit.</p>"
      : "<p>Děkujeme za registraci. Váš účet nyní čeká na schválení administrátorem.</p>",
  });

  if (opts.autoApproved) return;

  const recipients = await notificationRecipients();
  if (recipients.length === 0) return;

  const who = user.name ? `${user.name} <${user.email}>` : user.email;
  await Promise.all(
    recipients.map((to) =>
      sendMail({
        to,
        subject: "Nová registrace čeká na schválení",
        text: `Nový uživatel ${who} čeká na schválení: ${appUrl()}/admin/users`,
        html: `<p>Nový uživatel <strong>${who}</strong> čeká na schválení.</p><p><a href="${appUrl()}/admin/users">Otevřít administraci</a></p>`,
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
  packageKind: PackageKind;
  periodPreset: PeriodPreset | null;
}) {
  const recipients = await notificationRecipients();
  if (recipients.length === 0) return;

  const who = order.dependentName
    ? `${order.dependentName} (doprovod, přes ${order.user.name ? `${order.user.name} <${order.user.email}>` : order.user.email})`
    : order.user.name
      ? `${order.user.name} <${order.user.email}>`
      : order.user.email;
  const what =
    order.packageKind === PackageKind.PERIOD
      ? `časový balíček (${order.periodPreset ?? "CUSTOM"})`
      : `${order.credits} kreditů`;

  await Promise.all(
    recipients.map((to) =>
      sendMail({
        to,
        subject: `Nová platba QR čeká na potvrzení (VS ${order.variableSymbol ?? "-"})`,
        text: `${who} objednal(a) ${what} za ${order.amountCzk} Kč, VS ${order.variableSymbol}. Potvrďte v administraci: ${appUrl()}/admin/payments`,
        html: `<p><strong>${who}</strong> objednal(a) ${what} za ${order.amountCzk} Kč (VS ${order.variableSymbol}).</p><p><a href="${appUrl()}/admin/payments">Potvrdit platbu</a></p>`,
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
    default:
      return method;
  }
}

/** Substitutes the three admin-facing template variables into a subject/body string. */
function applyReceiptTemplate(template: string, vars: { PAYMENT_TYPE: string; AMOUNT: string; CREDITS: string }): string {
  return template
    .replaceAll("{PAYMENT_TYPE}", vars.PAYMENT_TYPE)
    .replaceAll("{AMOUNT}", vars.AMOUNT)
    .replaceAll("{CREDITS}", vars.CREDITS);
}

/**
 * Sent to the buyer the moment their payment is confirmed (admin, GoPay, or
 * Fio auto-match) — the "receipt" for their purchase. The email body's
 * wording comes from the admin-configurable template in
 * `PaymentReceiptSettings` (Admin > Nastavení); the itemized detail always
 * goes in the attached PDF instead, which has a fixed layout.
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
    confirmedAt: Date;
    user: { email: string; name: string | null };
    /** Set when the order was bought for a dependent (companion) rather than the account holder. */
    dependentName?: string | null;
    packageKind: PackageKind | null;
    periodPreset: PeriodPreset | null;
  },
  client?: PrismaClient,
) {
  const itemLabel =
    order.packageKind === PackageKind.PERIOD
      ? `časový balíček (${order.periodPreset ?? "CUSTOM"})`
      : order.packageKind === PackageKind.CREDITS
        ? `${order.credits} kreditů`
        : "vstup";
  const amountLabel = `${order.amountCzk} Kč`;
  const typeLabel = paymentTypeLabel(order.method);
  const dateLabel = formatAppDateTime(order.confirmedAt);

  const settings = await getPaymentReceiptSettingsStored(client);
  const vars = { PAYMENT_TYPE: typeLabel, AMOUNT: amountLabel, CREDITS: String(order.credits) };
  const subject = applyReceiptTemplate(settings.subject, vars);
  const body = applyReceiptTemplate(settings.bodyTemplate, vars);

  const pdfBytes = await generateReceiptPdf({
    orderId: order.id,
    confirmedAtLabel: dateLabel,
    buyerName: order.user.name,
    buyerEmail: order.user.email,
    dependentName: order.dependentName ?? null,
    paymentTypeLabel: typeLabel,
    itemLabel,
    amountLabel,
    credits: order.credits,
    messageText: body,
  });

  await sendMail(
    {
      to: order.user.email,
      subject,
      text: body,
      html: body
        .split("\n")
        .map((line) => (line ? `<p>${line}</p>` : ""))
        .join("\n"),
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
      `Přihlaste se na: ${appUrl()}/login`,
      "Doporučujeme si po prvním přihlášení heslo změnit.",
    ].join("\n"),
    html: `
      <p>${greeting},</p>
      <p>administrátor pro vás založil účet do aplikace <strong>Stěna Letňák Tišnov</strong>.</p>
      <p>Přihlašovací e-mail: <strong>${params.email}</strong><br/>Heslo: <strong>${params.password}</strong></p>
      <p><a href="${appUrl()}/login">Přihlásit se</a></p>
      <p>Doporučujeme si po prvním přihlášení heslo změnit.</p>
    `,
  });
}
