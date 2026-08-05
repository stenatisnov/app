import { getLockSettings, type LockSettings } from "./settings";

export type LockResult = {
  ok: boolean;
  error?: string;
  /** True when no agent URL is configured and the open was simulated for dev/testing. */
  simulated?: boolean;
};

export type GateStatus = {
  online: boolean;
  relayState: "on" | "off" | "unknown";
  doorState: "open" | "closed" | "unknown" | "not_monitored";
  error?: string;
  checkedAt: string;
};

async function callAgent(lock: LockSettings, method: string, path: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), lock.timeoutMs);
  try {
    return await fetch(`${lock.agentUrl.replace(/\/+$/, "")}${path}`, {
      method,
      headers: { Authorization: `Bearer ${lock.agentToken}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Opens the gate via the controller agent's direct HTTP API (POST /open).
 * The agent pulses the relay itself and only responds once the pulse is
 * done, so this call blocks for the full open duration — same tradeoff
 * as the agent's own PHP-facing flow, and it means this works identically
 * whether the app runs on a plain Node server or Cloudflare Workers.
 */
export async function openLock(settings?: LockSettings): Promise<LockResult> {
  const lock = settings ?? (await getLockSettings());

  if (!lock.agentUrl) {
    return { ok: true, simulated: true };
  }

  try {
    const res = await callAgent(lock, "POST", "/open");
    const data = await res.json().catch(() => ({}) as { ok?: boolean; error?: string });
    if (!res.ok || data.ok !== true) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Agent request failed" };
  }
}

/** Live relay/door/reachability snapshot, fetched on demand (no background polling agent). */
export async function getGateStatus(settings?: LockSettings): Promise<GateStatus> {
  const lock = settings ?? (await getLockSettings());
  const checkedAt = new Date().toISOString();

  if (!lock.agentUrl) {
    return { online: false, relayState: "unknown", doorState: "not_monitored", checkedAt };
  }

  try {
    const res = await callAgent(lock, "GET", "/status");
    const data = await res.json().catch(() => ({}) as Record<string, unknown>);
    if (!res.ok) {
      const error = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
      return { online: false, relayState: "unknown", doorState: "unknown", error, checkedAt };
    }
    const doorState = data.doorState === "open" || data.doorState === "closed" ? data.doorState : "unknown";
    const relayState = data.relayState === "on" || data.relayState === "off" ? data.relayState : "unknown";
    return {
      online: true,
      relayState,
      doorState,
      error: data.ioOk === false ? (typeof data.ioError === "string" ? data.ioError : "I/O error on the agent") : undefined,
      checkedAt,
    };
  } catch (e) {
    return {
      online: false,
      relayState: "unknown",
      doorState: "unknown",
      error: e instanceof Error ? e.message : "Agent unreachable",
      checkedAt,
    };
  }
}
