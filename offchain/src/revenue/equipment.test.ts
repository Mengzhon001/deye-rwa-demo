import test from "node:test";
import assert from "node:assert/strict";
import { equipmentEligibility } from "./equipment";
import { forecast } from "./model";
import { syntheticStation, demoAssumptions } from "./fixtures";

const start = Date.UTC(2026, 10, 1) / 1000;
const base = { commissionedOn: "2020-01-01", pvUsefulLifeYears: 25, pvAnnualLossPct: 0.7,
  source: "owner-declared", evidence: "Commissioning certificate and equipment inspection supplied by household",
  reviewedAt: start, reviewer: "0x123" } as const;
test("missing and unreviewed equipment cannot support a new rights sale", () => {
  assert.equal(equipmentEligibility(undefined, start, 60).status, "missing");
  assert.equal(equipmentEligibility({ ...base, reviewedAt: undefined }, start, 60).status, "pending");
});
test("remaining PV life is a hard limit; a replacement plan must cover battery health", () => {
  assert.equal(equipmentEligibility(base, start, 60).status, "eligible");
  assert.equal(equipmentEligibility({ ...base, pvUsefulLifeYears: 10 }, start, 60).status, "rejected");
  const battery = { commissionedOn: "2022-01-01", usefulLifeYears: 10, stateOfHealthPct: 82,
    minimumHealthPct: 80, annualCapacityLossPct: 2, batteryDependentSelfUsePct: 40 };
  assert.equal(equipmentEligibility({ ...base, battery }, start, 60).status, "rejected");
  assert.equal(equipmentEligibility({ ...base, battery: { ...battery, replacementMonth: 12, replacementCostLocal: 500 } }, start, 60).status, "eligible");
});
test("battery capacity loss moves battery-dependent self-use to export and funded replacement enters cost", () => {
  const station = syntheticStation(start);
  const assumptions = demoAssumptions(station.currency);
  const battery = { commissionedOn: "2022-01-01", usefulLifeYears: 15, stateOfHealthPct: 95,
    minimumHealthPct: 70, annualCapacityLossPct: 4, batteryDependentSelfUsePct: 50,
    replacementMonth: 24, replacementCostLocal: 1200 };
  const equipmentEvidence = { ...base, battery };
  const ordinary = forecast(station, assumptions, start);
  const aged = forecast(station, { ...assumptions, equipmentEvidence,
    costs: [...assumptions.costs, { id: "battery-replacement", label: "Battery replacement", payer: "revenue",
      annualLocal: 1200, replacementMonth: 24, evidence: base.evidence }] }, start);
  assert.ok(aged.rows[12].exportKWh > ordinary.rows[12].exportKWh);
  assert.ok(aged.rows[12].billing!.selfUseKWh < ordinary.rows[12].billing!.selfUseKWh);
  assert.ok(aged.rows[23].costsLocal > ordinary.rows[23].costsLocal + 1000);
});
