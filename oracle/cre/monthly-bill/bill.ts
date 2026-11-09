import { z } from 'zod';
import { keccak256, stringToHex } from 'viem';

export const MODEL_VERSION = 'deye.oracle.monthly.fixed-point.v1';
export const CHAIN_ID = 84532;
export const CIRCLE_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const decimal = z.string().regex(/^(0|[1-9]\d{0,29})(\.\d{1,18})?$/);
const integer = z.string().regex(/^(0|[1-9]\d{0,29})$/);
const digest = z.string().regex(/^0x[0-9a-f]{64}$/);
const bps = z.number().int().min(0).max(10000);
export const InputSchema = z.object({
  schemaVersion: z.literal(1), chainId: z.literal(CHAIN_ID),
  sourceKind: z.enum(['synthetic', 'platform-replay', 'deye-api-direct']),
  stationKey: digest,
  observationMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  servicePeriod: z.number().int().min(1).max(360),
  sourceTimezone: z.string().min(1).max(100), sourceRevision: z.string().min(1).max(200),
  mappingVersion: z.string().min(1).max(100), complete: z.literal(true), provisional: z.literal(true),
  generationWh: integer, exportWh: integer,
  parameters: z.object({
    version: z.string().min(1).max(100), currency: z.string().regex(/^[A-Z]{3}$/),
    gridTariffLocalPerKWh: decimal, exportTariffLocalPerKWh: decimal,
    selfUseDeliveryBps: bps, householdPaymentBps: bps, shareBps: bps,
    costsLocal: decimal, fxUSDCPerLocal: decimal,
  }).strict(),
}).strict();
export type MonthlyInput = z.infer<typeof InputSchema>;

/** Same canonical key ordering as the application hash, without Node APIs. */
export function canonical(value: unknown): string {
  function order(v: any): any {
    if (Array.isArray(v)) return v.map(order);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, order(v[k])]));
    return v;
  }
  return JSON.stringify(order(value));
}
export const hash = (value: unknown) => keccak256(stringToHex(canonical(value)));

type Ratio = { n: bigint; d: bigint };
const r = (n: bigint, d = 1n): Ratio => ({ n, d });
const mul = (a: Ratio, b: Ratio): Ratio => r(a.n * b.n, a.d * b.d);
function dec(value: string): Ratio {
  const [whole, fraction = ''] = value.split('.');
  return r(BigInt(whole + fraction), 10n ** BigInt(fraction.length));
}
// Exact nonnegative arithmetic, half-up rounding at each payable USDC amount.
const usdc = (a: Ratio) => (a.n * 1000000n * 2n + a.d) / (a.d * 2n);

export function verifyMonthly(raw: unknown, expectedInputDigest?: string) {
  const input = InputSchema.parse(raw), inputDigest = hash(input);
  if (expectedInputDigest && inputDigest !== expectedInputDigest) throw Error('Input digest changed; review source revision and parameters');
  const generation = BigInt(input.generationWh), exported = BigInt(input.exportWh), p = input.parameters;
  if (exported > generation) throw Error('Export exceeds generation; reconcile metering before inferring billable self-use');
  if (dec(p.fxUSDCPerLocal).n === 0n) throw Error('FX must be positive');
  if (p.householdPaymentBps <= 0 || p.householdPaymentBps >= 10000) throw Error('Household payment must preserve the agreed discount');
  if (p.shareBps === 0) throw Error('Revenue assignment must be positive');
  const selfUseKWh = r((generation - exported) * BigInt(p.selfUseDeliveryBps), 1000n * 10000n);
  const gridReference = mul(selfUseKWh, dec(p.gridTariffLocalPerKWh));
  const household = mul(mul(gridReference, r(BigInt(p.householdPaymentBps), 10000n)), dec(p.fxUSDCPerLocal));
  const exportRevenue = mul(mul(r(exported, 1000n), dec(p.exportTariffLocalPerKWh)), dec(p.fxUSDCPerLocal));
  const householdUSDC6 = usdc(household), exportUSDC6 = usdc(exportRevenue);
  const requestedCosts = usdc(mul(dec(p.costsLocal), dec(p.fxUSDCPerLocal)));
  const gross = householdUSDC6 + exportUSDC6, costs = requestedCosts > gross ? gross : requestedCosts;
  const assigned = (gross - costs) * BigInt(p.shareBps) / 10000n;
  const { parameters: _, ...observation } = input;
  return {
    schemaVersion: 1, reportType: 'BillVerificationReport', modelVersion: MODEL_VERSION,
    executionMode: 'local-shadow', independentSourceVerified: false, provisional: true,
    chainId: CHAIN_ID, paymentToken: CIRCLE_USDC,
    stationKey: input.stationKey, observationMonth: input.observationMonth, servicePeriod: input.servicePeriod,
    sourceKind: input.sourceKind, sourceDigest: hash(observation), parametersHash: hash(p), inputDigest,
    householdUSDC6: String(householdUSDC6), exportUSDC6: String(exportUSDC6), costsUSDC6: String(costs),
    uncoveredCostsUSDC6: String(requestedCosts - costs), assignedUSDC6: String(assigned),
    retainedUSDC6: String(gross - costs - assigned),
  };
}
