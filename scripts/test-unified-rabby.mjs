import {chromium}from'playwright';import{readFileSync,mkdirSync,writeFileSync}from'node:fs';import{join}from'node:path';import assert from'node:assert/strict';
import{initializeRole}from'../ui/scripts/recording/rabby.mjs';import{BrowserDriver}from'../ui/scripts/recording/rabby-driver.mjs';
const dir=process.env.REVENUE_UNIFIED_DATA_DIR,baseDir=process.env.BASE_SEPOLIA_DATA_DIR;if(!dir||!baseDir)throw Error('Explicit test data directories required');
const pub=JSON.parse(readFileSync(join(dir,'public.json'))),keys=JSON.parse(readFileSync(process.env.BASE_EXISTING_ROLES_FILE)),password=JSON.parse(readFileSync(join(baseDir,'browser.private.json'))).password,extension=process.env.BASE_RABBY_EXTENSION;
const profile=join(dir,'profiles/investor');mkdirSync(profile,{recursive:true,mode:0o700});
const context=await chromium.launchPersistentContext(profile,{headless:true,channel:'chromium',viewport:{width:1600,height:1000},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});context.setDefaultTimeout(30000);
const results=[];
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),extensionId=new URL(worker.url()).host,wallet=await context.newPage();await wallet.goto(`chrome-extension://${extensionId}/index.html`);
 const config={dir,chainId:84532,password,wallets:keys.wallets,urls:{app:pub.app,rpc:'https://sepolia.base.org',explorer:'https://base-sepolia.blockscout.com'}};
 const s={role:'investor',context,wallet,extensionId,config};await initializeRole(s,{allowImport:true});const page=await context.newPage();s.page=page;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const driver=Object.create(BrowserDriver.prototype);driver.sessions={investor:s};
 async function login(id){
  await page.locator('[data-wl-role="investor"]').waitFor({timeout:90000});await page.locator('[data-wl-role="investor"]').click();await page.locator('[data-wl-connect]').click();
  await driver.pump('investor',async()=>await page.locator('#nav [data-page]').count()>0,150000);
  await page.keyboard.press('Escape');const collapse=page.locator('[data-guide-collapse]');if(await collapse.count())await collapse.click();
  const session=await(await context.request.get(pub.app+`/networks/${id}/api/session/current`)).json();assert.equal(session.address.toLowerCase(),keys.wallets.investor.address.toLowerCase());
  const state=await page.evaluate(()=>({chainId:state.manifest.chainId,vault:state.manifest.addresses.vault,balance:state.accounts[actor].usdc}));assert.equal(state.chainId,id==='private'?20261008:84532);results.push({id,...state});
  await page.locator('#nav [data-page="position"]').click();await page.screenshot({path:join(dir,`validation/${id}.en.png`)});
  console.log('PASS real Rabby chain-specific sign-in and balance',id,state.balance);return state;
 }
 await page.goto(pub.app+'/networks/base-sepolia/app/?lang=en&wallet=rabby');const first=await login('base-sepolia');
 async function switchTo(target){
  const n=await(await context.request.get(pub.app+`/networks/${target}/api/network`)).json();config.chainId=n.chainId;config.urls.rpc=n.rpcUrl;config.urls.explorer=n.explorerUrl;
  await page.locator('#network-select').click();await page.locator(`[data-network="${target}"]`).click();
  await driver.pump('investor',async()=>page.url().includes(`/networks/${target}/app/`),120000);
  assert.ok(page.url().startsWith(pub.app));return login(target);
 }
 const privateState=await switchTo('private');assert.notEqual(first.vault,privateState.vault);
 const again=await switchTo('base-sepolia');assert.equal(first.vault,again.vault);assert.equal(first.balance,again.balance);
 // A real Circle-USDC payment and refund check the selected API namespace and wallet chain.
 await page.locator('#nav [data-page="subscribe"]').click();await page.locator('form[data-action="subscribe"] [name="amountUSDC6"]').fill('1');
 async function action(name,expected){let response;const listener=r=>{if(r.url().endsWith('/api/actions')&&r.request().postDataJSON()?.action===name)response=r;};page.on('response',listener);try{await page.locator(`form[data-action="${name}"] button[type="submit"]`).first().click();await driver.pump('investor',async()=>!!response||await page.locator('#feedback.error').count()>0,180000);assert.ok(response?.ok(),await page.locator('#feedback').innerText());assert.ok(response.url().includes('/networks/base-sepolia/api/'));await page.waitForFunction(expected=>state.accounts[actor].subscription.amount===expected,expected,{timeout:90000});}finally{page.off('response',listener);}}
 await action('subscribe','1000000');await page.reload();await page.locator('form[data-action="refund"] button[type="submit"]').waitFor({timeout:90000});await action('refund','0');
 const final=await page.evaluate(()=>state.accounts[actor].usdc);assert.equal(final,first.balance);console.log('PASS real Circle subscription, refresh and full refund through the unified origin');
 assert.deepEqual(errors,[]);writeFileSync(join(dir,'validation/rabby-results.json'),JSON.stringify({at:new Date().toISOString(),origin:pub.app,headless:true,extension:'Rabby 0.94.11',switches:results,subscriptionRefund:true,errors},null,2));
}catch(e){for(const p of context.pages())if(!p.isClosed()&&!p.url().includes('chrome-extension')){await p.screenshot({path:join(dir,'validation/rabby-failure.png')});console.log((await p.locator('body').innerText()).slice(-2400));}throw e;}finally{await context.close();}
