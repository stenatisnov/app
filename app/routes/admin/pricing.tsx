import type { PackageKind, PeriodPreset } from "@prisma/client";
import { Form, data } from "react-router";
import type { Route } from "./+types/pricing";
import { getPrisma } from "@/lib/db.server";
import { withLoadContext } from "@/lib/request-context.server";
import {
  adminCreatePackageAction,
  adminCreatePersonTypeAction,
  adminDeletePackageAction,
  adminDeletePersonTypeAction,
  adminSetDefaultPersonTypeAction,
  adminSetPersonTypeVisibilityAction,
} from "@/lib/actions/admin-pricing";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { periodLabelKey } from "@/lib/access-pass";
import { formatAppDateTime } from "@/lib/time";
import { useTranslations } from "@/i18n/translations";

type PackageRow = {
  id: string;
  kind: PackageKind;
  credits: number;
  priceCzk: number;
  periodPreset: PeriodPreset | null;
  periodFrom: Date | null;
  periodTo: Date | null;
};

export async function loader({ context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    const prisma = await getPrisma();
    const personTypes = await prisma.personType.findMany({
      include: {
        packages: { orderBy: [{ kind: "asc" }, { credits: "asc" }, { priceCzk: "asc" }] },
        _count: { select: { users: true } },
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    return data({ personTypes });
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  return withLoadContext(context, async () => {
    const formData = await request.formData();
    const intent = String(formData.get("intent"));
    switch (intent) {
      case "createPersonType":
        return adminCreatePersonTypeAction(formData);
      case "setPersonTypeVisibility":
        return adminSetPersonTypeVisibilityAction(formData);
      case "setDefaultPersonType":
        return adminSetDefaultPersonTypeAction(formData);
      case "deletePersonType":
        return adminDeletePersonTypeAction(String(formData.get("personTypeId") || ""));
      case "createPackage":
        return adminCreatePackageAction(formData);
      case "deletePackage":
        return adminDeletePackageAction(String(formData.get("packageId") || ""));
      default:
        throw data(null, { status: 400 });
    }
  });
}

export default function AdminPricingPage({ loaderData, params }: Route.ComponentProps) {
  const t = useTranslations("admin");
  const tBuy = useTranslations("buy");
  const tCommon = useTranslations("common");
  const dateLocale = params.locale === "en" ? "en-GB" : "cs-CZ";
  const { personTypes } = loaderData;

  function packageLabel(pkg: PackageRow) {
    if (pkg.kind === "PERIOD") {
      const period =
        pkg.periodPreset === "CUSTOM" && pkg.periodFrom && pkg.periodTo
          ? `${formatAppDateTime(pkg.periodFrom, dateLocale)} → ${formatAppDateTime(pkg.periodTo, dateLocale)}`
          : tBuy(periodLabelKey(pkg.periodPreset));
      return t("pricing.packagePeriodLabel", { period, price: pkg.priceCzk });
    }
    return `${tBuy("creditsPackage", { count: pkg.credits })} — ${tBuy("priceLabel", { price: pkg.priceCzk })}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("pricing.title")}</h1>

      <Form method="post" className="card flex flex-wrap items-end gap-3">
        <input type="hidden" name="intent" value="createPersonType" />
        <label className="min-w-[14rem] flex-1 text-sm text-[var(--ink)]">
          {t("pricing.newCategoryLabel")}
          <input className="input mt-1" name="name" placeholder={t("pricing.categoryPlaceholder")} required />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-[var(--ink)]">
          <input type="checkbox" name="visibleToUsers" defaultChecked />
          {t("pricing.visibleToUsersLabel")}
        </label>
        <button className="btn btn-primary" type="submit">
          {t("pricing.addCategory")}
        </button>
      </Form>

      <p className="text-sm text-[var(--muted)]">{t("pricing.defaultCategoryHint")}</p>
      <p className="text-sm text-[var(--muted)]">{t("pricing.visibleToUsersHint")}</p>

      {personTypes.map((pt) => (
        <div key={pt.id} className="card flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-[var(--ink)]">{pt.name}</h2>
                {pt.isDefault && <span className="banner banner-ok !py-1 text-sm">{t("pricing.defaultBadge")}</span>}
              </div>
              <p className="text-sm text-[var(--muted)]">{t("pricing.usersInCategory", { count: pt._count.users })}</p>
              <Form method="post" className="mt-1 flex items-center gap-2">
                <input type="hidden" name="intent" value="setPersonTypeVisibility" />
                <input type="hidden" name="personTypeId" value={pt.id} />
                <label className="flex items-center gap-1.5 text-sm text-[var(--ink)]">
                  <input type="checkbox" name="visibleToUsers" defaultChecked={pt.visibleToUsers} />
                  {t("pricing.visibleToUsersLabel")}
                </label>
                <button className="btn btn-secondary !px-2 !py-1 text-xs" type="submit">
                  {tCommon("save")}
                </button>
              </Form>
            </div>
            {!pt.isDefault && (
              <div className="flex flex-wrap gap-2">
                <Form method="post">
                  <input type="hidden" name="intent" value="setDefaultPersonType" />
                  <input type="hidden" name="personTypeId" value={pt.id} />
                  <button className="btn btn-secondary !py-2" type="submit">
                    {t("pricing.setDefault")}
                  </button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="intent" value="deletePersonType" />
                  <input type="hidden" name="personTypeId" value={pt.id} />
                  <ConfirmSubmitButton
                    confirmMessage={
                      pt._count.users > 0
                        ? t("pricing.deleteCategoryConfirm", {
                            name: pt.name,
                            extra: t("pricing.deleteCategoryUsersExtra", { count: pt._count.users }),
                          })
                        : t("pricing.deleteCategoryConfirm", { name: pt.name, extra: "" })
                    }
                    className="btn btn-danger !py-2"
                  >
                    {t("pricing.removeCategory")}
                  </ConfirmSubmitButton>
                </Form>
              </div>
            )}
          </div>

          <ul className="flex flex-col gap-2 text-sm">
            {pt.packages.length === 0 && <li className="text-[var(--muted)]">{t("pricing.noPackagesYet")}</li>}
            {pt.packages.map((pkg) => (
              <li
                key={pkg.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white/60 px-3 py-2"
              >
                <span className="text-[var(--ink)]">{packageLabel(pkg)}</span>
                <Form method="post">
                  <input type="hidden" name="intent" value="deletePackage" />
                  <input type="hidden" name="packageId" value={pkg.id} />
                  <ConfirmSubmitButton
                    confirmMessage={t("pricing.deletePackageConfirm", { label: packageLabel(pkg) })}
                    className="btn btn-danger !px-2 !py-1 text-xs"
                  >
                    {tCommon("delete")}
                  </ConfirmSubmitButton>
                </Form>
              </li>
            ))}
          </ul>

          <Form method="post" className="flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-3">
            <input type="hidden" name="intent" value="createPackage" />
            <input type="hidden" name="personTypeId" value={pt.id} />
            <input type="hidden" name="kind" value="CREDITS" />
            <span className="w-full text-sm font-medium text-[var(--ink)]">{t("pricing.creditPackageTitle")}</span>
            <input
              className="input max-w-[8rem]"
              name="credits"
              type="number"
              min={1}
              placeholder={t("pricing.entriesPlaceholder")}
              required
            />
            <input
              className="input max-w-[8rem]"
              name="priceCzk"
              type="number"
              min={0}
              placeholder={t("pricing.pricePlaceholder")}
              required
            />
            <button className="btn btn-secondary" type="submit">
              {t("pricing.addCreditPackage")}
            </button>
          </Form>

          <Form method="post" className="grid gap-2 border-t border-[var(--line)] pt-3 sm:grid-cols-2 [&>*]:min-w-0">
            <input type="hidden" name="intent" value="createPackage" />
            <input type="hidden" name="personTypeId" value={pt.id} />
            <input type="hidden" name="kind" value="PERIOD" />
            <span className="text-sm font-medium text-[var(--ink)] sm:col-span-2">{t("pricing.periodPackageTitle")}</span>
            <label className="text-sm text-[var(--ink)]">
              {t("pricing.validityPeriod")}
              <select className="input mt-1" name="periodPreset" defaultValue="WEEK">
                <option value="WEEK">{t("pricing.weekFromPurchase")}</option>
                <option value="MONTH">{t("pricing.monthFromPurchase")}</option>
                <option value="YEAR">{t("pricing.yearFromPurchase")}</option>
                <option value="CUSTOM">{t("pricing.customFromTo")}</option>
              </select>
            </label>
            <label className="text-sm text-[var(--ink)]">
              {t("pricing.priceCzk")}
              <input className="input mt-1" name="priceCzk" type="number" min={0} required />
            </label>
            <label className="text-sm text-[var(--ink)]">
              {t("pricing.periodFrom")}
              <input className="input mt-1" name="periodFrom" type="datetime-local" />
            </label>
            <label className="text-sm text-[var(--ink)]">
              {t("pricing.periodTo")}
              <input className="input mt-1" name="periodTo" type="datetime-local" />
            </label>
            <button className="btn btn-secondary sm:col-span-2" type="submit">
              {t("pricing.addPeriodPackage")}
            </button>
          </Form>
        </div>
      ))}
    </div>
  );
}
