import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { formatAppDateTime } from "@/lib/time";
import { GuestOpenButton } from "@/components/GuestOpenButton";

export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("guest");

  const pass = await prisma.guestPass.findUnique({ where: { token } });
  if (!pass) notFound();

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="text-2xl font-semibold">{pass.label || t("title")}</h1>
      <p className="text-sm text-neutral-500">
        {t("remainingUses", { count: Math.max(pass.maxUses - pass.usedCount, 0) })}
        {" · "}
        {t("validUntil", { date: formatAppDateTime(pass.validTo) })}
      </p>
      <GuestOpenButton token={token} />
    </div>
  );
}
