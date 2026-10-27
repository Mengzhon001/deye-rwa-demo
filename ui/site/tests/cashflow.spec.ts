import { test, expect } from '@playwright/test';
// Run against the disposable in-process chain created by scripts/test-billing-ui.mjs.
test.skip(!process.env.REVENUE_BILLING_TEST_URL, 'Requires an isolated seeded billing scenario');
test.use({ baseURL: process.env.REVENUE_BILLING_TEST_URL || 'http://127.0.0.1:4175' });
async function openRole(page: any, role: string, language = 'zh') {
  await page.addInitScript(({ role, language }: any) => {
    localStorage.setItem('revenue.role', role);
    localStorage.setItem('revenue.actor', role);
    localStorage.setItem('revenue.lang', language);
  }, { role, language });
  await page.goto('/app/');
  await expect(page.locator('#nav')).toBeVisible();
}
test('owner timeline uses the saved forecast, switches months and preserves values after refresh', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openRole(page, 'owner');
  await page.locator('[data-page="owner_agreement"]').click();
  await page.locator('[data-wf-open]').first().click();
  const timeline = page.locator('[data-cf-owner]');
  await expect(timeline).toBeVisible();
  const response = await page.request.get('/api/state');
  const s = await response.json(), report = s.applications[0].offer;
  expect(report.assumptions.revenueModel).toBe('household-export');
  expect(report.assumptions.shareBps).toBe(10000);
  expect(report.assumptions.householdPaymentBps).toBe(8000);
  await expect(timeline.locator('.cf-discount')).toContainText((Number(report.rows[0].presentValueUSDC6) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  await timeline.locator('.pt-detail-disclosure > summary').click();
  await expect(timeline.locator('[data-pt-period="1"] [data-pt-value="generation"]')).toContainText(report.rows[0].generationKWh.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  await timeline.locator('[data-cf-select]').selectOption('11');
  await expect(timeline.locator('.cf-period-date')).toContainText(new Date(report.rows[11].dueAt * 1000).toISOString().slice(0,10));
  await timeline.locator('[data-cf-month="23"]').click();
  await expect(timeline.locator('[data-cf-select]')).toHaveValue('23');
  await page.addStyleTag({ content: '.layout,.main{height:auto!important;overflow:visible!important}body{height:auto!important;overflow:visible!important}' });
  await timeline.locator('[data-pt-jump]').selectOption('1');
  await timeline.locator('.period-timeline').screenshot({ path: 'test-results/billing-owner-zh.png' });
  await page.reload();
  await page.locator('[data-page="owner_agreement"]').click();
  if (!await page.locator('[data-cf-owner]').count()) await page.locator('[data-wf-open]').first().click();
  await expect(page.locator('[data-cf-owner]')).toContainText('业主支付给项目的电费');
  expect(errors).toEqual([]);
});
test('investor chart shows cash receipts and terminal cash once in Chinese and English', async ({ page }) => {
  await openRole(page, 'investor');
  await page.locator('#nav [data-page="pool_detail"]').click();
  const panel = page.locator('.cf-investor');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('业主电费 ＋ 售电收入');
  await expect(panel.locator('.pt-period')).toHaveCount(61);
  await expect(panel.locator('[data-pt-period="1"] [data-pt-value="receipts"]')).toHaveText('0.00');
  await expect(panel.locator('[data-pt-period="3"] .pt-time')).toContainText('分配');
  const s = await (await page.request.get('/api/state')).json();
  await expect(panel.locator('.cf-flow')).toHaveCount(s.poolProjection.cashflows.length - 1);
  await expect(panel.locator('.cf-terminal')).toHaveCount(1);
  await page.addStyleTag({ content: '.layout,.main{height:auto!important;overflow:visible!important}body{height:auto!important;overflow:visible!important}' });
  await panel.locator('.period-timeline').screenshot({ path: 'test-results/billing-investor-zh.png' });
  await page.locator('#language').click();
  await expect(panel).toContainText('Household bills + exports');
  await expect(panel).toContainText('Projected net IRR');
  await panel.getByText('Monthly collection, fee and distribution ledger · whole pool').click();
  await expect(panel.locator('tbody tr')).toHaveCount(60);
});
test('mobile owner, keyboard period selection and bilingual public documentation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRole(page, 'owner', 'en');
  await page.locator('[data-page="owner_agreement"]').click();
  await page.locator('[data-wf-open]').first().click();
  const panel = page.locator('[data-cf-owner]');
  await expect(panel).toContainText('Household payment to the project');
  await panel.locator('[data-cf-month="1"]').focus();
  await page.keyboard.press('Enter');
  await expect(panel.locator('[data-cf-select]')).toHaveValue('1');
  await page.addStyleTag({ content: '.layout,.main{height:auto!important;overflow:visible!important}body{height:auto!important;overflow:visible!important}' });
  await panel.locator('[data-pt-jump]').selectOption('1');
  await panel.locator('.period-timeline').screenshot({ path: 'test-results/billing-owner-mobile.png' });
  const widths = await panel.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.width + 2);
  for (const language of ['zh','en']) {
    await page.goto(`/docs/${language}/valuation`);
    await expect(page.locator('.period-timeline')).toBeVisible();
    await expect(page.locator('#main')).toContainText('41.888');
    await expect(page.locator('[data-pt-period="1"] [data-pt-value="household"]')).toHaveText('259.20');
    await expect(page.locator('.pt-period')).toHaveCount(60);
    await page.goto(`/docs/${language}/accounting`);
    await expect(page.locator('.period-timeline')).toBeVisible();
    await expect(page.locator('.pt-period')).toHaveCount(61);
    await page.locator('.pt-tools').scrollIntoViewIfNeeded();
    await page.locator('[data-pt-jump]').selectOption('final');
    await expect(page.locator('[data-pt-period="final"]')).toBeInViewport();
    await expect(page.locator('[data-pt-period="final"] [data-pt-value="generation"]')).toHaveText('—');
    await page.locator('[data-pt-jump]').selectOption('1');
    const before = await page.locator('.pt-scroll').evaluate(el => el.scrollLeft);
    await page.locator('[data-pt-scroll="1"]').click();
    expect(await page.locator('.pt-scroll').evaluate(el => el.scrollLeft)).toBeGreaterThan(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
    await page.locator('[data-pt-jump]').selectOption('1');
    await page.locator('.period-timeline').screenshot({ path: `test-results/period-docs-${language}-mobile.png` });
  }
  await page.setViewportSize({width:1440,height:1100});
  for (const slug of ['valuation','accounting']) {
    await page.goto(`/docs/zh/${slug}`);
    await page.locator('.period-timeline').screenshot({path:`test-results/period-docs-${slug}-desktop.png`});
  }
});
test('intermediary monthly receivable shows both sources from the confirmed backend calculation', async ({ page }) => {
  await openRole(page, 'agent');
  const origin = process.env.REVENUE_BILLING_TEST_URL!;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { headers: { Origin: origin }, data });
    const body = await response.json();
    expect(response.ok(), JSON.stringify(body)).toBeTruthy();
    return body;
  };
  const act = async (role: string, action: string, payload = {}) => {
    await post('/api/session', { role });
    return post('/api/actions', { action, payload, idempotencyKey: crypto.randomUUID() });
  };
  const s = await (await page.request.get('/api/state')).json();
  const target = BigInt(s.chain.target);
  await act('investor', 'subscribe', { amountUSDC6: (target / 2n).toString() });
  await act('investor2', 'subscribe', { amountUSDC6: (target - target / 2n).toString() });
  await act('agent', 'advance', { by: 'cooling' });
  await act('agent', 'settle');
  await act('agent', 'prepare-valuation');
  await act('trustee', 'approve-valuation', { acceptProvisional: true });
  await act('agent', 'advance', { by: 'month' });
  await act('agent', 'accrue-fee');
  await act('agent', 'book-revenue', { applicationId: s.applications[0].id, period: 1, historyMonth: s.stations[0].history.at(-1).month });
  const after = await (await page.request.get('/api/state')).json();
  expect(after.income[0].billing.householdPaymentLocal).toBeGreaterThan(0);
  expect(after.income[0].billing.exportRevenueLocal).toBeGreaterThan(0);
  expect(after.income[0].amountUSDC6).toBe(after.income[0].billing.assignedUSDC6);
  await page.reload();
  await page.locator('#nav [data-page="agent_monitor"]').click();
  await expect(page.getByRole('columnheader', { name: '业主电费', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '售电收入', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '受让现金流 USDC', exact: true })).toBeVisible();
});
