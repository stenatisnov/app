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
import { BuyPackages, type BuyablePackage, type PlatbaPerson } from "@/components/BuyPackages";
import { createPaymentOrderAction, createPlatbaOrderAction } from "@/lib/actions/payments";

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

    function creditsOptionsFor(personTypeId: string | null) {
      return packages
        .filter((pkg) => pkg.personTypeId === personTypeId && pkg.kind === PackageKind.CREDITS)
        .map((pkg) => ({ id: pkg.id, credits: pkg.credits, priceCzk: pkg.priceCzk }));
    }

    // Platba (unified multi-person credits purchase) — the buyer and every
    // Doprovod, each picking any of their own active CREDITS packages.
    // Anyone (self included) whose category has none simply doesn't appear.
    const platbaPeople: PlatbaPerson[] = [
      { recipientId: "self", label: t("forSelf"), creditsOptions: creditsOptionsFor(user?.personTypeId ?? null) },
      ...dependents.map((dep) => ({ recipientId: dep.id, label: dep.name, creditsOptions: creditsOptionsFor(dep.personTypeId) })),
    ].filter((p) => p.creditsOptions.length > 0);

    // PERIOD and FAMILY stay self-only, exactly as before.
    const periodPackages = packages.filter((pkg) => pkg.personTypeId === user?.personTypeId && pkg.kind === PackageKind.PERIOD).map(toBuyable);
    const familyPackage = packages.find((pkg) => pkg.personTypeId === user?.personTypeId && pkg.kind === PackageKind.FAMILY);
    const familyCompanions = dependents.map((dep) => ({
      id: dep.id,
      name: dep.name,
      isChildCategory: dep.personType?.isChildCategory ?? false,
    }));

    // Only worth offering when the buyer's companions can actually fill a
    // combination better than buying credits separately: 1 adult + at least
    // 2 children, or (with no eligible adult companion) all 3 children.
    const availableAdults = familyCompanions.filter((c) => !c.isChildCategory).length;
    const availableChildren = familyCompanions.filter((c) => c.isChildCategory).length;
    const familyMakesSense = (availableAdults >= 1 && availableChildren >= 2) || availableChildren >= 3;

    return data({
      platbaPeople,
      periodPackages,
      familyPackage: familyPackage && familyMakesSense ? toBuyable(familyPackage) : null,
      familyCompanions,
      gopayEnabled: gopaySettings.enabled,
    });
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "createPaymentOrder":
        return createPaymentOrderAction(formData, request);
      case "createPlatbaOrder":
        return createPlatbaOrderAction(formData, request);
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function BuyPage({ loaderData }: Route.ComponentProps) {
  const t = useTranslations("buy");
  const { platbaPeople, periodPackages, familyPackage, familyCompanions, gopayEnabled } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--ink)]">{t("paymentTimingHint")}</p>
      </div>
      <BuyPackages
        platbaPeople={platbaPeople}
        periodPackages={periodPackages}
        familyPackage={familyPackage}
        familyCompanions={familyCompanions}
        gopayEnabled={gopayEnabled}
      />
    </div>
  );
}
