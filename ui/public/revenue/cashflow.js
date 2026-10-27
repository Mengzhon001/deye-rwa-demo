/* Timelines render saved financial reports; controls never mutate signed assumptions. */
const cfReports = new Map();
const cfNumber = (v, digits = 2) => typeof v === 'number' && Number.isFinite(v)
  ? v.toLocaleString(typeof lang !== 'undefined' && lang === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
const cfDate = ts => new Date(ts * 1000).toISOString().slice(0, 10);
function cfCard(label, value, note, cls = '') {
  return `<div class="cf-card ${cls}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
}
function cfOwnerPeriod(report, index, currency) {
  const r = report.rows[index], b = r?.billing;
  if (!b) return '';
  const a = report.assumptions, cash = v => `${cfNumber(v)} <small>${esc(currency)}</small>`;
  return `<div class="cf-period-date">${t('Service period', '用电期间')} ${cfDate(r.calculation.serviceStart)} → ${cfDate(r.calculation.serviceEnd)} <span>${t('Expected receipt', '预计回款')} ${cfDate(r.dueAt)}</span></div>
  <div class="cf-energy-route"><div><small>${t('Solar generation', '预测光伏发电')}</small><b>${cfNumber(r.generationKWh)} kWh</b></div><span aria-hidden="true">→</span><div><small>${t('Delivered self-use · modeled', '可计费自用量 · 估算')}</small><b>${cfNumber(b.selfUseKWh)} kWh</b></div><div><small>${t('Eligible export', '合格上网电量')}</small><b>${cfNumber(r.exportKWh)} kWh</b></div></div>
  <p class="cf-formula">${t('Self-use', '可计费自用量')} = max(0, ${cfNumber(r.generationKWh)} − ${cfNumber(r.exportKWh)}) × ${a.selfUseDeliveryPct}% = ${cfNumber(b.selfUseKWh)} kWh</p>
  <div class="cf-comparison"><div><h4>${t('Same electricity, bought from the grid', '同样电量，全部向电网购买')}</h4><b>${cash(b.avoidedGridCostLocal)}</b><p>${cfNumber(b.selfUseKWh)} kWh × ${cfNumber(b.gridTariffLocal, 4)} ${esc(currency)}/kWh</p></div><span class="cf-vs">${t('versus', '对比')}</span><div class="cf-better"><h4>${t('Household payment to the project', '业主支付给项目的电费')}</h4><b>${cash(b.householdPaymentLocal)}</b><p>${cfNumber(b.avoidedGridCostLocal)} × ${a.householdPaymentBps / 100}%</p></div></div>
  <div class="cf-saving"><span>${t('Energy charge saved this period', '本期相同电量少付')}</span><strong>${cash(b.householdSavingLocal)}</strong><span>${t('Discount on delivered solar electricity', '自用光伏电量的电费折扣')} ${cfNumber(100 - a.householdPaymentBps / 100)}%</span></div>
  <p class="cf-note">${b.gridPurchaseCostLocal === null
    ? t('Imported electricity is paid separately to the grid in both cases. Its cost is unavailable because historical imports are missing; it is not assumed to be zero.', '两种情形都另向电网支付实际购电费。历史购电量缺失，暂不能给出完整账单，该项费用不按零处理。')
    : t('Illustrative energy bill: all-grid ', '估算电量电费合计：全电网方案 ') + cash(b.allGridBillLocal) + ' → ' + t('after sale ', '出售后 ') + cash(b.householdBillLocal) + t('; both include ', '；两者均包含 ') + cash(b.gridPurchaseCostLocal) + t(' of grid purchases.', '实际购电费用。')}
  ${t('Fixed charges, demand charges, taxes and other household-paid costs are outside this energy-only comparison. The baseline is all-grid supply, not free self-use of equipment you already own.', '比较仅含电量电费，不含固定费、需量费、税费和其他业主自付成本。对比基准是全电网供电，不是您原本已有设备的免费自用。')}</p>
  <div class="cf-waterfall">
  ${cfCard(t('01 · Household payment', '01 · 业主电费'), cash(b.householdPaymentLocal), `${cfNumber(b.selfUseKWh)} × ${cfNumber(b.gridTariffLocal, 4)} × ${a.householdPaymentBps / 100}%`)}
  <span class="cf-op">＋</span>${cfCard(t('02 · Export revenue', '02 · 售电收入'), cash(b.exportRevenueLocal), `${cfNumber(r.exportKWh)} × ${cfNumber(b.exportTariffLocal, 4)}`)}
  <span class="cf-op">−</span>${cfCard(t('03 · Agreed station costs', '03 · 约定站点费用'), cash(r.costsLocal), t('Deducted once', '仅扣除一次'))}
  <span class="cf-op">＝</span>${cfCard(t('04 · Assigned cashflow', '04 · RWA 受让现金流'), `${cfNumber(Number(r.assignedUSDC6) / 1e6)} <small>USDC</small>`, `${a.shareBps / 100}% × ${a.fxUSDC} USDC/${esc(currency)}`, 'cf-highlight')}
  </div>
  <div class="cf-discount"><span>${t('Receipt at its future date', '未来回款日的现金')} <b>${money(r.assignedUSDC6)} USDC</b></span><span>× ${cfNumber(r.discountFactor, 6)} <small>${t('discount factor', '折现因子')}</small></span><span>→ ${t('Value at the valuation date', '估值日的现值')} <b>${money(r.presentValueUSDC6)} USDC</b></span></div>
  <p class="cf-note">${t('Discount factor = 1 / (1 + annual discount rate)^(years until receipt). Payment delay changes the receipt date; it does not create extra electricity.', '折现因子 = 1 ÷ (1 + 年折现率)^(距回款日年数)。收款延迟只改变回款日期，不增加电量。')}${b.uncoveredCostsLocal > 0 ? ' ' + t('Station costs exceed revenue this period; the funding gap requires review.', '本期站点成本超过收入，缺口须另行安排资金并审核。') : ''}</p>`;
}
function cfOwnerTimeline(report, price, currency) {
  if (report.assumptions?.revenueModel !== 'household-export')
    return `<div class="cf-legacy">${t('This saved agreement uses the earlier export-only model. Household electricity payments are not included. Unsigned offers can be recalculated; signed terms are preserved.', '本报告采用旧版仅售电收入模型，不含业主电费。未签约报价可重新评估，已签条款保持不变。')}</div>`;
  if (!report.rows.length) return `<p class="cf-note">${t('No remaining service periods. Collect outstanding receivables before final liquidation.', '已无剩余服务期间，待收应收款结清后进行最终清算。')}</p>`;
  const key = report.reportHash;
  cfReports.set(key, { report, price, currency });
  if (cfReports.size > 24) cfReports.delete(cfReports.keys().next().value);
  return `<section class="cf-panel" data-cf-owner="${esc(key)}"><div class="cf-heading"><div><span class="cf-eyebrow">${t('HOUSEHOLD · CASHFLOW EXPLAINED', '业主 · 收益权现金流图解')}</span><h3>${t('An upfront payment. Lower solar electricity charges each month.', '结算时收款，此后按月支付优惠光伏电费')}</h3></div><a href="/docs/${typeof lang !== 'undefined' && lang === 'en' ? 'en' : 'zh'}/valuation">${t('Model documentation', '查看模型说明')} ↗</a></div>
  ${RevenueTimeline.render(RevenueTimeline.owner(report, price, currency, typeof lang !== 'undefined' ? lang : 'zh'), { selectable: true })}
  <details class="pt-detail-disclosure"><summary>${t('Inspect one period’s formulas and bill comparison', '展开某一期的计算公式和电费比较')}</summary>
  <label class="cf-selector">${t('Inspect period', '选择计算期数')}<select data-cf-select>${report.rows.map((r,i) => `<option value="${i}">${t('Period', '第')} ${r.month} ${t('', '期')} · ${cfDate(r.calculation.serviceStart)}</option>`).join('')}</select></label>
  <div data-cf-detail>${cfOwnerPeriod(report, 0, currency)}</div></details>
  <p class="cf-note">${t('All amounts are forecasts using saved assumptions, not received cash or actual household bills. A lower grid-equivalent energy charge is conditional on positive eligible solar self-use; it does not guarantee lower total household expenditure.', '以上为本报告参数下的预测，并非已收现金或实际业主账单。相同光伏电量的电费优惠以存在合格自用电量为前提，不保证家庭全部支出下降。')}</p></section>`;
}
function cfInvestorTimeline(d) {
  const combined = state.valuations.some(r => d.p.sourceReports.includes(r.reportHash) && r.assumptions?.revenueModel === 'household-export');
  const p = d.p, scale = 1000 / (Number(p.initialInvestmentUSDC6) / 1e6);
  if (!Number.isFinite(scale)) return '';
  const flows = p.cashflows.slice(1), max = Math.max(1, ...flows.map(f => Number(f.valueUSDC6) / 1e6 * scale));
  return `<section class="cf-panel cf-investor"><div class="cf-heading"><div><span class="cf-eyebrow">${t('INVESTOR · CASHFLOW TIMELINE', '投资者 · 现金流时间轴')}</span><h3>${t('Where each 1,000 USDC goes, and when cash comes back', '每投入 1,000 USDC，资金如何使用、何时回流')}</h3></div><span class="cf-label">${t('Proportional illustration · not an order', '等比例测算 · 非认购订单')}</span></div>
  <p class="cf-note">${combined ? t('Household bills + exports', '业主电费 ＋ 售电收入') : t('Export receipts · legacy terms', '售电回款 · 旧协议条款')} · ${t('The columns below show the forecast for each month.', '下方逐列展示每个月的预测。')}</p>
  ${RevenueTimeline.render(RevenueTimeline.investor(p, state.valuations, typeof lang !== 'undefined' ? lang : 'zh', d.phase))}
  <details class="pt-detail-disclosure"><summary>${t('View the distribution chart and net IRR calculation', '展开回款柱形图与净年化收益计算')}</summary>
  <div class="cf-chart-head"><h4>${t('Projected distributions per 1,000 USDC', '每 1,000 USDC 对应的预计回款')}</h4><span>${t('USDC · hover or focus for dates and amounts', 'USDC · 悬停或键盘聚焦查看日期与金额')}</span></div><div class="cf-chart-scroll"><div class="cf-investor-chart">${flows.map((f,i) => {
    const v = Number(f.valueUSDC6) / 1e6 * scale;
    const servicePeriod = p.periods?.find(row => row.at === f.at);
    const label = i === flows.length - 1 ? t('Final cash', '清算现金') : `Q${servicePeriod ? Math.ceil(servicePeriod.month / 3) : i + 1}`;
    return `<div class="cf-flow" tabindex="0" title="${esc(label)} · ${cfDate(f.at)} · ${cfNumber(v)} USDC"><b>${cfNumber(v)}</b><span><i class="${i === flows.length - 1 ? 'cf-terminal' : ''}" style="height:${v / max * 100}%"></i></span><small>${label}</small><time>${cfDate(f.at).slice(0, 7)}</time></div>`;
  }).join('')}</div></div>
  <div class="cf-axis"><span>${t('Valuation date', '估值日')} ${cfDate(p.asOf)}</span><b>${t('Total projected receipts', '预计累计回款')} ${cfNumber(Number(d.total) / 1e6 * scale)} USDC</b></div>
  <div class="cf-discount"><span>${t('Initial cash outflow', '期初资金流出')} <b>−1,000</b></span><span>→ ${t('Scheduled distributions + final cash', '按期分配 ＋ 到期剩余现金')}</span><span>→ ${t('Projected net IRR', '预计净年化收益')} <b>${d.stale || !Number.isFinite(p.projectedNetIRRPct) ? '—' : cfNumber(p.projectedNetIRRPct) + '%'}</b></span></div>
  <p class="cf-note">${t('IRR solves Σ cashflow ÷ (1 + IRR)^years = 0. The final bar releases remaining cash after collections and liabilities; it does not repay an invented original principal. Retained cash is included only once. Dates include collection delays, so final cash may arrive after rights expiry. Remaining NAV declines as finite rights pay out.', '净 IRR 满足 Σ〔各期现金流 ÷ (1 + IRR)^年数〕= 0。最后一柱是收齐应收款并清偿负债后的剩余现金，不是承诺返还本金；留存现金只计入一次。回款延迟可能使清算晚于收益权到期日。有限期限收益权逐期兑现后，剩余净值可以下降。')}</p>
  </details>
  ${p.periods?.length ? `<details class="wf-disclosure"><summary>${t('Monthly collection, fee and distribution ledger · whole pool', '查看逐月归集、费用与分配账 · 全资金池')}</summary>${table([t('Month','月份'),t('Collected USDC','归集 USDC'),t('Accrued pool fee','本月计提池费用'),t('Accrued mandatory cost','本月计提必需费用'),t('Distribution','分配'),t('Ending cash','期末现金')],p.periods.map(r => [r.month,money(r.receiptsUSDC6),money(r.feeUSDC6),money(r.mandatoryCostUSDC6),money(r.payoutUSDC6),money(r.endingCashUSDC6)]))}<p class="cf-note">${t('Expenses in this ledger accrue monthly and are paid at the product’s distribution cutoff. Ending cash may still include cash reserved for unpaid expenses; it is not all distributable.', '本表费用为按月计提数，在本产品规定的分配日实际支付。期末现金可能包含尚未支付费用的备付资金，不能全部用于分配。')}</p></details>` : ''}</section>`;
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-cf-month]');
  if (!button) return;
  const panel = button.closest('[data-cf-owner]'), select = panel.querySelector('[data-cf-select]');
  panel.querySelector('.pt-detail-disclosure').open = true;
  select.value = button.dataset.cfMonth;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
document.addEventListener('change', event => {
  if (!event.target.matches('[data-cf-select]')) return;
  const panel = event.target.closest('[data-cf-owner]'), entry = cfReports.get(panel.dataset.cfOwner);
  if (!entry) return;
  panel.querySelector('[data-cf-detail]').innerHTML = cfOwnerPeriod(entry.report, Number(event.target.value), entry.currency);
  panel.querySelectorAll('[data-cf-month]').forEach(b => { const selected = b.dataset.cfMonth === event.target.value; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected)); });
});
