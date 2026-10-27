import { evidenceHash } from "../../offchain/src/utils/hash";
import { buildRelayPayloadFromRewardFlow } from "../../offchain/src/pipeline/reward";
import { deployFacility } from "../../offchain/src/simulator/deploy";
import { emitLifecycleEvent } from "../../offchain/src/simulator/lifecycle";
import { simulateFacilityPeriod } from "../../offchain/src/simulator/period";
import {
  claimViaVault,
  deployFacilityOnchain,
  depositToVault,
  loadDemoContext,
  mintDemoUsdc,
  resolveSigner,
  submitLifecycle
} from "../../onchain/scripts/demo-conductor";
import { deployDemoContracts } from "../../onchain/scripts/deploy";
import type { DemoContext } from "../../onchain/scripts/demo-conductor";
import type { DemoDeploymentManifest } from "../../onchain/scripts/deploy";
import type {
  ActivityEntry,
  ContractHealth,
  InvestorSnapshot,
  InvestorTradeRequest,
  InvestorTxPreparation,
  ManagedFacilityRecord,
  ManagedPeriodRecord,
  ManagerLifecycleRequest,
  ManagerOverview,
  MarketTradeRecord,
  MarketTxRecordRequest,
  UiMessage,
  UiState
} from "./types";
import type { DemoStoreRepository } from "./store";
import { AbiCoder, keccak256, parseEther } from "ethers";

function formatPercent(value: bigint) {
  const scaled = Number(value) / 100;
  return scaled.toFixed(2);
}

function statusLabel(status: bigint): "PENDING" | "ACTIVE" | "RETIRED" {
  if (status === 0n) {
    return "PENDING";
  }
  if (status === 2n) {
    return "RETIRED";
  }
  return "ACTIVE";
}

function toShareAmount(amountUnits: number) {
  return BigInt(amountUnits) * 10n ** 18n;
}

function makeActivityId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function distributionKey(facilityId: `0x${string}`, periodId: `0x${string}`) {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [facilityId, periodId])
  );
}

function reportKey(facilityId: `0x${string}`, periodId: `0x${string}`) {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [facilityId, periodId])
  );
}

const ZERO_TX_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

function message(key: UiMessage["key"], values?: Record<string, string>): UiMessage {
  return values && Object.keys(values).length > 0 ? { key, values } : { key };
}

function shortWallet(walletAddress: string) {
  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
}

export class DemoRuntime {
  private contextPromise: Promise<DemoContext> | null = null;
  private schedulerPromise: Promise<void> | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly store: DemoStoreRepository) {
    if (!process.env.HARDHAT_NETWORK) {
      process.env.HARDHAT_NETWORK = "hardhat";
    }
  }

  private async getContext() {
    if (!this.contextPromise) {
      this.contextPromise = (async () => {
        const manifest = await deployDemoContracts();
        const context = await loadDemoContext(manifest);
        this.store.update((current) => ({
          ...current,
          manifest,
          facilities:
            current.manifest?.contracts.functionsRouter === manifest.contracts.functionsRouter
              ? current.facilities
              : [],
          periods:
            current.manifest?.contracts.functionsRouter === manifest.contracts.functionsRouter
              ? current.periods
              : [],
          marketTrades:
            current.manifest?.contracts.functionsRouter === manifest.contracts.functionsRouter
              ? current.marketTrades
              : [],
          activity:
            current.manifest?.contracts.functionsRouter === manifest.contracts.functionsRouter
              ? current.activity
              : []
        }));
        return context;
      })();
    }

    return this.contextPromise;
  }

  private async getManifest() {
    const context = await this.getContext();
    return context.manifest;
  }

  private appendActivity(entry: Omit<ActivityEntry, "id" | "timestamp">) {
    this.store.update((current) => ({
      ...current,
      activity: [
        {
          id: makeActivityId(entry.kind),
          timestamp: Date.now(),
          ...entry
        },
        ...current.activity
      ].slice(0, 100)
    }));
  }

  private appendTrade(entry: Omit<MarketTradeRecord, "id" | "createdAt">) {
    this.store.update((current) => ({
      ...current,
      marketTrades: [
        {
          id: makeActivityId(entry.kind),
          createdAt: Date.now(),
          ...entry
        },
        ...current.marketTrades
      ].slice(0, 100)
    }));
  }

  private async syncFacilityStatus(
    facilityAssetId: `0x${string}`
  ): Promise<ManagedFacilityRecord | null> {
    const facilities = await this.refreshFacilitiesFromChain();
    return facilities.find((item) => item.facility.assetId === facilityAssetId) ?? null;
  }

  private nextTickAtMs(previousTickAtMs: number, intervalMs: number, nowMs = Date.now()) {
    return Math.max(previousTickAtMs + intervalMs, nowMs + intervalMs);
  }

  private persistAutomatedPeriod(
    facilityEntry: ManagedFacilityRecord,
    periodId: string,
    endTs: number,
    rewardAmountUSDC6: string,
    productionAmountUSDC6: string,
    cashflowAmountUSDC6: string,
    rewardStatus: ManagedPeriodRecord["rewardStatus"],
    txHashes: ManagedPeriodRecord["txHashes"]
  ) {
    this.store.update((current) => {
      const existingPeriod = current.periods.find(
        (item) =>
          item.facilityAssetId === facilityEntry.facility.assetId && item.periodId === periodId
      );
      const existingFacility = current.facilities.find(
        (item) => item.facility.assetId === facilityEntry.facility.assetId
      );
      const shouldAddReward =
        rewardStatus === "CLAIMED" && existingPeriod?.rewardStatus !== "CLAIMED";

      return {
        ...current,
        periods: [
          {
            facilityAssetId: facilityEntry.facility.assetId as `0x${string}`,
            facilityDisplayId: facilityEntry.facility.facilityId,
            periodId,
            rewardAmountUSDC6,
            productionAmountUSDC6,
            cashflowAmountUSDC6,
            rewardStatus,
            claimMode: "VAULT" as const,
            txHashes: existingPeriod
              ? {
                  productionReportTxHash:
                    txHashes.productionReportTxHash !== ZERO_TX_HASH
                      ? txHashes.productionReportTxHash
                      : existingPeriod.txHashes.productionReportTxHash,
                  cashflowReportTxHash:
                    txHashes.cashflowReportTxHash !== ZERO_TX_HASH
                      ? txHashes.cashflowReportTxHash
                      : existingPeriod.txHashes.cashflowReportTxHash,
                  revenueDepositTxHash:
                    txHashes.revenueDepositTxHash !== ZERO_TX_HASH
                      ? txHashes.revenueDepositTxHash
                      : existingPeriod.txHashes.revenueDepositTxHash,
                  rewardOpenTxHash:
                    txHashes.rewardOpenTxHash !== ZERO_TX_HASH
                      ? txHashes.rewardOpenTxHash
                      : existingPeriod.txHashes.rewardOpenTxHash,
                  claimTxHash:
                    txHashes.claimTxHash ??
                    existingPeriod.txHashes.claimTxHash
                }
              : txHashes
          },
          ...current.periods.filter(
            (item) =>
              !(
                item.facilityAssetId === facilityEntry.facility.assetId && item.periodId === periodId
              )
          )
        ].slice(0, 100),
        facilities: current.facilities.map((item) =>
          item.facility.assetId === facilityEntry.facility.assetId
            ? {
                ...item,
                latestPeriodId: periodId,
                tickCount: Math.max(item.tickCount, facilityEntry.tickCount + 1),
                lastSettlementEndTs: Math.max(item.lastSettlementEndTs ?? 0, endTs),
                nextRevenueTickAtMs: this.nextTickAtMs(
                  existingFacility?.nextRevenueTickAtMs ?? item.nextRevenueTickAtMs,
                  current.scheduler.tickIntervalMs
                ),
                totalRewardedUSDC6: shouldAddReward
                  ? (BigInt(item.totalRewardedUSDC6) + BigInt(rewardAmountUSDC6)).toString()
                  : item.totalRewardedUSDC6
              }
            : item
        )
      };
    });
  }

  private async resumeAutomatedPeriod(
    context: DemoContext,
    payload: ReturnType<typeof buildRelayPayloadFromRewardFlow>["payload"]
  ) {
    const oracle = await resolveSigner(context.manifest.accounts.oracle);
    const treasury = await resolveSigner(context.manifest.accounts.treasury);
    const router = context.contracts.functionsRouter.connect(oracle) as any;
    const energyRevenue = context.contracts.energyRevenue.connect(treasury) as any;
    const mockUsdc = context.contracts.mockUsdc.connect(treasury) as any;
    const amount = BigInt(payload.rewardFunding.amountUSDC6);
    const routeKey = reportKey(payload.facilityId, payload.periodId);

    const txHashes: ManagedPeriodRecord["txHashes"] = {
      productionReportTxHash: ZERO_TX_HASH,
      cashflowReportTxHash: ZERO_TX_HASH,
      revenueDepositTxHash: ZERO_TX_HASH,
      rewardOpenTxHash: ZERO_TX_HASH
    };

    const productionRecord = await context.contracts.functionsRouter.productionReports(routeKey);
    if (!productionRecord.exists) {
      const tx = await router.submitProductionReport(
        payload.facilityId,
        payload.periodId,
        amount,
        payload.productionReport.reportHash
      );
      await tx.wait();
      txHashes.productionReportTxHash = tx.hash as `0x${string}`;
    }

    const cashflowRecord = await context.contracts.functionsRouter.cashflowReports(routeKey);
    if (!cashflowRecord.exists) {
      const tx = await router.submitCashflowReport(
        payload.facilityId,
        payload.periodId,
        BigInt(payload.cashflowReport.amountUSDC6),
        payload.cashflowReport.reportHash
      );
      await tx.wait();
      txHashes.cashflowReportTxHash = tx.hash as `0x${string}`;
    }

    const revenueRecord = await context.contracts.energyRevenue.getRevenueRecord(
      payload.facilityId,
      payload.periodId
    );
    if (!revenueRecord.exists) {
      await (await mockUsdc.mint(context.manifest.accounts.treasury, amount)).wait();
      await (await mockUsdc.approve(context.manifest.contracts.energyRevenue, amount)).wait();
      const tx = await energyRevenue.depositRevenue(
        payload.facilityId,
        payload.periodId,
        amount,
        keccak256(new TextEncoder().encode(payload.cashflowReport.settlementRef))
      );
      await tx.wait();
      txHashes.revenueDepositTxHash = tx.hash as `0x${string}`;
    }

    const distribution = await context.contracts.rewardDistributor.getDistribution(
      payload.facilityId,
      payload.periodId
    );
    if (!distribution.isOpen) {
      const tx = await energyRevenue.fundReward(
        payload.facilityId,
        payload.periodId,
        amount,
        payload.rewardFunding.claimRoot
      );
      await tx.wait();
      txHashes.rewardOpenTxHash = tx.hash as `0x${string}`;
    }

    let claimTxHash: `0x${string}` | undefined;
    let alreadyClaimed = await context.contracts.rewardDistributor.claimed(
      distributionKey(payload.facilityId, payload.periodId)
    );

    if (!alreadyClaimed) {
      try {
        const claimed = await claimViaVault(context, payload);
        claimTxHash = claimed.txHash;
        alreadyClaimed = true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes("already claimed")) {
          throw error;
        }
        alreadyClaimed = true;
      }
    }

    return {
      rewardStatus: alreadyClaimed ? ("CLAIMED" as const) : ("OPENED" as const),
      txHashes: {
        ...txHashes,
        claimTxHash
      }
    };
  }

  async getContractHealth(): Promise<ContractHealth> {
    const context = await this.getContext();
    const totalSupply = await context.contracts.rwaVault.totalSupply();
    let marketPriceUSDC6 = "0";
    try {
      marketPriceUSDC6 = (await context.contracts.dbondMarket.currentPriceUSDC6()).toString();
    } catch {
      marketPriceUSDC6 = "0";
    }

    return {
      network: context.manifest.network,
      chainId: context.manifest.chainId,
      addresses: context.manifest.contracts,
      accounts: context.manifest.accounts,
      totalVaultAssetsUSDC6: (await context.contracts.rwaVault.totalAssetsUSDC6()).toString(),
      navPerShareUSDC6: (await context.contracts.rwaVault.navPerShare()).toString(),
      backingFacilityCount: Number(await context.contracts.rwaVault.backingFacilityCount()),
      dbondTotalSupply: totalSupply.toString(),
      marketInventoryDBOND: (await context.contracts.dbondMarket.availableInventoryDBOND()).toString(),
      marketReserveUSDC6: (await context.contracts.dbondMarket.availableReserveUSDC6()).toString(),
      marketPriceUSDC6
    };
  }

  private async refreshFacilitiesFromChain() {
    const context = await this.getContext();
    const currentStore = this.store.read();

    const refreshed: Array<ManagedFacilityRecord | null> = await Promise.all(
      currentStore.facilities.map(async (entry) => {
        try {
          const facility = await context.contracts.deyeRwa.getFacility(entry.facility.assetId);
          if (!facility.exists) {
            return null;
          }
          const currentHolder = await context.contracts.deyeRwa.ownerOfFacility(entry.facility.assetId);

          return {
            ...entry,
            onchainStatus: statusLabel(facility.status),
            currentHolder
          } satisfies ManagedFacilityRecord;
        } catch {
          return null;
        }
      })
    );

    const facilities = refreshed.filter(
      (entry): entry is ManagedFacilityRecord => entry !== null
    );
    const validAssetIds = new Set(facilities.map((entry) => entry.facility.assetId));

    this.store.write({
      ...currentStore,
      facilities,
      periods: currentStore.periods.filter((item) => validAssetIds.has(item.facilityAssetId)),
      activity: currentStore.activity.filter(
        (item) => !item.facilityAssetId || validAssetIds.has(item.facilityAssetId)
      )
    });

    return facilities;
  }

  private buildOverview(store: ReturnType<DemoStoreRepository["read"]>, health: ContractHealth): ManagerOverview {
    const totalRewards = store.periods.reduce(
      (sum, period) => sum + BigInt(period.rewardAmountUSDC6),
      0n
    );

    return {
      facilitiesTotal: store.facilities.length,
      activeFacilities: store.facilities.filter((item) => item.onchainStatus === "ACTIVE").length,
      pendingFacilities: store.facilities.filter((item) => item.onchainStatus === "PENDING").length,
      retiredFacilities: store.facilities.filter((item) => item.onchainStatus === "RETIRED").length,
      periodsClaimed: store.periods.filter((item) => item.rewardStatus === "CLAIMED").length,
      totalRewardsUSDC6: totalRewards.toString(),
      bondSupplyOnchain: health.dbondTotalSupply,
      marketInventoryOnchain: health.marketInventoryDBOND,
      reserveUSDC6: health.marketReserveUSDC6
    };
  }

  private buildInvestorSnapshot(
    walletAddress: `0x${string}` | null,
    store = this.store.read(),
    onchainBalance = "0",
    usdcBalance = "0",
    nativeBalanceWei = "0"
  ): InvestorSnapshot {
    return {
      walletAddress,
      onchainBalance,
      usdcBalance,
      nativeBalanceWei,
      marketTrades: walletAddress
        ? store.marketTrades.filter(
            (item) => item.walletAddress.toLowerCase() === walletAddress.toLowerCase()
          )
        : []
    };
  }

  private buildPeriodInput(facilityEntry: ManagedFacilityRecord) {
    const nextTick = facilityEntry.tickCount + 1;
    const startTs = facilityEntry.lastSettlementEndTs ?? facilityEntry.facility.deployedAt;
    const endTs = startTs + this.store.read().scheduler.economicPeriodSec;

    return {
      periodId: `P${String(nextTick).padStart(3, "0")}-${facilityEntry.facility.assetId.slice(2, 8)}`,
      startTs,
      endTs,
      capacityFactorPct: 70 + (nextTick % 6),
      availabilityPct: 96 + (nextTick % 3),
      soldRatioPct: 95,
      payoutRatioPct: 100,
      pricePerKWhUSDC6: (50 + ((nextTick % 6) * 35)).toString(),
      payer: "UI Automated Demo Settlement Pool",
      operatingState: "ACTIVE" as const
    };
  }

  private async runAutomatedPeriod(facilityEntry: ManagedFacilityRecord) {
    const context = await this.getContext();
    const periodInput = this.buildPeriodInput(facilityEntry);
    const operatingPeriod = simulateFacilityPeriod(facilityEntry.facility, periodInput);
    const rewardFlow = {
      facility: facilityEntry.facility,
      operatingPeriod,
      reviewDecision: {
        periodId: operatingPeriod.periodId,
        status: "APPROVED" as const,
        reviewerId: "manager.ui.scheduler",
        reviewNotesHash: evidenceHash({
          periodId: operatingPeriod.periodId,
          decision: "APPROVED"
        }),
        reviewedAt: periodInput.endTs + 60
      },
      signedDecisionUri: "ui://scheduler-approved"
    };

    const payload = buildRelayPayloadFromRewardFlow(rewardFlow).payload;
    try {
      const resumed = await this.resumeAutomatedPeriod(context, payload);
      this.persistAutomatedPeriod(
        facilityEntry,
        operatingPeriod.periodId,
        periodInput.endTs,
        payload.rewardFunding.amountUSDC6,
        payload.productionReport.amountUSDC6,
        payload.cashflowReport.amountUSDC6,
        resumed.rewardStatus,
        resumed.txHashes
      );

      this.appendActivity({
        source: "scheduler",
        kind: "SCHEDULER_TICK",
        status: "INFO",
        facilityAssetId: payload.facilityId,
        summary: message("messages.activity.schedulerTickSettled", {
          periodId: operatingPeriod.periodId,
          facilityName: facilityEntry.displayName
        })
      });
      this.appendActivity({
        source: "onchain",
        kind: "PERIOD_SUBMISSION",
        status: "MINED",
        facilityAssetId: payload.facilityId,
        txHash:
          resumed.txHashes.rewardOpenTxHash !== ZERO_TX_HASH
            ? resumed.txHashes.rewardOpenTxHash
            : undefined,
        amountUSDC6: payload.rewardFunding.amountUSDC6,
        summary: message("messages.activity.periodSubmission", {
          periodId: operatingPeriod.periodId
        })
      });
      if (resumed.rewardStatus === "CLAIMED") {
        this.appendActivity({
          source: "onchain",
          kind: "VAULT_CLAIM",
          status: "MINED",
          facilityAssetId: payload.facilityId,
          txHash: resumed.txHashes.claimTxHash,
          amountUSDC6: payload.rewardFunding.amountUSDC6,
          summary: message("messages.activity.vaultClaim", {
            amountUSDC6: payload.rewardFunding.amountUSDC6,
            periodId: operatingPeriod.periodId
          })
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.store.update((current) => ({
        ...current,
        facilities: current.facilities.map((item) =>
          item.facility.assetId === payload.facilityId
            ? {
                ...item,
                nextRevenueTickAtMs: this.nextTickAtMs(
                  item.nextRevenueTickAtMs,
                  current.scheduler.tickIntervalMs
                )
              }
            : item
        )
      }));

      this.appendActivity({
        source: "scheduler",
        kind: "SCHEDULER_TICK",
        status: "INFO",
        facilityAssetId: payload.facilityId,
        amountUSDC6: payload.rewardFunding.amountUSDC6,
        summary: message("messages.activity.schedulerTickPaused", {
          periodId: operatingPeriod.periodId,
          reason: errorMessage
        })
      });
      throw error;
    }
  }

  async processDueRevenueTicks(nowMs = Date.now()) {
    if (!this.schedulerPromise) {
      this.schedulerPromise = (async () => {
        const store = this.store.read();
        if (!store.scheduler.autoMode) {
          return;
        }

        for (const facilityEntry of store.facilities) {
          const currentEntry = await this.syncFacilityStatus(
            facilityEntry.facility.assetId as `0x${string}`
          );
          if (!currentEntry || currentEntry.nextRevenueTickAtMs > nowMs) {
            continue;
          }

          if (currentEntry.onchainStatus !== "ACTIVE") {
            this.store.update((current) => ({
              ...current,
              facilities: current.facilities.map((item) =>
                item.facility.assetId === currentEntry.facility.assetId
                  ? {
                      ...item,
                      nextRevenueTickAtMs: nowMs + current.scheduler.tickIntervalMs
                    }
                  : item
              )
            }));
            this.appendActivity({
              source: "scheduler",
              kind: "SCHEDULER_SKIP",
              status: "INFO",
              facilityAssetId: currentEntry.facility.assetId as `0x${string}`,
              summary: message("messages.activity.schedulerSkipStatus", {
                facilityName: currentEntry.displayName,
                status: currentEntry.onchainStatus
              })
            });
          } else {
            try {
              await this.runAutomatedPeriod(currentEntry);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              if (errorMessage.includes("facility not eligible")) {
                const synced = await this.syncFacilityStatus(
                  currentEntry.facility.assetId as `0x${string}`
                );
                this.store.update((current) => ({
                  ...current,
                  facilities: current.facilities.map((item) =>
                    item.facility.assetId === currentEntry.facility.assetId
                      ? {
                          ...item,
                          nextRevenueTickAtMs: this.nextTickAtMs(
                            item.nextRevenueTickAtMs,
                            current.scheduler.tickIntervalMs
                          )
                        }
                      : item
                  )
                }));
                this.appendActivity({
                  source: "scheduler",
                  kind: "SCHEDULER_SKIP",
                  status: "INFO",
                  facilityAssetId: currentEntry.facility.assetId as `0x${string}`,
                  summary: synced
                    ? message("messages.activity.schedulerSkipStatus", {
                        facilityName: synced.displayName,
                        status: synced.onchainStatus
                      })
                    : message("messages.activity.schedulerSkipIneligible")
                });
              }
              console.error("demo scheduler failed", error);
            }
          }
        }
      })().finally(() => {
        this.schedulerPromise = null;
      });
    }

    await this.schedulerPromise;
  }

  startScheduler() {
    if (this.schedulerTimer) {
      return;
    }

    this.schedulerTimer = setInterval(() => {
      void this.processDueRevenueTicks();
    }, 1_000);
  }

  async getUiState(walletAddress: `0x${string}` | null): Promise<UiState> {
    await this.refreshFacilitiesFromChain();
    await this.processDueRevenueTicks();
    const facilities = await this.refreshFacilitiesFromChain();
    const store = this.store.read();
    const context = await this.getContext();
    const health = await this.getContractHealth();
    const nav = BigInt(health.navPerShareUSDC6 || "0");
    let onchainBalance = "0";
    let usdcBalance = "0";
    let nativeBalanceWei = "0";

    if (walletAddress) {
      onchainBalance = (await context.contracts.rwaVault.balanceOf(walletAddress)).toString();
      usdcBalance = (await context.contracts.mockUsdc.balanceOf(walletAddress)).toString();
      nativeBalanceWei = (await context.contracts.mockUsdc.runner?.provider?.getBalance(walletAddress))?.toString?.() ?? "0";
    }

    const nextTickAtMs =
      store.facilities.length > 0
        ? Math.min(...store.facilities.map((item) => item.nextRevenueTickAtMs))
        : null;
    const periodsClaimed = Math.max(store.periods.length, 1);
    const navRatioBps = nav > 0n ? (nav * 10_000n) / 1_000_000n : 0n;
    const simulatedApyPct =
      periodsClaimed > 0 && nav > 1_000_000n
        ? (((Number(navRatioBps) / 10_000) ** (365 / periodsClaimed) - 1) * 100).toFixed(2)
        : "0.00";

    return {
      managerOverview: this.buildOverview(store, health),
      facilities,
      periods: store.periods,
      bondMetrics: {
        totalSupplyOnchain: health.dbondTotalSupply,
        marketInventoryOnchain: health.marketInventoryDBOND,
        marketReserveUSDC6: health.marketReserveUSDC6,
        navPerShareUSDC6: health.navPerShareUSDC6,
        marketPriceUSDC6: health.marketPriceUSDC6,
        returnPct: nav > 0n ? formatPercent(((nav - 1_000_000n) * 10_000n) / 1_000_000n) : "0.00",
        simulatedApyPct
      },
      contractHealth: health,
      investor: this.buildInvestorSnapshot(
        walletAddress,
        store,
        onchainBalance,
        usdcBalance,
        nativeBalanceWei
      ),
      scheduler: {
        ...store.scheduler,
        nextTickAtMs
      },
      activity: store.activity,
      notices: {
        marketState: message("messages.notice.marketStateRealOnchainDemoUsdc"),
        simulationDisclosure: message("messages.notice.simulationDisclosure"),
        networkMode:
          context.manifest.network === "localhost"
            ? message("messages.notice.networkModeLocalhost")
            : message("messages.notice.networkModeNonLocalhost")
      }
    };
  }

  async deployFacility(request: {
    deploymentInput: Parameters<typeof deployFacility>[0];
    adminAddress?: `0x${string}`;
  }) {
    const context = await this.getContext();
    const facility = deployFacility(request.deploymentInput);
    const deployment = await deployFacilityOnchain(context, facility, {
      adminAddress: request.adminAddress ?? context.manifest.accounts.deployer
    });
    const vaultDeposit = await depositToVault(
      context,
      facility.assetId as `0x${string}`,
      context.manifest.contracts.dbondMarket
    );

    const managed: ManagedFacilityRecord = {
      facility,
      displayName: facility.facilityName,
      onchainStatus: facility.lifecycleStatus,
      currentHolder: context.manifest.contracts.rwaVault,
      deploymentTxHash: deployment.txHash,
      vaultDepositTxHash: vaultDeposit.txHash,
      totalRewardedUSDC6: "0",
      tickCount: 0,
      nextRevenueTickAtMs: Date.now() + this.store.read().scheduler.tickIntervalMs
    };

    this.store.update((current) => ({
      ...current,
      manifest: context.manifest,
      facilities: [
        managed,
        ...current.facilities.filter((item) => item.facility.assetId !== facility.assetId)
      ]
    }));

    this.appendActivity({
      source: "onchain",
      kind: "DEPLOYMENT",
      status: "MINED",
      facilityAssetId: facility.assetId as `0x${string}`,
      txHash: deployment.txHash,
      summary: message("messages.activity.deployment", {
        facilityName: facility.facilityName
      })
    });
    this.appendActivity({
      source: "onchain",
      kind: "VAULT_DEPOSIT",
      status: "MINED",
      facilityAssetId: facility.assetId as `0x${string}`,
      txHash: vaultDeposit.txHash,
      shareAmount: (await context.contracts.rwaVault.balanceOf(context.manifest.contracts.dbondMarket)).toString(),
      summary: message("messages.activity.vaultDeposit", {
        facilityName: facility.facilityName
      })
    });

    return managed;
  }

  async submitLifecycleEvent(request: ManagerLifecycleRequest) {
    const currentStore = this.store.read();
    const facilityEntry = currentStore.facilities.find(
      (item) => item.facility.assetId === request.facilityAssetId
    );

    if (!facilityEntry) {
      throw new Error("facility not found in demo store");
    }

    const context = await this.getContext();
    const lifecycleEvent = emitLifecycleEvent(facilityEntry.facility, request.eventInput);
    const result = await submitLifecycle(context, lifecycleEvent);

    this.store.update((current) => ({
      ...current,
      facilities: current.facilities.map((item) =>
        item.facility.assetId === request.facilityAssetId
          ? {
              ...item,
              onchainStatus: result.status,
              latestLifecycleEvent: lifecycleEvent,
              nextRevenueTickAtMs:
                lifecycleEvent.toStatus === "ACTIVE"
                  ? Date.now() + current.scheduler.tickIntervalMs
                  : item.nextRevenueTickAtMs + current.scheduler.tickIntervalMs,
              facility: {
                ...item.facility,
                lifecycleStatus: lifecycleEvent.toStatus
              }
            }
          : item
      )
    }));

    this.appendActivity({
      source: "onchain",
      kind: "LIFECYCLE",
      status: "MINED",
      facilityAssetId: request.facilityAssetId,
      txHash: result.txHash,
      summary: message("messages.activity.lifecycle", {
        facilityName: facilityEntry.displayName,
        status: lifecycleEvent.toStatus
      })
    });

    return lifecycleEvent;
  }

  async requestDemoUsdc(walletAddress: `0x${string}`, amountUSDC6 = 500_000_000n) {
    const context = await this.getContext();
    const result = await mintDemoUsdc(context, walletAddress, amountUSDC6);
    this.appendTrade({
      kind: "FAUCET",
      walletAddress,
      amountUSDC6: amountUSDC6.toString(),
      txHash: result.txHash,
      status: "MINED"
    });
    this.appendActivity({
      source: "onchain",
      kind: "DEMO_USDC_FAUCET",
      status: "MINED",
      walletAddress,
      txHash: result.txHash,
      amountUSDC6: amountUSDC6.toString(),
      summary: message("messages.activity.demoUsdcFaucet", {
        wallet: shortWallet(walletAddress)
      })
    });
    return result;
  }

  async requestDemoEth(
    walletAddress: `0x${string}`,
    minimumWei = parseEther("1"),
    topUpWei = parseEther("10")
  ) {
    const context = await this.getContext();
    const provider = context.contracts.mockUsdc.runner?.provider;
    if (!provider) {
      throw new Error("provider unavailable for native balance funding");
    }

    const currentBalance = await provider.getBalance(walletAddress);
    if (currentBalance >= minimumWei) {
      return {
        walletAddress,
        funded: false,
        amountWei: "0",
        txHash: undefined,
        balanceWei: currentBalance.toString()
      };
    }

    const deployer = await resolveSigner(context.manifest.accounts.deployer);
    const tx = await deployer.sendTransaction({
      to: walletAddress,
      value: topUpWei
    });
    await tx.wait();

    const updatedBalance = await provider.getBalance(walletAddress);
    this.appendActivity({
      source: "onchain",
      kind: "DEMO_ETH_FAUCET",
      status: "MINED",
      walletAddress,
      txHash: tx.hash as `0x${string}`,
      summary: message("messages.activity.demoEthFaucet", {
        wallet: shortWallet(walletAddress)
      })
    });

    return {
      walletAddress,
      funded: true,
      amountWei: topUpWei.toString(),
      txHash: tx.hash as `0x${string}`,
      balanceWei: updatedBalance.toString()
    };
  }

  async prepareBuyTransaction(request: InvestorTradeRequest): Promise<InvestorTxPreparation> {
    const context = await this.getContext();
    const shareAmount = toShareAmount(request.amountUnits);
    const paymentUSDC6 = await context.contracts.dbondMarket.previewBuyCostUSDC6(shareAmount);
    const allowance = await context.contracts.mockUsdc.allowance(
      request.walletAddress,
      context.manifest.contracts.dbondMarket
    );

    const steps: InvestorTxPreparation["steps"] = [];
    if (allowance < paymentUSDC6) {
      steps.push({
        kind: "TOKEN_APPROVAL",
        label: message("messages.tx.approveDemoUsdc"),
        amountUSDC6: paymentUSDC6.toString(),
        request: {
          from: request.walletAddress,
          to: context.manifest.contracts.mockUsdc,
          data: context.contracts.mockUsdc.interface.encodeFunctionData("approve", [
            context.manifest.contracts.dbondMarket,
            paymentUSDC6
          ]) as `0x${string}`
        }
      });
    }

    steps.push({
      kind: "MARKET_BUY",
      label: message("messages.tx.buyDbond"),
      amountUSDC6: paymentUSDC6.toString(),
      shareAmount: shareAmount.toString(),
      request: {
        from: request.walletAddress,
        to: context.manifest.contracts.dbondMarket,
        data: context.contracts.dbondMarket.interface.encodeFunctionData("buy", [
          shareAmount,
          paymentUSDC6,
          request.walletAddress
        ]) as `0x${string}`
      }
    });

    return {
      kind: "BUY",
      walletAddress: request.walletAddress,
      shareAmount: shareAmount.toString(),
      amountUSDC6: paymentUSDC6.toString(),
      steps
    };
  }

  async prepareRedeemTransaction(request: InvestorTradeRequest): Promise<InvestorTxPreparation> {
    const context = await this.getContext();
    const shareAmount = toShareAmount(request.amountUnits);
    const payoutUSDC6 = await context.contracts.dbondMarket.previewRedeemPayoutUSDC6(shareAmount);
    const allowance = await context.contracts.rwaVault.allowance(
      request.walletAddress,
      context.manifest.contracts.dbondMarket
    );

    const steps: InvestorTxPreparation["steps"] = [];
    if (allowance < shareAmount) {
      steps.push({
        kind: "TOKEN_APPROVAL",
        label: message("messages.tx.approveDbond"),
        shareAmount: shareAmount.toString(),
        request: {
          from: request.walletAddress,
          to: context.manifest.contracts.rwaVault,
          data: context.contracts.rwaVault.interface.encodeFunctionData("approve", [
            context.manifest.contracts.dbondMarket,
            shareAmount
          ]) as `0x${string}`
        }
      });
    }

    steps.push({
      kind: "MARKET_REDEEM",
      label: message("messages.tx.redeemDbond"),
      amountUSDC6: payoutUSDC6.toString(),
      shareAmount: shareAmount.toString(),
      request: {
        from: request.walletAddress,
        to: context.manifest.contracts.dbondMarket,
        data: context.contracts.dbondMarket.interface.encodeFunctionData("redeem", [
          shareAmount,
          payoutUSDC6,
          request.walletAddress
        ]) as `0x${string}`
      }
    });

    return {
      kind: "REDEEM",
      walletAddress: request.walletAddress,
      shareAmount: shareAmount.toString(),
      amountUSDC6: payoutUSDC6.toString(),
      steps
    };
  }

  async recordMarketTransaction(request: MarketTxRecordRequest) {
    const tradeKind =
      request.kind === "MARKET_BUY"
        ? "BUY"
        : request.kind === "MARKET_REDEEM"
          ? "REDEEM"
          : "APPROVAL";

    this.appendTrade({
      kind: tradeKind,
      walletAddress: request.walletAddress,
      txHash: request.txHash,
      shareAmount: request.shareAmount,
      amountUSDC6: request.amountUSDC6,
      status: "MINED"
    });
    this.appendActivity({
      source: "onchain",
      kind: request.kind,
      status: "MINED",
      walletAddress: request.walletAddress,
      txHash: request.txHash,
      shareAmount: request.shareAmount,
      amountUSDC6: request.amountUSDC6,
      summary:
        request.kind === "MARKET_BUY"
          ? message("messages.activity.marketBuy")
          : request.kind === "MARKET_REDEEM"
            ? message("messages.activity.marketRedeem")
            : message("messages.activity.tokenApproval")
    });

    return { ok: true };
  }

  async manifest(): Promise<DemoDeploymentManifest> {
    return this.getManifest();
  }
}
