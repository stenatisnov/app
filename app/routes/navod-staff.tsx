import type { Route } from "./+types/navod-staff";
import { requireStaffOrAbove } from "@/lib/session.server";
import { withLoadContext } from "@/lib/request-context.server";
import { useTranslations } from "@/i18n/translations";
import { GuideStep as Step, GuidePill as Pill } from "@/components/GuideStep";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  return withLoadContext(context, async () => {
    await requireStaffOrAbove(request, params.locale!);
    return null;
  });
}

export default function StaffGuidePage() {
  const t = useTranslations("guideStaff");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold tracking-wide text-[var(--brand)] uppercase">{t("eyebrow")}</p>
        <h1 className="page-title text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("lede")}</p>
      </div>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-medium text-[var(--ink)]">{t("section1Title")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("section1Purpose")}</p>
        </div>
        <Step number={1} title={t("step1Title")} body={t("step1Body")} />
        <Step number={2} title={t("step2Title")} body={t("step2Body")} />
      </section>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-medium text-[var(--ink)]">{t("section2Title")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("section2Purpose")}</p>
        </div>
        <Step number={1} title={t("step3Title")}>
          <p className="mt-1 text-sm text-[var(--ink)]">{t("step3Intro")}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-[var(--ink)]">
            <li>
              <Pill>{t("methodScan")}</Pill> — {t("methodScanBody")}
            </li>
            <li>
              <Pill>{t("methodEmail")}</Pill> — {t("methodEmailBody")}
            </li>
            <li>
              <Pill>{t("methodCode")}</Pill> — {t("methodCodeBody")}
            </li>
          </ul>
        </Step>
        <Step number={2} title={t("step4Title")} body={t("step4Body")} />
      </section>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-medium text-[var(--ink)]">{t("section3Title")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("section3Purpose")}</p>
        </div>
        <Step number={1} title={t("step5Title")}>
          <p className="mt-1 text-sm text-[var(--ink)]">{t("step5Intro")}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-[var(--ink)]">
            <li>
              <strong className="text-[var(--ink)]">{t("paymentListUnmatchedTitle")}</strong> — {t("paymentListUnmatchedBody")}
            </li>
            <li>
              <strong className="text-[var(--ink)]">{t("paymentListUnpaidTitle")}</strong> — {t("paymentListUnpaidBody")}
            </li>
            <li>
              <strong className="text-[var(--ink)]">{t("paymentListUnmatchedPassTitle")}</strong> —{" "}
              {t("paymentListUnmatchedPassBody")}
            </li>
            <li>
              <strong className="text-[var(--ink)]">{t("paymentListPaidTitle")}</strong> — {t("paymentListPaidBody")}
            </li>
            <li>
              <strong className="text-[var(--ink)]">{t("paymentListEntriesTitle")}</strong> — {t("paymentListEntriesBody")}
            </li>
          </ul>
          <div className="mt-2 rounded-lg border-l-2 border-[var(--brand)] bg-[var(--bg-accent)] px-3 py-2 text-sm text-[var(--ink)]">
            <strong className="text-[var(--brand-dark)]">{t("tipConfirmTitle")}</strong> {t("tipConfirmBody")}
          </div>
        </Step>
      </section>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-medium text-[var(--ink)]">{t("section4Title")}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("section4Purpose")}</p>
        </div>
        <Step number={1} title={t("step6Title")} body={t("step6Body")} />
        <Step number={2} title={t("step7Title")} body={t("step7Body")}>
          <div className="mt-2 rounded-lg border-l-2 border-[var(--brand)] bg-[var(--bg-accent)] px-3 py-2 text-sm text-[var(--ink)]">
            <strong className="text-[var(--brand-dark)]">{t("tipMinorTitle")}</strong> {t("tipMinorBody")}
          </div>
        </Step>
      </section>
    </div>
  );
}
