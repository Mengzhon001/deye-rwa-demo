import type { EvidenceOutput } from "./evidence";
import type { ReviewDecision } from "../types/schemas";
import type {
  FacilityDeploymentSubmission,
  FacilityLifecycleSubmission,
  TeamBToTeamAInput
} from "../types/handoff";
import { evidenceHash, facilityDistributionLeaf } from "../utils/hash";
import {
  FacilityDeploymentRecordSchema,
  FacilityLifecycleEventSchema,
  type FacilityDeploymentRecord,
  type FacilityLifecycleEvent
} from "../types/schemas";

function serialHashForFacility(record: FacilityDeploymentRecord): `0x${string}` {
  return evidenceHash({
    facilityId: record.facilityId,
    facilityName: record.facilityName,
    operatorId: record.operatorId
  });
}

function siteHashForFacility(record: FacilityDeploymentRecord): `0x${string}` {
  return evidenceHash({
    facilityId: record.facilityId,
    siteName: record.location.siteName,
    gridConnectionId: record.technicalProfile.gridConnectionId,
    latitude: record.location.latitude,
    longitude: record.location.longitude
  });
}

export function buildDeploymentSubmissionPayload(
  facility: FacilityDeploymentRecord,
  admin = facility.beneficiary
): FacilityDeploymentSubmission {
  const record = FacilityDeploymentRecordSchema.parse(facility);

  return {
    facilityId: record.assetId as `0x${string}`,
    admin: admin as `0x${string}`,
    serialHash: serialHashForFacility(record),
    siteHash: siteHashForFacility(record),
    metadataHash: record.tokenization.metadataHash as `0x${string}`,
    acquisitionCostUSDC6: record.commercialTerms.acquisitionCostUSDC6,
    commissionedAt: record.commercialTerms.commissionedAt,
    activateOnMint: record.tokenization.initialStatus === "ACTIVE"
  };
}

export function buildLifecycleSubmissionPayload(
  lifecycleEvent: FacilityLifecycleEvent
): FacilityLifecycleSubmission {
  const event = FacilityLifecycleEventSchema.parse(lifecycleEvent);

  return {
    facilityId: event.assetId as `0x${string}`,
    status: event.toStatus,
    eventHash: event.evidenceHash as `0x${string}`
  };
}

export function buildTeamBToTeamAPayload(
  facilityId: `0x${string}`,
  settlementRef: string,
  evidence: EvidenceOutput,
  reviewDecision: ReviewDecision,
  periodIdBytes32: `0x${string}`,
  signedDecisionUri = "file://review-decision-signed.json"
): TeamBToTeamAInput {
  if (reviewDecision.status !== "APPROVED") {
    throw new Error("review decision must be APPROVED before chain submission");
  }

  return {
    facilityId,
    periodId: periodIdBytes32,
    reviewTimestamp: reviewDecision.reviewedAt,
    signedDecisionUri,
    productionReport: {
      amountUSDC6: evidence.totalEligibleAmountUSDC6,
      evidenceHash: evidence.periodEvidence.evidenceHash as `0x${string}`,
      reportHash: evidenceHash({
        facilityId,
        periodId: periodIdBytes32,
        kind: "production",
        evidenceHash: evidence.periodEvidence.evidenceHash
      }),
      schemaVersionHash: evidence.schemaVersionHash
    },
    cashflowReport: {
      amountUSDC6: evidence.totalEligibleAmountUSDC6,
      settlementRef,
      reportHash: evidenceHash({
        facilityId,
        periodId: periodIdBytes32,
        kind: "cashflow",
        settlementRef,
        amountUSDC6: evidence.totalEligibleAmountUSDC6
      })
    },
    rewardFunding: {
      amountUSDC6: evidence.totalEligibleAmountUSDC6,
      claimRoot: facilityDistributionLeaf(
        evidence.periodEvidence.periodId,
        facilityId,
        evidence.totalEligibleAmountUSDC6
      )
    }
  };
}
