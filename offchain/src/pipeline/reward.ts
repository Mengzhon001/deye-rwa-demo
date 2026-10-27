import { encodeBytes32String } from "ethers";
import { buildEvidencePackage } from "./evidence";
import { normalizeIngestion } from "./ingest";
import { buildTeamBToTeamAPayload } from "./relay";
import { createReviewDecision } from "./review";
import {
  AssetStatusSnapshotSchema,
  EntitlementRecordSchema,
  LegacyPeriodInputBundleSchema,
  RewardFlowInputSchema,
  type AssetStatusSnapshot,
  type EntitlementRecord,
  type LegacyPeriodInputBundle,
  type RewardFlowInput,
  type ReviewDecision
} from "../types/schemas";
import type { EvidenceOutput } from "./evidence";
import type { NormalizedDataset } from "./ingest";
import type { TeamBToTeamAInput } from "../types/handoff";
import { evidenceHash } from "../utils/hash";

export type RelayPayloadBuildResult = {
  derivedInput: LegacyPeriodInputBundle;
  normalized: NormalizedDataset;
  evidence: EvidenceOutput;
  review: ReviewDecision;
  payload: TeamBToTeamAInput;
};

function buildStatusSnapshot(input: RewardFlowInput): AssetStatusSnapshot[] {
  const operatingState = input.operatingPeriod.productionData.operatingState;
  const assetStatus = operatingState === "ACTIVE" ? "ACTIVE" : "PENDING";

  return [
    AssetStatusSnapshotSchema.parse({
      periodId: input.operatingPeriod.periodId,
      assetId: input.facility.assetId,
      assetStatus,
      statusSourceTx: evidenceHash({
        facilityId: input.facility.facilityId,
        periodId: input.operatingPeriod.periodId,
        assetStatus
      })
    })
  ];
}

function buildEntitlements(input: RewardFlowInput): EntitlementRecord[] {
  const amountUSDC6 = input.operatingPeriod.rewardDistribution.amountUSDC6;

  return [
    EntitlementRecordSchema.parse({
      periodId: input.operatingPeriod.periodId,
      beneficiary: input.operatingPeriod.rewardDistribution.beneficiary,
      amountUSDC6,
      eligibilityStatus: input.operatingPeriod.rewardDistribution.eligibilityStatus
    })
  ];
}

export function deriveLegacyInputFromRewardFlow(input: RewardFlowInput): LegacyPeriodInputBundle {
  if (input.reviewDecision.periodId !== input.operatingPeriod.periodId) {
    throw new Error("reviewDecision.periodId must match operatingPeriod.periodId");
  }

  return LegacyPeriodInputBundleSchema.parse({
    ingestion: {
      periodId: input.operatingPeriod.periodId,
      siteId: input.operatingPeriod.siteId,
      startTs: input.operatingPeriod.productionData.startTs,
      endTs: input.operatingPeriod.productionData.endTs,
      rawTelemetryFiles: input.operatingPeriod.productionData.rawTelemetryFiles,
      rawEventFiles: input.operatingPeriod.productionData.rawEventFiles,
      simulatedMetrics: {
        energyProducedKWh: input.operatingPeriod.productionData.energyGeneratedKWh,
        availabilityPct: input.operatingPeriod.productionData.availabilityPct,
        offlineDurationSec: input.operatingPeriod.productionData.offlineDurationSec,
        anomalyFlags: input.operatingPeriod.productionData.anomalyFlags
      }
    },
    statusSnapshot: buildStatusSnapshot(input),
    entitlements: buildEntitlements(input),
    reviewDecision: input.reviewDecision
  });
}

export function buildRelayPayloadFromLegacyInput(input: LegacyPeriodInputBundle): RelayPayloadBuildResult {
  const normalized = normalizeIngestion(input.ingestion);
  const evidence = buildEvidencePackage(normalized, input.entitlements, input.statusSnapshot);
  const review = createReviewDecision(input.reviewDecision);
  const periodIdBytes32 = encodeBytes32String(normalized.periodId) as `0x${string}`;
  const facilityId = input.statusSnapshot[0].assetId as `0x${string}`;
  const settlementRef = `LEGACY-${normalized.periodId}`;
  const payload = buildTeamBToTeamAPayload(
    facilityId,
    settlementRef,
    evidence,
    review,
    periodIdBytes32,
    "file://review-decision-signed.json"
  );

  return {
    derivedInput: input,
    normalized,
    evidence,
    review,
    payload
  };
}

export function buildRelayPayloadFromRewardFlow(input: RewardFlowInput): RelayPayloadBuildResult {
  const derivedInput = deriveLegacyInputFromRewardFlow(input);
  const result = buildRelayPayloadFromLegacyInput(derivedInput);
  const periodIdBytes32 = encodeBytes32String(result.normalized.periodId) as `0x${string}`;

  return {
    ...result,
    payload: buildTeamBToTeamAPayload(
      input.facility.assetId as `0x${string}`,
      input.operatingPeriod.cashflowData.settlementRef,
      result.evidence,
      result.review,
      periodIdBytes32,
      input.signedDecisionUri
    )
  };
}

export function buildRelayPayloadFromInput(raw: unknown): RelayPayloadBuildResult {
  const rewardFlowResult = RewardFlowInputSchema.safeParse(raw);
  if (rewardFlowResult.success) {
    return buildRelayPayloadFromRewardFlow(rewardFlowResult.data);
  }

  return buildRelayPayloadFromLegacyInput(LegacyPeriodInputBundleSchema.parse(raw));
}
