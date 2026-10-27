// Live read-only navigation with the real local Rabby profile. Never approves or refunds an order.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {guard,dir} from '../../scripts/revenue-guidance-local.mjs';
import {launchRole,initializeRole} from './recording/rabby.mjs';
import {BrowserDriver} from './recording/rabby-driver.mjs';
guard();assert.equal(process.env.REVENUE_GUIDANCE_LOCAL_QA,'true');
const driver=new BrowserDriver('guidance-local'),vault=JSON.parse(readFileSync(dir+'/experience-product.json')).vault;
try{
 await driver.guardLocalNode();const s=await launchRole('guidance-local','agent');driver.sessions.agent=s;await initializeRole(s);s.page=await s.context.newPage();
 const forbidden=[];await s.context.route('**/api/**',route=>{const r=route.request();if(r.method()!=='GET'&&!new URL(r.url()).pathname.startsWith('/api/auth/')){forbidden.push(r.url());return route.abort();}return route.fallback();});
 await driver.login('agent');const p=s.page;
 await p.locator('#product-select').selectOption(vault);await p.waitForFunction(vault=>state?.manifest?.addresses.vault===vault,vault);
 if(!await p.locator('#guide-panel').count())await p.locator('#guide-launch').click();
 if(await p.locator('#guide-panel').innerText().then(t=>t.includes('引导已暂停')))await p.locator('[data-guide-pause]').click();
 const pending=await p.evaluate(()=>window.RevenueGuide.model().find(t=>t.action==='review-subscription'&&t.status!=='complete'));
 if(pending){
  await p.locator('.guide-checklist').evaluate(e=>e.open=true);await p.locator(`[data-guide-task-id="${pending.id}"]`).click();await p.locator('[data-guide-locate]').click();
  if(pending.status==='ready'){await p.locator('.driver-popover').waitFor();assert.equal(await p.locator(`form[data-action="review-subscription"][data-guide-entity="${pending.entity}"]`).count(),1);}
  else await p.locator('.guide-notice[open]').waitFor();
  await p.screenshot({path:dir+'/locate-check/real-rabby-order.png'});await p.keyboard.press('Escape');
 }
 const settle=await p.evaluate(()=>window.RevenueGuide.model().find(t=>t.action==='settle'));assert(settle);
 await p.locator('.guide-checklist').evaluate(e=>e.open=true);await p.locator(`[data-guide-task-id="${settle.id}"]`).click();await p.locator('[data-guide-locate]').click();
 if(settle.status==='blocked'){await p.waitForFunction(()=>document.querySelector('.guide-notice[open]')?.innerText.includes('当前尚未满足操作条件'));await p.screenshot({path:dir+'/locate-check/real-rabby-settlement.png'});}
 else await p.locator('.driver-popover').waitFor();
 await p.keyboard.press('Escape');assert.deepEqual(forbidden,[]);
 writeFileSync(dir+'/locate-check/real-rabby.json',JSON.stringify({passed:true,at:new Date().toISOString(),realRabbyLogin:true,recordedFixtures:false,mutations:0,vault,orderTask:pending?{actor:pending.actor,status:pending.status}:null,settlementStatus:settle.status},null,2));
 console.log('PASS real Rabby sign-in and live local locator navigation; no review, settlement, refund or chain transaction submitted');
}finally{await driver.close();}
