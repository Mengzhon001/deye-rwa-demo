import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {BrowserDriver} from './recording/rabby-driver.mjs';import {config} from './recording/environment.mjs';
if(process.env.REVENUE_GUIDANCE_ISOLATED_QA!=='true')throw Error('Dedicated disposable environment required');
const c=config('guidance-isolated'),driver=new BrowserDriver('guidance-isolated'),checks=[];
const save=()=>writeFileSync(c.dir+'/results.json',JSON.stringify({at:new Date().toISOString(),passed:false,checks,proofs:driver.proofs},null,2),{mode:0o600});
const pass=x=>{checks.push(x);console.log('CHECK',x);save();};
let scope='issuance';const progress={};
async function act(r,a,v={}){const k=scope+':'+r+':'+a;const result=await driver.action(r,a,v,{proof:false});progress[k]=result||{confirmed:true};writeFileSync(c.dir+'/progress.json',JSON.stringify(progress),{mode:0o600});return result;}
async function val(){await driver.nav('agent','agent_pool');await act('agent','prepare-valuation');await driver.nav('trustee','trustee_events');await act('trustee','approve-valuation',{acceptProvisional:true});}
async function current(r){const p=driver.sessions[r].page;const launch=p.locator('#guide-launch');if(!await p.locator('#guide-panel').count())await launch.click();if((await p.locator('#guide-panel').innerText()).includes('引导已暂停'))await p.locator('[data-guide-pause]').click();return p.locator('.guide-current > h3').innerText();}
try{
 await driver.start();for(const r of ['owner','agent','investor','trustee']){await driver.login(r);await driver.faucet(r);}pass('Four isolated accounts log in through real Rabby message signatures and receive explicit faucet funds');
 let s=await driver.state();assert.equal(s.manifest.chainId,20261015);assert.equal(s.chain.distributionIntervalMonths,1);assert.equal(Number(s.chain.phase),0);assert.equal(s.applications.length,0);const original=s.stations.map(x=>[x.sourceHash,x.observedAt]);
 if(!progress['issuance:agent:settle']){
 if(!progress['issuance:agent:admit']){
 await driver.nav('owner','owner_apply');await act('owner','apply',{stationId:s.stations[0].id,notes:'隔离浏览器回归。记录回放，不改变共享演示进度。'});
 await driver.openApplication('agent','agent_apply_review');await act('agent','review',{decision:'approved',notes:'核对电站证据和收益权条款。'});
 await driver.openApplication('agent','agent_financing');await act('agent','offer',{wf_baselineMethod:'historical',wf_baselineReviewNote:'核对已采集完整历史月份。近期数据与历史统计范围不同，本次采用历史季节性基线，并明确标记演示电价及交付假设。',wf_baselineReviewed:true});
 await driver.openApplication('trustee','trustee_events');await act('trustee','approve-offer',{acceptProvisional:true});
 await driver.openApplication('owner','owner_agreement');await act('owner','accept');await driver.openApplication('owner','owner_agreement');await act('owner','sign');
 await driver.openApplication('agent','agent_pool');await act('agent','mint-station');await driver.openApplication('owner','owner_agreement');await act('owner','custody-consent');await driver.openApplication('agent','agent_pool');await act('agent','admit');}
 await val();
 await driver.nav('agent','agent_product');await act('agent','publish');await driver.nav('investor','investor_eligibility');await act('investor','apply-eligibility',{riskAccepted:true,demoAcknowledged:true});await driver.nav('agent','agent_kyc_review');await driver.sessions.agent.page.locator('[data-investor-review="investor"]').click();await act('agent','eligible',{eligible:'true',reviewNote:'独立测试投资者已阅读风险声明。'});
 s=await driver.state();await driver.nav('investor','subscribe');await act('investor','subscribe',{amountUSDC6:(Number(s.chain.target)/1e6).toFixed(6)});await driver.nav('agent','agent_product');await act('agent','review-subscription',{approved:'true',reviewNote:'核对累计托管金额与当前发行条款。'});await act('agent','settle');}
 s=await driver.state();if(Number(s.chain.feeMonths)===0&&Number(s.financialTime)<Number(s.chain.nextFeeAt)){scope='opening';await val();}
 pass('Actual page and Rabby workflow completes application, independent offer review, agreement signing, NFT custody, publication, subscription review and issuance');
 for(let month=1;month<=2;month++){scope='month'+month;
  await driver.nav('agent','agent_product');await act('agent','advance',{by:'month'});await driver.nav('agent','agent_monitor');s=await driver.state();const hist=s.stations[0].history.filter(h=>h.complete!==false&&h.exportKWh!==null&&h.generationKWh!==null).at(-1).month;await act('agent','book-revenue',{period:String(month),historyMonth:hist});await driver.nav('agent','agent_monitor');await act('agent','collect-revenue');
  s=await driver.state();if(!s.chain.feeBasisReady&&Number(s.chain.feeMonths)<month){scope='month'+month+'-fee-basis';await val();scope='month'+month;}
  await driver.nav('agent','agent_product');await act('agent','accrue-fee');
  await driver.nav('agent','agent_pool');await act('agent','prepare-valuation');await driver.nav('trustee','trustee_events');const p=driver.sessions.trustee.page;
  assert.equal(await p.evaluate(()=>RevenueGuideModel.distributionHandoff(state)),null);assert.match(await current('trustee'),/批准资产池估值/);await p.locator('[data-guide-locate]').click();await p.locator('.driver-popover').waitFor();assert.equal(await p.locator('.driver-active-element').evaluate(e=>(e.closest('form')||e.querySelector('form'))?.dataset.action==='approve-valuation'),true);await p.screenshot({path:c.dir+`/month${month}-pending-approval.png`});await p.keyboard.press('Escape');
  await act('trustee','approve-valuation',{acceptProvisional:true});pass(`Month ${month}: trustee guide locates the actual unapproved valuation, never an old paid distribution`);
  await driver.nav('agent','agent_product');await act('agent','distribute');const a=driver.sessions.agent.page;assert.equal((await driver.state()).chain.distributionCount,String(month));assert(await a.locator('[data-distribution-handoff]').count());assert.match(await current('agent'),/分配已宣告/);await a.screenshot({path:c.dir+`/month${month}-declared.png`});
  const notice=a.locator('.guide-notice[open]');if(await notice.count())await notice.locator('[data-guide-investor-handoff]').click();else await a.locator('#guide-panel [data-guide-investor-handoff]').click();await a.locator('.wallet-login[open]').waitFor();assert.equal(await a.locator('[data-wl-role="investor"]').getAttribute('aria-pressed'),'true');await a.keyboard.press('Escape');
  await driver.nav('investor','position');s=await driver.state('investor');const claim=s.accounts.investor.claims.find(x=>Number(x.id)===month);assert(BigInt(claim.amountUSDC6)>0n);const balance=BigInt(s.accounts.investor.usdc);await driver.sessions.investor.page.screenshot({path:c.dir+`/month${month}-claimable.png`});await act('investor','claim');s=await driver.state('investor');const paid=s.accounts.investor.claims.find(x=>Number(x.id)===month);assert.equal(paid.amountUSDC6,'0');assert.equal(BigInt(paid.paidUSDC6),BigInt(claim.amountUSDC6));assert.equal(BigInt(s.accounts.investor.usdc)-balance,BigInt(claim.amountUSDC6));
  await driver.nav('trustee','trustee_events');assert.equal(await driver.sessions.trustee.page.evaluate(()=>RevenueGuideModel.distributionHandoff(state)),null);assert.equal(await driver.sessions.trustee.page.locator('[data-distribution-handoff]').count(),0);pass(`Month ${month}: confirmed declaration offers investor handoff; real Rabby claim pays ${Number(claim.amountUSDC6)/1e6} USDC; paid history disappears from active staff guidance`);
  scope='month'+month+'-after';await val();
 }
 s=await driver.state();for(const op of s.operations.filter(o=>o.status==='confirmed'))await driver.evidence('agent',op.action,false,op.id);assert.deepEqual(s.stations.map(x=>[x.sourceHash,x.observedAt]),original);assert.equal(s.chain.distributionCount,'2');assert(driver.proofs.filter(p=>p.action==='claim').length===2);assert(driver.proofs.every(p=>p.offchain||p.matched));pass('Two consecutive monthly distributions reconcile wallet balance changes, confirmed receipts and business evidence; telemetry remains fixed');
 writeFileSync(c.dir+'/final-state.json',JSON.stringify(s),{mode:0o600});writeFileSync(c.dir+'/results.json',JSON.stringify({passed:true,at:new Date().toISOString(),realRabby:true,cleanBusinessStart:true,chainId:20261015,checks,proofs:driver.proofs},null,2),{mode:0o600});
}catch(e){console.error(e.stack);save();process.exitCode=1;}finally{await driver.close();}
