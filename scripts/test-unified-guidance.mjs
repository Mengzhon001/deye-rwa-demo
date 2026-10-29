import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {HDNodeWallet} from 'ethers';
import {chromium} from 'playwright';

const dir=process.env.REVENUE_UNIFIED_DATA_DIR,rolesFile=process.env.BASE_EXISTING_ROLES_FILE;
if(!dir||!rolesFile)throw Error('Explicit test directories and wallets required');
const origin=JSON.parse(readFileSync(join(dir,'public.json'))).app;
const wallet=HDNodeWallet.fromPhrase(JSON.parse(readFileSync(rolesFile)).wallets.investor.phrase);
const out=join(dir,'validation/guidance-resources');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[],errors=[];
async function fixture(id){
 const path=`/networks/${id}`,headers={Origin:origin,'Content-Type':'application/json'};
 const post=async(url,body)=>{const r=await fetch(origin+path+url,{method:'POST',headers,body:JSON.stringify(body)});assert.ok(r.ok);return r;};
 const c=await(await post('/api/auth/challenge',{address:wallet.address,requestedRole:'investor'})).json();
 const verified=await post('/api/auth/verify',{nonce:c.nonce,signature:await wallet.signMessage(c.message)}),session=await verified.json();
 const cookie=verified.headers.get('set-cookie').split(';')[0];
 const response=await fetch(origin+path+'/api/state',{headers:{Cookie:cookie}});assert.ok(response.ok);
 const state=await response.json();assert.equal(state.manifest.chainId,id==='private'?20261008:84532);
 // Reproduce an unqualified investor in browser presentation only. Nothing is
 // posted back, and no eligibility, subscription or chain state is changed.
 state.accounts[session.actor].eligible=false;
 state.eligibilityApplications=(state.eligibilityApplications||[]).filter(a=>a.investor!==session.actor);
 return {id,path,cookie,state};
}
async function check(f,{lang='zh',fail='',mobile=false}={}){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},reducedMotion:'reduce'});
 const i=f.cookie.indexOf('=');await context.addCookies([{name:f.cookie.slice(0,i),value:f.cookie.slice(i+1),url:origin+f.path+'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
 await context.addInitScript(({address,chain,lang})=>{localStorage.setItem('revenue.lang',lang);localStorage.setItem('revenue.wallet','rabby');window.ethereum={isRabby:true,on(){},removeListener(){},request:async({method})=>{if(method==='eth_accounts')return[address];if(method==='eth_chainId')return chain;throw Error('Guide checks must not sign or submit transactions');}};},{address:wallet.address,chain:'0x'+f.state.manifest.chainId.toString(16),lang});
 await context.route('**/api/**',r=>{if(r.request().method()!=='GET'){errors.push('Forbidden business mutation');return r.abort();}return r.fallback();});
 await context.route('**/api/state',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(f.state)}));
 const failPattern='**/guidance-driver.'+fail;
 if(fail)await context.route(failPattern,r=>r.abort());
 const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+f.path+'/app/?lang='+lang);await p.locator('[data-guide-start]').click();
 const task=await p.evaluate(()=>RevenueGuide.model().find(t=>t.action==='apply-eligibility'));assert.ok(task);
 await p.locator('.guide-checklist').evaluate(e=>e.open=true);await p.locator(`[data-guide-task-id="${task.id}"]`).click();
 await p.locator('[data-guide-locate]').click();
 if(fail){
  await p.locator('.guide-notice[open]').filter({hasText:lang==='en'?/operation guide could not load/:/操作引导组件暂时未能加载/}).waitFor();
  assert.equal(await p.locator('form[data-action="apply-eligibility"].guide-blocked-target').count(),1);
  assert.equal(await p.locator('.driver-popover').count(),0);
  await context.unroute(failPattern);await p.locator('[data-guide-retry]').click();
 }
 await p.locator('.driver-popover').waitFor();
 assert.equal(await p.locator('form[data-action="apply-eligibility"] .driver-active-element').count(),1);
 assert.equal(await p.locator('link[href="/guidance-driver.css"]').count(),1);
 assert.ok(await p.locator('script[src="/guidance-driver.js"]').count()<=1);
 assert.equal(await p.evaluate(()=>typeof window.driver.js.driver),'function');
 assert.equal(await p.locator('.driver-popover').evaluate(el=>getComputedStyle(el).position),'fixed');
 await p.screenshot({path:join(out,`${f.id}-${lang}-${fail||'normal'}.png`)});
 await p.keyboard.press('Escape');
 assert.ok(await p.locator('[data-guide-locate]').evaluate(e=>e===document.activeElement));
 await p.locator('[data-guide-locate]').click();await p.locator('.driver-popover').waitFor();await p.keyboard.press('Escape');
 results.push({network:f.id,lang,mobile,resourceFailure:fail||null,correctControl:true,repeatedLocate:true});
 await context.close();
}
try{
 for(const extension of ['js','css']){const r=await fetch(origin+'/guidance-driver.'+extension);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),extension==='js'?/javascript/:/text\/css/);await r.body.cancel();}
 const base=await fixture('base-sepolia'),privateChain=await fixture('private');
 await check(base);await check(privateChain,{lang:'en'});
 await check(base,{lang:'en',fail:'js',mobile:true});await check(base,{fail:'css',mobile:true});
 assert.deepEqual(errors,[]);writeFileSync(join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),origin,realSignedSessions:true,readOnlyPresentationFixtures:true,noBusinessTransactions:true,results,errors},null,2));console.log('PASS both network guides, exact eligibility target, repeated location and JS/CSS failure recovery');
}finally{await browser.close();}
