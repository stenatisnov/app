import { getTranslations } from "next-intl/server";
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

const inputClass = "input !py-1 text-sm";
const buttonClass = "btn btn-secondary !px-3 !py-1.5 text-xs";
const primaryButtonClass = "btn btn-primary !px-3 !py-1.5 text-xs";

export default async function AdminPricingPage() {
  const t = await getTranslations("admin.pricing");
  const tBuy = await getTranslations("buy");
  const tCommon = await getTranslations("common");

  const personTypes = await prisma.personType.findMany({
    include: { packages: { orderBy: { priceCzk: "asc" } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>

      <section>
        <h2 className="text-lg font-medium">{t("personTypesTitle")}</h2>
        <form action={adminCreatePersonTypeAction} className="mt-3 flex gap-2">
          <input name="name" placeholder={t("personTypeName")} required className={inputClass} />
          <button className={primaryButtonClass}>{t("createPersonType")}</button>
        </form>

        <div className="mt-4 flex flex-col gap-2">
          {personTypes.map((pt) => (
            <div key={pt.id} className="flex items-center justify-between rounded-lg border border-[var(--line)] px-3 py-2">
              <span>
                {pt.name} {pt.isDefault && <span className="text-xs text-[var(--muted)]">({t("defaultBadge")})</span>}
              </span>
              <div className="flex gap-2">
                {!pt.isDefault && (
                  <>
                    <form action={adminSetDefaultPersonTypeAction}>
                      <input type="hidden" name="personTypeId" value={pt.id} />
                      <button className={buttonClass}>{t("setDefault")}</button>
                    </form>
                    <form action={adminDeletePersonTypeAction.bind(null, pt.id)}>
                      <ConfirmSubmitButton
                        confirmMessage={t("deletePersonTypeConfirm", { name: pt.name })}
                        className={`${buttonClass} text-[var(--danger)]`}
                      >
                        {tCommon("delete")}
                      </ConfirmSubmitButton>
                    </form>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">{t("packagesTitle")}</h2>
        <details className="mt-3 card">
          <summary className="cursor-pointer font-medium">{t("createPackage")}</summary>
          <form action={adminCreatePackageAction} className="mt-3 grid gap-2 sm:grid-cols-3">
            <select name="personTypeId" required className={inputClass}>
              {personTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>
            <select name="kind" defaultValue="CREDITS" className={inputClass}>
              <option value="CREDITS">{t("kindCredits")}</option>
              <option value="PERIOD">{t("kindPeriod")}</option>
            </select>
            <input name="priceCzk" type="number" min={0} placeholder={t("priceCzk")} required className={inputClass} />
            <input name="credits" type="number" min={1} placeholder={t("credits")} className={inputClass} />
            <select name="periodPreset" defaultValue="WEEK" className={inputClass}>
              <option value="WEEK">{tBuy("periodWeek")}</option>
              <option value="MONTH">{tBuy("periodMonth")}</option>
              <option value="YEAR">{tBuy("periodYear")}</option>
              <option value="CUSTOM">{tBuy("periodCustom")}</option>
            </select>
            <div className="flex gap-2">
              <input name="periodFrom" type="datetime-local" className={inputClass} title={t("periodFrom")} />
              <input name="periodTo" type="datetime-local" className={inputClass} title={t("periodTo")} />
            </div>
            <button className={`${primaryButtonClass} sm:col-span-3 w-fit`}>{t("createPackage")}</button>
          </form>
        </details>

        <div className="mt-4 flex flex-col gap-4">
          {personTypes.map((pt) => (
            <div key={pt.id}>
              <p className="text-sm font-medium text-[var(--muted)]">{pt.name}</p>
              <div className="mt-1 flex flex-col gap-1">
                {pt.packages.map((pkg) => (
                  <div key={pkg.id} className="flex items-center justify-between rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
                    <span>
                      {pkg.kind === "CREDITS" ? tBuy("creditsPackage", { count: pkg.credits }) : tBuy(periodLabelKey(pkg.periodPreset))}
                      {" — "}
                      {tBuy("priceLabel", { price: pkg.priceCzk })}
                    </span>
                    <form action={adminDeletePackageAction.bind(null, pkg.id)}>
                      <ConfirmSubmitButton confirmMessage={t("deletePackageConfirm")} className="text-[var(--danger)]">
                        {tCommon("delete")}
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                ))}
                {pt.packages.length === 0 && <p className="text-sm text-[var(--muted)]">—</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
