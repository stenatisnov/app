import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { periodLabelKey } from "@/lib/access-pass";
import { BuyPackages, type BuyablePackage } from "@/components/BuyPackages";

export default async function BuyPage() {
  const session = await requireSession();
  const t = await getTranslations("buy");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const packages = user?.personTypeId
    ? await prisma.pricePackage.findMany({
        where: { personTypeId: user.personTypeId, active: true },
        orderBy: { priceCzk: "asc" },
      })
    : [];

  const buyable: BuyablePackage[] = packages.map((pkg) => ({
    id: pkg.id,
    kind: pkg.kind,
    credits: pkg.credits,
    priceCzk: pkg.priceCzk,
    periodLabelKey: periodLabelKey(pkg.periodPreset),
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
      <BuyPackages packages={buyable} />
    </div>
  );
}
