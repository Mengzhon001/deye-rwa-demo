import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {sleep} from './browser-driver.mjs';
const {BrowserDriver}=await import(process.env.REVENUE_RECORDING_WALLET==='rabby'?'./rabby-driver.mjs':'./browser-driver.mjs');
import {Director} from './director.mjs';
import {config,roles} from './environment.mjs';
const stage=process.argv[2]||'rehearsal',stop=process.argv[3]||'settlement',c=config(stage);
if(process.env.REVENUE_REMOTE_QA==='true'){
 const compose=JSON.parse(readFileSync(c.dir+'/../compose.json','utf8'));
 assert(compose.name.endsWith('-qa'),'Full lifecycle tests require an isolated QA stack, never the shared colleague-test scene');
}
const file=c.dir+'/progress.json',progress=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
if(process.argv.includes('--record')&&Object.keys(progress).length)throw Error('Formal recording requires a clean scene. Preserve this run and create a fresh recording environment; do not present resumed debugging footage as a clean take.');
const driver=new BrowserDriver(stage);let director,key;
const save=()=>writeFileSync(file,JSON.stringify(progress,null,2));
async function step(id,fn){key=id;if(progress[id]){return progress[id].result;}console.log('STEP',id);director?.mark('step-start',{key:id});const result=await fn();director?.mark('step-end',{key:id});progress[id]||={result};save();return result;}
const captions={apply:'业主先选择已经接入的真实电站。这里回放的是固定采集时点的证据，不代表当前实时读数。设备仍归业主所有，申请出售的是五年的收入权益。',review:'中介核对电站资料、设备与历史电量，判断申请是否具备估值条件。审核结果保存在业务系统中，这一步不产生链上交易。',offer:'新的现金流由业主电费和上网收入组成。业主按电网电价的八折支付光伏自用部分，保留电费优惠。未来每月净现金流折现后形成报价。','approve-offer':'受托管理人独立审核估值的电量基线、电价假设与成本。历史和近期数据存在差异时，必须记录判断依据，不能直接把预测当成真实回款。',accept:'业主查看已获批准的报价与逐月现金流，并接受购买价格。接受报价后，经济条款将被冻结。',sign:'业主通过真实 MetaMask 签署协议消息，绑定电站、价格、比例、期限、产品与链。消息签名本身不产生交易，也不消耗燃料费。','mint-station':'这是第一笔业务上链交易。中介将电站凭证铸造给业主。凭证代表站点身份，并不转移光伏设备的法律所有权。','custody-consent':'业主在自己的钱包中授权资产池托管电站凭证。中介不能代替业主作出这项授权。',admit:'中介把已经签约并获授权的收益权纳入资产池。链上记录电站编号、协议摘要与收购价格；此时还没有发行投资者份额。','prepare-valuation':'中介提交资产池估值，将报告摘要及净值计算参数锚定上链。原始电站记录与完整报告仍保存在业务系统。','approve-valuation':'受托管理人用独立钱包批准估值。产品交易使用获批且有效的价格，不能仅凭中介单方面填写的数字结算。',publish:'发布募集条款后，产品才进入投资者大厅。募集并不等于份额已经发行，认购审核和募集资金条件仍须满足。',subscribe:'投资者核对金额后，先授权演示 USDC，再签署认购交易。认购资金进入托管，中介可以立即审核，统一结算前可以全额退款。',refund:'投资者在结算前退回这笔认购，浏览器中的 USDC 转账与订单金额相符，系统不会发行任何投资者份额。',settle:'两位投资者的认购均已通过中介审核，且资金满足签约购买价与初始留存要求。结算向业主付款，并按实际认购金额铸造份额。'};
const nextActors={apply:'中介机构审核',review:'中介机构估值',offer:'受托管理人审批','approve-offer':'业主确认',accept:'业主签署协议',sign:'中介机构铸造凭证','mint-station':'业主授权托管','custody-consent':'中介机构入池',admit:'中介机构编制估值','prepare-valuation':'受托管理人审批','approve-valuation':'中介机构处理产品',publish:'投资者申请与认购','apply-eligibility':'中介机构审核资格',eligible:'投资者认购',subscribe:'投资者核对订单',settle:'中介机构运营','book-revenue':'业主按月缴纳 USDC 电费','pay-household-bill':'中介核对收款','fund-export':'中介确认净额入池','confirm-receipt':'中介与受托人更新净值','collect-revenue':'中介机构与受托人更新净值',distribute:'投资者领取','propose-trade':'买方确认','consent-trade':'中介机构复核','review-trade':'卖方执行原子结算','open-case':'投资者按快照支持','support-case':'两名独立受托人','approve-case':'核对处置结果',close:'投资者领取与业主取回凭证'};
async function act(role,action,values={},options={}){return driver.action(role,action,values,{next:nextActors[action]||'当前角色继续处理',caption:captions[action]||options.caption,...options});}
async function val(prefix){await step(prefix+'-prepare',async()=>{await driver.nav('agent','agent_pool');return act('agent','prepare-valuation',{}, {proof:prefix==='initial'});});await step(prefix+'-approve',async()=>{await driver.nav('trustee','trustee_events');return act('trustee','approve-valuation',{acceptProvisional:true},{proof:prefix==='initial'});});}
try{
 await driver.start();director=await new Director(c,driver.sessions,{record:process.argv.includes('--record')}).start();driver.director=director;
 await step('intro-home',async()=>{await director.setScene({role:'owner',task:'平台首页与演示范围',caption:'本演示使用独立本地测试链、真实 MetaMask 与已采集的真实电站证据。全部资金均为测试资金，电价、未来预测和回款为明确标记的模拟。'});await sleep(director.record?32000:100);});
 let guidancePrimary='';
 const walkthroughRoles=process.env.REVENUE_GUIDANCE_LOCAL_QA==='true'?['agent','owner','investor','investor2','trustee','trustee2']:roles;
 for(const role of walkthroughRoles){if(guidancePrimary)await driver.sessions[role].page.evaluate(v=>sessionStorage.setItem('revenue.selected-product',v),guidancePrimary);director.mark('step-start',{key:'login-'+role});await director.setScene({role,task:'选择角色并签名登录',caption:'每位参与者使用独立的 MetaMask 钱包，角色选择不会自动赋予权限。'});if(process.argv.includes('--checks')&&role==='investor'&&!progress.vault)await driver.checkWrongRole(role);await driver.login(role);if(process.env.REVENUE_GUIDANCE_LOCAL_QA==='true'&&role==='agent'){guidancePrimary=(await driver.state('agent')).manifest.addresses.vault;const p=driver.sessions.agent.page;const changed=p.waitForResponse(r=>r.url().endsWith('/api/state')&&r.request().method()==='GET');await p.locator('#product-select').selectOption(guidancePrimary);await changed;}director.mark('step-end',{key:'login-'+role});director.mark('step-start',{key:'faucet-'+role});await director.setScene({task:'领取测试资金',caption:'通过明确的水龙头入口领取演示燃料币和测试 USDC。水龙头余额不是投资收益，也不代表真实资金。'});if(!(process.argv.includes('--checks')&&role==='investor'&&!progress['qa-insufficient-funds']))await driver.faucet(role);director.mark('step-end',{key:'faucet-'+role});}
 const state=await driver.state();assert.equal(state.mode,'replay');writeFileSync(director.dir+'/deployments.json',JSON.stringify(await fetch(c.urls.app+'/api/public/deployment').then(r=>r.json()),null,2));writeFileSync(director.dir+'/session-info.json',JSON.stringify({manifest:state.manifest,mode:state.mode,station:state.stations.map(s=>({id:s.id,name:s.name,source:s.source,observedAt:s.observedAt,sourceHash:s.sourceHash}))},null,2));if(progress.vault)assert.equal(progress.vault,state.manifest.addresses.vault);else{progress.vault=state.manifest.addresses.vault;save();}
 driver.onDone=data=>{progress[key]={...data};save();};
 await director.setScene({chapter:'02 · 电站与估值'});
 await step('station-evidence',async()=>{await driver.nav('owner','owner_station_detail');const p=driver.sessions.owner.page;await director.setScene({role:'owner',task:'核对真实电站记录与采集时间',caption:'德业上海光储电站 · 40 kWp。电量来自已采集记录的回放，电价、预测和回款另行标明为模拟。',mode:''});assert((await p.locator('.ds-station-head h2').innerText()).includes(state.stations[0].name));assert((await p.locator('.ds-station-head .ds-source').innerText()).includes('回放'));await p.locator('.ds-station-head').scrollIntoViewIfNeeded();await sleep(director.record?10000:100);await p.locator('[role="tab"][data-ds-tab="evidence"]').click();await p.getByText(state.stations[0].sourceHash,{exact:true}).first().scrollIntoViewIfNeeded();await sleep(director.record?10000:100);await p.locator('[role="tab"][data-ds-tab="overview"]').click();});
 await step('application',async()=>{await driver.nav('owner','owner_apply');return act('owner','apply',{stationId:state.stations[0].id,notes:'本演示使用已采集的德业上海光储电站证据，业主按折扣电价支付自用光伏电费，售电款与业主电费共同归集。'});});
 await step('review',async()=>{await driver.openApplication('agent','agent_apply_review');return act('agent','review',{decision:'approved',notes:'已核对记录回放中的站点身份与采集时间。电价、交付系数及费用为演示假设，完整模型由受托人独立复核。'});});
 await step('offer',async()=>{await driver.openApplication('agent','agent_financing');const p=driver.sessions.agent.page,f=p.locator('form[data-action="offer"]');await f.evaluate(e=>e.querySelectorAll('details').forEach(x=>x.open=true));const values={};for(const [name,value] of Object.entries({wf_baselineMethod:'historical',wf_baselineReviewNote:'已核对完整历史月份与近期读数，两者统计窗口和出口比例不同。本次采用经复核的历史季节性基线，不将单日高点直接外推至五年。电价及自用交付系数仍作为演示假设。',wf_baselineReviewed:true}))if(await f.locator(`[name="${name}"]`).count())values[name]=value;return act('agent','offer',values);});
 await step('offer-approval',async()=>{await driver.openApplication('trustee','trustee_events');return act('trustee','approve-offer',{acceptProvisional:true});});
 await step('owner-timeline',async()=>{await driver.openApplication('owner','owner_agreement');const p=driver.sessions.owner.page;await director.setScene({role:'owner',task:'逐期电量、电费优惠与折现报价',caption:'时间从左到右。每个月都列出发电量、上网量、自用量、业主付款和节约电费。扣除约定费用后的现金流，再按到期时间折现相加形成报价。',mode:''});const timeline=p.locator('[data-period-timeline="owner"]').first();await timeline.locator('.pt-tools').scrollIntoViewIfNeeded();await sleep(director.record?9000:200);await p.mouse.wheel(0,550);await sleep(director.record?8000:200);await timeline.locator('[data-pt-jump]').selectOption('55');await sleep(director.record?6000:200);});
 await director.setScene({chapter:'03 · 协议与入池'});
 await step('accept',async()=>{await driver.openApplication('owner','owner_agreement');return act('owner','accept');});
 await step('sign',async()=>{await driver.openApplication('owner','owner_agreement');return act('owner','sign');});
 if(process.argv.includes('--checks')&&!progress.mint)await step('qa-wallet-rejection',async()=>{await driver.openApplication('agent','agent_pool');driver.rejectOnce=true;await assert.rejects(()=>act('agent','mint-station'),/reject|拒|cancel|denied/i);const s=await driver.state();assert.equal(s.applications[0].chainAdmission.minted,false);await driver.sessions.agent.page.reload();await driver.login('agent');return {rejectedWithoutMint:true,refreshRecovered:true};});
 await step('mint',async()=>{await driver.openApplication('agent','agent_pool');return act('agent','mint-station');});
 if(stop==='mint')throw new Error('CHECKPOINT_STOP');
 await step('consent',async()=>{await driver.openApplication('owner','owner_agreement');return act('owner','custody-consent');});
 await step('admit',async()=>{await driver.openApplication('agent','agent_pool');return act('agent','admit');});
 await val('initial');
 await director.setScene({chapter:'04 · 募集与结算'});
 await step('publish',async()=>{await driver.nav('agent','agent_product');return act('agent','publish');});
 await step('investor-timeline',async()=>{await driver.nav('investor','pool_detail');const p=driver.sessions.investor.page;await director.setScene({role:'investor',task:'投资者逐期现金流与预计回报',caption:'投资者时间轴从初始认购支出开始，逐月列出归集现金、费用、储备和季度分配。到期剩余现金只计一次，不保证票息或返还初始本金。',mode:''});const timeline=p.locator('[data-period-timeline="investor"]').first();await timeline.locator('.pt-tools').scrollIntoViewIfNeeded();await sleep(director.record?9000:200);await p.mouse.wheel(0,550);await sleep(director.record?8000:200);await timeline.locator('[data-pt-jump]').selectOption('final');await sleep(director.record?6000:200);});
 for(const role of ['investor','investor2']){
 await step(role+'-eligibility',async()=>{await driver.nav(role,'investor_eligibility');return act(role,'apply-eligibility',{riskAccepted:true,demoAcknowledged:true},{caption:'投资者先确认浮动收益、损失和有限退出流动性的风险，再向中介提交演示资格申请。'});});
 await step(role+'-approved',async()=>{await driver.nav('agent','agent_kyc_review');await driver.sessions.agent.page.locator(`[data-investor-review="${role}"]`).click();return act('agent','eligible',{eligible:'true',reviewNote:'已核对独立钱包和演示风险声明，批准本地测试投资资格。'},{caption:'中介审批后，用钱包把这个地址的投资资格登记上链。只有获得资格的地址才能认购或接收份额。'});});}
 if(process.argv.includes('--checks'))await step('qa-insufficient-funds',async()=>{await driver.nav('investor','subscribe');await assert.rejects(()=>act('investor','subscribe',{amountUSDC6:'100'}),/余额不足|Insufficient demo USDC/);const s=await driver.state();assert.equal(s.accounts.investor.subscription.amount,'0');await driver.faucet('investor');return{unfundedSubscriptionRejected:true};});
 let now=await driver.state();const target=BigInt(now.chain.target),first=target*6n/10n;const units=n=>(Number(n)/1e6).toFixed(6);
 for(const [id,role,action,amount] of [['subscribe-a','investor','subscribe',first],['refund-a','investor','refund'],['resubscribe-a','investor','subscribe',first],['subscribe-b','investor2','subscribe',target-first]])await step(id,async()=>{await driver.nav(role,'subscribe');return act(role,action,amount?{amountUSDC6:units(amount)}:{});});
 await step('subscription-review',async()=>{await driver.nav('agent','agent_product');for(const investor of ['investor','investor2']){await act('agent','review-subscription',{approved:'true',reviewNote:'已核对投资资格、托管金额与发行条款。'},{caption:'中介立即审核两位投资者的订单，不需要推进三天时间。审核通过后仍须满足募集和购买资金要求，才能统一发行份额。'});}});
 await step('settle',async()=>{await driver.nav('agent','agent_product');return act('agent','settle');});await val('settled');
 console.log('PASS full browser issuance rehearsal');
 if(stop==='settlement')throw Error('CHECKPOINT_STOP');
 await director.setScene({chapter:'05 · 运营与分配'});
 for(let month=1;month<=60;month++){
   const prefix='month-'+month;
   await director.setScene({chapter:month<=6?'05 · 运营与分配':month<=9?'06 · 转让与赎回':'08 · 后续期间与到期关闭',caption:`第 ${month} / 60 期。这里只推进演示财务时间，模拟账单与回款不会改变真实电站记录。`});
   await step(prefix+'-advance',async()=>{await driver.nav('agent','agent_product');return act('agent','advance',{by:'month'},{proof:false,caption:`进入第 ${month} 期演示财务月份，原电站采集时间保持不变。`});});
   await step(prefix+'-fee',async()=>{await driver.nav('agent','agent_product');return act('agent','accrue-fee',{}, {proof:month===1,caption:'每月按照上一个已批准月末净值计提合计百分之零点五的年费，费用只记录一次。'});});
   await step(prefix+'-book',async()=>{await driver.nav('agent','agent_monitor');const s=await driver.state();const calendarMonth=new Date(s.financialTime*1000).getUTCMonth()+1;const records=s.stations[0].history.filter(h=>h.complete!==false);const history=(records.filter(h=>Number(h.month.slice(5))===calendarMonth).at(-1)||records.at(-1)).month;return act('agent','book-revenue',{period:String(month),historyMonth:history},{proof:month===1,caption:'选择已有的历史电量作为本期演示依据。系统按签约电价计算业主优惠电费、上网收入和费用，并记录应收款，而不是直接把预测当成现金。'});});
   if((await driver.state()).householdPaymentsEnabled){
    await step(prefix+'-owner-payment',async()=>{await driver.faucet('owner');await driver.nav('owner','owner_funds');return act('owner','pay-household-bill',{}, {proof:month===1,caption:'业主核对本期账单并使用自己的钱包支付测试 USDC。款项暂存在账单合约中，中介不能替业主签名。'});});
    await step(prefix+'-export-payment',async()=>{await driver.nav('agent','agent_monitor');return act('agent','fund-export',{}, {proof:month===1,caption:'只有电网售电部分由独立系统账户模拟，不能替代业主付款。'});});
    await step(prefix+'-confirm-receipt',async()=>{await driver.nav('agent','agent_monitor');return act('agent','confirm-receipt',{}, {proof:month===1,caption:'中介核对两笔回款后签名确认，净额进入资产池，约定站点费用支付一次。'});});
   }else{
   await step(prefix+'-collect',async()=>{await driver.nav('agent','agent_monitor');return act('agent','collect-revenue',{}, {proof:month===1,caption:'独立系统账户送入明确标记的模拟回款。应收款转为资金池现金，入账金额可以与 USDC 转账事件核对。'});});
   }
   await val(prefix);
   if(month%3===0){await step(prefix+'-distribution',async()=>{await driver.nav('agent','agent_product');return act('agent','distribute',{}, {proof:month===3,caption:'季度结清约定费用并恢复六个月保护储备后，剩余回款的百分之七十五用于分配，百分之二十五保留为赎回流动性。'});});await val(prefix+'-post-distribution');}
   if(month===3)await step('first-claim',async()=>{await driver.nav('investor','position');return act('investor','claim',{}, {caption:'分配先按快照固定领取权。投资者亲自签署领取交易，收到的现金与剩余份额净值分别显示，不会把返还的资产价值全部称为利息。'});});
   if(month===6){
     await director.setScene({chapter:'06 · 转让与赎回'});
     await step('trade-propose',async()=>{await driver.nav('investor','bond_transfer');return act('investor','propose-trade',{buyer:'investor2',sharesUSDC6:'1',paymentUSDC6:'5'},{caption:'六个月锁定结束后，投资者 A 向投资者 B 提出转让一份、支付五 USDC 的条款。这个演示价格刻意偏离净值，需要额外的中介复核。'});});
     await step('trade-buyer',async()=>{await driver.nav('investor2','bond_transfer');return act('investor2','consent-trade',{}, {caption:'买方在自己的钱包中批准支付额度并同意准确的转让条款。卖方不能替买方确认。'});});
     await step('trade-review',async()=>{await driver.nav('agent','agent_transfer_review');return act('agent','review-trade',{}, {caption:'协商价格与参考净值偏离超过百分之十，中介复核后在链上登记批准。这不是对该价格提供收益保证。'});});
     await step('trade-settle',async()=>{await driver.nav('investor','bond_transfer');return act('investor','settle-trade',{}, {caption:'卖方签署原子结算。份额从 A 转给 B，同时 USDC 从 B 转给 A，两条转账都在同一笔交易里。'});});
     const s=await driver.state();const amount=(Number(BigInt(s.accounts.investor.shares)/2n)/1e6).toFixed(6);
     await step('redemption-request',async()=>{await driver.nav('investor','bond_transfer');return act('investor','request-redemption',{sharesUSDC6:amount},{caption:'投资者提前三十天申请季度赎回。申请份额先进入托管，在付款销毁前仍保留分配权。'});});

   }
   if(month===9){await director.setScene({chapter:'06 · 季度赎回处理'});await step('redemption-process',async()=>{await driver.nav('agent','agent_product');return act('agent','process-redemptions',{}, {caption:'赎回按交易日净值处理，并受可用现金与资产池净值百分之五的双重限制。此次只会成交部分请求，未成交份额继续排队。'});});const s=await driver.state();if(!progress['redemption-cancel'])assert(BigInt(s.accounts.investor.redemption.shares)>0n);await step('redemption-cancel',async()=>{await driver.nav('investor','bond_transfer');return act('investor','cancel-redemption',{}, {caption:'投资者在下一截止前取消剩余排队部分。未付款的份额从托管中退回，不会被提前销毁。'});});}
   if(month===9){
     await director.setScene({chapter:'07 · 受托处置'});
     await step('case-open',async()=>{await driver.nav('agent','agent_monitor');return act('agent','open-case',{reason:'missing-remittance',notes:'演示服务事件：假设约定回款延迟并需要变更演示收款方。本事件不代表真实电站或业主存在违约，不修改银行账户或物理设备。'},{caption:'这里建立一项明确标记的模拟服务事件。普通发电量低于预测并不自动构成违约，处置需要固定持仓快照支持和两名不同受托人的批准。'});});
     await step('case-support',async()=>{await driver.nav('investor','position');return act('investor','support-case',{}, {caption:'投资者 A 按事件建立时的固定快照表示支持，达到百分之三十门槛。后续转让不能重复制造投票权。'});});
     for(const role of ['trustee','trustee2'])await step('case-'+role,async()=>{await driver.nav(role,'trustee_review');return act(role,'approve-case',{}, {caption:role==='trustee'?'第一位受托人独立签署批准，此时还不能完成收款方变更。':'第二位不同的受托人批准后，合约才执行演示收款方变更。链上可以核对两名审批人的独立地址。'});});
   }
   console.log(`PASS browser service month ${month}/60`);
 }
 await director.setScene({chapter:'08 · 到期关闭'});
 const beforeClose=await driver.state();assert.equal(beforeClose.chain.feeMonths,'60');assert.equal(beforeClose.receipts.length,60);
 await step('close',async()=>{await driver.nav('agent','agent_product');return act('agent','close',{}, {caption:'五年的收入权益到期后，确认应收款已收齐、费用和负债已结清。剩余现金形成最终分配，产品关闭，不再虚构一笔本金偿还。'});});
 for(const role of ['investor','investor2']){let s=await driver.state(role);for(const claim of s.accounts[role].claims.filter(c=>BigInt(c.amountUSDC6)>BigInt(c.paidUSDC6||'0')))await step(role+'-final-claim-'+claim.id,async()=>{await driver.nav(role,'position');return act(role,'claim',{}, {proof:claim.id===s.accounts[role].claims.at(-1).id,caption:'投资者领取已经固定的剩余分配权。这里包含历次尚未领取的金额与到期最终现金，全部对应独立的链上领取记录。'});});}
 await step('release',async()=>{await driver.openApplication('owner','owner_agreement');return act('owner','release-station',{}, {caption:'最后，由业主钱包取回电站凭证，结束托管。设备一直属于业主，期限结束后的收入也不再受本产品的收益权约定约束。'});});
 const final=await driver.state();for(const op of final.operations.filter(o=>o.status==='confirmed'))await driver.evidence('agent',op.action,false,op.id);assert.equal(final.chain.phase,'4');assert.deepEqual(final.stations.map(s=>[s.id,s.observedAt,s.sourceHash]),state.stations.map(s=>[s.id,s.observedAt,s.sourceHash]),'Financial time never changes recorded telemetry');assert(final.applications[0].chainAdmission.released);writeFileSync(director.dir+'/final-state.json',JSON.stringify(final,null,2));director.status='complete';console.log('PASS COMPLETE REAL '+(process.env.REVENUE_RECORDING_WALLET==='rabby'?'RABBY':'METAMASK')+' LIFECYCLE');

}catch(e){if(director){director.status=e.message==='CHECKPOINT_STOP'?'checkpoint':'failed';director.mark('stop',{status:director.status,reason:e.message.split('\n')[0]});}if(e.message!=='CHECKPOINT_STOP'){console.error('Scenario stopped:',e.message.split('\n')[0]);console.error((e.stack||'').split('\n').filter(line=>line.trim().startsWith('at ')).slice(0,6).join('\n'));process.exitCode=1;}else console.log('Requested checkpoint reached');}finally{if(director)await director.close();await driver.close();}
