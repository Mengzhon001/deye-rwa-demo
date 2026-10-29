import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {HDNodeWallet} from 'ethers';
import {chromium} from 'playwright';

const dir=process.env.REVENUE_UNIFIED_DATA_DIR,rolesFile=process.env.BASE_EXISTING_ROLES_FILE;
if(!dir||!rolesFile)throw Error('Explicit test directories and wallets required');
const origin=JSON.parse(readFileSync(join(dir,'public.json'))).app;
const wallets=JSON.parse(readFileSync(rolesFile)).wallets;
const out=join(dir,'validation/guidance-resources');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[],errors=[];
async function fixture(id,role='investor'){
 const wallet=HDNodeWallet.fromPhrase(wallets[role].phrase);
 const path=`/networks/${id}`,headers={Origin:origin,'Content-Type':'application/json'};
 const post=async(url,body)=>{const r=await fetch(origin+path+url,{method:'POST',headers,body:JSON.stringify(body)});assert.ok(r.ok);return r;};
 const c=await(await post('/api/auth/challenge',{address:wallet.address,requestedRole:role})).json();
 const verified=await post('/api/auth/verify',{nonce:c.nonce,signature:await wallet.signMessage(c.message)}),session=await verified.json();
 const cookie=verified.headers.get('set-cookie').split(';')[0];
 const response=await fetch(origin+path+'/api/state',{headers:{Cookie:cookie}});assert.ok(response.ok);
 const state=await response.json();assert.equal(state.manifest.chainId,id==='private'?20261008:84532);
 // Reproduce an unqualified investor in browser presentation only. Nothing is
 // posted back, and no eligibility, subscription or chain state is changed.
 if(role==='investor'){
  state.accounts[session.actor].eligible=false;
  state.eligibilityApplications=(state.eligibilityApplications||[]).filter(a=>a.investor!==session.actor);
 }else{
  state.operations=[];state.chain.phase='1';state.chain.deadline=state.financialTime+86400;state.chain.fresh=true;state.chain.subscriptionReviewRequired=true;
  state.chain.valuationReport=state.activeReports.aggregate;state.chain.proposedValuationValidUntil=state.financialTime+90*86400;
  if(!state.approvedReports.includes(state.activeReports.aggregate))state.approvedReports.push(state.activeReports.aggregate);
  for(const a of Object.values(state.accounts))a.subscription={...a.subscription,amount:'0',approved:false};
  state.accounts.investor.eligible=true;state.accounts.investor.subscription={...state.accounts.investor.subscription,amount:'1000000000',approved:false};state.chain.totalSubscriptions='1000000000';
 }
 return {id,path,cookie,state,role,address:wallet.address};
}
async function check(f,{lang='zh',fail='',mobile=false}={}){
 console.log('Checking',f.id,f.role,lang,mobile?'mobile':'desktop',fail||'normal');
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},reducedMotion:'reduce'});
 const i=f.cookie.indexOf('=');await context.addCookies([{name:f.cookie.slice(0,i),value:f.cookie.slice(i+1),url:origin+f.path+'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
 await context.addInitScript(({address,chain,lang})=>{localStorage.setItem('revenue.lang',lang);localStorage.setItem('revenue.wallet','rabby');window.ethereum={isRabby:true,on(){},removeListener(){},request:async({method})=>{if(method==='eth_accounts')return[address];if(method==='eth_chainId')return chain;throw Error('Guide checks must not sign or submit transactions');}};},{address:f.address,chain:'0x'+f.state.manifest.chainId.toString(16),lang});
 await context.route('**/api/**',r=>{if(r.request().method()!=='GET'){errors.push('Forbidden business mutation');return r.abort();}return r.fallback();});
 let stateReads=0,readMode='ok',releaseRead,pendingStarted;
 await context.route('**/api/state',async r=>{
  stateReads++;
  if(readMode==='fail')return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Status service unavailable for test'})});
  if(readMode==='hold'){pendingStarted?.();await new Promise(resolve=>releaseRead=resolve);}
  await r.fulfill({contentType:'application/json',body:JSON.stringify(f.state)});
 });
 const failPattern='**/guidance-driver.'+fail;
 if(fail)await context.route(failPattern,r=>r.abort());
 const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
 try{
 await p.goto(origin+f.path+'/app/?lang='+lang);await p.locator('[data-guide-start]').click();
 const action=f.role==='agent'?'settle':'apply-eligibility';
 const task=await p.evaluate(action=>RevenueGuide.model().find(t=>t.action===action),action);assert.ok(task);
 await p.locator('.guide-checklist').evaluate(e=>e.open=true);await p.locator(`[data-guide-task-id="${task.id}"]`).click();
 const initialReads=stateReads,readAt=await p.locator('[data-guide-read-at]').getAttribute('data-guide-read-at'),started=performance.now();
 await p.locator('[data-guide-locate]').click();
 if(f.role==='agent'){
  await p.locator('.guide-notice[open]').filter({hasText:lang==='en'?'Prerequisites are not yet met':'当前尚未满足操作条件'}).waitFor();
  assert.equal(stateReads,initialReads);assert.equal(await p.locator('form[data-action="settle"].guide-blocked-target').count(),1);
  assert.ok(await p.locator('form[data-action="settle"] button[type="submit"]').isDisabled());
  assert.match(await p.locator('[data-guide-retry]').innerText(),lang==='en'?/Retry locating/:/重新定位/);
  assert.equal(await p.locator('[data-guide-notice-refresh]').count(),1);
  const elapsed=performance.now()-started;assert.ok(elapsed<2500,`Blocked locate took ${elapsed} ms`);
  await p.screenshot({path:join(out,`${f.id}-${lang}-settlement.png`)});
  await p.locator('[data-guide-remedy]').click();await p.locator('.driver-popover').waitFor();
  assert.equal(await p.locator('form[data-action="review-subscription"] .driver-active-element').count(),1);assert.equal(stateReads,initialReads);
  results.push({network:f.id,role:f.role,lang,mobile,blockedLocateMs:Math.round(elapsed),exactTarget:true,noStateQuery:true,concreteOrderReviewRemedy:true});
  await context.close();return;
 }
 if(fail){
  await p.locator('.guide-notice[open]').filter({hasText:lang==='en'?/operation guide could not load/:/操作引导组件暂时未能加载/}).waitFor();
  assert.equal(await p.locator('form[data-action="apply-eligibility"].guide-blocked-target').count(),1);
  assert.equal(await p.locator('.driver-popover').count(),0);
  await context.unroute(failPattern);await p.locator('[data-guide-retry]').click();
 }
 await p.locator('.driver-popover').waitFor();
 const elapsed=performance.now()-started;
 assert.equal(stateReads,initialReads);assert.equal(await p.locator('[data-guide-read-at]').getAttribute('data-guide-read-at'),readAt);
 assert.equal(await p.locator('form[data-action="apply-eligibility"] .driver-active-element').count(),1);
 assert.equal(await p.locator('link[href="/guidance-driver.css"]').count(),1);
 assert.ok(await p.locator('script[src="/guidance-driver.js"]').count()<=1);
 assert.equal(await p.evaluate(()=>typeof window.driver.js.driver),'function');
 assert.equal(await p.locator('.driver-popover').evaluate(el=>getComputedStyle(el).position),'fixed');
 await p.screenshot({path:join(out,`${f.id}-${lang}-${fail||'normal'}.png`)});
 await p.keyboard.press('Escape');await p.locator('.driver-popover').waitFor({state:'hidden'});
 assert.ok(await p.locator('[data-guide-locate]').evaluate(e=>e===document.activeElement));
 await p.locator('[data-guide-locate]').click();await p.locator('.driver-popover').waitFor();await p.keyboard.press('Escape');await p.locator('.driver-popover').waitFor({state:'hidden'});
 assert.equal(stateReads,initialReads);
 // RPC failure must not prevent navigation. Only an explicit status refresh reads it.
 readMode='fail';await p.locator('[data-guide-locate]').click();await p.locator('.driver-popover').waitFor();await p.keyboard.press('Escape');await p.locator('.driver-popover').waitFor({state:'hidden'});assert.equal(stateReads,initialReads);
 await p.locator('[data-guide-refresh]').click();await p.locator('.guide-notice').filter({hasText:'Status service unavailable for test'}).waitFor();assert.equal(stateReads,initialReads+1);
 readMode='ok';await p.locator('[data-guide-retry]').click();await p.locator('.guide-last-check').waitFor();assert.equal(stateReads,initialReads+2);await p.keyboard.press('Escape');await p.locator('.driver-popover').waitFor({state:'hidden'});
 const freshAt=await p.locator('[data-guide-read-at]').getAttribute('data-guide-read-at');assert.ok(Number(freshAt)>Number(readAt));
 // A query already in flight must not hold the locator or reopen its dialog after dismissal.
 readMode='hold';const pending=new Promise(resolve=>pendingStarted=resolve);
 await p.locator('[data-guide-refresh]').click();await pending;await p.locator('[data-guide-notice-close]').click();
 await p.locator('[data-guide-locate]').click();await p.locator('.driver-popover').waitFor();assert.equal(stateReads,initialReads+3);
 releaseRead();await p.waitForFunction(at=>Number(document.querySelector('[data-guide-read-at]')?.dataset.guideReadAt)>Number(at),freshAt);
 await p.waitForFunction(()=>!!document.querySelector('form[data-action="apply-eligibility"] .driver-active-element'));
 assert.equal(await p.locator('.guide-notice[open]').count(),0);await p.keyboard.press('Escape');await p.locator('.driver-popover').waitFor({state:'hidden'});
 results.push({network:f.id,role:f.role,lang,mobile,resourceFailure:fail||null,firstLocateMs:Math.round(elapsed),correctControl:true,repeatedLocate:true,noStateQuery:true,explicitRefreshRecovery:true,locateDuringPendingRefresh:true});
 await context.close();
 }catch(error){await p.screenshot({path:join(out,'locator-failure.png')});console.log('Locator failure details:',await p.evaluate(()=>({spotlight:document.body.classList.contains('guide-spotlight'),popover:document.querySelector('.driver-popover')?.innerText,notice:document.querySelector('.guide-notice[open]')?.innerText,active:document.activeElement?.tagName})));throw error;}
}
try{
 for(const extension of ['js','css']){const r=await fetch(origin+'/guidance-driver.'+extension);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),extension==='js'?/javascript/:/text\/css/);await r.body.cancel();}
 const base=await fixture('base-sepolia'),privateChain=await fixture('private');
 await check(base);await check(privateChain,{lang:'en'});
 await check(base,{lang:'en',fail:'js',mobile:true});await check(base,{fail:'css',mobile:true});
 const agent=await fixture('base-sepolia','agent');await check(agent);await check(agent,{lang:'en',mobile:true});
 assert.deepEqual(errors,[]);writeFileSync(join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),origin,realSignedSessions:true,readOnlyPresentationFixtures:true,noBusinessTransactions:true,results,errors},null,2));console.log('PASS both network guides, immediate location without state reads, explicit refresh recovery, pending refresh race and blocked settlement remedy');
}finally{await browser.close();}
