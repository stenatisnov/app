"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminRunFioPollAction, type ManualFioPollResult } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";

export function FioPollButton() {
  const t = useTranslations("admin.settings");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ManualFioPollResult | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      setResult(await adminRunFioPollAction());
    });
  }

  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      <button type="button" onClick={handleClick} disabled={pending} className="btn btn-secondary !px-3 !py-1.5 text-xs">
        {pending ? t("fioPollRunning") : t("fioPollNowButton")}
      </button>
      {result &&
        (result.ok ? (
          <StatusBanner>{t("fioPollSuccess", { count: result.matchedCount })}</StatusBanner>
        ) : (
          <StatusBanner tone="danger">{result.message}</StatusBanner>
        ))}
    </div>
  );
}
