"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { resendVerificationEmailAction, type ResendVerificationResult } from "@/app/actions";

export function ResendVerificationEmailButton() {
  const t = useTranslations("dashboard");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ResendVerificationResult | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      setResult(await resendVerificationEmailAction());
    });
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1.5">
      <button type="button" onClick={handleClick} disabled={pending} className="text-sm font-semibold underline">
        {pending ? t("resendVerificationSending") : t("resendVerificationButton")}
      </button>
      {result && (
        <p className="text-sm">{result.ok ? t("resendVerificationSuccess") : result.message}</p>
      )}
    </div>
  );
}
