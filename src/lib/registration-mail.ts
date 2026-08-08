import { PackageKind, type PeriodPreset } from "@prisma/client";
import { prisma } from "./db";
import { sendMail } from "./mail";
import { appUrl } from "./app-url";

async function adminEmails(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
  });
  return admins.map((a) => a.email);
}

/**
 * Welcome email to the new member, plus (unless auto-approved — nothing to
 * approve there) a heads-up to every admin that someone is pending
 * approval.
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

  const admins = await adminEmails();
  if (admins.length === 0) return;

  const who = user.name ? `${user.name} <${user.email}>` : user.email;
  await Promise.all(
    admins.map((to) =>
      sendMail({
        to,
        subject: "Nová registrace čeká na schválení",
        text: `Nový uživatel ${who} čeká na schválení: ${appUrl()}/admin/users`,
        html: `<p>Nový uživatel <strong>${who}</strong> čeká na schválení.</p><p><a href="${appUrl()}/admin/users">Otevřít administraci</a></p>`,
      }),
    ),
  );
}

/** Notifies every admin that a QR bank-transfer order is waiting for manual confirmation. */
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
  const admins = await adminEmails();
  if (admins.length === 0) return;

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
    admins.map((to) =>
      sendMail({
        to,
        subject: `Nová platba QR čeká na potvrzení (VS ${order.variableSymbol ?? "-"})`,
        text: `${who} objednal(a) ${what} za ${order.amountCzk} Kč, VS ${order.variableSymbol}. Potvrďte v administraci: ${appUrl()}/admin/payments`,
        html: `<p><strong>${who}</strong> objednal(a) ${what} za ${order.amountCzk} Kč (VS ${order.variableSymbol}).</p><p><a href="${appUrl()}/admin/payments">Potvrdit platbu</a></p>`,
      }),
    ),
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
