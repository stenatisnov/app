/**
 * Outbound-email seam.
 *
 * `app` only defines the shape and a "not configured" fallback so pages and
 * server actions can call `sendMail()` unconditionally. Every database
 * branch provides a real transport that fits its runtime. `libsql` and
 * `libsql-local` always use `nodemailer` over SMTP.
 *
 * `d1sql` (this file) uses `nodemailer` too, for any *third-party* SMTP
 * host — the `nodejs_compat` compatibility flag polyfills enough of
 * `net`/`tls` for that to work directly on Cloudflare Workers. But
 * Cloudflare Workers cannot open a raw TCP socket to a host on
 * Cloudflare's own network (it's treated as a loopback and rejected with
 * "proxy request failed, cannot connect to the specified address") — so
 * when `host` is Cloudflare's own Email Sending endpoint
 * (`*.mx.cloudflare.net`), this sends over Cloudflare's HTTP Email Sending
 * API instead, using the same stored username/password as the SMTP
 * credentials (API token) plus `accountId`. That request is a normal
 * `fetch()`, not a raw socket, so it isn't affected by the restriction.
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

import nodemailer from "nodemailer";

import type { PrismaClient } from "@prisma/client";
import { getEffectiveSmtpSettings, type SmtpSettings } from "./settings";

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

const CLOUDFLARE_EMAIL_HOST_RE = /(^|\.)mx\.cloudflare\.net$/i;

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

  if (CLOUDFLARE_EMAIL_HOST_RE.test(config.host)) {
    return sendViaCloudflareEmailApi(config, params);
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });

  await transporter.sendMail({
    from: config.from || "noreply@localhost",
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
    attachments: params.attachments,
  });

  return { ok: true };
}

/** Splits `"Display Name <addr@host>"` (or a bare address) into Cloudflare's `{address, name?}` shape. */
function parseFromAddress(from: string): { address: string; name?: string } {
  const match = from.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (match && match[1]) return { address: match[2], name: match[1].replace(/^"|"$/g, "") };
  if (match) return { address: match[2] };
  return { address: from.trim() };
}

async function sendViaCloudflareEmailApi(config: SmtpSettings, params: SendMailParams): Promise<SendMailResult> {
  if (!config.accountId) {
    console.warn("[mail] Cloudflare Email Sending needs an account ID (Admin > Nastavení > SMTP).");
    return { ok: false, reason: "cloudflare_account_id_missing" };
  }

  const attachments = (params.attachments ?? []).map((a) => ({
    content: (Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content)).toString("base64"),
    filename: a.filename,
    type: a.contentType || "application/octet-stream",
    disposition: a.cid ? "inline" : "attachment",
    ...(a.cid ? { content_id: a.cid } : {}),
  }));

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.pass}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: params.to,
        from: parseFromAddress(config.from || "noreply@localhost"),
        subject: params.subject,
        text: params.text,
        html: params.html,
        ...(attachments.length ? { attachments } : {}),
      }),
    },
  );

  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: { code: number; message: string }[];
  };

  if (!res.ok || !data.success) {
    const reason = data.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
    console.error("[mail] Cloudflare Email Sending API failed:", reason);
    return { ok: false, reason };
  }

  return { ok: true };
}
