import { getTranslations } from "next-intl/server";
import { GuideStep as Step, GuidePill as Pill } from "@/components/GuideStep";
import { requireStaffOrAbove } from "@/lib/session";

export default async function StaffGuidePage() {
  await requireStaffOrAbove();
  const t = await getTranslations("guideStaff");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold tracking-wide text-[var(--brand)] uppercase">{t("eyebrow")}</p>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("lede")}</p>
      </div>

      <section className="card flex flex-col gap-4">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("section1Title")}</h2>
        <Step number={1} title={t("step1Title")} body={t("step1Body")} />
        <Step number={2} title={t("step2Title")} body={t("step2Body")} />
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("section2Title")}</h2>
        <Step number={1} title={t("step3Title")}>
          <p className="mt-1 text-sm text-[var(--ink)]">{t("step3Intro")}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-[var(--ink)]">
            <li>
              <Pill>{t("methodEmail")}</Pill> — {t("methodEmailBody")}
            </li>
            <li>
              <Pill>{t("methodCode")}</Pill> — {t("methodCodeBody")}
            </li>
            <li>
              <Pill>{t("methodScan")}</Pill> — {t("methodScanBody")}
            </li>
          </ul>
        </Step>
        <Step number={2} title={t("step4Title")} body={t("step4Body")} />
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("section3Title")}</h2>
        <Step number={1} title={t("step5Title")} body={t("step5Body")}>
          <div className="mt-2 rounded-lg border-l-2 border-[var(--brand)] bg-[var(--bg-accent)] px-3 py-2 text-sm text-[var(--ink)]">
            <strong className="text-[var(--brand-dark)]">{t("tipConfirmTitle")}</strong> {t("tipConfirmBody")}
          </div>
        </Step>
      </section>
    </div>
  );
}
