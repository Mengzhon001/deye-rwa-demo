/* Partial reads never become the authoritative business state. */
(function () {
  'use strict';
  const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll(String.fromCharCode(39),'&#39;').replaceAll(String.fromCharCode(34),'&quot;');
  const purposes={
    owner:['Review your stations, agreements and monthly bills. Equipment ownership stays with the household.','查看电站、收益权协议和月度电费账单。设备所有权仍归业主。'],
    agent:['Review applications and operate the product. Each approval and payment retains its actual prerequisites.','审核申请并运营产品。审批、收款和发行仍须满足各自的实际条件。'],
    investor:['Review products, qualification, subscriptions and holdings. Escrow and issued shares are separate.','查看产品、投资资格、认购和持仓。认购托管款与已发行份额分别记录。'],
    trustee:['Independently review valuations and servicing proposals. Opening a page does not approve a report.','独立审核估值和服务事件。选择角色或打开页面不会批准报告。']
  };
  function render({lang,role,page,title,network,session,load}) {
    const tr=(en,zh)=>lang==='en'?en:zh,sections=load.sections,m=sections.metadata,b=sections.balances,p=sections.products,r=sections.records;
    const amount=value=>(Number(value)/1e6).toLocaleString(lang==='en'?'en-US':'zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
    const stamp=data=>tr('Read at ','读取于 ')+new Date(data.readAt).toLocaleTimeString(lang==='en'?'en-GB':'zh-CN');
    const pending=(key,section)=>section.status==='error'
      ? `<p class='workspace-section-error'>${tr('This section is unavailable. Other sections remain accessible.','此部分暂时不可用，其他内容仍可浏览。')}</p><button type='button' class='btn btn-outline' data-workspace-section-retry='${key}'>${tr('Retry this section','重试此部分')}</button>`
      : `<p class='workspace-section-loading' role='status'>${tr('Loading…','正在读取…')}</p><div class='workspace-skeleton' aria-hidden='true'></div>`;
    const card=(key,label,body)=>`<section class='workspace-section' data-workspace-section='${key}' aria-busy='${sections[key].status==='pending'}'><h2>${esc(label)}</h2>${body}</section>`;
    const symbol=network.paymentToken?.symbol||(network.publicTestnet?'USDC':'mUSDC');
    const balanceBody=b.status==='ready'
      ? `<div class='workspace-balance-grid'><div><span>${tr('Available wallet balance','钱包可用余额')}</span><strong data-workspace-usdc>${amount(b.data.usdc)} <small>${esc(symbol)}</small></strong></div><div><span>${tr('Gas balance','Gas 余额')}</span><strong>${(Number(b.data.nativeBalanceWei)/1e18).toLocaleString(lang==='en'?'en-US':'zh-CN',{maximumFractionDigits:6})} <small>${network.publicTestnet?'ETH':'DETH'}</small></strong></div></div><p class='workspace-asof'>${stamp(b.data)}</p><p>${tr('Wallet funds are separate from subscription escrow and issued shares.','钱包余额与认购托管金额、已发行份额分别记录。')}</p>`
      : pending('balances',b);
    const metadataBody=m.status==='ready'
      ? `<h3>${esc(m.data.product.title[lang]||m.data.product.title.zh)}</h3><p>${tr('Product contract','产品合约')} <a target='_blank' rel='noopener' href='${esc(network.explorerUrl)}/address/${esc(m.data.vault)}'>${esc(m.data.vault.slice(0,10))}…${esc(m.data.vault.slice(-6))} ↗</a></p><p>${tr('Recorded station evidence','已接入电站记录')} · ${m.data.stations.length}</p>${m.data.stations.slice(0,3).map(station=>`<p>${esc(station.name)}</p>`).join('')}<p class='workspace-asof'>${tr('Business metadata is loaded. Chain phase and action conditions are still being checked.','业务资料已读取，链上阶段和操作条件仍在核对。')}</p>`
      : pending('metadata',m);
    const phases={1:tr('Fundraising','募集中'),2:tr('Active','存续中'),3:tr('Failed','募集失败'),4:tr('Closed','已关闭')};
    const productsBody=p.status==='ready'
      ? p.data.products.length?p.data.products.map(product=>`<article class='workspace-product'><div><h3>${esc(product.title[lang]||product.title.zh)}</h3><span class='workspace-chip'>${esc(phases[product.phase])}</span></div><p>${tr('Subscribed','已认购')} ${amount(product.subscriptionsUSDC6)} / ${amount(product.targetUSDC6)} ${esc(symbol)}</p><button type='button' class='btn btn-outline' data-workspace-product='${esc(product.vault)}'>${tr('View product','查看产品')} →</button></article>`).join(''):`<p>${tr('No published products are available.','暂无已发布产品。')}</p>`
      : pending('products',p);
    const recordsBody=r.status==='ready'
      ? `<p>${tr('Saved operations are shown below. Current receipts and explorer indexing are still being reconciled.','下方为已保存的操作记录，正在进一步核对交易回执和浏览器索引。')}</p>${r.data.records.length?`<ul class='workspace-records'>${r.data.records.slice(0,6).map(record=>`<li><span>${esc(record.actor)} · ${esc(globalThis.RevenueGuideModel?.content?.[record.action]?.[lang==='en'?0:1]||record.action)}</span>${record.hashes.map(hash=>`<a target='_blank' rel='noopener' href='${esc(network.explorerUrl)}/tx/${esc(hash)}'>${esc(hash.slice(0,12))}… ↗</a>`).join(' ')}</li>`).join('')}</ul>`:`<p>${tr('No saved operations for this product.','本产品暂无已保存的操作记录。')}</p>`}`
      : pending('records',r);
    const operational=['product_hall','pool_detail'].includes(page)?card('products',tr('Published products','已发布产品'),productsBody)
      : ['transaction_log','message_center'].includes(page)?card('records',tr('Saved operation records','已保存的操作记录'),recordsBody)
      : `<section class='workspace-section workspace-operation-pending'><h2>${tr('Business actions','业务操作')}</h2><p>${tr('Orders, approvals and action conditions will appear after their confirmed state is loaded. Navigation does not submit a transaction.','订单、审批和操作条件将在确认状态读取完成后显示。切换导航不会提交交易。')}</p><div class='workspace-skeleton' aria-hidden='true'></div><button type='button' class='btn btn-outline' disabled>${tr('Actions await state confirmation','状态确认后开放操作')}</button></section>`;
    return `<div class='workspace-shell wallet-workspace' data-workspace-shell><header class='workspace-page-header'><div><small>DEYE · ${esc(network.chainName)}</small><h1 id='wallet-workspace-title'>${esc(title)}</h1><p>${esc((purposes[role]||purposes.investor)[lang==='en'?0:1])}</p></div><span class='workspace-signed-in'>${tr('Signed in','已登录')} · ${esc(session.address.slice(0,6))}…${esc(session.address.slice(-4))}</span></header>
      <section class='workspace-sync-status ${load.error?'workspace-sync-error':''}' role='status' aria-live='polite' aria-busy='${load.pending}'><span class='workspace-sync-icon' aria-hidden='true'>${load.error?'!':'↻'}</span><div><b>${load.error?tr('Some business state could not load','部分业务状态暂未加载'):tr('Business state is loading in the background','正在后台加载业务状态')}</b><p data-wallet-load-detail>${load.error?esc(load.error):load.slow?tr('The chain is responding slowly. You can keep browsing; completed sections remain visible.','链上响应较慢，可以继续浏览，已加载的内容会保留。'):tr('Use the sidebar while balances, products and records load independently. Missing financial values are not treated as zero.','可以先使用左侧导航。余额、产品和记录分别加载，未返回的金额不会按 0 处理。')}</p>${load.error?`<button type='button' class='btn btn-outline' id='wallet-load-retry'>${tr('Retry business state','重新加载业务状态')}</button>`:''}</div></section>
      <div class='workspace-overview-grid'>${card('metadata',tr('Product and station records','产品与电站资料'),metadataBody)}${card('balances',tr('Wallet funds','钱包资金'),balanceBody)}</div>${operational}<p class='workspace-guide-pending'>${tr('The operation guide will use confirmed business state when synchronization finishes.','操作引导将在状态同步完成后，依据已确认的业务状态显示当前任务。')}</p></div>`;
  }
  globalThis.RevenueWorkspace={render};
})();
