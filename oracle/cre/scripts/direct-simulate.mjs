import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { simulationReport } from './result.mjs';
const project = fileURLToPath(new URL('..', import.meta.url));
const dir = resolve(process.env.ORACLE_CRE_DATA_DIR || join(project, '../../.data/oracle-cre/direct'));
mkdirSync(dir, { recursive: true, mode: 0o700 });
rmSync(join(dir, 'report.private.json'), { force: true });
const auth = JSON.parse(readFileSync(join(dir, 'auth.private.json'), 'utf8'));
const args = ['-R', project, '-T', 'direct-settings', 'workflow', 'simulate', 'monthly-bill', '--config', join(dir, 'config.private.json'), '--non-interactive', '--trigger-index', '0'];
const child = spawn(process.env.CRE_BINARY || 'cre', args, {
  cwd: project,
  env: { ...process.env, DEYE_READONLY_AUTH_ALL: JSON.stringify(auth), ...(process.env.BUN_BINARY ? { PATH: resolve(process.env.BUN_BINARY, '..') + ':' + process.env.PATH } : {}) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
const timer = setTimeout(() => child.kill('SIGTERM'), 180000);
let exit;
try { exit = await new Promise((ok, no) => { child.once('error', no); child.once('exit', ok); }); }
finally { clearTimeout(timer); }
// Keep detailed simulation logs local, including normalized report values.
writeFileSync(join(dir, 'simulation.log'), output, { mode: 0o600 });
if (exit !== 0) {
  const error = output.split('\n').filter(l => /failed:|^Error:|^✗|disagree|incomplete|missing|invalid/i.test(l)).slice(-4).join('\n');
  console.error(error.replaceAll(auth.appSecret, '[redacted]').replaceAll(auth.passwordSha256, '[redacted]').replaceAll(auth.email, '[redacted]').replaceAll(auth.appId, '[redacted]'));
  throw Error('Direct-source CRE simulation did not produce a verified report; inspect the restricted local log');
}
const report = simulationReport(output);
if (report.executionMode !== 'local-direct-simulation' || report.sourceKind !== 'deye-api-direct' || !report.dailyReconciled || report.independentSourceVerified !== false) throw Error('Unexpected report assurance');
const reference = JSON.parse(readFileSync(join(dir, 'reference.private.json'), 'utf8'));
const fields = ['householdUSDC6', 'exportUSDC6', 'costsUSDC6', 'assignedUSDC6', 'retainedUSDC6'];
const differences = fields.filter(k => report[k] !== reference.amounts[k]);
writeFileSync(join(dir, 'report.private.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
writeFileSync(join(dir, 'comparison.private.json'), JSON.stringify({ sameAsPriorCapture: differences.length === 0, differingFields: differences, observationMonth: report.observationMonth, sourceRevisionKind: report.sourceRevisionKind }, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ directDeyeAPI: true, coveredDays: report.coveredDays, dailyReconciled: true, sameAsPriorCapture: differences.length === 0, differingFields: differences, execution: 'local CRE simulation', publicChainWrites: 0 }));
