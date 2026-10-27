import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {Wallet,JsonRpcProvider} from 'ethers';
import {guard,urls,chainId,dir} from '../../scripts/revenue-guidance-local.mjs';
guard();const provider=new JsonRpcProvider(urls.rpc);assert.equal(Number((await provider.getNetwork()).chainId),chainId);
const keys=JSON.parse(readFileSync(dir+'/wallet-import.private.json')),browser=await chromium.launch({headless:true});mkdirSync(dir+'/ui-cases',{recursive:true});const results=[],errors=[];
async function scene(name,role,patch,action,status,{locate=false,handoff=false,poll=false}={}){
 const w=new Wallet(keys[role].privateKey),headers={Origin:urls.app,'Content-Type':'application/json'};
 let r=await fetch(urls.app+'/api/auth/challenge',{method:'POST',headers,body:JSON.stringify({address:w.address,requestedRole:role.replace(/2$/,'')})});const ch=await r.json();
 r=await fetch(urls.app+'/api/auth/verify',{method:'POST',headers,body:JSON.stringify({nonce:ch.nonce,signature:await w.signMessage(ch.message)})});assert(r.ok);const cookie=r.headers.get('set-cookie').split(';')[0],i=cookie.indexOf('=');
 const state=await fetch(urls.app+'/api/state',{headers:{Cookie:cookie}}).then(r=>r.json());patch(state);
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await ctx.addCookies([{name:cookie.slice(0,i),value:cookie.slice(i+1),url:urls.app,httpOnly:true,sameSite:'Strict'}]);
 await ctx.addInitScript(({address,chain})=>{localStorage.setItem('revenue.lang','zh');window.ethereum={isRabby:true,on(){},removeListener(){},request:async({method})=>{if(method==='eth_accounts')return[address];if(method==='eth_chainId')return chain;throw Error('State presentation tests cannot sign or transact');}};},{address:w.address,chain:'0x'+chainId.toString(16)});
 let reads=0;await ctx.route('**/api/state',route=>{reads++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(state)});});
 await ctx.route('**/api/actions',()=>{throw Error('State presentation tests forbid business mutations');});
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(name+': '+e.message));p.setDefaultTimeout(10000);await p.goto(urls.app+'/app/');await p.locator('[data-guide-start]').click();
 const task=await p.evaluate(({action})=>window.RevenueGuide.model().find(t=>t.action===action&&t.status!=='complete'),{action});assert(task,name+' missing '+action);assert.equal(task.status,status,name+' status');
 await p.locator('[data-guide-mode]').selectOption(handoff?'demo':'participant');await p.locator('.guide-checklist').evaluate(e=>e.open=true);await p.locator('[data-guide-task-id]').filter({hasText:task.title}).first().click();
 if(locate){await p.locator('[data-guide-locate]').click();try{await p.locator('.driver-popover').waitFor();}catch(e){console.log(name,await p.locator('#guide-panel').innerText());await p.screenshot({path:dir+'/ui-cases/'+name+'-failed.png'});throw e;}assert(await p.locator(`form[data-action="${action}"]`).count());await p.screenshot({path:dir+'/ui-cases/'+name+'.png'});await p.keyboard.press('Escape');}
 else{await p.screenshot({path:dir+'/ui-cases/'+name+'.png'});}
 if(handoff){await p.locator('[data-guide-handoff]').click();await p.locator('.wallet-login[open]').waitFor();assert.equal(await p.locator('[data-wl-role="'+task.role+'"]').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('.driver-popover').count(),0);}
 if(poll){const initial=reads;await p.waitForTimeout(16000);assert(reads>initial,'Waiting-role guide must refresh visible state');await p.locator('[data-guide-pause]').click();const paused=reads;await p.waitForTimeout(16000);assert.equal(reads,paused,'Paused guide must not poll');}
 results.push({name,role,action,status,located:locate,handoff});await ctx.close();
}
function draft(s){s.chain.phase='0';s.financialTime=100;s.operations=[];s.approvedReports=[];s.activeReports={};s.valuationChecks={};s.applications=s.applications.slice(0,1);s.applications[0].chainAdmission={minted:false,approvedToVault:false,admitted:false,released:false};}
try{
 await scene('supplement','owner',s=>{draft(s);s.applications[0].status='supplement';s.applications[0].notes='请补充设备所有权资料。';},'supplement','ready',{locate:true});
 await scene('waiting-review-poll','owner',s=>{draft(s);s.applications[0].status='submitted';},'review','waiting-role',{poll:true});
 await scene('rejection','owner',s=>{draft(s);s.applications[0].status='rejected';s.applications[0].notes='设备所有权证据尚不充分。';},'view','failed');
 await scene('expired-quote','agent',s=>{draft(s);s.applications[0].status='offered';s.applications[0].offer.validUntil=50;},'offer','ready',{locate:true});
 await scene('reassessment-trustee','trustee',s=>{const a=s.applications[0];s.operations=[];s.chain.phase='2';s.valuationChecks[a.id]={blocked:true,reassessmentCurrent:true};a.reassessment={report:a.offer,trusteeApproved:false,ownerAccepted:false};},'approve-reassessment','ready',{locate:true});
 await scene('reassessment-owner','owner',s=>{const a=s.applications[0];s.operations=[];s.chain.phase='2';s.valuationChecks[a.id]={blocked:true,reassessmentCurrent:true};a.reassessment={report:a.offer,trusteeApproved:true,ownerAccepted:false};},'accept-reassessment','ready',{locate:true});
 await scene('pending-eligibility','investor',s=>{s.operations=[];s.chain.phase='1';s.accounts.investor.eligible=false;s.accounts.investor.subscription.amount='0';s.eligibilityApplications=[{id:'qa-eligibility',investor:'investor',status:'pending',riskAccepted:true,demoAcknowledged:true}];},'eligible','waiting-role',{handoff:true});
 await scene('insufficient-funds','investor',s=>{s.operations=[];s.chain.phase='1';s.accounts.investor.eligible=true;s.accounts.investor.subscription.amount='0';s.accounts.investor.usdc='0';s.accounts.investor.nativeBalanceWei='0';},'faucet','ready');
 await scene('locked-transfer','investor',s=>{s.operations=[];s.chain.phase='2';s.chain.unlockedAt=s.financialTime+86400;s.accounts.investor.shares='1000000';},'propose-trade','waiting-time');
 await scene('unfilled-redemption','investor',s=>{s.operations=[];s.chain.phase='2';s.chain.redemptionCutoff=s.financialTime+86400;s.accounts.investor.redemption={shares:'1000000',requestedAt:s.financialTime-90*86400};},'cancel-redemption','ready',{locate:true});
 await scene('missed-dealing-window','agent',s=>{s.operations=[];s.chain.phase='2';s.chain.redemptionDate=s.financialTime-8*86400;s.accounts.investor.redemption={shares:'1000000',requestedAt:s.financialTime-90*86400};},'carry-window','ready',{locate:true});
 assert.deepEqual(errors,[]);writeFileSync(dir+'/state-browser-check.json',JSON.stringify({passed:true,fixturePresentationOnly:true,chainId,results,errors},null,2));console.log('PASS '+results.length+' read-only state presentation cases');
}finally{await browser.close();provider.destroy();}
