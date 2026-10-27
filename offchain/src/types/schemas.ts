import { z } from "zod";

const usdc6String = z.string().regex(/^[0-9]+$/);
const evmAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const hexHash = z.string().startsWith("0x");
const lifecycleStatus = z.enum(["PENDING", "ACTIVE", "RETIRED"]);

export const PeriodEvidenceSchema = z.object({
  periodId: z.string().min(1),
  siteId: z.string().min(1),
  startTs: z.number().int().nonnegative(),
  endTs: z.number().int().positive(),
  energyProducedKWh: z.number().nonnegative(),
  availabilityPct: z.number().min(0).max(100),
  anomalyFlags: z.array(z.string()),
  offlineDurationSec: z.number().int().nonnegative(),
  schemaVersion: z.string().min(1),
  evidenceHash: z.string().startsWith("0x")
});

export const EntitlementRecordSchema = z.object({
  periodId: z.string().min(1),
  beneficiary: evmAddress,
  amountUSDC6: usdc6String,
  eligibilityStatus: z.enum(["ELIGIBLE", "SUSPENDED", "REJECTED"])
});

export const ReviewDecisionSchema = z.object({
  periodId: z.string().min(1),
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewerId: z.string().min(1),
  reviewNotesHash: hexHash,
  reviewedAt: z.number().int().positive()
});

export const AssetStatusSnapshotSchema = z.object({
  periodId: z.string().min(1),
  assetId: hexHash,
  assetStatus: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "RETIRED"]),
  statusSourceTx: hexHash
});

export const RevenueSettlementRecordSchema = z.object({
  periodId: z.string().min(1),
  inflowUSDC6: usdc6String,
  fundedToDistributorUSDC6: usdc6String,
  settlementRef: z.string().min(1),
  reconciled: z.boolean()
});

export const IngestionInputSchema = z.object({
  periodId: z.string().min(1).max(31),
  siteId: z.string().min(1),
  startTs: z.number().int().nonnegative(),
  endTs: z.number().int().positive(),
  rawTelemetryFiles: z.array(z.string().min(1)).min(1),
  rawEventFiles: z.array(z.string().min(1)).min(1),
  simulatedMetrics: z
    .object({
      energyProducedKWh: z.number().nonnegative(),
      availabilityPct: z.number().min(0).max(100),
      offlineDurationSec: z.number().int().nonnegative(),
      anomalyFlags: z.array(z.string())
    })
    .optional()
});

export const LegacyPeriodInputBundleSchema = z.object({
  ingestion: IngestionInputSchema,
  statusSnapshot: z.array(AssetStatusSnapshotSchema).min(1),
  entitlements: z.array(EntitlementRecordSchema).min(1),
  reviewDecision: ReviewDecisionSchema
});

export const FacilityLocationSchema = z.object({
  country: z.string().min(1),
  region: z.string().min(1),
  siteName: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180)
});

export const FacilityCommercialTermsSchema = z.object({
  acquisitionCostUSDC6: usdc6String,
  commissionedAt: z.number().int().positive(),
  expectedLifetimePeriods: z.number().int().positive()
});

export const FacilityTechnicalProfileSchema = z.object({
  nameplateCapacityKW: z.number().positive(),
  gridConnectionId: z.string().min(1)
});

export const FacilityDeploymentInputSchema = z.object({
  facilityName: z.string().min(1),
  facilityType: z.enum(["INVERTER"]),
  location: FacilityLocationSchema,
  commercialTerms: FacilityCommercialTermsSchema,
  technicalProfile: FacilityTechnicalProfileSchema,
  beneficiary: evmAddress,
  operatorId: z.string().min(1),
  activateOnDeploy: z.boolean().optional()
});

export const FacilityDeploymentRecordSchema = FacilityDeploymentInputSchema.extend({
  facilityId: z.string().min(1),
  assetId: hexHash,
  deployedAt: z.number().int().positive(),
  lifecycleStatus: lifecycleStatus,
  tokenization: z.object({
    rawTokenId: z.string().min(1),
    metadataHash: hexHash,
    initialStatus: lifecycleStatus
  })
});

export const PeriodSimulationInputSchema = z.object({
  periodId: z.string().min(1).max(31),
  startTs: z.number().int().nonnegative(),
  endTs: z.number().int().positive(),
  capacityFactorPct: z.number().min(0).max(100).optional(),
  availabilityPct: z.number().min(0).max(100).optional(),
  soldRatioPct: z.number().min(0).max(100).optional(),
  payoutRatioPct: z.number().min(0).max(100).optional(),
  pricePerKWhUSDC6: usdc6String,
  payer: z.string().min(1),
  operatingState: z.enum(["ACTIVE", "PENDING"]).optional()
});

export const FacilityProductionDataSchema = z.object({
  startTs: z.number().int().nonnegative(),
  endTs: z.number().int().positive(),
  rawTelemetryFiles: z.array(z.string().min(1)).min(1),
  rawEventFiles: z.array(z.string().min(1)).min(1),
  energyGeneratedKWh: z.number().nonnegative(),
  energySoldKWh: z.number().nonnegative(),
  availabilityPct: z.number().min(0).max(100),
  operatingState: z.enum(["ACTIVE", "PENDING"]),
  anomalyFlags: z.array(z.string()),
  offlineDurationSec: z.number().int().nonnegative()
});

export const FacilityCashflowDataSchema = z.object({
  settlementRef: z.string().min(1),
  payer: z.string().min(1),
  grossRevenueUSDC6: usdc6String,
  netRevenueUSDC6: usdc6String,
  settledAt: z.number().int().positive()
});

export const RewardDistributionPlanSchema = z.object({
  beneficiary: evmAddress,
  amountUSDC6: usdc6String,
  eligibilityStatus: z.enum(["ELIGIBLE", "SUSPENDED", "REJECTED"])
});

export const FacilityOperatingPeriodSchema = z.object({
  periodId: z.string().min(1).max(31),
  facilityId: z.string().min(1),
  assetId: hexHash,
  siteId: z.string().min(1),
  productionData: FacilityProductionDataSchema,
  cashflowData: FacilityCashflowDataSchema,
  rewardDistribution: RewardDistributionPlanSchema
});

export const FacilityLifecycleEventInputSchema = z.object({
  eventType: z.enum(["DEPLOYED", "BROKEN", "REPAIRED", "RETIRED"]),
  eventTs: z.number().int().positive(),
  reason: z.string().min(1)
});

export const FacilityLifecycleEventSchema = z.object({
  facilityId: z.string().min(1),
  assetId: hexHash,
  eventId: z.string().min(1),
  eventType: z.enum(["DEPLOYED", "BROKEN", "REPAIRED", "RETIRED"]),
  fromStatus: lifecycleStatus,
  toStatus: lifecycleStatus,
  eventTs: z.number().int().positive(),
  reason: z.string().min(1),
  evidenceHash: hexHash
});

export const RewardFlowInputSchema = z.object({
  facility: FacilityDeploymentRecordSchema,
  operatingPeriod: FacilityOperatingPeriodSchema,
  reviewDecision: ReviewDecisionSchema,
  signedDecisionUri: z.string().min(1)
});

export type PeriodEvidence = z.infer<typeof PeriodEvidenceSchema>;
export type EntitlementRecord = z.infer<typeof EntitlementRecordSchema>;
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
export type AssetStatusSnapshot = z.infer<typeof AssetStatusSnapshotSchema>;
export type RevenueSettlementRecord = z.infer<typeof RevenueSettlementRecordSchema>;
export type IngestionInputData = z.infer<typeof IngestionInputSchema>;
export type LegacyPeriodInputBundle = z.infer<typeof LegacyPeriodInputBundleSchema>;
export type FacilityDeploymentInput = z.infer<typeof FacilityDeploymentInputSchema>;
export type FacilityDeploymentRecord = z.infer<typeof FacilityDeploymentRecordSchema>;
export type PeriodSimulationInput = z.infer<typeof PeriodSimulationInputSchema>;
export type FacilityOperatingPeriod = z.infer<typeof FacilityOperatingPeriodSchema>;
export type FacilityLifecycleEventInput = z.infer<typeof FacilityLifecycleEventInputSchema>;
export type FacilityLifecycleEvent = z.infer<typeof FacilityLifecycleEventSchema>;
export type RewardFlowInput = z.infer<typeof RewardFlowInputSchema>;
