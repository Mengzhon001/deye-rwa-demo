import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { simulationReport } from './result.mjs';
const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const root = resolve(project, '../..');
const require = createRequire(import.meta.url);
const { keccak256, toUtf8Bytes } = require('../../../node_modules/ethers');
const inputFile = resolve(process.env.ORACLE_INPUT_FILE || join(project, 'fixtures/example-month.json'));
const data = resolve(process.env.ORACLE_CRE_DATA_DIR || join(root, '.data/oracle-cre'));
mkdirSync(data, { recursive: true, mode: 0o700 });
// A failed retry must not leave an earlier report looking like its new result.
rmSync(join(data, 'report.private.json'), { force: true });
const input = JSON.parse(readFileSync(inputFile, 'utf8'));
function order(v) { return Array.isArray(v) ? v.map(order) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, order(v[k])])) : v; }
const expectedInputDigest = keccak256(toUtf8Bytes(JSON.stringify(order(input))));
const body = JSON.stringify(input);
const server = createServer((req, res) => {
  if (req.method !== 'GET' || req.url !== '/month') { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(body);
});
await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok); });
const config = { mode: 'local-shadow', schedule: '0 0 1 1 *', sourceUrl: `http://127.0.0.1:${server.address().port}/month`, expectedInputDigest };
const configFile = join(data, 'simulation.config.private.json');
writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
const args = ['-R', project, '-T', 'local-shadow', 'workflow', 'simulate', 'monthly-bill', '--config', configFile, '--non-interactive', '--trigger-index', '0'];
try {
  const child = spawn(process.env.CRE_BINARY || 'cre', args, { cwd: project, env: { ...process.env, ...(process.env.BUN_BINARY ? { PATH: resolve(process.env.BUN_BINARY, '..') + ':' + process.env.PATH } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', b => { output += b; process.stdout.write(b); });
  child.stderr.on('data', b => { output += b; process.stderr.write(b); });
  const timer = setTimeout(() => child.kill('SIGTERM'), 180000);
  const exit = await new Promise((ok, no) => { child.once('error', no); child.once('exit', ok); }); clearTimeout(timer);
  writeFileSync(join(data, 'simulation.log'), output, { mode: 0o600 });
  if (exit !== 0) throw Error('CRE simulation did not produce a verified report; inspect the local simulation log');
  const report = simulationReport(output);
  if (report.inputDigest !== expectedInputDigest || report.executionMode !== 'local-shadow' || report.independentSourceVerified !== false) throw Error('Unexpected simulation report identity');
  writeFileSync(join(data, 'report.private.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log('Local shadow simulation succeeded. No transaction was broadcast and no DON deployment was performed.');
} finally { await new Promise(ok => server.close(ok)); }
