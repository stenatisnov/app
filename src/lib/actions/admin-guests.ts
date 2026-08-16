import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { qrDataUrl } from "@/lib/qr";
import { guestPassUrl } from "@/lib/app-url";
import { requestAppUrl } from "@/lib/request-url";
import { formatAppDate, parseAppLocalDate, parseAppLocalDateEndOfDay } from "@/lib/time";
import { getSessionUser } from "@/lib/session.server";

// ---------------------------------------------------------------------------
// Admin — guest passes
// ---------------------------------------------------------------------------

export async function adminCreateGuestPassAction(formData: FormData, request: Request) {
  const prisma = await getPrisma();
  const actor = await getSessionUser(request);
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
      createdBy: actor?.id,
    },
  });

  await audit({ action: "admin.guest.create", success: true, meta: { passId: pass.id, maxUses: pass.maxUses } });
  return { ok: true as const, token: pass.token, id: pass.id };
}

export async function adminDeleteGuestPassAction(passId: string) {
  const prisma = await getPrisma();
  if (!passId) return;

  const pass = await prisma.guestPass.findUnique({ where: { id: passId } });
  if (!pass) return;

  await prisma.guestPass.delete({ where: { id: passId } });
  await audit({ action: "admin.guest.delete", success: true, guestToken: pass.token, meta: { passId: pass.id, label: pass.label } });
}

export async function adminDeleteGuestPassesAction(passIds: string[]) {
  const prisma = await getPrisma();
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
  return { ok: true as const, deleted: passes.length };
}

export async function adminSendGuestPassEmailAction(formData: FormData, request: Request) {
  const prisma = await getPrisma();
  const passId = String(formData.get("passId") || "");
  const email = String(formData.get("email") || "").toLowerCase().trim();
  if (!passId || !z.string().email().safeParse(email).success) {
    return { ok: false as const, error: "invalid_email" as const };
  }

  const pass = await prisma.guestPass.findUnique({ where: { id: passId } });
  if (!pass) return { ok: false as const, error: "not_found" as const };

  const url = guestPassUrl(pass.token, "cs", requestAppUrl(request));
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
