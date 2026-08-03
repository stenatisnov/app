"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { openGateAction } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";

type Result = Awaited<ReturnType<typeof openGateAction>>;

export function OpenGateButton({ disabled = false }: { disabled?: boolean }) {
  const t = useTranslations("dashboard");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  function handleClick() {
    startTransition(async () => {
      const res = await openGateAction();
      setResult(res);
    });
  }

  return (
    <div className="gate-stack flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || pending}
        className="btn btn-open max-w-xs disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t("opening") : t("openButton")}
      </button>

      {result && !result.ok && (
        <StatusBanner tone="danger">
          {t.has(`errors.${result.code}`)
            ? t(`errors.${result.code}` as Parameters<typeof t>[0])
            : result.message}
        </StatusBanner>
      )}
      {result && result.ok && (
        <StatusBanner tone="info">{result.simulated ? t("openedSimulated") : t("openedSuccess")}</StatusBanner>
      )}
    </div>
  );
}
