import { getLockSettings, type LockSettings } from "./settings";
import { Evok } from "./evok";

export type LockResult = {
  ok: boolean;
  error?: string;
  /** True when no EVOK URL is configured and the open was simulated for dev/testing. */
  simulated?: boolean;
};

export type GateStatus = {
  online: boolean;
  relayState: "on" | "off" | "unknown";
  doorState: "open" | "closed" | "unknown" | "not_monitored";
  error?: string;
  checkedAt: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Opens the gate by pulsing the configured EVOK relay: switch on, hold for
 * `openDurationSec`, switch off. Runs synchronously for the full pulse
 * duration rather than reporting success early and closing the relay in the
 * background — this app is deployed to Cloudflare Workers as well as plain
 * Node servers, and only the Node runtimes can reliably run work after a
 * request completes, so awaiting the whole pulse here is what actually
 * works the same way everywhere.
 */
export async function openLock(settings?: LockSettings): Promise<LockResult> {
  const lock = settings ?? (await getLockSettings());

  if (!lock.evokUrl) {
    return { ok: true, simulated: true };
  }

  const evok = new Evok(lock.evokUrl, lock.token, lock.timeoutMs);

  try {
    await evok.setRelay(lock.relayCircuit, true);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "EVOK request failed" };
  }

  try {
    await sleep(lock.openDurationSec * 1000);
  } finally {
    try {
      await evok.setRelay(lock.relayCircuit, false);
    } catch (e) {
      // The lock already unlocked (setRelay(true) above succeeded) — only
      // switching it back off failed. Log it, but don't turn a successful
      // open into a reported failure over that.
      console.error("[lock] Failed to switch the relay back off after the pulse:", e);
    }
  }

  return { ok: true };
}

/** Live relay/door/reachability snapshot, fetched on demand (no background polling agent). */
export async function getGateStatus(settings?: LockSettings): Promise<GateStatus> {
  const lock = settings ?? (await getLockSettings());
  const checkedAt = new Date().toISOString();

  if (!lock.evokUrl) {
    return { online: false, relayState: "unknown", doorState: "not_monitored", checkedAt };
  }

  const evok = new Evok(lock.evokUrl, lock.token, lock.timeoutMs);
  try {
    const relayOn = await evok.getRelay(lock.relayCircuit);
    let doorState: GateStatus["doorState"] = "not_monitored";
    if (lock.doorInputCircuit) {
      const raw = await evok.getInput(lock.doorInputCircuit);
      const isOpen = lock.doorInverted ? !raw : raw;
      doorState = isOpen ? "open" : "closed";
    }
    return { online: true, relayState: relayOn ? "on" : "off", doorState, checkedAt };
  } catch (e) {
    return {
      online: false,
      relayState: "unknown",
      doorState: "unknown",
      error: e instanceof Error ? e.message : "EVOK unreachable",
      checkedAt,
    };
  }
}
