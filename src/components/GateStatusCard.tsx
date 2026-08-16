import { useFetcher } from "react-router";
import { useTranslations } from "@/i18n/translations";
import type { adminCheckGateStatusAction } from "@/lib/actions/admin-settings";
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
  const t = useTranslations("admin");
  const fetcher = useFetcher<typeof adminCheckGateStatusAction>();
  const status = fetcher.data ?? initialStatus;
  const pending = fetcher.state !== "idle";

  function refresh() {
    const fd = new FormData();
    fd.set("intent", "checkGateStatus");
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-[var(--line)] p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={status.online ? "ok" : "danger"}>
          {status.online ? t("settings.gateOnline") : t("settings.gateOffline")}
        </Pill>
        <Pill tone={status.relayState === "on" ? "ok" : status.relayState === "off" ? "muted" : "danger"}>
          {t("settings.gateRelay")}:{" "}
          {status.relayState === "on"
            ? t("settings.gateRelayOn")
            : status.relayState === "off"
              ? t("settings.gateRelayOff")
              : t("settings.gateUnknown")}
        </Pill>
        <Pill tone={status.doorState === "open" ? "danger" : status.doorState === "closed" ? "ok" : "muted"}>
          {t("settings.gateDoor")}:{" "}
          {status.doorState === "open"
            ? t("settings.gateDoorOpen")
            : status.doorState === "closed"
              ? t("settings.gateDoorClosed")
              : status.doorState === "not_monitored"
                ? t("settings.gateDoorNotMonitored")
                : t("settings.gateUnknown")}
        </Pill>
      </div>
      {status.error && <p className="text-xs text-[var(--danger)]">{status.error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={refresh} disabled={pending} className="btn btn-secondary w-fit !px-3 !py-1.5 text-xs">
          {pending ? "…" : t("settings.gateStatusRefresh")}
        </button>
        <p className="text-xs text-[var(--muted)]">
          {t("settings.gateStatusCheckedAt", { date: new Date(status.checkedAt).toLocaleTimeString() })}
        </p>
      </div>
    </div>
  );
}
