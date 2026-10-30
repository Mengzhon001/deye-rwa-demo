import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HDNodeWallet } from 'ethers';
import { chromium } from 'playwright';

// Read-only UI checks against explicit test environments. Only sign-in/logout
// requests are permitted. Delayed and failed state responses are browser fixtures.
const dir = process.env.REVENUE_UNIFIED_DATA_DIR;
const rolesFile = process.env.BASE_EXISTING_ROLES_FILE;
if (!dir || !rolesFile) throw Error('Explicit test directories and test wallets required');
const origin = JSON.parse(readFileSync(join(dir, 'public.json'))).app;
const wallet = HDNodeWallet.fromPhrase(JSON.parse(readFileSync(rolesFile)).wallets.investor.phrase);
const out = join(dir, 'validation/login-loading');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [], errors = [];

async function fixture(id) {
  const path = `/networks/${id}`;
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  const post = async (url, body) => {
    const response = await fetch(origin + path + url, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.ok(response.ok, `Sign-in request failed (${response.status})`);
    return response;
  };
  const c = await (await post('/api/auth/challenge', { address: wallet.address, requestedRole: 'investor' })).json();
  const verified = await post('/api/auth/verify', { nonce: c.nonce, signature: await wallet.signMessage(c.message) });
  const cookie = verified.headers.get('set-cookie').split(';')[0];
  const response = await fetch(origin + path + '/api/state', { headers: { Cookie: cookie } });
  assert.ok(response.ok);
  const state = await response.json();
  assert.equal(state.manifest.chainId, id === 'private' ? 20261008 : 84532);
  return { id, path, state, cookie };
}

async function setup(f, { signedIn = true, language = 'zh', mobile = false, fastTimeout = false, failure = false } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  if (signedIn) {
    const i = f.cookie.indexOf('=');
    await context.addCookies([{ name: f.cookie.slice(0, i), value: f.cookie.slice(i + 1), url: origin + f.path + '/', httpOnly: true, secure: true, sameSite: 'Strict' }]);
  }
  let signatures = 0;
  await context.exposeFunction('__loadingTestSign', async message => { signatures++; return wallet.signMessage(message); });
  await context.addInitScript(({ address, chainId, language, fastTimeout }) => {
    localStorage.setItem('revenue.lang', language);
    localStorage.setItem('revenue.wallet', 'rabby');
    const handlers = {};
    window.__loadingTestEmit = (name, value) => (handlers[name] || []).forEach(fn => fn(value));
    window.ethereum = {
      isRabby: true,
      on(name, fn) { (handlers[name] ||= []).push(fn); },
      removeListener(name, fn) { handlers[name] = (handlers[name] || []).filter(h => h !== fn); },
      async request({ method, params }) {
        if (method === 'eth_chainId') return '0x' + chainId.toString(16);
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [address];
        if (method === 'personal_sign') return window.__loadingTestSign(params[0]);
        throw Error('Loading test must not send wallet transactions: ' + method);
      },
    };
    if (fastTimeout) {
      const original = AbortSignal.timeout.bind(AbortSignal);
      AbortSignal.timeout = ms => original(ms === 45000 ? 150 : ms);
    }
  }, { address: wallet.address, chainId: f.state.manifest.chainId, language, fastTimeout });
  const control = { reads: 0, held: [], mode: failure ? 'failure' : 'hold' };
  await context.route('**/api/**', route => {
    if (route.request().method() !== 'GET' && !/\/api\/auth\/(challenge|verify|logout)$/.test(new URL(route.request().url()).pathname)) {
      errors.push('Unexpected mutation');
      return route.abort();
    }
    return route.fallback();
  });
  // Keep coverage of old-server compatibility. Progressive rendering has its own suite.
  await context.route('**/api/network', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), progressiveWorkspace: false } });
  });
  await context.route('**/api/state', async route => {
    control.reads++;
    if (control.mode === 'hold') await new Promise(resolve => control.held.push(resolve));
    try {
      await route.fulfill({ status: control.mode === 'failure' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(control.mode === 'failure' ? { error: 'State service unavailable' } : f.state) });
    } catch { /* The browser may have cancelled this read after invalidation. */ }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + f.path + '/app/?lang=' + language + '&wallet=rabby');
  if (!signedIn) {
    await page.locator('[data-wl-role="investor"]').click();
    await page.locator('[data-wl-connect]').click();
  }
  await page.locator('.wallet-workspace').waitFor();
  const release = (mode = 'success') => { control.mode = mode; control.held.splice(0).forEach(resolve => resolve()); };
  return { context, page, control, release, signatures: () => signatures };
}

try {
  const base = await fixture('base-sepolia');
  const first = await setup(base, { signedIn: false });
  assert.equal(first.signatures(), 1);
  assert.match(await first.page.locator('#wallet-status').innerText(), /已登录/);
  assert.match(await first.page.locator('#wallet-workspace-title').innerText(), /正在加载/);
  assert.ok(await first.page.locator('#wallet-connect').isDisabled());
  assert.equal(await first.page.locator('.wallet-login[open]').count(), 0);
  await first.page.evaluate(() => { document.querySelector('#refresh').click(); document.querySelector('#wallet-connect').click(); });
  assert.equal(first.control.reads, 1);
  await first.page.locator('[data-wallet-load-detail]').filter({ hasText: '网络响应较慢' }).waitFor();
  await first.page.screenshot({ path: join(out, 'loading.zh.png') });
  await first.page.locator('#language').click();
  assert.match(await first.page.locator('#wallet-workspace-title').innerText(), /Loading your workspace/);
  first.release();
  await first.page.locator('#nav [data-page]').first().waitFor();
  assert.equal(await first.page.locator('.wallet-workspace').count(), 0);
  assert.equal(first.signatures(), 1);
  // Reload restores the session and displays loading without asking to sign again.
  first.control.mode = 'hold';
  await first.page.reload();
  await first.page.locator('.wallet-workspace[aria-busy="true"]').waitFor();
  assert.equal(first.signatures(), 1);
  first.release();
  await first.page.locator('#nav [data-page]').first().waitFor();
  results.push('Signed login, slow response, language switch, duplicate-click prevention and reload restore');
  await first.context.close();

  const failed = await setup(base, { failure: true });
  await failed.page.locator('#wallet-load-retry').waitFor();
  assert.match(await failed.page.locator('.wallet-workspace').innerText(), /登录状态已保留/);
  failed.control.mode = 'success';
  await failed.page.locator('#wallet-load-retry').click();
  await failed.page.locator('#nav [data-page]').first().waitFor();
  assert.equal(failed.signatures(), 0);
  results.push('Unavailable state service retries without reconnecting or signing');
  await failed.context.close();

  const timeout = await setup(base, { language: 'en', mobile: true, fastTimeout: true });
  await timeout.page.locator('#wallet-load-retry').waitFor();
  assert.match(await timeout.page.locator('.wallet-workspace').innerText(), /query timed out/);
  await timeout.page.screenshot({ path: join(out, 'timeout-mobile.en.png') });
  timeout.release();
  await timeout.page.locator('#wallet-load-retry').click();
  await timeout.page.locator('#nav [data-page]').first().waitFor();
  assert.equal(timeout.signatures(), 0);
  results.push('Accelerated browser-only timeout, English mobile recovery and no additional signature');
  await timeout.context.close();

  const changed = await setup(base);
  await changed.page.evaluate(() => window.__loadingTestEmit('accountsChanged', []));
  changed.release();
  await changed.page.locator('#wallet-connect-main').waitFor();
  await changed.page.waitForTimeout(200);
  assert.equal(await changed.page.locator('#nav [data-page]').count(), 0);
  assert.equal(await changed.page.evaluate(() => walletSession), undefined);
  assert.equal(await changed.page.evaluate(() => state), undefined);
  results.push('Wallet invalidation cancels loading and cannot restore an old protected workspace');
  await changed.context.close();

  const local = await setup(await fixture('private'));
  assert.match(await local.page.locator('#wallet-status').innerText(), /已登录/);
  local.release();
  await local.page.locator('#nav [data-page]').first().waitFor();
  assert.equal(local.signatures(), 0);
  results.push('Private demo chain retains normal sign-in and rendering');
  await local.context.close();
  assert.deepEqual(errors, []);
  writeFileSync(join(out, 'results.json'), JSON.stringify({ at: new Date().toISOString(), origin, simulatedProvider: true, realSignedBackendSessions: true, readOnlyStateFixtures: true, results, errors }, null, 2));
  console.log(`PASS ${results.length} workspace loading scenarios; no business transactions`);
} finally { await browser.close(); }
