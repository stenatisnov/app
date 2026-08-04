import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { formatAppDate } from "@/lib/time";
import { GuestOpenButton } from "@/components/GuestOpenButton";

export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("guest");

  const pass = await prisma.guestPass.findUnique({ where: { token } });
  if (!pass) notFound();

  const remaining = Math.max(pass.maxUses - pass.usedCount, 0);

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{pass.label || t("title")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("validUntil", { date: formatAppDate(pass.validTo) })}</p>
      <GuestOpenButton token={token} initialRemaining={remaining} />
    </div>
  );
}
