import {
  FacilityDeploymentRecordSchema,
  FacilityLifecycleEventInputSchema,
  FacilityLifecycleEventSchema,
  type FacilityDeploymentRecord,
  type FacilityLifecycleEvent,
  type FacilityLifecycleEventInput
} from "../types/schemas";
import { evidenceHash } from "../utils/hash";

function nextStatus(eventType: FacilityLifecycleEventInput["eventType"]) {
  switch (eventType) {
    case "DEPLOYED":
      return "ACTIVE";
    case "BROKEN":
      return "PENDING";
    case "REPAIRED":
      return "ACTIVE";
    case "RETIRED":
      return "RETIRED";
  }
}

export function emitLifecycleEvent(
  facility: FacilityDeploymentRecord,
  input: FacilityLifecycleEventInput
): FacilityLifecycleEvent {
  const parsedFacility = FacilityDeploymentRecordSchema.parse(facility);
  const parsedInput = FacilityLifecycleEventInputSchema.parse(input);
  const toStatus = nextStatus(parsedInput.eventType);
  const evidence = evidenceHash({
    facilityId: parsedFacility.facilityId,
    eventType: parsedInput.eventType,
    eventTs: parsedInput.eventTs,
    reason: parsedInput.reason,
    toStatus
  });

  return FacilityLifecycleEventSchema.parse({
    facilityId: parsedFacility.facilityId,
    assetId: parsedFacility.assetId,
    eventId: `EVT-${evidence.slice(2, 10).toUpperCase()}`,
    eventType: parsedInput.eventType,
    fromStatus: parsedFacility.lifecycleStatus,
    toStatus,
    eventTs: parsedInput.eventTs,
    reason: parsedInput.reason,
    evidenceHash: evidence
  });
}
