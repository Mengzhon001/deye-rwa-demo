import { expect, test } from 'bun:test';
import example from '../fixtures/example-month.json';
import { hash } from './bill';
import { normalizeDirect, validateDirectConfig, joinDailyWindows, type DirectConfig } from './deye-direct';
const config = (): DirectConfig => ({
  mode: 'local-direct-simulation', schedule: '0 0 1 1 *', region: 'eu', stationId: '123',
  stationKey: hash({ namespace: 'deye.station.v2', region: 'eu', sourceId: '123' }),
  observationMonth: '2026-08', servicePeriod: 1, sourceTimezone: 'Asia/Shanghai',
  observationStartUtc: 1785513600, observationEndUtc: 1788192000, expectedDays: 31,
  mappingVersion: 'deye.generationValue-gridValue.kWh.v1', parameters: example.parameters,
  expectedParametersHash: hash(example.parameters),
});
const detail = () => ({ success: true, station: { id: 123, regionTimezone: 'Asia/Shanghai' } });
const monthly = () => ({ success: true, total: 1, stationDataItems: [{ year: 2026, month: 8, day: 0, generationValue: 310, gridValue: 31 }] });
const daily = () => ({ success: true, total: 31, stationDataItems: Array.from({ length: 31 }, (_, i) => ({ year: 2026, month: 8, day: i + 1, generationValue: 10, gridValue: 1 })) });
const now = 1791000000;

test('normalizes complete direct observations and keeps simulation assurance explicit', () => {
  const r = normalizeDirect(config(), detail(), monthly(), daily(), now);
  expect(r.sourceKind).toBe('deye-api-direct'); expect(r.coveredDays).toBe(31);
  expect(r.dailyReconciled).toBe(true); expect(r.independentSourceVerified).toBe(false);
  expect(r.executionMode).toBe('local-direct-simulation');
});
test('request identifiers and response ordering cannot change normalized source revision', () => {
  const a = normalizeDirect(config(), detail(), monthly(), daily(), now);
  const d = daily(); d.stationDataItems.reverse();
  const b = normalizeDirect(config(), { ...detail(), requestId: 'different' }, { ...monthly(), requestId: 'also-different' }, d, now);
  expect(b.sourceRevisionKind).toBe('normalized-content-hash'); expect(b.sourceDigest).toBe(a.sourceDigest);
});
test.each([
  ['wrong station', (c: any, d: any) => { d.station.id = 124; }],
  ['wrong timezone', (c: any, d: any) => { d.station.regionTimezone = 'UTC'; }],
  ['missing day', (c: any, d: any, m: any, rows: any) => { rows.stationDataItems.pop(); rows.total--; }],
  ['duplicate day', (c: any, d: any, m: any, rows: any) => { rows.stationDataItems[30].day = 30; }],
  ['monthly/daily conflict', (c: any, d: any, m: any) => { m.stationDataItems[0].gridValue = 30.9; }],
  ['partial response', (c: any, d: any, m: any) => { m.total = 2; }],
  ['missing export', (c: any, d: any, m: any) => { m.stationDataItems[0].gridValue = null; }],
  ['unapproved parameter change', (c: any) => { c.parameters = { ...c.parameters, costsLocal: '200' }; }],
])('rejects %s', (_, change) => {
  const c = config(), d = detail(), m = monthly(), days = daily(); change(c, d, m, days);
  expect(() => normalizeDirect(c, d, m, days, now)).toThrow();
});
test('accepts but excludes only the next-month boundary day', () => {
  const d = daily(); d.stationDataItems.push({ year: 2026, month: 9, day: 1, generationValue: 99, gridValue: 99 }); d.total++;
  expect(normalizeDirect(config(), detail(), monthly(), d, now).coveredDays).toBe(31);
});
test('rejects a month that has not actually closed', () => {
  expect(() => validateDirectConfig(config(), 1786000000)).toThrow('not closed');
});
test('bounded daily windows preserve all 31 days and deduplicate an equal boundary', () => {
  const rows = daily().stationDataItems;
  const a = { success: true, total: 16, stationDataItems: rows.slice(0, 16) };
  const b = { success: true, total: 16, stationDataItems: rows.slice(15) };
  expect(normalizeDirect(config(), detail(), monthly(), joinDailyWindows([a, b]), now).coveredDays).toBe(31);
  b.stationDataItems[0] = { ...b.stationDataItems[0], gridValue: 2 };
  expect(() => joinDailyWindows([a, b])).toThrow('conflicting boundary');
});
test('source revision binds daily distribution even when monthly totals remain equal', () => {
  const a = normalizeDirect(config(), detail(), monthly(), daily(), now);
  const days = daily(); days.stationDataItems[0].generationValue = 9; days.stationDataItems[1].generationValue = 11;
  expect(normalizeDirect(config(), detail(), monthly(), days, now).sourceDigest).not.toBe(a.sourceDigest);
});
