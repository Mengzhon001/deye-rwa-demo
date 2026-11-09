import { describe, expect, test } from 'bun:test';
import fixture from '../fixtures/example-month.json';
import { canonical, hash, verifyMonthly } from './bill';
const example = () => structuredClone(fixture);

describe('Independent monthly bill calculation', () => {
  test('matches the Oracle plan example exactly', () => {
    const r = verifyMonthly(example());
    expect([r.householdUSDC6, r.exportUSDC6, r.costsUSDC6, r.assignedUSDC6, r.retainedUSDC6]).toEqual(['36288000', '19600000', '14000000', '41888000', '0']);
    expect(r.independentSourceVerified).toBe(false); expect(r.executionMode).toBe('local-shadow');
  });
  test('hashes bind source revisions and ignore property ordering', () => {
    const input = example(), digest = hash(input);
    expect(hash(Object.fromEntries(Object.entries(input).reverse()))).toBe(digest);
    expect(verifyMonthly(input, digest).inputDigest).toBe(digest);
    input.sourceRevision = 'changed'; expect(() => verifyMonthly(input, digest)).toThrow('Input digest changed');
  });
  test('FX rounding cannot distribute an unfunded extra micro-USDC', () => {
    const input = example(); Object.assign(input, { generationWh: '1000', exportWh: '500' });
    Object.assign(input.parameters, { gridTariffLocalPerKWh: '0.000001', exportTariffLocalPerKWh: '0.000001', selfUseDeliveryBps: 10000, householdPaymentBps: 9999, costsLocal: '0', fxUSDCPerLocal: '1' });
    const r = verifyMonthly(input);
    expect([r.householdUSDC6, r.exportUSDC6, r.assignedUSDC6]).toEqual(['0', '1', '1']);
  });
  test('tracks uncovered costs without inventing available funds', () => {
    const input = example(); input.parameters.costsLocal = '1000'; const r = verifyMonthly(input);
    expect([r.costsUSDC6, r.assignedUSDC6, r.uncoveredCostsUSDC6]).toEqual(['55888000', '0', '84112000']);
  });
  test('applies assignment once and retains the remainder', () => {
    const input = example(); input.parameters.shareBps = 8000; const r = verifyMonthly(input);
    expect([r.assignedUSDC6, r.retainedUSDC6]).toEqual(['33510400', '8377600']);
  });
  test.each([
    ['missing energy', (x: any) => { x.generationWh = null; }],
    ['incomplete month', (x: any) => { x.complete = false; }],
    ['wrong chain', (x: any) => { x.chainId = 1; }],
    ['unknown schema', (x: any) => { x.schemaVersion = 2; }],
    ['unsupported provenance', (x: any) => { x.sourceKind = 'deye-direct'; }],
    ['unreconciled export', (x: any) => { x.exportWh = '2000000'; }],
    ['negative costs', (x: any) => { x.parameters.costsLocal = '-1'; }],
    ['zero FX', (x: any) => { x.parameters.fxUSDCPerLocal = '0'; }],
    ['unknown fields', (x: any) => { x.amount = '123'; }],
  ])('rejects %s', (_, change) => {
    const input = example(); change(input); expect(() => verifyMonthly(input)).toThrow();
  });
  test('keeps distinct deterministic source and parameter hashes', () => {
    const r = verifyMonthly(example()); expect(r.sourceDigest).not.toBe(r.parametersHash);
    expect(verifyMonthly(JSON.parse(canonical(example())))).toEqual(r);
  });
});
