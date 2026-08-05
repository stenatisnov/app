"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminCheckGateStatusAction } from "@/app/actions";
import type { GateStatus } from "@/lib/lock";

const TONE = {
  ok: "bg-[var(--ok-bg)] text-[var(--ok)]",
  danger: "bg-[var(--danger-bg)] text-[var(--danger)]",
  muted: "bg-[var(--bg-accent)] text-[var(--muted)]",
} as const;

function Pill({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${TONE[tone]}`}>{children}</span>;
}

export function GateStatusCard({ initialStatus }: { initialStatus: GateStatus }) {
  const t = useTranslations("admin.settings");
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      setStatus(await adminCheckGateStatusAction());
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-[var(--line)] p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={status.online ? "ok" : "danger"}>
          {status.online ? t("gateOnline") : t("gateOffline")}
        </Pill>
        <Pill tone={status.relayState === "on" ? "ok" : status.relayState === "off" ? "muted" : "danger"}>
          {t("gateRelay")}:{" "}
          {status.relayState === "on" ? t("gateRelayOn") : status.relayState === "off" ? t("gateRelayOff") : t("gateUnknown")}
        </Pill>
        <Pill tone={status.doorState === "open" ? "danger" : status.doorState === "closed" ? "ok" : "muted"}>
          {t("gateDoor")}:{" "}
          {status.doorState === "open"
            ? t("gateDoorOpen")
            : status.doorState === "closed"
              ? t("gateDoorClosed")
              : status.doorState === "not_monitored"
                ? t("gateDoorNotMonitored")
                : t("gateUnknown")}
        </Pill>
      </div>
      {status.error && <p className="text-xs text-[var(--danger)]">{status.error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={refresh} disabled={pending} className="btn btn-secondary w-fit !px-3 !py-1.5 text-xs">
          {pending ? "…" : t("gateStatusRefresh")}
        </button>
        <p className="text-xs text-[var(--muted)]">
          {t("gateStatusCheckedAt", { date: new Date(status.checkedAt).toLocaleTimeString() })}
        </p>
      </div>
    </div>
  );
}
