import { getLockSettings, type LockSettings } from "./settings";

export type LockResult = {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
  /** True when no lock URL is configured and the open was simulated for dev/testing. */
  simulated?: boolean;
};

/**
 * Generic HTTPS + bearer-token gate lock adapter. The concrete hardware
 * (UniPi Patron) payload is intentionally not hard-coded — everything it
 * needs (URL, token, method, duration) comes from admin-configurable
 * settings, so swapping hardware never requires a code change.
 */
export async function openLock(settings?: LockSettings): Promise<LockResult> {
  const lock = settings ?? (await getLockSettings());

  if (!lock.url) {
    return { ok: true, simulated: true, body: `simulated open ${lock.openDurationSec}s` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), lock.timeoutMs);

  try {
    const res = await fetch(lock.url, {
      method: lock.method || "POST",
      headers: {
        Authorization: `Bearer ${lock.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ action: "open", durationSec: lock.openDurationSec }),
      signal: controller.signal,
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lock request failed" };
  } finally {
    clearTimeout(timer);
  }
}
