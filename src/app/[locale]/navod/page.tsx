import { getTranslations } from "next-intl/server";
import { StatusBanner } from "@/components/StatusBanner";
import { Link } from "@/i18n/navigation";

function Step({
  number,
  title,
  body,
  children,
}: {
  number: number;
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-[var(--brand)] bg-[var(--bg-accent)] text-sm font-bold text-[var(--brand-dark)]">
        {number}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-[var(--ink)]">{title}</h3>
        {body && <p className="mt-1 text-sm text-[var(--ink)]">{body}</p>}
        {children}
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-md border border-[var(--brand)] bg-[var(--bg-accent)] px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-[var(--brand-dark)]">
      {children}
    </span>
  );
}

export default async function GuidePage() {
  const [t, tBanners] = await Promise.all([getTranslations("guide"), getTranslations("banners")]);

  const statusItems: { tone: "danger" | "warning" | "info"; msg: React.ReactNode; explain: string }[] = [
    { tone: "danger", msg: tBanners("suspended"), explain: t("explainSuspended") },
    {
      tone: "warning",
      msg: tBanners.rich("noCredits", {
        link: (chunks) => (
          <Link href="/buy" className="font-semibold underline">
            {chunks}
          </Link>
        ),
      }),
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
        <Step number={1} title={t("step1Title")} body={t("step1Body")} />
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="text-lg font-medium text-[var(--ink)]">{t("section2Title")}</h2>
        <Step number={1} title={t("step2Title")} body={t("step2Body")} />
        <Step number={2} title={t("step3Title")}>
          <p className="mt-1 text-sm text-[var(--ink)]">{t("step3Intro")}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-[var(--ink)]">
            <li>
              <Pill>{t("optionOpen")}</Pill> — {t("optionOpenBody")}
            </li>
            <li>
              <Pill>{t("optionProve")}</Pill> — {t("optionProveBody")}
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
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-[var(--ink)]">
            <li>
              <Pill>{t("methodQr")}</Pill> — {t("methodQrBody")}
            </li>
            <li>
              <Pill>{t("methodGopay")}</Pill> — {t("methodGopayBody")}
            </li>
          </ul>
          <div className="mt-2 rounded-lg border-l-2 border-[var(--brand)] bg-[var(--bg-accent)] px-3 py-2 text-sm text-[var(--ink)]">
            <strong className="text-[var(--brand-dark)]">{t("tipNoPackagesTitle")}</strong> {t("tipNoPackagesBody")}
          </div>
        </Step>
        <Step number={2} title={t("step5Title")} body={t("step5Body")} />
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
