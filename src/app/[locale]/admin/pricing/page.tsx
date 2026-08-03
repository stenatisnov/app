import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import {
  adminCreatePackageAction,
  adminCreatePersonTypeAction,
  adminDeletePackageAction,
  adminDeletePersonTypeAction,
  adminSetDefaultPersonTypeAction,
} from "@/app/actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { periodLabelKey } from "@/lib/access-pass";
import { formatAppDateTime } from "@/lib/time";
import type { PackageKind, PeriodPreset } from "@prisma/client";

type Package = {
  id: string;
  kind: PackageKind;
  credits: number;
  priceCzk: number;
  periodPreset: PeriodPreset | null;
  periodFrom: Date | null;
  periodTo: Date | null;
};

export default async function AdminPricingPage() {
  const [t, tBuy, tCommon, locale] = await Promise.all([
    getTranslations("admin.pricing"),
    getTranslations("buy"),
    getTranslations("common"),
    getLocale(),
  ]);
  const dateLocale = locale === "en" ? "en-GB" : "cs-CZ";

  const personTypes = await prisma.personType.findMany({
    include: {
      packages: { orderBy: [{ kind: "asc" }, { credits: "asc" }, { priceCzk: "asc" }] },
      _count: { select: { users: true } },
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  function packageLabel(pkg: Package) {
    if (pkg.kind === "PERIOD") {
      const period =
        pkg.periodPreset === "CUSTOM" && pkg.periodFrom && pkg.periodTo
          ? `${formatAppDateTime(pkg.periodFrom, dateLocale)} → ${formatAppDateTime(pkg.periodTo, dateLocale)}`
          : tBuy(periodLabelKey(pkg.periodPreset));
      return t("packagePeriodLabel", { period, price: pkg.priceCzk });
    }
    return `${tBuy("creditsPackage", { count: pkg.credits })} — ${tBuy("priceLabel", { price: pkg.priceCzk })}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>

      <form action={adminCreatePersonTypeAction} className="card flex flex-wrap items-end gap-3">
        <label className="min-w-[14rem] flex-1 text-sm text-[var(--ink)]">
          {t("newCategoryLabel")}
          <input className="input mt-1" name="name" placeholder={t("categoryPlaceholder")} required />
        </label>
        <button className="btn btn-primary" type="submit">
          {t("addCategory")}
        </button>
      </form>

      <p className="text-sm text-[var(--muted)]">{t("defaultCategoryHint")}</p>

      {personTypes.map((pt) => (
        <div key={pt.id} className="card flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-[var(--ink)]">{pt.name}</h2>
                {pt.isDefault && <span className="banner banner-ok !py-1 text-sm">{t("defaultBadge")}</span>}
              </div>
              <p className="text-sm text-[var(--muted)]">{t("usersInCategory", { count: pt._count.users })}</p>
            </div>
            {!pt.isDefault && (
              <div className="flex flex-wrap gap-2">
                <form action={adminSetDefaultPersonTypeAction}>
                  <input type="hidden" name="personTypeId" value={pt.id} />
                  <button className="btn btn-secondary !py-2" type="submit">
                    {t("setDefault")}
                  </button>
                </form>
                <form action={adminDeletePersonTypeAction.bind(null, pt.id)}>
                  <ConfirmSubmitButton
                    confirmMessage={
                      pt._count.users > 0
                        ? t("deleteCategoryConfirm", {
                            name: pt.name,
                            extra: t("deleteCategoryUsersExtra", { count: pt._count.users }),
                          })
                        : t("deleteCategoryConfirm", { name: pt.name, extra: "" })
                    }
                    className="btn btn-danger !py-2"
                  >
                    {t("removeCategory")}
                  </ConfirmSubmitButton>
                </form>
              </div>
            )}
          </div>

          <ul className="flex flex-col gap-2 text-sm">
            {pt.packages.length === 0 && <li className="text-[var(--muted)]">{t("noPackagesYet")}</li>}
            {pt.packages.map((pkg) => (
              <li
                key={pkg.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white/60 px-3 py-2"
              >
                <span className="text-[var(--ink)]">{packageLabel(pkg)}</span>
                <form action={adminDeletePackageAction.bind(null, pkg.id)}>
                  <ConfirmSubmitButton
                    confirmMessage={t("deletePackageConfirm", { label: packageLabel(pkg) })}
                    className="btn btn-danger !px-2 !py-1 text-xs"
                  >
                    {tCommon("delete")}
                  </ConfirmSubmitButton>
                </form>
              </li>
            ))}
          </ul>

          <form
            action={adminCreatePackageAction}
            className="flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-3"
          >
            <input type="hidden" name="personTypeId" value={pt.id} />
            <input type="hidden" name="kind" value="CREDITS" />
            <span className="w-full text-sm font-medium text-[var(--ink)]">{t("creditPackageTitle")}</span>
            <input
              className="input max-w-[8rem]"
              name="credits"
              type="number"
              min={1}
              placeholder={t("entriesPlaceholder")}
              required
            />
            <input
              className="input max-w-[8rem]"
              name="priceCzk"
              type="number"
              min={0}
              placeholder={t("pricePlaceholder")}
              required
            />
            <button className="btn btn-secondary" type="submit">
              {t("addCreditPackage")}
            </button>
          </form>

          <form
            action={adminCreatePackageAction}
            className="grid gap-2 border-t border-[var(--line)] pt-3 sm:grid-cols-2 [&>*]:min-w-0"
          >
            <input type="hidden" name="personTypeId" value={pt.id} />
            <input type="hidden" name="kind" value="PERIOD" />
            <span className="text-sm font-medium text-[var(--ink)] sm:col-span-2">{t("periodPackageTitle")}</span>
            <label className="text-sm text-[var(--ink)]">
              {t("validityPeriod")}
              <select className="input mt-1" name="periodPreset" defaultValue="WEEK">
                <option value="WEEK">{t("weekFromPurchase")}</option>
                <option value="MONTH">{t("monthFromPurchase")}</option>
                <option value="YEAR">{t("yearFromPurchase")}</option>
                <option value="CUSTOM">{t("customFromTo")}</option>
              </select>
            </label>
            <label className="text-sm text-[var(--ink)]">
              {t("priceCzk")}
              <input className="input mt-1" name="priceCzk" type="number" min={0} required />
            </label>
            <label className="text-sm text-[var(--ink)]">
              {t("periodFrom")}
              <input className="input mt-1" name="periodFrom" type="datetime-local" />
            </label>
            <label className="text-sm text-[var(--ink)]">
              {t("periodTo")}
              <input className="input mt-1" name="periodTo" type="datetime-local" />
            </label>
            <button className="btn btn-secondary sm:col-span-2" type="submit">
              {t("addPeriodPackage")}
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
