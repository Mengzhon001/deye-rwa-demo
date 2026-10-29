import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { getAddress } from "ethers";
import { RevenueRuntime } from "./runtime";
import { publishedProducts } from "./public";
import { StationMonitor } from "./monitor";
import type { Actor } from "./store";

type Entry = { key: string; title: { zh: string; en: string }; kind: "issuance" | "experience"; createdAt: number; archived?: boolean };
export class RevenueCatalog {
  readonly runtimes = new Map<string, RevenueRuntime>();
  private entries: Entry[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  monitor!: StationMonitor;
  constructor(readonly primary: RevenueRuntime) {}
  async start() {
    await this.primary.start();
    const file = join(this.primary.dataDir, "products.json");
    this.entries = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).products : [{ key: "primary", title: { zh: "光伏收益权 · 发行演示 01", en: "Solar Rights · Issuance 01" }, kind: "issuance", createdAt: Date.now() }];
    this.runtimes.set("primary", this.primary);
    for (const entry of this.entries.filter(e => e.key !== "primary")) {
      if (!/^[a-zA-Z0-9-]{8,100}$/.test(entry.key)) throw new Error("Invalid stored product key");
      const runtime = new RevenueRuntime(join(this.primary.dataDir, "products", entry.key));
      await runtime.start();
      this.runtimes.set(entry.key, runtime);
    }
    this.save();
    this.monitor = new StationMonitor(this.primary.dataDir, this.primary.repo.read().stations);
    this.monitor.start();
  }
  private save() {
    const file = join(this.primary.dataDir, "products.json");
    writeFileSync(file + ".tmp", JSON.stringify({ version: 1, products: this.entries }, null, 2), { mode: 0o600 });
    renameSync(file + ".tmp", file);
  }
  serialize<T>(work: () => T | Promise<T>): Promise<T> {
    const next = this.queue.then(work); this.queue = next.catch(() => {}); return next;
  }
  async select(vault?: string, role?: string) {
    if (vault) {
      const address = getAddress(vault);
      const runtime = [...this.runtimes.values()].find(r => getAddress(r.repo.read().manifest!.addresses.vault) === address);
      if (!runtime) throw new Error("Product not found. Refresh the product list / 产品不存在，请刷新列表");
      return runtime;
    }
    if (role === "investor") {
      for (const entry of this.entries.filter(e => !e.archived && e.kind === "experience").reverse()) {
        const runtime = this.runtimes.get(entry.key)!;
        if ([1, 2].includes(Number(await runtime.vault.phase()))) return runtime;
      }
    }
    if (["owner", "agent", "trustee"].includes(role || "")) {
      const current = this.entries.filter(e => !e.archived && e.kind === "issuance").reverse().map(e => this.runtimes.get(e.key)!).find(r => ["RevenueShareVaultV3", "RevenueShareVaultV4", "RevenueShareVaultV5"].includes(r.repo.read().manifest?.contractName || ""));
      if (current) return current;
    }
    if (!this.entry(this.primary)?.archived) return this.primary;
    const latest = this.entries.filter(e => !e.archived).reverse();
    return this.runtimes.get((latest.find(e => e.kind === "experience") || latest[0])?.key || "primary")!;
  }
  assertAction(runtime: RevenueRuntime, action: string) {
    if (this.entry(runtime)?.archived && action !== "refund")
      throw new Error("Withdrawn subscriptions are refund-only / 已撤销认购仅可领取退款，请返回当前产品");
  }
  entry(runtime: RevenueRuntime) {
    return this.entries.find(e => this.runtimes.get(e.key) === runtime)!;
  }
  async rows(filter = "all", includeDrafts = false) {
    const rows = [];
    for (const entry of this.entries.filter(e => !e.archived)) {
      const runtime = this.runtimes.get(entry.key)!, s = runtime.repo.read();
      const names = ["phase", "fresh", "target", "totalSubscriptions", "totalSupply", "deadline", "rightCount"];
      const values = await runtime.readTogether(names.map(method=>({contract:runtime.vault,method})));
      const chain = Object.fromEntries(names.map((n, i) => [n, values[i]]));
      const row = publishedProducts(s.manifest!, chain, filter)[0];
      if (!row && !(includeDrafts && Number(chain.phase) === 0)) continue;
      rows.push({ ...(row || { id: s.manifest!.scenarioId, vault: s.manifest!.addresses.vault, phase: 0 }), title: entry.title, kind: entry.kind,
        distributionIntervalMonths: s.manifest?.contractName === "RevenueShareVaultV5" ? Number(await runtime.vault.getFunction("distributionIntervalMonths")()) : 3, subscriptionReviewRequired: ["RevenueShareVaultV3", "RevenueShareVaultV4", "RevenueShareVaultV5"].includes(s.manifest!.contractName || ""), subscriptionTopUpsAllowed: ["RevenueShareVaultV4", "RevenueShareVaultV5"].includes(s.manifest!.contractName || ""), admittedStations: Number(chain.rightCount), targetUSDC6: String(chain.target), subscriptionsUSDC6: String(chain.totalSubscriptions),
        totalSupply: String(chain.totalSupply), valuationFresh: Boolean(chain.fresh), deadline: Number(chain.deadline),
        projectedNetIRRPct: s.poolProjection?.projectedNetIRRPct ?? null, testOnly: true });
    }
    return rows;
  }
  retire(actor: Actor, vault: string) {
    return this.serialize(async () => {
      if (actor !== "agent") throw new Error("Only the intermediary can retire a product");
      const runtime = await this.select(vault), phase = Number(await runtime.vault.phase());
      if (BigInt(await runtime.vault.totalSupply()) > 0n) throw new Error("Issued shares cannot be removed with the demo replacement tool");
      if (![0,3,4].includes(phase)) throw new Error("End fundraising before removing a product / 请先撤销募集再移除产品");
      if (phase === 0 && (runtime.repo.read().applications.length || BigInt(await runtime.vault.totalSubscriptions()) || BigInt(await runtime.vault.totalSupply())))
        throw new Error("Only an empty draft can be removed");
      this.entry(runtime).archived = true;
      this.save();
      return {vault,removed:true};
    });
  }
  create(actor: Actor, key: string, title?: string, kind: Entry["kind"] = "issuance") {
    return this.serialize(async () => {
      if (actor !== "agent") throw new Error("Only the intermediary can create a product / 仅中介机构可创建产品");
      if (!/^[a-zA-Z0-9-]{8,100}$/.test(key)) throw new Error("Invalid product request key");
      const prior = this.runtimes.get(key);
      if (prior) return prior;
      if (this.entries.length >= 20) throw new Error("This demo supports up to 20 products");
      const dir = join(this.primary.dataDir, "products", key);
      mkdirSync(dir, { recursive: true });
      const runtime = new RevenueRuntime(dir);
      if(this.primary.repo.read().manifest?.chainId===84532)throw new Error("Deploy additional Base Sepolia products explicitly with base:deploy. The application does not spend deployment ETH from a browser request.");
      await runtime.start();
      runtime.repo.update(s => {
        const latest = this.monitor.read().stations;
        s.stations = latest.length ? latest : this.primary.repo.read().stations;
        s.mode = s.stations.some(s => s.source === "live") ? "live" : this.primary.repo.read().mode;
        s.audit.push({ at: Date.now(), actor, action: "product-created", message: "Independent test product; reusing station evidence does not assign real revenue rights twice." });
      });
      const series = this.entries.filter(e => !e.archived && e.kind === "issuance").length + 1;
      this.entries.push({ key, kind, createdAt: Date.now(), title: {
        zh: title?.trim().slice(0, 80) || `光伏收益权 · 发行演示 ${String(series).padStart(2, "0")}`,
        en: kind === "experience" ? "Solar Rights · Investor Experience" : `Solar Rights · Issuance ${String(series).padStart(2, "0")}`,
      } });
      this.runtimes.set(key, runtime); this.save(); return runtime;
    });
  }
}
