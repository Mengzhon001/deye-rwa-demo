/* Shared, read-only presentation of saved station and pool forecasts. No new valuation model. */
(() => {
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = ts => Number.isFinite(ts) ? new Date(ts * 1000).toISOString().slice(0, 10) : '—';
  const usd = v => v == null ? null : Number(v) / 1e6;
  const sum = (rows, f) => rows.some(r => f(r) == null) ? null : rows.reduce((s, r) => s + f(r), 0);
  const translate = lang => (zh, en) => lang === 'en' ? en : zh;
  function owner(report, price, currency, lang = 'zh') {
    const t = translate(lang), a = report.assumptions;
    const rows = [
      ['generation', t('预测发电量', 'Solar generation'), 'kWh', 'energy'],
      ['export', t('预测售电量', 'Exported electricity'), 'kWh', 'energy'],
      ['self', t('可计费自用量', 'Delivered self-use'), 'kWh', 'energy'],
      ['baseline', t('同量全购电费用', 'Same supply · all-grid'), currency, 'bill'],
      ['bill', t('出售后总电量费', 'Energy bill after sale'), currency, 'bill'],
      ['saving', t('业主少付电费', 'Household saving'), currency, 'saving'],
      ['household', t('① 业主付给项目', '① Household → project'), currency, 'income'],
      ['sale', t('② 电网售电收入', '② Export revenue'), currency, 'income'],
      ['cost', t('③ 约定站点费用', '③ Station expenses'), currency, 'cost'],
      ['assigned', t('本期净应收款', 'Net receivable earned'), 'USDC', 'net'],
      ['due', t('预计收到本期款', 'Expected collection'), t('回款日', 'UTC date'), 'date'],
      ['factor', t('乘以折现因子', '× Discount factor'), `${a.discountBps / 100}% ${t('年折现率', 'annual rate')}`, 'discount'],
      ['pv', t('折算到估值日', 'Value today'), 'USDC', 'pv'],
    ];
    const columns = report.rows.map((r, i) => {
      const b = r.billing;
      return { month:r.month, index:i, label:t(`第 ${r.month} 期`, `Period ${r.month}`), date:date(r.calculation?.serviceStart), end:date(r.calculation?.serviceEnd),
        values:{ generation:r.generationKWh, export:r.exportKWh, self:b?.selfUseKWh, baseline:b?.allGridBillLocal, bill:b?.householdBillLocal, saving:b?.householdSavingLocal, household:b?.householdPaymentLocal, sale:b?.exportRevenueLocal, cost:r.costsLocal, assigned:usd(r.assignedUSDC6), due:date(r.dueAt), factor:r.discountFactor, pv:usd(r.presentValueUSDC6) } };
    });
    return {kind:'owner', rows, columns, lang,
      openingLabel:t('第 0 期 · 成功结算时业主收款', 'Time 0 · household receives at successful settlement'), openingValue:usd(price ?? report.rightsValueUSDC6),
      intro:t('每列是一个月的用电服务。先看电量和业主账单，再看净应收款如何折现。', 'Each column is one month of electricity service. Follow energy and household bills down to the receivable and its present value.'),
      rule:t(`净应收款 = (① + ② − ③，最低为 0) × ${a.shareBps / 100}% × ${a.fxUSDC} USDC/${currency}`, `Net receivable = max(0, ① + ② − ③) × ${a.shareBps / 100}% × ${a.fxUSDC} USDC/${currency}`),
      closingLabel:t('← 把上面每一期的现值相加，就是收益权估值', '← Add every period’s present value to obtain the rights valuation'), closingValue:usd(report.rightsValueUSDC6),
      note:t('总电量费包含另付电网的购电费；购电数据缺失时显示 —，不按零计算。付款给项目的优惠仅针对可计费自用光伏。日期使用 UTC，服务期不含期末当天；净应收款在所列回款日才预计转成现金。', 'Energy bills include separate grid purchases. Missing imports appear as —, never zero. The project discount applies only to eligible self-used solar. Dates use UTC; service ends at the start of the end date. Receivables become projected cash only on their collection dates.')};
  }
  function investor(projection, reports, lang = 'zh', phase = 1) {
    const t = translate(lang), p = projection, scale = 1000 / usd(p.initialInvestmentUSDC6);
    if (!Number.isFinite(scale) || scale <= 0) return null;
    if (!p.periods?.length) return null;
    const source = reports.filter(r => p.sourceReports.includes(r.reportHash) && Array.isArray(r.rows));
    const complete = source.length === p.sourceReports.length;
    const rows = [
      ['generation', t('电站预测发电量', 'Station generation'), 'kWh', 'energy'],
      ['export', t('电站预测售电量', 'Station exports'), 'kWh', 'energy'],
      ['self', t('预计交付自用光伏量', 'Estimated delivered solar self-use'), 'kWh', 'energy'],
      ['household', t('① 本期业主电费', '① Household charges'), 'USDC', 'income'],
      ['sale', t('② 本期售电收入', '② Export revenue earned'), 'USDC', 'income'],
      ['cost', t('③ 本期站点费用', '③ Station expenses'), 'USDC', 'cost'],
      ['assigned', t('本期形成净应收款', 'Net receivable earned'), 'USDC', 'net'],
      ['receipts', t('本期预计收到现金', 'Cash due this period'), 'USDC', 'received'],
      ['origin', t('对应发电服务期', 'Cash relates to service'), t('回款来源', 'Source periods'), 'date'],
      ['expense', t('本期计提池费用', 'Pool expense accrual'), 'USDC', 'cost'],
      ['paid', t('本期支付池费用', 'Pool expenses paid'), 'USDC', 'cost'],
      ['payout', t('每 1,000 投资回款', 'Payout per 1,000 invested'), 'USDC', 'payout'],
      ['cash', t('分配后资金池现金', 'Closing pool cash'), 'USDC', 'net'],
    ];
    const interval=Number(p.distributionIntervalMonths||3);
    let previous = p.asOf, accrued = 0;
    const columns = (p.periods || []).map(period => {
      const earned = source.flatMap(report => report.rows.filter(r => r.month === period.month).map(r => ({r, a:report.assumptions})));
      const received = source.flatMap(report => report.rows.filter(r => r.dueAt > previous && r.dueAt <= period.at));
      const fees = usd(period.feeUSDC6) + usd(period.mandatoryCostUSDC6);
      accrued += fees;
      // These are projection accruals settled at the quarter end, not a second deduction.
      const paid = period.month % interval === 0 ? accrued : 0;
      if (period.month % interval === 0) accrued = 0;
      const field = f => complete ? sum(earned, f) : null;
      const col = {month:period.month, label:t(`第 ${period.month} 期`, `Period ${period.month}`), date:date(previous), end:date(period.at), quarter:period.month % interval === 0,
        values:{generation:field(e => e.r.generationKWh), export:field(e => e.r.exportKWh), self:field(e => e.r.billing?.selfUseKWh), household:field(e => e.r.billing ? e.r.billing.householdPaymentLocal * e.a.fxUSDC : null), sale:field(e => e.r.billing ? e.r.billing.exportRevenueLocal * e.a.fxUSDC : null), cost:field(e => e.r.costsLocal * e.a.fxUSDC), assigned:field(e => usd(e.r.assignedUSDC6)), receipts:usd(period.receiptsUSDC6), origin:complete ? (received.length ? [...new Set(received.map(r => r.month))].map(m => t(`第 ${m} 期`, `P${m}`)).join(', ') : '—') : '—', expense:fees, paid, payout:usd(period.payoutUSDC6) * scale, cash:usd(period.endingCashUSDC6)} };
      previous = period.at;
      return col;
    });
    const final = p.cashflows.at(-1);
    if (final) {
      const lastRows = source.flatMap(report => report.rows.filter(r => r.dueAt > previous && r.dueAt <= final.at));
      columns.push({label:t('到期收尾', 'Final collection'), date:date(final.at), end:'', terminal:true, values:{receipts:complete ? sum(lastRows, r => usd(r.assignedUSDC6)) : null, origin:complete ? [...new Set(lastRows.map(r => r.month))].map(m => t(`第 ${m} 期`, `P${m}`)).join(', ') || '—' : '—', paid:accrued, payout:usd(final.valueUSDC6) * scale, cash:0}});
    }
    return {kind:'investor', rows, columns, lang, distributionIntervalMonths:interval,
      openingLabel:phase < 2 ? t('第 0 期 · 投资支出', 'Time 0 · investment outflow') : t('测算期初 · 归一化资产价值', 'Projection opening · normalized asset value'), openingValue:-1000,
      intro:t('发电与售电采用已审定的电量基线。预计交付自用量＝（发电量－合格售电量）×交付系数；业主电费＝交付自用量×购电价×约定付费比例。下方再列回款与分配时点。', 'Generation and exports use the approved baseline. Delivered self-use = (generation − eligible exports) × delivery factor; household charges = delivered self-use × grid rate × contracted payment fraction. Collections and distributions follow below.'),
      rule:t('电站电量和收支为全池合计。各站本币金额先按其报告汇率换成 USDC；净应收款再按各协议的归集比例计算。绿色回款行才是每投入 1,000 USDC 对应的金额。', 'Energy and station cashflows cover the whole pool. Local amounts use each report’s FX rate; receivables use its assignment share. Only the green payout row is scaled to a 1,000 USDC investment.'),
      closingLabel:t('逐季回款 + 到期剩余现金 = 预计累计回款', 'Quarterly payouts + final remaining cash = projected total receipts'), closingValue:p.cashflows.slice(1).reduce((s,f) => s + usd(f.valueUSDC6) * scale, 0),
      note:t('以上均为预测，不是已到账记录。池费用先按月计提，再按产品分配周期支付，两行不是重复扣费。分配前先支付费用并保护储备，再分配剩余回款的 75%。最后一列仅清收应收款并分配剩余现金，不增加发电期数，也不承诺返还本金。', 'These are forecasts, not confirmed receipts. Pool expenses accrue monthly and are paid at the product’s distribution cutoff; the two rows do not double-charge them. After expenses and protected reserves, 75% of surplus collections is distributed. The final column releases remaining cash after collection, with no extra generation or guaranteed principal repayment.')};
  }
  function render(model, options = {}) {
    if (!model || !model.columns.length) return '';
    const t = translate(model.lang), fmt = (v, digits = 2) => typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString(model.lang === 'en' ? 'en-US' : 'zh-CN', {minimumFractionDigits:digits,maximumFractionDigits:digits}) : typeof v === 'string' ? v : '—';
    const labels = model.rows.map(([key,label,unit,tone]) => `<div class="pt-cell pt-${tone}" data-pt-row="${key}"><span>${escape(label)}</span><small>${escape(unit)}</small></div>`).join('');
    const columns = model.columns.map(c => `<div class="pt-period${c.quarter ? ' pt-quarter' : ''}${c.terminal ? ' pt-final' : ''}" data-pt-period="${c.month ?? 'final'}"><div class="pt-time"><span class="pt-dot" aria-hidden="true"></span>${options.selectable && !c.terminal ? `<button type="button" data-cf-month="${c.index}" aria-pressed="${c.index === 0}" class="${c.index === 0 ? 'selected' : ''}">${escape(c.label)} ↘</button>` : `<b>${escape(c.label)}</b>`}<time>${escape(c.date)}</time><small>${c.end ? `${t('至', 'to')} ${escape(c.end)}` : t('无新增发电', 'No new generation')}</small><em>${c.quarter ? (model.distributionIntervalMonths===1?t('月度分配日','Monthly distribution'):t('季度分配日', 'Quarterly distribution')) : c.terminal ? t('剩余现金清算', 'Remaining cash paid') : t('月度服务期', 'Monthly service')}</em></div>${model.rows.map(([key,,unit,tone]) => `<div class="pt-cell pt-${tone}" data-pt-value="${key}" title="${escape(c.values[key] ?? '—')} ${escape(unit)}"><b>${escape(fmt(c.values[key], key === 'factor' ? 6 : key === 'generation' || key === 'export' || key === 'self' ? 1 : 2))}</b>${key === 'payout' && c.values[key] === 0 ? `<small>${t('本期不分配', 'No payout this month')}</small>` : ''}</div>`).join('')}</div>`).join('');
    return `<section class="period-timeline" data-period-timeline="${model.kind}"><p class="pt-intro">${escape(model.intro)}</p><div class="pt-opening"><span>${escape(model.openingLabel)}</span><strong>${fmt(model.openingValue)} <small>USDC</small></strong><span aria-hidden="true">→</span></div><div class="pt-tools"><span>${t('时间从左向右 · 横向滑动查看每一期', 'Time runs left to right · scroll for each period')}</span><div><button type="button" data-pt-scroll="-1" aria-label="${t('查看前面期数', 'Previous periods')}">←</button><label>${t('跳至', 'Jump to')} <select data-pt-jump>${model.columns.filter((c,i) => i % 6 === 0 || i === model.columns.length - 1).map(c => `<option value="${c.month ?? 'final'}">${escape(c.label)}</option>`).join('')}</select></label><button type="button" data-pt-scroll="1" aria-label="${t('查看后面期数', 'Next periods')}">→</button></div></div><div class="pt-scroll" tabindex="0" role="region" aria-label="${t('逐期现金流时间轴，可横向滚动', 'Period cashflow timeline, horizontally scrollable')}"><div class="pt-track"><div class="pt-labels"><div class="pt-time"><b>${t('每期计算项目', 'Period breakdown')}</b><small>${t('电量 → 账单 → 回款', 'Energy → bills → cash')}</small></div>${labels}</div>${columns}</div></div><p class="pt-rule">${escape(model.rule)}</p><div class="pt-total"><span>${escape(model.closingLabel)}</span><strong>${fmt(model.closingValue)} USDC</strong></div><p class="pt-note">${escape(model.note)}</p></section>`;
  }
  globalThis.RevenueTimeline = { owner, investor, render };
  if (typeof document !== 'undefined') {
    document.addEventListener('click', event => {
      const b = event.target.closest('[data-pt-scroll]');
      if (!b) return;
      const viewport = b.closest('[data-period-timeline]').querySelector('.pt-scroll');
      viewport.scrollBy({left:Number(b.dataset.ptScroll) * Math.max(180, viewport.clientWidth - 150), behavior:'auto'});
    });
    document.addEventListener('change', event => {
      if (!event.target.matches('[data-pt-jump]')) return;
      const panel = event.target.closest('[data-period-timeline]'), viewport = panel.querySelector('.pt-scroll');
      const col = panel.querySelector(`[data-pt-period="${event.target.value}"]`);
      viewport.scrollLeft = col.offsetLeft - panel.querySelector('.pt-labels').offsetWidth;
    });
  }
})();
