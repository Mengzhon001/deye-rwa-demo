import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {initializeRole} from '../ui/scripts/recording/rabby.mjs';
import {BrowserDriver} from '../ui/scripts/recording/rabby-driver.mjs';

const dir=process.env.REVENUE_UNIFIED_DATA_DIR,baseDir=process.env.BASE_SEPOLIA_DATA_DIR,rolesFile=process.env.BASE_EXISTING_ROLES_FILE,extension=process.env.BASE_RABBY_EXTENSION;
if(!dir||!baseDir||!rolesFile||!extension||!existsSync(join(extension,'manifest.json')))throw Error('Explicit isolated wallet profile and official extension required');
const pub=JSON.parse(readFileSync(join(dir,'public.json'))),keys=JSON.parse(readFileSync(rolesFile)),password=JSON.parse(readFileSync(join(baseDir,'browser.private.json'))).password;
const out=join(dir,'validation/guidance-resources');mkdirSync(out,{recursive:true});
const context=await chromium.launchPersistentContext(join(dir,'profiles/investor'),{headless:true,channel:'chromium',reducedMotion:'reduce',viewport:{width:1600,height:1000},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});context.setDefaultTimeout(30000);
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),extensionId=new URL(worker.url()).host,wallet=await context.newPage();await wallet.goto(`chrome-extension://${extensionId}/index.html`);
 const config={dir:out,chainId:84532,password,wallets:keys.wallets,urls:{app:pub.app,rpc:'https://sepolia.base.org',explorer:'https://base-sepolia.blockscout.com'}};
 const s={role:'investor',context,wallet,extensionId,config};await initializeRole(s);
 const page=await context.newPage();s.page=page;const errors=[];let stateReads=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/api/state'))stateReads++;});
 await context.route('**/api/**',r=>{if(r.request().method()!=='GET'&&!r.request().url().includes('/api/auth/'))throw Error('Read-only guide test attempted a business mutation');return r.continue();});
 await page.goto(pub.app+'/networks/base-sepolia/app/?lang=zh&wallet=rabby');
 const driver=Object.create(BrowserDriver.prototype);driver.sessions={investor:s};
 await Promise.race([page.locator('[data-wl-role]').first().waitFor({timeout:90000}),page.locator('#nav [data-page]').first().waitFor({timeout:90000})]);
 if(!await page.locator('#nav [data-page]').count()){
  await page.locator('[data-wl-role="investor"]').click();await page.locator('[data-wl-connect]').click();
  await driver.pump('investor',async()=>await page.locator('#nav [data-page]').count()>0,120000);
 }
 await page.waitForFunction(()=>typeof state!=='undefined',{},{timeout:90000});
 const session=await(await context.request.get(pub.app+'/networks/base-sepolia/api/session/current')).json();assert.equal(session.address.toLowerCase(),keys.wallets.investor.address.toLowerCase());
 if(await page.locator('[data-guide-start]').count())await page.locator('[data-guide-start]').click();
 if(!await page.locator('#guide-panel').count())await page.locator('#guide-launch').click();
 if(/Resume|恢复/.test(await page.locator('[data-guide-pause]').innerText()))await page.locator('[data-guide-pause]').click();
 const task=await page.evaluate(()=>RevenueGuide.model().find(t=>t.action==='subscribe'&&t.status==='ready')||RevenueGuide.model().find(t=>t.role==='investor'&&t.status==='ready'&&!t.readOnly&&!t.informational));assert.ok(task);
 await page.locator('.guide-checklist').evaluate(e=>e.open=true);await page.locator(`[data-guide-task-id="${task.id}"]`).click();
 const initialReads=stateReads,readAt=await page.locator('[data-guide-read-at]').getAttribute('data-guide-read-at'),start=performance.now();
 await page.locator('[data-guide-locate]').click();await page.locator('.driver-popover').waitFor();
 const elapsed=Math.round(performance.now()-start);assert.equal(stateReads,initialReads);assert.equal(await page.locator('[data-guide-read-at]').getAttribute('data-guide-read-at'),readAt);
 await page.screenshot({path:join(out,'rabby-immediate-locate.png')});
 const tips=[];
 for(let n=0;n<8;n++){
  tips.push(await page.locator('.driver-popover-title').innerText());
  const next=page.locator('.driver-popover-next-btn');if(/Return to task|返回任务/.test(await next.innerText()))break;
  await next.click();
 }
 assert.equal(await page.locator(`form[data-action="${task.action}"] .driver-active-element`).count(),1);
 await page.keyboard.press('Escape');await page.locator('.driver-popover').waitFor({state:'hidden'});await page.locator('[data-guide-locate]').waitFor({state:'visible'});
 assert.equal(stateReads,initialReads);assert.deepEqual(errors,[]);
 writeFileSync(join(out,'rabby-immediate-locate.json'),JSON.stringify({at:new Date().toISOString(),origin:pub.app,headless:true,extension:'Rabby 0.94.11',chainId:84532,action:task.action,locateMs:elapsed,noStateReadsOnLocate:true,noBusinessTransactions:true,tips,errors},null,2));
 console.log('PASS real Rabby guide location',elapsed+' ms',tips.length+' tips, no business transactions');
}finally{await context.close();}
