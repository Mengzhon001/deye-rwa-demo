import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DeyeClient, deyeConfig, fieldMapping } from "../../../offchain/src/revenue/deye";
import type { Station } from "../../../offchain/src/revenue/model";
import { safeError } from "./runtime";

/** Monitoring is shared across products. Signed valuation evidence stays in each product store. */
export class StationMonitor {
  private pending?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private snapshot: { stations: Station[]; attemptedAt?: number; succeededAt?: number; error?: string };
  constructor(private dir: string, stations: Station[]) {
    const file = join(dir, "monitoring.json");
    this.snapshot = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { stations };
  }
  start() {
    if (process.env.REVENUE_MONITOR_LIVE !== "true") return;
    void this.refresh().catch(() => {});
    this.timer = setInterval(() => void this.refresh().catch(() => {}), 15 * 60_000);
    this.timer.unref();
  }
  stop() { if (this.timer) clearInterval(this.timer); }
  read() {
    return { ...structuredClone(this.snapshot), enabled: process.env.REVENUE_MONITOR_LIVE === "true", refreshing: !!this.pending };
  }
  refresh() {
    if (process.env.REVENUE_MONITOR_LIVE !== "true")
      return Promise.reject(new Error("Live monitoring is not configured; the displayed capture is recorded replay / 尚未配置实时监控，当前为记录回放"));
    if (this.pending) return this.pending;
    // Every role can request a monitoring refresh; a short shared cooldown prevents API flooding.
    if (this.snapshot.attemptedAt && Date.now() - this.snapshot.attemptedAt < 60_000) return Promise.resolve();
    this.pending = this.capture().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async capture() {
    this.snapshot.attemptedAt = Date.now();
    try {
      const client = new DeyeClient(deyeConfig());
      const next: Station[] = [];
      for (const station of this.snapshot.stations.filter(s => s.source !== "synthetic")) {
        next.push(await client.capture(station.sourceId, Math.floor(Date.now() / 1000), fieldMapping(), join(this.dir, "monitor-evidence")));
      }
      if (!next.length) throw new Error("No real station configured for live monitoring");
      this.snapshot.stations = next;
      this.snapshot.succeededAt = Date.now();
      this.snapshot.error = undefined;
    } catch (error) {
      // Retain the last successful capture, with its original timestamp and explicit failure state.
      this.snapshot.error = safeError(error);
    }
    mkdirSync(this.dir, { recursive: true });
    const file = join(this.dir, "monitoring.json");
    writeFileSync(file + ".tmp", JSON.stringify(this.snapshot), { mode: 0o600 });
    renameSync(file + ".tmp", file);
  }
}
