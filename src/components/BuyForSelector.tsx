import { useState } from "react";
import { useTranslations } from "@/i18n/translations";
import { BuyPackages, type BuyablePackage } from "./BuyPackages";

export type Buyer = {
  /** "self" for the logged-in member, otherwise the dependent's id. */
  key: string;
  label: string;
  dependentId?: string;
  packages: BuyablePackage[];
};

export function BuyForSelector({ buyers, gopayEnabled }: { buyers: Buyer[]; gopayEnabled: boolean }) {
  const t = useTranslations("buy");
  const [activeKey, setActiveKey] = useState(buyers[0]?.key);
  const active = buyers.find((b) => b.key === activeKey) ?? buyers[0];

  if (buyers.length <= 1) {
    return <BuyPackages packages={active?.packages ?? []} gopayEnabled={gopayEnabled} dependentId={active?.dependentId} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <span className="self-center text-sm text-[var(--muted)]">{t("forWhom")}:</span>
        {buyers.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setActiveKey(b.key)}
            className={`btn !px-3 !py-1.5 text-sm ${b.key === active?.key ? "btn-primary" : "btn-secondary"}`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <BuyPackages packages={active?.packages ?? []} gopayEnabled={gopayEnabled} dependentId={active?.dependentId} />
    </div>
  );
}
