"use strict";
function billingLink(hash,label) {
  return hash ? `<a class="mono" href="${esc(networkConfig.explorerUrl)}/tx/${esc(hash)}" target="_blank" rel="noopener">${esc(label||hash.slice(0,12)+'…')} ↗</a>` : '—';
}
function billingStatus(p) {
  if(p.confirmed)return t('Confirmed into pool','已确认入池');
  if(p.refunded)return t('Refunded after product ended','产品结束后已退款');
  return p.householdPaid?t('Household paid · awaiting reconciliation','业主已付 · 待核对确认'):t('Awaiting household payment','待业主缴费');
}
function billingDetails(r) {
  const p=r.payment;
  return `<details><summary>${t('Bill calculation and transaction evidence','账单计算与交易凭证')}</summary><p>${t('Only the agreed discounted solar electricity payment is charged here. This is not the household’s entire utility bill. Energy evidence is recorded separately from demo tariff and FX assumptions.','本次仅收取协议约定的优惠光伏电费，不是家庭全部电网电费。电量证据与演示电价、汇率假设分别记录。')}</p>${table(
    [t('Component','项目'),t('USDC','USDC')],[[t('Household payment','业主优惠电费'),money(p.householdUSDC6)],[t('Grid export receipt (simulated)','电网售电回款（模拟）'),money(p.exportUSDC6)],[t('Agreed station expenses','约定站点费用'),money(p.costsUSDC6)],[t('Net assigned to pool','归集到资产池的净额'),money(p.assignedUSDC6)],[t('Unassigned cash returned to household','未受让部分退回业主'),money(p.retainedUSDC6)]]
  )}<p>${t('USDC token contract','USDC 合约')} <span class="mono">${esc(state.manifest.addresses.usdc)}</span></p><p>${t('Bill payment contract','账单缴费合约')} <span class="mono">${esc(state.manifest.addresses.billing)}</span></p><p>${t('Pay through the bill button. A plain token transfer without the bill identifier is not credited to this bill.','请通过本期缴费按钮付款。直接转账而未绑定账单编号，不会被认作本期缴费。')}</p><p>${t('Household payment','业主付款')} ${billingLink(p.ownerTransaction)} · ${t('Export funding','售电回款')} ${billingLink(p.exportTransaction)} · ${t('Intermediary confirmation','中介确认')} ${billingLink(p.confirmationTransaction)}</p></details>`;
}
function householdBillsView() {
  const rows=(state.income||[]).filter(r=>r.payment && r.payment.payer.toLowerCase()===state.accounts.owner.address.toLowerCase());
  const content=rows.map(r=>{const p=r.payment,canPay=!p.householdPaid&&!p.confirmed&&!p.refunded&&Number(state.chain.phase)===2;
    return `<section data-billing-id="${esc(r.id)}" class="billing-period"><h3>${t('Service month','服务期')} ${r.period} · ${esc(stationName(r.stationId))}</h3><p><b>${billingStatus(p)}</b></p><div class="metric-grid">${metric(t('This month’s electricity payment','本期应缴优惠电费'),money(p.householdUSDC6),'USDC')}${metric(t('Confirmed wallet balance','钱包可用余额'),money(state.accounts.owner.usdc),'USDC')}</div><p>${t('Payment authorizes this bill’s exact amount and transfers your USDC to the bill contract. The intermediary then reconciles it with the separate export receipt before releasing net cash to the pool. You do not pay the export or station-expense amount again.','缴费时仅授权本期准确金额，并从您的钱包向账单合约支付 USDC。中介随后核对业主付款及单独登记的售电回款，再确认净额入池。您不需要再支付售电收入或重复支付站点费用。')}</p>${canPay?form('pay-household-bill',t('Pay this month’s electricity bill','支付本期电费'),'',{incomeId:r.id}):`<p>${p.confirmed?t('This period is complete. Do not pay again.','本期已完成，无需再次缴费。'):p.householdPaid?t('Your payment is confirmed on-chain. Wait for the intermediary; no second payment is required.','您的付款已在链上确认。请等待中介核对，不需要再次付款。'):t('There is no payable household amount for this bill.','本账单没有需要业主支付的电费。')}</p>`}${canPay&&BigInt(state.accounts.owner.usdc)<BigInt(p.householdUSDC6)?`<p class="notice-bar">${t('USDC is insufficient. Use Receive test funds in the header, then return to this bill.','USDC 余额不足。请先点击顶部「领取测试资金」，再返回本账单缴费。')}</p>`:''}${billingDetails(r)}</section>`;
  }).join('');
  return card(t('Monthly USDC electricity payments','每月 USDC 电费缴纳'),content||`<p>${t('No monthly bill has been published. After a service month ends, the intermediary publishes its bill here.','暂无已发布的月度账单。服务期结束后，中介将发布账单，您可在此查看并缴费。')}</p>`);
}
function agentBillsView() {
  if(!state.householdPaymentsEnabled)return (state.income||[]).filter(r=>!r.collected).map(r=>button('collect-revenue',`${t('Collect legacy simulated receipt','归集旧场景模拟回款')} · ${money(r.amountUSDC6)} USDC`,{incomeId:r.id})).join('');
  return (state.income||[]).map(r=>{
    if(!r.payment)return r.collected?`<p>${t('Historical simulated receipt','历史模拟回款')} · ${r.period} · ${money(r.amountUSDC6)} USDC</p>`:`<section data-billing-id="${esc(r.id)}"><p>${t('This unpaid older receivable needs a wallet-payment bill. No household payment has been taken.','这笔未收款的旧应收记录需要发布钱包缴费账单，尚未扣取业主电费。')}</p>${button('publish-household-bill',t('Publish household payment bill','发布业主缴费账单'),{incomeId:r.id})}</section>`;
    const p=r.payment,ready=p.householdPaid&&p.exportPaid&&!p.confirmed&&!p.refunded;
    return `<section data-billing-id="${esc(r.id)}" class="billing-period"><h3>${t('Service month','服务期')} ${r.period} · ${esc(stationName(r.stationId))}</h3><p><b>${billingStatus(p)}</b></p>${table([t('Household payment','业主缴费'),t('Grid export receipt','售电回款'),t('Net pool receipt','净入池金额')],[[`${money(p.householdUSDC6)} USDC · ${p.householdPaid?t('Paid','已付'):t('Waiting for household','等待业主')}`,`${money(p.exportUSDC6)} USDC · ${p.exportPaid?t('Funded','已登记'):t('Not funded','未登记')}`,`${money(p.assignedUSDC6)} USDC · ${p.confirmed?t('Confirmed','已确认'):t('Not yet pool cash','尚未成为池内现金')}`]])}${!p.confirmed&&!p.refunded?`${!p.householdPaid?`<p>${t('The household must sign its own payment. Open Household → Funds & monthly bills with the household wallet. The intermediary cannot pay on its behalf.','请由业主使用自己的钱包进入「资金与月度缴费」付款。中介不能代替业主签名扣款。')}</p><button class="btn btn-outline" data-billing-owner>${t('Open household payment workspace','打开业主缴费入口')} →</button>`:''}${!p.exportPaid?button('fund-export',t('Record simulated grid export payment','登记模拟电网售电回款'),{incomeId:r.id}):''}${form('confirm-receipt',t('Reconcile and confirm receipt into pool','核对并确认收款入池'),'',{incomeId:r.id},!ready)}<p>${ready?t('Check the amounts and evidence above. Your confirmation releases net assigned cash to the pool and pays the agreed station costs once.','请核对以上金额与凭证。确认后，净受让款进入资产池，并一次性支付约定站点费用。'):t('Confirmation opens after the household payment and separate export receipt are complete. It never mints substitute household money.','完成业主缴费及单独的售电回款登记后，才可确认收款。此操作不会铸造 USDC 替代业主付款。')}</p>`:''}${billingDetails(r)}</section>`;
  }).join('');
}
document.addEventListener('click',event=>{
 if(event.target.closest('[data-billing-owner]'))setRole('owner','owner',{page:'owner_funds'}).catch(e=>feedback(e.message,true));
});
