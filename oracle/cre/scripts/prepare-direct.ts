import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { loadDeyeCredentials, deyeConfig } from '../../../offchain/src/revenue/deye';
import { AssumptionsSchema, monthlyRevenue } from '../../../offchain/src/revenue/model';
import { paymentAmounts } from '../../../ui/src/revenue/household-billing';
import { hash } from '../monthly-bill/bill';
import { validateDirectConfig } from '../monthly-bill/deye-direct';

const store = process.env.ORACLE_REPLAY_STORE, credentials = process.env.DEYE_CREDENTIALS_FILE;
if (!store || !credentials) throw Error('Set explicit ORACLE_REPLAY_STORE and DEYE_CREDENTIALS_FILE paths to authorized local inputs');
const s = JSON.parse(readFileSync(resolve(store), 'utf8'));
const stations: any[] = Object.values(s.stations);
if (stations.length !== 1) throw Error('This first direct-source test requires one explicitly selected station');
const station = stations[0];
const app: any = Object.values(s.applications).find((a: any) => a.stationId === station.id && a.assumptions?.revenueModel === 'household-export');
if (!app || !station.mappingVerified) throw Error('Existing agreement and reviewed field mapping are required');
const month = process.env.ORACLE_OBSERVATION_MONTH || station.history.filter((r: any) => r.complete && r.generationKWh != null && r.exportKWh != null && r.exportKWh <= r.generationKWh).at(-1)?.month;
const row = station.history.find((r: any) => r.month === month);
if (!row?.complete) throw Error('Select an existing reviewed, complete observation month');
const a = AssumptionsSchema.parse(app.assumptions), servicePeriod = 1;
const reference = monthlyRevenue(a, row, servicePeriod);
const parameters = {
  version: 'existing-agreement-resolved-period.v1', currency: station.currency,
  gridTariffLocalPerKWh: String(reference.gridTariffLocal), exportTariffLocalPerKWh: String(reference.exportTariffLocal),
  selfUseDeliveryBps: a.selfUseDeliveryPct * 100, householdPaymentBps: a.householdPaymentBps, shareBps: a.shareBps,
  costsLocal: String(reference.costsLocal), fxUSDCPerLocal: String(a.fxUSDC),
};
function boundary(year: number, month: number): number {
  const base = Date.UTC(year, month, 1), format = new Intl.DateTimeFormat('en-CA', { timeZone: station.timezone, timeZoneName: 'longOffset' });
  let candidate = base;
  for (let i = 0; i < 3; i++) {
    const text = format.formatToParts(new Date(candidate)).find(p => p.type === 'timeZoneName')!.value;
    const match = text.match(/^GMT([+-])(\d{2}):(\d{2})$/);
    if (text !== 'GMT' && !match) throw Error('Timezone offset is unavailable');
    const offset = match ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) * 60000 : 0;
    const next = base - offset; if (next === candidate) break; candidate = next;
  }
  return candidate / 1000;
}
const [year, m] = month.split('-').map(Number);
const config = validateDirectConfig({
  mode: 'local-direct-simulation', schedule: '0 0 1 1 *', region: station.region,
  stationId: station.sourceId, stationKey: station.id.toLowerCase(), observationMonth: month, servicePeriod,
  sourceTimezone: station.timezone, observationStartUtc: boundary(year, m - 1), observationEndUtc: boundary(year, m),
  expectedDays: new Date(Date.UTC(year, m, 0)).getUTCDate(), mappingVersion: 'deye.generationValue-gridValue.kWh.v1',
  parameters, expectedParametersHash: hash(parameters),
}, Math.floor(Date.now() / 1000));
const env = { ...process.env, DEYE_REGION: station.region };
loadDeyeCredentials(resolve(credentials), env);
const auth = deyeConfig(env);
const dir = resolve(process.env.ORACLE_CRE_DATA_DIR || '.data/oracle-cre/direct');
mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700);
function save(name: string, value: unknown) { const p = join(dir, name); writeFileSync(p, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); chmodSync(p, 0o600); }
save('config.private.json', config);
save('auth.private.json', { appId: auth.appId, appSecret: auth.appSecret, email: auth.email, passwordSha256: createHash('sha256').update(auth.password).digest('hex'), ...(auth.companyId ? { companyId: auth.companyId } : {}) });
save('reference.private.json', { observationMonth: month, amounts: paymentAmounts(reference, a.fxUSDC, a.shareBps), sourceAssurance: 'existing captured history; comparison only' });
console.log('Prepared direct-source simulation inputs in restricted local storage; no credentials were printed or uploaded.');
