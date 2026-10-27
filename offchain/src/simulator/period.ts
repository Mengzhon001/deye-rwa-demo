import {
  FacilityDeploymentRecordSchema,
  FacilityOperatingPeriodSchema,
  PeriodSimulationInputSchema,
  type FacilityDeploymentRecord,
  type FacilityOperatingPeriod,
  type PeriodSimulationInput
} from "../types/schemas";

function toStableFileSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function computeGrossRevenue(soldKWh: number, pricePerKWhUSDC6: string) {
  return BigInt(Math.round(soldKWh)) * BigInt(pricePerKWhUSDC6);
}

export function simulateFacilityPeriod(
  facility: FacilityDeploymentRecord,
  input: PeriodSimulationInput
): FacilityOperatingPeriod {
  const parsedFacility = FacilityDeploymentRecordSchema.parse(facility);
  const parsedInput = PeriodSimulationInputSchema.parse(input);

  if (parsedInput.endTs <= parsedInput.startTs) {
    throw new Error("period endTs must be greater than startTs");
  }

  if (parsedFacility.lifecycleStatus === "RETIRED") {
    throw new Error("cannot simulate operating period for a retired facility");
  }

  const operatingState =
    parsedInput.operatingState ?? (parsedFacility.lifecycleStatus === "ACTIVE" ? "ACTIVE" : "PENDING");
  const availabilityPct = parsedInput.availabilityPct ?? (operatingState === "ACTIVE" ? 98 : 0);
  const capacityFactorPct = parsedInput.capacityFactorPct ?? (operatingState === "ACTIVE" ? 72 : 0);
  const soldRatioPct = parsedInput.soldRatioPct ?? (operatingState === "ACTIVE" ? 95 : 0);
  const payoutRatioPct = parsedInput.payoutRatioPct ?? 100;

  const durationHours = (parsedInput.endTs - parsedInput.startTs) / 3600;
  const generatedKWh = Number(
    (
      parsedFacility.technicalProfile.nameplateCapacityKW *
      durationHours *
      (availabilityPct / 100) *
      (capacityFactorPct / 100)
    ).toFixed(2)
  );
  const soldKWh = Number((generatedKWh * (soldRatioPct / 100)).toFixed(2));
  const anomalyFlags = operatingState === "ACTIVE" ? ["NONE"] : ["FAULT_PENDING"];
  const offlineDurationSec =
    operatingState === "ACTIVE"
      ? Math.round((parsedInput.endTs - parsedInput.startTs) * ((100 - availabilityPct) / 100))
      : parsedInput.endTs - parsedInput.startTs;

  const grossRevenueUSDC6 =
    operatingState === "ACTIVE"
      ? computeGrossRevenue(soldKWh, parsedInput.pricePerKWhUSDC6)
      : 0n;
  const payoutBps = BigInt(Math.round(payoutRatioPct * 100));
  const netRevenueUSDC6 = (grossRevenueUSDC6 * payoutBps) / 10_000n;
  const eligibilityStatus =
    operatingState === "ACTIVE" && netRevenueUSDC6 > 0n ? "ELIGIBLE" : "SUSPENDED";
  const fileSlug = toStableFileSlug(`${parsedFacility.facilityId}-${parsedInput.periodId}`);

  return FacilityOperatingPeriodSchema.parse({
    periodId: parsedInput.periodId,
    facilityId: parsedFacility.facilityId,
    assetId: parsedFacility.assetId,
    siteId: parsedFacility.location.siteName,
    productionData: {
      startTs: parsedInput.startTs,
      endTs: parsedInput.endTs,
      rawTelemetryFiles: [`${fileSlug}-telemetry.csv`],
      rawEventFiles: [`${fileSlug}-events.json`],
      energyGeneratedKWh: generatedKWh,
      energySoldKWh: soldKWh,
      availabilityPct,
      operatingState,
      anomalyFlags,
      offlineDurationSec
    },
    cashflowData: {
      settlementRef: `SETTLE-${parsedInput.periodId}-${parsedFacility.facilityId}`,
      payer: parsedInput.payer,
      grossRevenueUSDC6: grossRevenueUSDC6.toString(),
      netRevenueUSDC6: netRevenueUSDC6.toString(),
      settledAt: parsedInput.endTs
    },
    rewardDistribution: {
      beneficiary: parsedFacility.beneficiary,
      amountUSDC6: netRevenueUSDC6.toString(),
      eligibilityStatus
    }
  });
}
