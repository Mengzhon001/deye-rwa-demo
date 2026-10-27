import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const cwd = resolve(import.meta.dirname, '..');
const port = Number(process.env.REVENUE_BILLING_TEST_PORT || 4185);
if (!Number.isInteger(port) || port < 1024 || [4174, 4000, 18545].includes(port)) throw new Error('Use a separate test port');
const base = `http://127.0.0.1:${port}`;
try { await fetch(base + '/api/network'); throw new Error('Test port already occupied'); }
catch (e) { if (e.message === 'Test port already occupied') throw e; }
const data = mkdtempSync(join(tmpdir(), 'deye-billing-ui-'));
const env = { ...process.env, HARDHAT_NETWORK: 'hardhat', HARDHAT_CONFIG: '../onchain/hardhat.config.ts', REVENUE_ENV_FILE: join(data, 'no-env'), REVENUE_DATA_DIR: data, REVENUE_PORT: String(port), REVENUE_HOST: '127.0.0.1', REVENUE_WALLET_REQUIRED: 'false', REVENUE_AUTO_VERIFY: 'false', REVENUE_AUTO_SYNC_STATION_ID: '', REVENUE_SEED_STAGE: 'fundraising', REVENUE_BILLING_TEST_URL: base };
for (const key of Object.keys(env)) if (/^REVENUE_(.*_ADDRESS|SYSTEM_MNEMONIC|CHAIN_ID|RPC_URL|ALLOWED_ORIGINS)$/.test(key)) delete env[key];
const cachedBrowser = resolve(cwd, '../.data/playwright-browsers');
if (!env.PLAYWRIGHT_BROWSERS_PATH && existsSync(cachedBrowser)) env.PLAYWRIGHT_BROWSERS_PATH = cachedBrowser;
const run = args => new Promise((resolve, reject) => {
  const c = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
  c.on('error', reject); c.on('exit', code => code === 0 ? resolve() : reject(new Error(`Test command failed (${code})`)));
});
const server = spawn(process.execPath, ['--import','tsx','src/revenue/server.ts'], { cwd, env, stdio: 'inherit' });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Isolated server exited');
    try { ready = (await fetch(base + '/api/network')).ok; } catch {}
    if (ready) break;
    await new Promise(r => setTimeout(r, 200));
  }
  if (!ready) throw new Error('Isolated server did not start');
  await run(['--import','tsx','src/revenue/seed.ts']);
  await run(['../node_modules/@playwright/test/cli.js','test','--config','site/playwright.config.ts','cashflow.spec.ts']);
} finally { server.kill('SIGTERM'); }
