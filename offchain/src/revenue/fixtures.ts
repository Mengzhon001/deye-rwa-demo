import { Station, stationId, hash, AssumptionsSchema } from "./model";
export function syntheticStation(now: number, n = 1): Station {
  const end = new Date(now * 1000);
  end.setUTCDate(1);
  end.setUTCHours(0, 0, 0, 0);
  const history = Array.from({ length: 36 }, (_, i) => {
    const d = new Date(end);
    d.setUTCMonth(d.getUTCMonth() - 36 + i);
    const generation = Math.round(
      (620 + 340 * Math.sin(((d.getUTCMonth() - 2) * Math.PI) / 6)) *
        (1 + (n - 1) * 0.15)
    );
    return {
      month: d.toISOString().slice(0, 7),
      generationKWh: generation,
      exportKWh: Math.round(generation * 0.65),
      importKWh: 420,
      complete: true,
    };
  });
  return {
    id: stationId("eu", `DEMO-${n}`),
    region: "eu",
    sourceId: `DEMO-${n}`,
    name: `Deye Rooftop ${n}`,
    currency: "EUR",
    timezone: "Europe/Berlin",
    capacityKW: 8 + n,
    observedAt: now,
    source: "synthetic",
    sourceHash: hash(history),
    mappingVerified: true,
    history,
    devices: [{ serial: `DEMO-INV-${n}`, type: "INVERTER" }],
    alerts: [],
    latest: { generationPowerKW: 3.2 },
    metadata: {},
  };
}
export const demoAssumptions = (currency = "EUR") => {
  // Deliberate demo inputs, not live FX or electricity prices. Never reuse EUR FX for CNY.
  const defaults: Record<string, { fxUSDC: number; tariffLocal: number; gridTariffLocal: number }> = {
    EUR: { fxUSDC: 1.08, tariffLocal: 0.12, gridTariffLocal: 0.30 },
    CNY: { fxUSDC: 0.14, tariffLocal: 0.35, gridTariffLocal: 0.60 },
    USD: { fxUSDC: 1, tariffLocal: 0.12, gridTariffLocal: 0.25 },
  };
  if (!defaults[currency])
    throw new Error(
      "Explicit demo financial assumptions required for this station currency"
    );
  return AssumptionsSchema.parse({
    ...defaults[currency],
    revenueModel: "household-export",
    shareBps: 10000,
    costs: [
      {
        id: "maintenance",
        label: "Maintenance",
        payer: "revenue",
        annualLocal: 80,
        evidence: "demo maintenance budget",
      },
      {
        id: "insurance",
        label: "Insurance",
        payer: "revenue",
        annualLocal: 25,
        evidence: "demo insurance budget",
      },
    ],
  });
};
