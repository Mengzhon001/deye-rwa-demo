export type IngestionInput = {
  periodId: string;
  siteId: string;
  startTs: number;
  endTs: number;
  rawTelemetryFiles: string[];
  rawEventFiles: string[];
  simulatedMetrics?: {
    energyProducedKWh: number;
    availabilityPct: number;
    offlineDurationSec: number;
    anomalyFlags: string[];
  };
};

export type NormalizedDataset = {
  periodId: string;
  siteId: string;
  startTs: number;
  endTs: number;
  rowCount: number;
  schemaVersion: string;
  qualityReport: {
    missingValues: number;
    badTimestampRows: number;
    droppedRows: number;
  };
  energyProducedKWh: number;
  availabilityPct: number;
  offlineDurationSec: number;
  anomalyFlags: string[];
};

export function normalizeIngestion(input: IngestionInput): NormalizedDataset {
  if (input.endTs <= input.startTs) {
    throw new Error("endTs must be greater than startTs");
  }

  const defaultEnergyProduced = Number(((input.rawTelemetryFiles.length * 1000) / 80).toFixed(2));
  const simulatedMetrics = input.simulatedMetrics ?? {
    energyProducedKWh: defaultEnergyProduced,
    availabilityPct: 99.0,
    offlineDurationSec: 0,
    anomalyFlags: ["NONE"]
  };

  return {
    periodId: input.periodId,
    siteId: input.siteId,
    startTs: input.startTs,
    endTs: input.endTs,
    rowCount: input.rawTelemetryFiles.length * 1000,
    schemaVersion: "offchain.v1",
    qualityReport: {
      missingValues: 0,
      badTimestampRows: 0,
      droppedRows: 0
    },
    energyProducedKWh: simulatedMetrics.energyProducedKWh,
    availabilityPct: simulatedMetrics.availabilityPct,
    offlineDurationSec: simulatedMetrics.offlineDurationSec,
    anomalyFlags: simulatedMetrics.anomalyFlags
  };
}
