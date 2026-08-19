import type { ReactNode } from "react";
import { useTranslations, Trans } from "@/i18n/translations";
import { Link } from "@/i18n/navigation";
import { StatusBanner } from "@/components/StatusBanner";
import { GuideStep as Step, GuidePill as Pill } from "@/components/GuideStep";

export default function GuidePage() {
  const t = useTranslations("guide");
  const tBanners = useTranslations("banners");

  const statusItems: { tone: "danger" | "warning" | "info"; msg: ReactNode; explain: string }[] = [
    { tone: "danger", msg: tBanners("suspended"), explain: t("explainSuspended") },
    {
      tone: "warning",
      msg: (
        <Trans
          t={tBanners}
          i18nKey="noCredits"
          components={{ a: <Link href="/buy" className="font-semibold underline" /> }}
        />
      ),
      explain: t("explainNoCredits"),
    },
    { tone: "warning", msg: tBanners("outsideHours"), explain: t("explainOutsideHours") },
    { tone: "info", msg: tBanners("cooldown"), explain: t("explainCooldown") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold tracking-wide text-[var(--brand)] uppercase">{t("eyebrow")}</p>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("lede")}</p>
      </div>

      <section className="card flex flex-col gap-4">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("section1Title")}</h2>
        <Step number={1} title={t("step1Title")}>
          <p className="mt-1 text-sm text-[var(--ink)]">{t("step1Body")}</p>
          <div className="mt-2 rounded-lg border-l-2 border-[var(--brand)] bg-[var(--bg-accent)] px-3 py-2 text-sm text-[var(--ink)]">
            <strong className="text-[var(--brand-dark)]">{t("googleTipTitle")}</strong> {t("googleTipBody")}
          </div>
        </Step>
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("section2Title")}</h2>
        <Step number={1} title={t("step2Title")} body={t("step2Body")} />
        <Step number={2} title={t("step3Title")}>
          <p className="mt-1 text-sm text-[var(--ink)]">{t("step3Intro")}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-[var(--ink)]">
            <li>
              <Pill>{t("optionProve")}</Pill> — {t("optionProveBody")}
            </li>
            <li>
              <Pill>{t("optionOpen")}</Pill> — {t("optionOpenBody")}
            </li>
            <li>
              <Pill>{t("optionCancel")}</Pill> — {t("optionCancelBody")}
            </li>
          </ul>
        </Step>
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("section3Title")}</h2>
        <Step number={1} title={t("step4Title")}>
          <p className="mt-1 text-sm text-[var(--ink)]">{t("step4Body")}</p>
          <div className="mt-2 rounded-lg border-l-2 border-[var(--brand)] bg-[var(--bg-accent)] px-3 py-2 text-sm text-[var(--ink)]">
            <strong className="text-[var(--brand-dark)]">{t("tipNoPackagesTitle")}</strong> {t("tipNoPackagesBody")}
          </div>
        </Step>
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("sectionDependentsTitle")}</h2>
        <Step number={1} title={t("stepDependents1Title")} body={t("stepDependents1Body")} />
        <Step number={2} title={t("stepDependents2Title")} body={t("stepDependents2Body")} />
        <Step number={3} title={t("stepDependents3Title")} body={t("stepDependents3Body")} />
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("section4Title")}</h2>
        <Step number={1} title={t("step6Title")} body={t("step6Body")} />
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("section5Title")}</h2>
        {statusItems.map((item) => (
          <div key={item.explain} className="flex flex-col gap-1">
            <StatusBanner tone={item.tone}>{item.msg}</StatusBanner>
            <p className="px-1 text-xs text-[var(--muted)]">{item.explain}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
