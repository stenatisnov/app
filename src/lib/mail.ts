/**
 * Outbound-email seam.
 *
 * `app` only defines the shape and a "not configured" fallback so pages and
 * server actions can call `sendMail()` unconditionally. Every database
 * branch provides a real transport that fits its runtime:
 *  - `libsql` / `libsql-local` run on plain Node.js -> `nodemailer` over SMTP.
 *  - `d1sql` runs in the Cloudflare Workers runtime, which has no `net`/`tls`
 *    -> `worker-mailer`, SMTP over the `cloudflare:sockets` API.
 *
 * Branches override this file's implementation (same exported signature)
 * rather than importing a different module, so callers never need to know
 * which transport is active. Connection settings come from
 * `getEffectiveSmtpSettings()` (admin-configured DB values, falling back to
 * SMTP_* env vars) — not `process.env` directly.
 *
 * `sendMail()` takes an optional `client` to pass down to
 * `getEffectiveSmtpSettings()` — callers running outside the normal fetch
 * request lifecycle (the D1 branch's scheduled jobs) must supply the D1
 * client they already built themselves, since the default resolution path
 * depends on request-scoped context that a `scheduled` invocation never
 * has. Omitting it there doesn't fail loudly — it throws inside a
 * try/catch several layers up and the email is just silently never sent.
 */

import type { PrismaClient } from "@prisma/client";
import { getEffectiveSmtpSettings } from "./settings";

export type MailAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  /** Content-ID for referencing the attachment from `html` via `cid:...`. */
  cid?: string;
};

export type SendMailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
};

export type SendMailResult = { ok: true } | { ok: false; reason: string };

export async function isSmtpConfigured(client?: PrismaClient): Promise<boolean> {
  const config = await getEffectiveSmtpSettings(client);
  return Boolean(config.host);
}

export async function sendMail(params: SendMailParams, client?: PrismaClient): Promise<SendMailResult> {
  const config = await getEffectiveSmtpSettings(client);
  if (!config.host) {
    console.warn("[mail] SMTP not configured, message not sent:", params.subject, "->", params.to);
    return { ok: false, reason: "smtp_not_configured" };
  }
  console.warn(
    "[mail] no database branch mail transport wired in — see src/lib/mail.ts on the app branch.",
  );
  return { ok: false, reason: "no_transport" };
}
