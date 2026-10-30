import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUnifiedEntry } from './health.mjs';

test('a surviving connector is not evidence of a working public endpoint', async () => {
  const unavailable = await checkUnifiedEntry('https://expired.trycloudflare.com', async () => {
    throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
  });
  assert.deepEqual(unavailable, { healthy: false, reason: 'ENOTFOUND' });
  const wrong = await checkUnifiedEntry('https://example.trycloudflare.com', async () =>
    Response.json({ version: 1, networks: [{ id: 'base-sepolia', chainId: 84532 }] }));
  assert.equal(wrong.healthy, false);
  const valid = await checkUnifiedEntry('https://example.trycloudflare.com', async (url, init) => {
    assert.equal(url, 'https://example.trycloudflare.com/networks.json');
    assert.equal(init.cache, 'no-store');
    return Response.json({ version: 1, networks: [
      { id: 'private', chainId: 20261008 }, { id: 'base-sepolia', chainId: 84532 },
    ] });
  });
  assert.deepEqual(valid, { healthy: true });
});
