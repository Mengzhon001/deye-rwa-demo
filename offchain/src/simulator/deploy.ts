import {
  FacilityDeploymentInputSchema,
  FacilityDeploymentRecordSchema,
  type FacilityDeploymentInput,
  type FacilityDeploymentRecord
} from "../types/schemas";
import { evidenceHash } from "../utils/hash";

function buildFacilityId(input: FacilityDeploymentInput) {
  const hash = evidenceHash({
    facilityName: input.facilityName,
    location: input.location,
    commissionedAt: input.commercialTerms.commissionedAt
  });

  return `FAC-${hash.slice(2, 10).toUpperCase()}`;
}

export function deployFacility(input: FacilityDeploymentInput): FacilityDeploymentRecord {
  const parsed = FacilityDeploymentInputSchema.parse(input);
  const facilityId = buildFacilityId(parsed);
  const initialStatus = parsed.activateOnDeploy === false ? "PENDING" : "ACTIVE";

  return FacilityDeploymentRecordSchema.parse({
    ...parsed,
    facilityId,
    assetId: evidenceHash({
      facilityId,
      beneficiary: parsed.beneficiary,
      facilityType: parsed.facilityType
    }),
    deployedAt: parsed.commercialTerms.commissionedAt,
    lifecycleStatus: initialStatus,
    tokenization: {
      rawTokenId: `RAW-${facilityId}`,
      metadataHash: evidenceHash({
        facilityId,
        facilityName: parsed.facilityName,
        location: parsed.location,
        commercialTerms: parsed.commercialTerms,
        technicalProfile: parsed.technicalProfile
      }),
      initialStatus
    }
  });
}
