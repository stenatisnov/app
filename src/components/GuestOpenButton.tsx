"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { openGuestGateAction } from "@/app/actions";
import { StatusBanner } from "./StatusBanner";

type Result = Awaited<ReturnType<typeof openGuestGateAction>>;

export function GuestOpenButton({ token }: { token: string }) {
  const t = useTranslations("guest");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  function handleClick() {
    startTransition(async () => {
      setResult(await openGuestGateAction(token));
    });
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || (result?.ok === false && result.code === "USED_UP")}
        className="w-full max-w-xs rounded-2xl bg-brand px-8 py-6 text-xl font-semibold text-white shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? t("opening") : t("openButton")}
      </button>

      {result && !result.ok && (
        <StatusBanner tone="danger">
          {t.has(`errors.${result.code}`) ? t(`errors.${result.code}` as Parameters<typeof t>[0]) : result.message}
        </StatusBanner>
      )}
      {result?.ok && <StatusBanner tone="info">{t("remainingUses", { count: result.creditsLeft })}</StatusBanner>}
    </div>
  );
}
