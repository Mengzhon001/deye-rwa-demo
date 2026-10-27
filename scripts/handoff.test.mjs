import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, rmSync, mkdtempSync, cpSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const root = resolve(import.meta.dirname, '..');
test('local configuration uses generated secrets and no customer station or private materials mount', () => {
  const compose = yaml.load(readFileSync(join(root, 'infra/revenue-web3/docker-compose.yml'), 'utf8'));
  assert.equal(compose.name, 'deye-rwa-platform');
  assert.match(compose.services.postgres.environment.POSTGRES_PASSWORD, /LOCAL_DATABASE_PASSWORD/);
  assert.match(compose.services.blockscout.environment.SECRET_KEY_BASE, /LOCAL_BLOCKSCOUT_SECRET/);
  assert.match(compose.services.app.environment.REVENUE_AUTO_SYNC_STATION_ID, /REVENUE_AUTO_SYNC_STATION_ID/);
  assert.ok(!JSON.stringify(compose).includes('materials_from_Deye'));
  for (const name of ['anvil', 'postgres', 'redis']) assert.equal(compose.services[name].ports, undefined);
});
test('new developers generate their own local accounts without printing private keys and can rerun init safely', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deye-handoff-'));
  try {
    mkdirSync(join(dir, 'scripts'));
    for (const name of ['revenue-web3.mjs', 'local-wallets.mjs']) cpSync(join(root, 'scripts', name), join(dir, 'scripts', name));
    cpSync(join(root, '.env.example'), join(dir, '.env.example'));
    // Resolve dependencies from this clean installation without copying credentials.
    require('node:fs').symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    const run = name => {
      const result = spawnSync(process.execPath, [join(dir, 'scripts', name), 'init'], { encoding: 'utf8', cwd: dir });
      assert.equal(result.status, 0, result.stderr); return result.stdout;
    };
    const first = run('revenue-web3.mjs');
    assert.ok(existsSync(join(dir, '.env.revenue')));
    const env = readFileSync(join(dir, '.env.web3.local'), 'utf8');
    assert.match(env, /LOCAL_DATABASE_PASSWORD=[a-f0-9]{48}/);
    assert.match(env, /LOCAL_BLOCKSCOUT_SECRET=[a-f0-9]{128}/);
    assert.ok(!first.includes(env.match(/^ANVIL_MNEMONIC=(.*)$/m)[1]));
    run('revenue-web3.mjs');
    assert.equal(readFileSync(join(dir, '.env.web3.local'), 'utf8'), env);
    const output = run('local-wallets.mjs');
    const path = join(dir, '.data/local-wallets/wallet-import.private.json');
    const wallets = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(new Set(Object.values(wallets).map(w => w.address)).size, 6);
    for (const w of Object.values(wallets)) assert.ok(!output.includes(w.privateKey));
    assert.equal(statSync(path).mode & 0o777, 0o600);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('re-preparing a recording keeps infrastructure credentials and isolated evidence mounts stable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deye-recording-handoff-'));
  try {
    for (const folder of ['ui/scripts/recording', 'infra/revenue-web3', '.data/demo-recording/source']) mkdirSync(join(dir, folder), { recursive: true });
    cpSync(join(root, 'ui/scripts/recording/environment.mjs'), join(dir, 'ui/scripts/recording/environment.mjs'));
    for (const name of ['docker-compose.yml', 'explorer-nginx.conf']) cpSync(join(root, 'infra/revenue-web3', name), join(dir, 'infra/revenue-web3', name));
    require('node:fs').symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    require('node:fs').writeFileSync(join(dir, '.data/demo-recording/source/station.json'), JSON.stringify({capturedAt: 1, history: []}));
    const code = "const {prepare}=await import('./ui/scripts/recording/environment.mjs');prepare('probe');";
    const run = () => {
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return readFileSync(join(dir, '.data/demo-recording/probe/environment.env'), 'utf8');
    };
    const first = run();
    assert.ok(run() === first, "Preparation must preserve generated credentials");
    assert.match(first, /LOCAL_DATABASE_PASSWORD=[a-f0-9]{64}/);
    assert.match(first, /LOCAL_BLOCKSCOUT_SECRET=[a-f0-9]{128}/);
    const compose = yaml.load(readFileSync(join(dir, '.data/demo-recording/probe/compose.yml'), 'utf8'));
    assert.ok(compose.name.startsWith('deye-demo-probe-'));
    assert.equal(compose.services.app.environment.REVENUE_AUTO_SYNC_STATION_ID, '');
    assert.ok(compose.services.app.volumes.some(v => v.endsWith(':/recording-evidence:ro')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
