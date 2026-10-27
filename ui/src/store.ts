import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DemoStore, UiMessage } from "./types";

const dataDir = resolve(__dirname, "../data");
const defaultStorePath = resolve(dataDir, "demo-store.json");

function defaultStore(): DemoStore {
  return {
    manifest: null,
    facilities: [],
    periods: [],
    marketTrades: [],
    activity: [],
    scheduler: {
      tickIntervalMs: 60_000,
      economicPeriodSec: 86_400,
      autoMode: true
    },
    lastUpdatedAt: Date.now()
  };
}

function uiMessage(key: UiMessage["key"], values?: Record<string, string>): UiMessage {
  return values && Object.keys(values).length > 0 ? { key, values } : { key };
}

function parseLegacyUiMessage(text: string): UiMessage {
  const patterns: Array<{
    pattern: RegExp;
    build: (match: RegExpMatchArray) => UiMessage;
  }> = [
    {
      pattern: /^Deployed (.+) and minted its facility RWA$/u,
      build: (match) =>
        uiMessage("messages.activity.deployment", {
          facilityName: match[1]
        })
    },
    {
      pattern: /^Deposited (.+) into RWAVault and minted DBOND inventory to the market$/u,
      build: (match) =>
        uiMessage("messages.activity.vaultDeposit", {
          facilityName: match[1]
        })
    },
    {
      pattern: /^Lifecycle update moved (.+) to (ACTIVE|PENDING|RETIRED)$/u,
      build: (match) =>
        uiMessage("messages.activity.lifecycle", {
          facilityName: match[1],
          status: match[2]
        })
    },
    {
      pattern: /^Minted demo USDC to (.+)$/u,
      build: (match) =>
        uiMessage("messages.activity.demoUsdcFaucet", {
          wallet: match[1]
        })
    },
    {
      pattern: /^Topped up demo ETH for (.+)$/u,
      build: (match) =>
        uiMessage("messages.activity.demoEthFaucet", {
          wallet: match[1]
        })
    },
    {
      pattern: /^Investor bought DBOND on-chain$/u,
      build: () => uiMessage("messages.activity.marketBuy")
    },
    {
      pattern: /^Investor redeemed DBOND on-chain$/u,
      build: () => uiMessage("messages.activity.marketRedeem")
    },
    {
      pattern: /^Investor submitted a token approval transaction$/u,
      build: () => uiMessage("messages.activity.tokenApproval")
    },
    {
      pattern: /^Auto-settled (.+) for (.+)$/u,
      build: (match) =>
        uiMessage("messages.activity.schedulerTickSettled", {
          periodId: match[1],
          facilityName: match[2]
        })
    },
    {
      pattern: /^Submitted production, cashflow, and funding for (.+)$/u,
      build: (match) =>
        uiMessage("messages.activity.periodSubmission", {
          periodId: match[1]
        })
    },
    {
      pattern: /^Vault claimed (.+) USDC6 for (.+)$/u,
      build: (match) =>
        uiMessage("messages.activity.vaultClaim", {
          amountUSDC6: match[1],
          periodId: match[2]
        })
    },
    {
      pattern: /^Auto-settlement paused for (.+): (.+)$/u,
      build: (match) =>
        uiMessage("messages.activity.schedulerTickPaused", {
          periodId: match[1],
          reason: match[2]
        })
    },
    {
      pattern: /^Skipped auto-period for (.+) because status is (.+)$/u,
      build: (match) =>
        uiMessage("messages.activity.schedulerSkipStatus", {
          facilityName: match[1],
          status: match[2]
        })
    },
    {
      pattern: /^Skipped auto-period because the facility is not reward eligible on-chain$/u,
      build: () => uiMessage("messages.activity.schedulerSkipIneligible")
    }
  ];

  for (const { pattern, build } of patterns) {
    const match = text.match(pattern);
    if (match) {
      return build(match);
    }
  }

  return uiMessage("messages.legacy.text", { text });
}

function normalizeUiMessage(raw: unknown): UiMessage {
  if (raw && typeof raw === "object" && "key" in raw && typeof raw.key === "string") {
    const rawMessage = raw as {
      key: string;
      values?: Record<string, unknown>;
    };
    const values =
      rawMessage.values && typeof rawMessage.values === "object"
        ? Object.fromEntries(
            Object.entries(rawMessage.values).map(([key, value]) => [key, `${value ?? ""}`])
          )
        : undefined;

    if (rawMessage.key === "messages.legacy.text" && typeof values?.text === "string") {
      return parseLegacyUiMessage(values.text);
    }

    return values && Object.keys(values).length > 0
      ? { key: rawMessage.key as UiMessage["key"], values }
      : { key: rawMessage.key as UiMessage["key"] };
  }

  if (typeof raw === "string") {
    return parseLegacyUiMessage(raw);
  }

  return uiMessage("messages.legacy.text", { text: "" });
}

function normalizeStore(raw: Partial<DemoStore> | null | undefined): DemoStore {
  const fallback = defaultStore();
  return {
    manifest: raw?.manifest ?? fallback.manifest,
    facilities: (raw?.facilities ?? []).map((facility) => ({
      ...facility,
      tickCount: facility.tickCount ?? 0,
      nextRevenueTickAtMs: facility.nextRevenueTickAtMs ?? Date.now() + fallback.scheduler.tickIntervalMs
    })),
    periods: raw?.periods ?? fallback.periods,
    marketTrades: raw?.marketTrades ?? fallback.marketTrades,
    activity: (raw?.activity ?? fallback.activity).map((entry) => ({
      ...entry,
      summary: normalizeUiMessage(entry.summary)
    })),
    scheduler: {
      tickIntervalMs:
        raw?.scheduler?.tickIntervalMs === 60_000
          ? raw.scheduler.tickIntervalMs
          : fallback.scheduler.tickIntervalMs,
      economicPeriodSec: raw?.scheduler?.economicPeriodSec ?? fallback.scheduler.economicPeriodSec,
      autoMode: raw?.scheduler?.autoMode ?? fallback.scheduler.autoMode
    },
    lastUpdatedAt: raw?.lastUpdatedAt ?? fallback.lastUpdatedAt
  };
}

export class DemoStoreRepository {
  constructor(private readonly filePath = defaultStorePath) {}

  read(): DemoStore {
    if (!existsSync(this.filePath)) {
      const initial = defaultStore();
      this.write(initial);
      return initial;
    }

    return normalizeStore(JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<DemoStore>);
  }

  write(store: DemoStore) {
    const normalized = normalizeStore(store);
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(
      this.filePath,
      `${JSON.stringify({ ...normalized, lastUpdatedAt: Date.now() }, null, 2)}\n`,
      "utf8"
    );
  }

  update(updater: (current: DemoStore) => DemoStore) {
    const next = updater(this.read());
    this.write(next);
    return next;
  }
}

export function createMemoryLikeStorePath(name: string) {
  return resolve(dataDir, name);
}
