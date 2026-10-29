import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {Wallet,JsonRpcProvider} from 'ethers';
import {guard,root,dir,urls,chainId} from '../../scripts/revenue-guidance-local.mjs';
guard();const provider=new JsonRpcProvider(urls.rpc),source=process.argv.includes('--source');
assert.equal(Number(BigInt(await provider.send('eth_chainId',[]))),chainId);
const keys=JSON.parse(readFileSync(dir+'/wallet-import.private.json'));
const vault=JSON.parse(readFileSync(dir+'/experience-product.json')).vault;
const browser=await chromium.launch({headless:true}),results=[],errors=[];
mkdirSync(dir+'/locate-check',{recursive:true,mode:0o700});
async function setup({language='zh',mobile=false,patch=()=>{}}={}){
 const w=new Wallet(keys.agent.privateKey),headers={Origin:urls.app,'Content-Type':'application/json'};
 let r=await fetch(urls.app+'/api/auth/challenge',{method:'POST',headers,body:JSON.stringify({address:w.address,requestedRole:'agent'})});assert(r.ok);const c=await r.json();
 r=await fetch(urls.app+'/api/auth/verify',{method:'POST',headers,body:JSON.stringify({nonce:c.nonce,signature:await w.signMessage(c.message)})});assert(r.ok);const raw=r.headers.get('set-cookie').split(';')[0],i=raw.indexOf('=');
 const state=await fetch(urls.app+'/api/state',{headers:{Cookie:raw,'X-Revenue-Product':vault}}).then(r=>r.json());
 const fixture=structuredClone(state);fixture.operations=[];fixture.chain.valuationReport=fixture.activeReports.aggregate;fixture.chain.proposedValuationValidUntil=fixture.financialTime+90*86400;if(!fixture.approvedReports.includes(fixture.activeReports.aggregate))fixture.approvedReports.push(fixture.activeReports.aggregate);fixture.chain.phase='1';fixture.chain.deadline=fixture.financialTime+86400;fixture.chain.fresh=true;fixture.chain.subscriptionReviewRequired=true;
 for(const a of Object.values(fixture.accounts)){a.subscription={...a.subscription,amount:'0',approved:false};}
 fixture.accounts.investor.eligible=true;fixture.accounts.investor.subscription={...fixture.accounts.investor.subscription,amount:'1000000000',approved:false};fixture.chain.totalSubscriptions='1000000000';
 patch(fixture);
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.addCookies([{name:raw.slice(0,i),value:raw.slice(i+1),url:urls.app,httpOnly:true,sameSite:'Strict'}]);
 await context.addInitScript(({address,language,chain,vault})=>{localStorage.setItem('revenue.lang',language);sessionStorage.setItem('revenue.selected-product',vault);window.ethereum={isRabby:true,on(){},removeListener(){},request:async({method})=>{if(method==='eth_accounts')return[address];if(method==='eth_chainId')return chain;throw Error('Locate tests cannot sign or submit transactions');}};
  localStorage.setItem(`guidance.v1:${parseInt(chain,16)}:${address.toLowerCase()}:agent:${vault}`,JSON.stringify({open:true,paused:false,selected:'settle:agent:pool:',selectedExplicit:false}));
 },{address:w.address,language,chain:'0x'+chainId.toString(16),vault});
 await context.route('**/api/state',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)}));
 // Even an accidental click on a business control must never mutate the user's scene in these checks.
 await context.route('**/api/**',async(route)=>{
  const request=route.request();if(request.method()!=='GET'){errors.push('Forbidden mutation '+request.url());return route.abort();}return route.fallback();
 });
 if(source)for(const name of ['guidance.js','guidance-model.js','guidance.css','product.js','investor.js','app.js'])await context.route('**/'+name,route=>route.fulfill({status:200,contentType:name.endsWith('css')?'text/css':'text/javascript',body:readFileSync(root+'/ui/public/revenue/'+name,'utf8')}));
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.goto(urls.app+'/app/');await page.locator('[data-guide-start]').click();
 return {context,page,fixture};
}
async function choose(page,action){
 const task=await page.evaluate(action=>window.RevenueGuide.model().find(t=>t.action===action&&t.status!=='complete'),action);assert(task);
 await page.locator('.guide-checklist').evaluate(e=>e.open=true);await page.locator(`[data-guide-task-id="${task.id}"]`).click();return task;
}
async function popup(page,word){await page.locator('.guide-notice[open]').waitFor();await page.waitForFunction(word=>document.querySelector('.guide-notice[open]')?.innerText.includes(word),word);}
try{
 const a=await setup();const p=a.page;
 await p.locator('[data-guide-task="review-subscription"]').waitFor();results.push('New order review replaces a cached automatic blocked settlement');
 await p.locator('[data-guide-locate]').click();await p.locator('.driver-popover').waitFor();assert.equal(await p.locator('form[data-action="review-subscription"]').getAttribute('data-guide-entity'),'investor');await p.keyboard.press('Escape');
 await p.locator('[data-guide-locate]').click();await p.locator('.driver-popover').waitFor();await p.keyboard.press('Escape');assert(await p.locator('[data-guide-locate]').evaluate(e=>e===document.activeElement));results.push('Repeated ready-operation clicks each create a spotlight on the exact investor order and restore focus');
 await choose(p,'settle');
 for(let n=0;n<2;n++){
  await p.locator('[data-guide-locate]').click();await popup(p,'当前尚未满足操作条件');
  assert(await p.locator('.guide-notice').innerText().then(t=>t.includes('全部认购订单已由中介审核通过')&&t.includes('至少10%现金由合约自动留存')));
  assert.equal(await p.locator('form[data-action="settle"] button[type=submit]').isDisabled(),true);
  if(n===0){await p.screenshot({path:dir+'/locate-check/blocked-settlement.png'});await p.keyboard.press('Escape');assert(await p.locator('[data-guide-locate]').evaluate(e=>e===document.activeElement));}
 }
 await p.locator('[data-guide-remedy]').click();await p.locator('.driver-popover').waitFor();assert.equal(await p.locator('[data-guide-task="review-subscription"]').count(),1);await p.screenshot({path:dir+'/locate-check/order-review.png'});await p.keyboard.press('Escape');
 results.push('Blocked settlement always opens a conditions dialog; remedy locates order review without enabling or submitting settlement');
 await p.evaluate(()=>window.RevenueGuide.operation({stage:'wallet',action:'review-subscription',message:'请先在钱包中确认当前审核请求。'}));await p.locator('[data-guide-locate]').click();await popup(p,'当前操作仍在处理中');await p.keyboard.press('Escape');await p.evaluate(()=>window.RevenueGuide.operation({stage:'done'}));results.push('Wallet-in-progress locator stays responsive with an explanation');await a.context.close();

 const missing=await setup();await choose(missing.page,'review-subscription');
 await missing.page.evaluate(()=>{new MutationObserver(()=>document.querySelectorAll('form[data-action="review-subscription"]').forEach(f=>f.remove())).observe(document.querySelector('#main'),{childList:true,subtree:true});});
 await missing.page.locator('[data-guide-locate]').click();await popup(missing.page,'当前记录未提供该操作');assert.equal(await missing.page.locator('.driver-popover').count(),0);await missing.page.keyboard.press('Escape');await missing.page.locator('[data-guide-locate]').click();await popup(missing.page,'当前记录未提供该操作');results.push('Missing target shows a repeatable dialog without highlighting another record');await missing.context.close();

 const resource=await setup();await resource.context.route('**/guidance-driver.js',route=>route.abort());await resource.page.locator('[data-guide-locate]').click();await popup(resource.page,'操作引导组件暂时未能加载');await resource.context.unroute('**/guidance-driver.js');await resource.page.locator('[data-guide-retry]').click();await resource.page.locator('.driver-popover').waitFor();await resource.page.keyboard.press('Escape');results.push('Driver asset failure opens a readable fallback and retries successfully');await resource.context.close();

 const unavailable=await setup();await unavailable.context.route('**/api/state',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'本地状态服务暂时不可用，请稍后重试。'})}));await unavailable.page.locator('[data-guide-locate]').click();await unavailable.page.locator('.driver-popover').waitFor();await unavailable.page.keyboard.press('Escape');await unavailable.page.locator('[data-guide-refresh]').click();await popup(unavailable.page,'本地状态服务暂时不可用');await unavailable.page.keyboard.press('Escape');results.push('Locating works while the status service is unavailable; explicit refresh reports the read failure');await unavailable.context.close();

 const en=await setup({language:'en',mobile:true});await choose(en.page,'settle');await en.page.locator('[data-guide-locate]').click();await popup(en.page,'Prerequisites are not yet met');assert(await en.page.evaluate(()=>{const d=document.querySelector('.guide-notice'),r=d.getBoundingClientRect(),h=d.querySelector('h2').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height<=innerHeight&&h.top>=r.top&&h.bottom<=r.bottom&&d.scrollTop===0;}));await en.page.screenshot({path:dir+'/locate-check/blocked-mobile-en.png'});await en.page.keyboard.press('Escape');results.push('English mobile dialog fits the viewport, starts at its heading and supports Escape');await en.context.close();
 assert.deepEqual(errors,[]);writeFileSync(dir+'/locate-check/results'+(source?'-source':'')+'.json',JSON.stringify({passed:true,at:new Date().toISOString(),readonlyPresentationFixtures:true,sourceAssets:source,chainId,results,errors},null,2));console.log('PASS '+results.length+' locator checks; no business mutation or wallet transaction');
}finally{await browser.close();provider.destroy();}
