import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulationReport } from './result.mjs';
test('reads the full final result when a user log is truncated', () => {
  const r = { schemaVersion: 1, sourceKind: 'deye-api-direct', inputDigest: 'test' };
  const output = 'DEYE_ORACLE_DIRECT_RESULT={"schemaVersion":1 ...(truncated)\n✓ Workflow Simulation Result:\n' + JSON.stringify(JSON.stringify(r)) + '\nDone';
  assert.deepEqual(simulationReport(output), r);
});
test('accepts a structured final result and ignores terminal colors', () => {
  assert.deepEqual(simulationReport('\u001b[32m✓ Workflow Simulation Result:\u001b[0m\n{"schemaVersion":1}'), { schemaVersion: 1 });
});
test('missing or invalid final output does not become a successful report', () => {
  assert.throws(() => simulationReport('workflow execution failed'));
  assert.throws(() => simulationReport('Workflow Simulation Result:\n"incomplete'));
});
