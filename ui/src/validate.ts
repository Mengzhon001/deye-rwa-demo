import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { buildRelayPayloadFromRewardFlow } from "../../offchain/src/pipeline/reward";
import { simulateFacilityPeriod } from "../../offchain/src/simulator/period";
import { evidenceHash } from "../../offchain/src/utils/hash";
import {
  buyBond,
  loadDemoContext,
  redeemBond,
  resolveSigner
} from "../../onchain/scripts/demo-conductor";
import { DemoRuntime } from "./runtime";
import { DemoStoreRepository } from "./store";
import type {
  FacilityDeploymentInput,
  FacilityLifecycleEventInput
} from "../../offchain/src/types/schemas";

const tempStorePath = resolve(__dirname, "../data/demo-store.validate.json");
const investorWallet = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" as const;

const deploymentInput: FacilityDeploymentInput = {
  facilityName: "Validation Inverter Alpha",
  facilityType: "INVERTER",
  location: {
    country: "Singapore",
    region: "North",
    siteName: "SG-VALIDATION-SITE",
    latitude: 1.39,
    longitude: 103.82
  },
  commercialTerms: {
    acquisitionCostUSDC6: "2000000000",
    commissionedAt: 1775001600,
    expectedLifetimePeriods: 90
  },
  technicalProfile: {
    nameplateCapacityKW: 420,
    gridConnectionId: "GRID-SG-VAL-01"
  },
  beneficiary: "0x1111111111111111111111111111111111111111",
  operatorId: "validation.operator.01",
  activateOnDeploy: true
};

const lifecycleInput: FacilityLifecycleEventInput = {
  eventType: "BROKEN",
  eventTs: 1775091600,
  reason: "Validation trip event"
};

async function run() {
  rmSync(tempStorePath, { force: true });

  const store = new DemoStoreRepository(tempStorePath);
  const runtime = new DemoRuntime(store);
  const deployed = await runtime.deployFacility({
    deploymentInput,
    adminAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  });
  assert.equal(deployed.displayName, deploymentInput.facilityName);
  assert.ok(deployed.vaultDepositTxHash);
  const manifest = await runtime.manifest();
  const context = await loadDemoContext(manifest);

  const firstPeriod = simulateFacilityPeriod(deployed.facility, {
    periodId: `P001-${deployed.facility.assetId.slice(2, 8)}`,
    startTs: deployed.facility.deployedAt,
    endTs: deployed.facility.deployedAt + 86_400,
    capacityFactorPct: 71,
    availabilityPct: 97,
    soldRatioPct: 95,
    payoutRatioPct: 100,
    pricePerKWhUSDC6: "85",
    payer: "UI Automated Demo Settlement Pool",
    operatingState: "ACTIVE"
  });
  const firstPayload = buildRelayPayloadFromRewardFlow({
    facility: deployed.facility,
    operatingPeriod: firstPeriod,
    reviewDecision: {
      periodId: firstPeriod.periodId,
      status: "APPROVED",
      reviewerId: "manager.ui.scheduler",
      reviewNotesHash: evidenceHash({
        periodId: firstPeriod.periodId,
        decision: "APPROVED"
      }),
      reviewedAt: firstPeriod.productionData.endTs + 60
    },
    signedDecisionUri: "ui://scheduler-approved"
  }).payload;

  const oracle = await resolveSigner(manifest.accounts.oracle);
  await (
    await (context.contracts.functionsRouter.connect(oracle) as any).submitProductionReport(
      firstPayload.facilityId,
      firstPayload.periodId,
      BigInt(firstPayload.rewardFunding.amountUSDC6),
      firstPayload.productionReport.reportHash
    )
  ).wait();

  store.update((current) => ({
    ...current,
    facilities: current.facilities.map((item) =>
      item.facility.assetId === deployed.facility.assetId
        ? { ...item, nextRevenueTickAtMs: Date.now() - 1_000 }
        : item
    )
  }));
  await runtime.processDueRevenueTicks(Date.now());

  await runtime.requestDemoUsdc(investorWallet, 250_000_000n);
  const preparedBuy = await runtime.prepareBuyTransaction({
    walletAddress: investorWallet,
    amountUnits: 10
  });
  assert.equal(preparedBuy.steps[0]?.label.key, "messages.tx.approveDemoUsdc");
  assert.equal(
    preparedBuy.steps[preparedBuy.steps.length - 1]?.label.key,
    "messages.tx.buyDbond"
  );

  const buy = await buyBond(context, investorWallet, 10n * 10n ** 18n);
  await runtime.recordMarketTransaction({
    walletAddress: investorWallet,
    txHash: buy.txHash,
    kind: "MARKET_BUY",
    shareAmount: buy.shareAmount,
    amountUSDC6: buy.paymentUSDC6
  });

  const preparedRedeem = await runtime.prepareRedeemTransaction({
    walletAddress: investorWallet,
    amountUnits: 5
  });
  assert.equal(preparedRedeem.steps[0]?.label.key, "messages.tx.approveDbond");
  assert.equal(
    preparedRedeem.steps[preparedRedeem.steps.length - 1]?.label.key,
    "messages.tx.redeemDbond"
  );

  const redeem = await redeemBond(context, investorWallet, 5n * 10n ** 18n);
  await runtime.recordMarketTransaction({
    walletAddress: investorWallet,
    txHash: redeem.txHash,
    kind: "MARKET_REDEEM",
    shareAmount: redeem.shareAmount,
    amountUSDC6: redeem.payoutUSDC6
  });

  const lifecycle = await runtime.submitLifecycleEvent({
    facilityAssetId: deployed.facility.assetId as `0x${string}`,
    eventInput: lifecycleInput
  });
  assert.equal(lifecycle.toStatus, "PENDING");

  const uiState = await runtime.getUiState(investorWallet);
  assert.equal(uiState.facilities.length, 1);
  assert.equal(uiState.periods.length, 1);
  assert.ok(uiState.contractHealth.addresses.dbondMarket.startsWith("0x"));
  assert.equal(uiState.investor.marketTrades.length, 3);
  assert.ok(uiState.activity.length >= 5);
  assert.equal(uiState.notices.marketState.key, "messages.notice.marketStateRealOnchainDemoUsdc");
  assert.equal(uiState.notices.simulationDisclosure.key, "messages.notice.simulationDisclosure");
  assert.ok(
    ["messages.notice.networkModeLocalhost", "messages.notice.networkModeNonLocalhost"].includes(
      uiState.notices.networkMode.key
    )
  );
  assert.ok(uiState.activity.every((entry) => typeof entry.summary.key === "string"));
  assert.ok(
    uiState.activity.some((entry) => entry.summary.key === "messages.activity.marketRedeem")
  );

  process.stdout.write("UI demo validation passed.\n");
}

run().finally(() => {
  rmSync(tempStorePath, { force: true });
});
