import { PackageKind } from "@prisma/client";
import { data } from "react-router";
import type { Route } from "./+types/buy";
import { getPrisma } from "@/lib/db";
import { requireSession } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";
import { periodLabelKey } from "@/lib/access-pass";
import { getGoPaySettings } from "@/lib/settings";
import { defaultLocale, isLocale } from "@/i18n/routing";
import { useTranslations } from "@/i18n/translations";
import { getFixedT } from "@/i18n/i18n.server";
import type { BuyablePackage } from "@/components/BuyPackages";
import { BuyForSelector, type Buyer } from "@/components/BuyForSelector";
import { createPaymentOrderAction } from "@/lib/actions/payments";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const session = await requireSession(request, params.locale!);
    const prisma = await getPrisma();
    const t = getFixedT(isLocale(params.locale) ? params.locale : defaultLocale, "buy");

    const [user, dependents, gopaySettings] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.id } }),
      prisma.dependent.findMany({
        where: { parentUserId: session.id },
        include: { personType: true },
        orderBy: { createdAt: "asc" },
      }),
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
        // A FAMILY package (only ever offered for self, see the dependent
        // filter below) lets the buyer pick companions from their own
        // Doprovod — classified adult/child via each one's current category.
        familyCompanions: dependents.map((dep) => ({
          id: dep.id,
          name: dep.name,
          isChildCategory: dep.personType?.isChildCategory ?? false,
        })),
        // Bulk group payment attaches to the buyer's own "1 vstup" CREDITS
        // package — a Doprovod only appears here if their own category has
        // one too, since that's the price they'd be charged.
        bulkCompanions: dependents
          .map((dep) => {
            const pkg = packages.find((p) => p.personTypeId === dep.personTypeId && p.kind === PackageKind.CREDITS && p.credits === 1);
            return pkg ? { id: dep.id, name: dep.name, unitPriceCzk: pkg.priceCzk } : null;
          })
          .filter((c) => c !== null),
      },
      ...dependents.map((dep) => ({
        key: dep.id,
        label: dep.name,
        dependentId: dep.id,
        packages: packages
          .filter((pkg) => pkg.personTypeId === dep.personTypeId && pkg.kind === PackageKind.CREDITS)
          .map(toBuyable),
      })),
    ];

    return data({ buyers, gopayEnabled: gopaySettings.enabled });
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "createPaymentOrder":
        return createPaymentOrderAction(formData, request);
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function BuyPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("buy");
  const { buyers, gopayEnabled } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--ink)]">{t("paymentTimingHint")}</p>
      </div>
      <BuyForSelector buyers={buyers} gopayEnabled={gopayEnabled} />
    </div>
  );
}
