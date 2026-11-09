import { z } from 'zod';
import { InputSchema, hash, verifyMonthly, type MonthlyInput } from './bill';

export const DEYE_HOSTS = {
  eu: 'https://eu1-developer.deyecloud.com',
  us: 'https://us1-developer.deyecloud.com',
  india: 'https://india-developer.deyecloud.com',
} as const;
export const DirectConfigSchema = z.object({
  mode: z.literal('local-direct-simulation'), schedule: z.string().min(1),
  region: z.enum(['eu', 'us', 'india']),
  stationId: z.string().regex(/^[1-9]\d{0,14}$/),
  stationKey: z.string().regex(/^0x[0-9a-f]{64}$/),
  observationMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  servicePeriod: z.number().int().min(1).max(360),
  sourceTimezone: z.string().min(1).max(100),
  observationStartUtc: z.number().int().positive(), observationEndUtc: z.number().int().positive(),
  expectedDays: z.number().int().min(28).max(31),
  mappingVersion: z.string().min(1).max(100),
  parameters: InputSchema.shape.parameters,
  expectedParametersHash: z.string().regex(/^0x[0-9a-f]{64}$/),
}).strict();
export type DirectConfig = z.infer<typeof DirectConfigSchema>;
export const AuthSchema = z.object({
  appId: z.string().min(1), appSecret: z.string().min(1), email: z.string().email(),
  passwordSha256: z.string().regex(/^[0-9a-f]{64}$/), companyId: z.string().min(1).optional(),
}).strict();
export type ReadPath = '/station/detail' | '/station/history';

function energyWh(value: unknown): bigint {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw Error('Deye energy is missing or invalid');
  const wh = value * 1000, rounded = Math.round(wh);
  if (!Number.isSafeInteger(rounded) || Math.abs(wh - rounded) > 0.000001) throw Error('Deye energy requires an explicit sub-Wh mapping');
  return BigInt(rounded);
}
function rows(response: any): any[] {
  if (!response || response.success !== true || !Array.isArray(response.stationDataItems)) throw Error('Deye historical response schema is invalid');
  const total = Number(response.total);
  if (!Number.isSafeInteger(total) || total !== response.stationDataItems.length) throw Error('Deye historical response is incomplete or paginated');
  return response.stationDataItems;
}
function rowMonth(row: any): string {
  if (!Number.isInteger(row.year) || row.year < 2000 || !Number.isInteger(row.month) || row.month < 1 || row.month > 12) throw Error('Deye historical month is ambiguous');
  return `${row.year}-${String(row.month).padStart(2, '0')}`;
}
/** Join bounded history windows; equal boundary rows are deduplicated, conflicts fail. */
export function joinDailyWindows(responses: unknown[]) {
  const combined = new Map<string, any>();
  for (const response of responses) for (const row of rows(response)) {
    const key = `${rowMonth(row)}-${row.day}`;
    const previous = combined.get(key);
    if (previous && (energyWh(previous.generationValue) !== energyWh(row.generationValue) || energyWh(previous.gridValue) !== energyWh(row.gridValue))) throw Error('Deye history windows contain conflicting boundary observations');
    if (!previous) combined.set(key, row);
  }
  return { success: true, total: combined.size, stationDataItems: [...combined.values()] };
}
export function validateDirectConfig(raw: unknown, now: number): DirectConfig {
  const c = DirectConfigSchema.parse(raw);
  if (c.stationKey !== hash({ namespace: 'deye.station.v2', region: c.region, sourceId: c.stationId })) throw Error('Station identity binding mismatch');
  if (hash(c.parameters) !== c.expectedParametersHash) throw Error('Parameter snapshot changed');
  const [year, month] = c.observationMonth.split('-').map(Number);
  if (new Date(Date.UTC(year, month, 0)).getUTCDate() !== c.expectedDays) throw Error('Observation calendar length mismatch');
  const length = c.observationEndUtc - c.observationStartUtc;
  if (Math.abs(length - c.expectedDays * 86400) > 7200 || now < c.observationEndUtc) throw Error('Observation period is not closed or its boundaries are invalid');
  return c;
}
/** Responses are read directly from Deye; only normalized, non-secret facts enter consensus. */
export function normalizeDirect(rawConfig: unknown, detail: any, monthly: any, daily: any, now: number) {
  const c = validateDirectConfig(rawConfig, now);
  const station = detail?.station;
  if (detail?.success !== true || !station || String(station.id) !== c.stationId || station.regionTimezone !== c.sourceTimezone) throw Error('Deye station or timezone does not match the request');
  const monthlyRows = rows(monthly);
  if (monthlyRows.length !== 1 || rowMonth(monthlyRows[0]) !== c.observationMonth || monthlyRows[0].day !== 0) throw Error('Expected one unambiguous monthly observation');
  const generation = energyWh(monthlyRows[0].generationValue), exported = energyWh(monthlyRows[0].gridValue);
  const days = new Map<number, { generation: bigint; exported: bigint }>();
  const [year, month] = c.observationMonth.split('-').map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  for (const row of rows(daily)) {
    const observedMonth = rowMonth(row);
    // Some Deye endpoints include the end-boundary day. It is never billed twice.
    if (observedMonth === nextMonth && row.day === 1) continue;
    if (observedMonth !== c.observationMonth || !Number.isInteger(row.day) || row.day < 1 || row.day > c.expectedDays || days.has(row.day)) throw Error('Deye daily periods are duplicated or outside the requested month');
    days.set(row.day, { generation: energyWh(row.generationValue), exported: energyWh(row.gridValue) });
  }
  if (days.size !== c.expectedDays) throw Error('Deye daily observation coverage is incomplete');
  const summed = [...days.values()].reduce((a, d) => ({ generation: a.generation + d.generation, exported: a.exported + d.exported }), { generation: 0n, exported: 0n });
  if (summed.generation !== generation || summed.exported !== exported) throw Error('Deye monthly and daily energy disagree; reconcile before verifying a bill');
  const facts = {
    stationKey: c.stationKey, observationMonth: c.observationMonth, sourceTimezone: c.sourceTimezone,
    observationStartUtc: c.observationStartUtc, observationEndUtc: c.observationEndUtc,
    mappingVersion: c.mappingVersion, generationWh: String(generation), exportWh: String(exported),
    coveredDays: days.size, revisionKind: 'normalized-content-hash',
    dailyDigest: hash([...days.entries()].sort(([a], [b]) => a - b).map(([day, e]) => ({ day, generationWh: String(e.generation), exportWh: String(e.exported) }))),
  };
  const input: MonthlyInput = {
    schemaVersion: 1, chainId: 84532, sourceKind: 'deye-api-direct', stationKey: c.stationKey,
    observationMonth: c.observationMonth, servicePeriod: c.servicePeriod, sourceTimezone: c.sourceTimezone,
    sourceRevision: hash(facts), mappingVersion: c.mappingVersion, complete: true, provisional: true,
    generationWh: String(generation), exportWh: String(exported), parameters: c.parameters,
  };
  return {
    ...verifyMonthly(input), executionMode: 'local-direct-simulation',
    sourceEndpoint: DEYE_HOSTS[c.region], sourceRevisionKind: 'normalized-content-hash',
    coveredDays: days.size, dailyReconciled: true, upstreamRevisionAvailable: false,
    observationStartUtc: c.observationStartUtc, observationEndUtc: c.observationEndUtc,
    parameterAssurance: 'pinned-local-snapshot; not yet registered onchain',
  };
}
