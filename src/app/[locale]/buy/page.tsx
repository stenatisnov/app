import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { periodLabelKey } from "@/lib/access-pass";
import { getGoPaySettings } from "@/lib/settings";
import { PackageKind } from "@prisma/client";
import type { BuyablePackage } from "@/components/BuyPackages";
import { BuyForSelector, type Buyer } from "@/components/BuyForSelector";

export default async function BuyPage() {
  const session = await requireSession();
  const t = await getTranslations("buy");

  const [user, dependents, gopaySettings] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id } }),
    prisma.dependent.findMany({ where: { parentUserId: session.user.id }, orderBy: { createdAt: "asc" } }),
    getGoPaySettings(),
  ]);

  const personTypeIds = [
    ...(user?.personTypeId ? [user.personTypeId] : []),
    ...dependents.map((d) => d.personTypeId).filter((id): id is string => Boolean(id)),
  ];
  const packages = personTypeIds.length
    ? await prisma.pricePackage.findMany({
        where: { personTypeId: { in: personTypeIds }, active: true },
        orderBy: { priceCzk: "asc" },
      })
    : [];

  function toBuyable(pkg: (typeof packages)[number]): BuyablePackage {
    return {
      id: pkg.id,
      kind: pkg.kind,
      credits: pkg.credits,
      priceCzk: pkg.priceCzk,
      periodLabelKey: periodLabelKey(pkg.periodPreset),
    };
  }

  const buyers: Buyer[] = [
    {
      key: "self",
      label: t("forSelf"),
      packages: packages.filter((pkg) => pkg.personTypeId === user?.personTypeId).map(toBuyable),
    },
    // Dependents are credits-only in v1 — never offer a PERIOD pass "for" one.
    ...dependents.map((dep) => ({
      key: dep.id,
      label: dep.name,
      dependentId: dep.id,
      packages: packages
        .filter((pkg) => pkg.personTypeId === dep.personTypeId && pkg.kind === PackageKind.CREDITS)
        .map(toBuyable),
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--ink)]">{t("paymentTimingHint")}</p>
      </div>
      <BuyForSelector buyers={buyers} gopayEnabled={gopaySettings.enabled} />
    </div>
  );
}
