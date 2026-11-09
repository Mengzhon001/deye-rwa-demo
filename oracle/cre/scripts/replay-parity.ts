import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { AssumptionsSchema, monthlyRevenue } from '../../../offchain/src/revenue/model';
import { paymentAmounts } from '../../../ui/src/revenue/household-billing';
import { hash, verifyMonthly, type MonthlyInput } from '../monthly-bill/bill';

const source = process.env.ORACLE_REPLAY_STORE;
if (!source) throw Error('Set ORACLE_REPLAY_STORE to an authorized local application store; no source evidence is bundled');
const dir = resolve(process.env.ORACLE_CRE_DATA_DIR || '.data/oracle-cre/replay-parity');
mkdirSync(dir, { recursive: true, mode: 0o700 });
const s = JSON.parse(readFileSync(resolve(source), 'utf8'));
const stations: any[] = Object.values(s.stations);
const apps: any[] = Object.values(s.applications);
const results: any[] = [], skipped: Record<string, number> = {};
let firstInput: MonthlyInput | undefined;
function wh(kWh: number): string {
  const value = kWh * 1000, rounded = Math.round(value);
  if (!Number.isFinite(value) || value < 0 || Math.abs(value - rounded) > 0.000001) throw Error('Observed energy needs an explicit sub-Wh normalization policy');
  return String(rounded);
}
for (const station of stations) {
  const app = apps.find(a => a.stationId === station.id && a.assumptions?.revenueModel === 'household-export');
  if (!app) continue;
  const a = AssumptionsSchema.parse(app.assumptions);
  for (const row of station.history) {
    if (!row.complete || row.generationKWh == null || row.exportKWh == null || row.exportKWh > row.generationKWh) {
      skipped.ineligibleObservedMonths = (skipped.ineligibleObservedMonths || 0) + 1; continue;
    }
    // Historical observations are test vectors, not newly issued service bills.
    for (const period of [1, 2, 12, a.termMonths].filter((v, i, all) => all.indexOf(v) === i && v <= a.termMonths)) {
      const current = monthlyRevenue(a, row, period);
      const expected = paymentAmounts(current, a.fxUSDC, a.shareBps);
      const input: MonthlyInput = {
        schemaVersion: 1, chainId: 84532, sourceKind: 'platform-replay', stationKey: station.id.toLowerCase(),
        observationMonth: row.month, servicePeriod: period, sourceTimezone: station.timezone,
        sourceRevision: station.sourceHash, mappingVersion: 'existing-normalized-history.wh.v1',
        complete: true, provisional: true, generationWh: wh(row.generationKWh), exportWh: wh(row.exportKWh),
        parameters: {
          version: 'existing-agreement-resolved-period.v1', currency: station.currency,
          gridTariffLocalPerKWh: String(current.gridTariffLocal), exportTariffLocalPerKWh: String(current.exportTariffLocal),
          selfUseDeliveryBps: a.selfUseDeliveryPct * 100, householdPaymentBps: a.householdPaymentBps,
          shareBps: a.shareBps, costsLocal: String(current.costsLocal), fxUSDCPerLocal: String(a.fxUSDC),
        },
      };
      const report = verifyMonthly(input, hash(input));
      const fields = ['householdUSDC6', 'exportUSDC6', 'costsUSDC6', 'assignedUSDC6', 'retainedUSDC6'] as const;
      const mismatches = fields.filter(k => report[k] !== expected[k]);
      results.push({ observationMonth: row.month, servicePeriod: period, inputDigest: report.inputDigest, equal: mismatches.length === 0, mismatches });
      if (!firstInput && !mismatches.length) firstInput = input;
    }
  }
}
const validation = {
  kind: 'local-replay-arithmetic-comparison', sourceAssurance: 'platform-replay; not independent source attestation',
  comparison: 'existing resolved per-period tariffs and costs versus exact rational bill calculation',
  networkWrites: 0, checked: results.length, passed: results.filter(r => r.equal).length, skipped, results,
};
writeFileSync(join(dir, 'parity.private.json'), JSON.stringify(validation, null, 2) + '\n', { mode: 0o600 });
if (firstInput) writeFileSync(join(dir, 'month.private.json'), JSON.stringify(firstInput, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ checked: validation.checked, passed: validation.passed, skipped, sourceAssurance: validation.sourceAssurance }));
if (!results.length || results.some(r => !r.equal)) throw Error('No comparable records or a micro-USDC mismatch; inspect the local parity report');
