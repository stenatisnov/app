/**
 * Thin client for the EVOK 3 HTTP API exposed by a UniPi Patron controller:
 *   POST /json/relay/{circuit}  {"value": "1"|"0"}     → switches a relay
 *   GET  /json/relay/{circuit}                          → {"value": 0|1, ...}
 *   GET  /json/input/{circuit}                          → {"value": 0|1, ...}
 *
 * EVOK itself has no built-in auth — the optional `token` is only sent when
 * set, for deployments that put a reverse proxy with a shared secret in
 * front of it (EVOK is meant to be reachable directly here, not through a
 * separate polling agent).
 */
export class Evok {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs: number,
  ) {}

  private async request(method: string, path: string, body?: unknown): Promise<{ value: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}${path}`, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`EVOK ${method} ${path} → HTTP ${res.status}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Switches a relay on/off. */
  async setRelay(circuit: string, on: boolean): Promise<void> {
    await this.request("POST", `/json/relay/${circuit}`, { value: on ? "1" : "0" });
  }

  /** Reads the current relay state (on/off). */
  async getRelay(circuit: string): Promise<boolean> {
    const data = await this.request("GET", `/json/relay/${circuit}`);
    return Number(data.value) !== 0;
  }

  /** Reads a digital input's current value (0/1). */
  async getInput(circuit: string): Promise<boolean> {
    const data = await this.request("GET", `/json/input/${circuit}`);
    return Number(data.value) !== 0;
  }
}
