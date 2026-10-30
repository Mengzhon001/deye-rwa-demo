import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspaceMetadata, workspaceBalances, workspaceRecords } from './workspace';

const address = '0x1111111111111111111111111111111111111111';
function fixture() {
  const saved = {
    manifest: { chainId: 84532, addresses: { vault: '0x2222222222222222222222222222222222222222', usdc: '0x3333333333333333333333333333333333333333' } },
    mode: 'replay', captureFile: '/private/evidence.json', wallets: { secret: 'must not be returned' },
    stations: [{ id: 'station', name: 'Recorded station', source: 'replay', observedAt: 123, rawEvidence: 'private' }],
    operations: [{ id: 'op', actor: 'investor', action: 'subscribe', status: 'submitted', payload: { secret: 'private' },
      steps: { approve: { hash: '0xabc', rawTransaction: 'private' }, subscribe: { hash: '0xabc' } } }],
  };
  const runtime: any = { repo: { read: () => saved }, address: (actor: string) => { assert.equal(actor, 'investor'); return address; },
    state: () => { throw Error('Full state must not be queried'); },
    usdc: { balanceOf: async (a: string) => { assert.equal(a,address); return 123456789n; },
      runner: { provider: { getBalance: async (a: string) => { assert.equal(a,address); return 99000000000000000n; } } } } };
  const catalog: any = { entry: () => ({ title: { zh: '测试产品', en: 'Test product' }, kind: 'experience', createdAt: 55 }) };
  return { saved, runtime, catalog };
}

test('metadata and saved records use allowlists and do not query financial state', () => {
  const { runtime, catalog } = fixture();
  const metadata = workspaceMetadata(runtime,catalog), records = workspaceRecords(runtime);
  assert.equal(metadata.chainId,84532);assert.equal(metadata.stations[0].name,'Recorded station');
  assert.deepEqual(Object.keys(metadata).sort(),['chainId','mode','product','readAt','stations','vault']);
  assert.deepEqual(Object.keys(metadata.stations[0]).sort(),['id','name','observedAt','source']);
  assert.deepEqual(records.records,[{id:'op',actor:'investor',action:'subscribe',status:'submitted',hashes:['0xabc']}]);
  assert.doesNotMatch(JSON.stringify({metadata,records}),/private|secret|wallets|payload|rawTransaction|captureFile/);
});
test('balance reads identify the signed-in account and preserve exact units', async () => {
  const { runtime } = fixture(), balance = await workspaceBalances(runtime,'investor');
  assert.equal(balance.address,address);assert.equal(balance.chainId,84532);
  assert.equal(balance.usdc,'123456789');assert.equal(balance.nativeBalanceWei,'99000000000000000');
  assert.equal(balance.vault,runtime.repo.read().manifest.addresses.vault);
});
test('unavailable balance reads fail instead of returning fabricated zero values', async () => {
  const { runtime } = fixture();runtime.usdc.balanceOf = async () => { throw Error('RPC unavailable'); };
  await assert.rejects(workspaceBalances(runtime,'investor'),/RPC unavailable/);
  runtime.usdc.runner = undefined;
  await assert.rejects(workspaceBalances(runtime,'investor'),/provider unavailable/);
});
