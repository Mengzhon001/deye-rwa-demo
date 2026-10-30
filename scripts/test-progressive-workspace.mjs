import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {HDNodeWallet,JsonRpcProvider,Contract} from 'ethers';
import {chromium} from 'playwright';

// Browser-only delays/failures exercise rendering. Real backend sessions are
// signed with dedicated test wallets. Business mutations and transactions fail.
const dir=process.env.REVENUE_UNIFIED_DATA_DIR,rolesFile=process.env.BASE_EXISTING_ROLES_FILE;
if(!dir||!rolesFile)throw Error('Explicit test environment and dedicated wallets required');
const origin=JSON.parse(readFileSync(join(dir,'public.json'))).app,keys=JSON.parse(readFileSync(rolesFile)).wallets;
const out=join(dir,'validation/progressive-workspace');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),results=[],errors=[];
async function fixture(id='base-sepolia',role='investor'){
 const path='/networks/'+id,wallet=HDNodeWallet.fromPhrase(keys[role].phrase);
 const post=async(url,body)=>{const r=await fetch(origin+path+url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});assert.ok(r.ok,'Test sign-in must succeed');return r;};
 const challenge=await(await post('/api/auth/challenge',{address:wallet.address,requestedRole:role})).json();
 const verified=await post('/api/auth/verify',{nonce:challenge.nonce,signature:await wallet.signMessage(challenge.message)});
 const cookie=verified.headers.get('set-cookie').split(';')[0];
 const stateResponse=await fetch(origin+path+'/api/state',{headers:{Cookie:cookie},signal:AbortSignal.timeout(45000)});assert.ok(stateResponse.ok);
 const state=await stateResponse.json(),network=await(await fetch(origin+path+'/api/network')).json();
 assert.equal(state.manifest.chainId,id==='base-sepolia'?84532:20261008);
 let account=Object.values(state.accounts).find(a=>a.address.toLowerCase()===wallet.address.toLowerCase());
 if(!account){
  const provider=new JsonRpcProvider(network.rpcUrl,network.chainId,{staticNetwork:true});
  try{const token=new Contract(state.manifest.addresses.usdc,['function balanceOf(address) view returns(uint256)'],provider);
   const [usdc,native]=await Promise.all([token.balanceOf(wallet.address),provider.getBalance(wallet.address)]);account={usdc:String(usdc),nativeBalanceWei:String(native)};
  }finally{provider.destroy();}
 }
 const common={chainId:network.chainId,vault:state.manifest.addresses.vault,readAt:Date.now()};
 return {id,path,role,wallet,cookie,state,network,sections:{
  metadata:{...common,product:{title:state.selectedProduct.title},stations:state.stations.map(s=>({id:s.id,name:s.name})),mode:state.mode},
  balances:{...common,address:wallet.address,usdc:account.usdc,nativeBalanceWei:account.nativeBalanceWei,token:state.manifest.addresses.usdc},
  products:{chainId:network.chainId,readAt:Date.now(),products:state.products.filter(p=>[1,2].includes(p.phase))},
  records:{...common,records:state.operations.slice(-15).reverse().map(o=>({id:o.id,actor:o.actor,action:o.action,status:o.status,hashes:[...new Set(Object.values(o.steps).map(s=>s.hash).filter(Boolean))]}))}
 }};
}
async function setup(f,{lang='zh',mobile=false,full='hold',sections={},fastTimeout=false}={}){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},reducedMotion:'reduce'}),i=f.cookie.indexOf('=');
 await context.addCookies([{name:f.cookie.slice(0,i),value:f.cookie.slice(i+1),url:origin+f.path+'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
 await context.addInitScript(({address,chainId,lang,fastTimeout})=>{
  localStorage.setItem('revenue.lang',lang);localStorage.setItem('revenue.wallet','rabby');
  const handlers={};window.__progressiveEmit=(name,value)=>(handlers[name]||[]).forEach(fn=>fn(value));
  window.ethereum={isRabby:true,on:(name,fn)=>(handlers[name]||=[]).push(fn),removeListener:(name,fn)=>handlers[name]=(handlers[name]||[]).filter(h=>h!==fn),request:async({method})=>{
   if(method==='eth_chainId')return'0x'+chainId.toString(16);if(['eth_accounts','eth_requestAccounts'].includes(method))return[address];
   throw Error('This read-only test must not sign or send: '+method);
  }};
  if(fastTimeout){const timeout=AbortSignal.timeout.bind(AbortSignal);AbortSignal.timeout=ms=>timeout(ms===45000?250:ms);}
 },{address:f.wallet.address,chainId:f.network.chainId,lang,fastTimeout});
 const controls=Object.fromEntries(['state','metadata','balances','products','records'].map(name=>[name,{mode:name==='state'?full:sections[name]||'hold',held:[],reads:0}]));
 await context.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname.slice(f.path.length);
  if(route.request().method()!=='GET'){
   if(path==='/api/auth/logout')return route.continue();
   errors.push('Unexpected mutation: '+path);return route.abort();
  }
  if(path==='/api/network')return route.fulfill({json:{...f.network,progressiveWorkspace:true}});
  const key=path==='/api/state'?'state':path==='/api/products'?'products':path.startsWith('/api/workspace/')?path.split('/').at(-1):null;
  const control=controls[key];if(!control)return route.continue();
  control.reads++;if(control.mode==='hold')await new Promise(resolve=>control.held.push(resolve));
  try{
   if(control.mode==='failure')return await route.fulfill({status:503,json:{error:'Controlled read failure'}});
   let data=key==='state'?f.state:f.sections[key];
   if(control.mode==='wrong-chain')data={...data,chainId:1};
   if(control.mode==='wrong-wallet')data={...data,address:'0x0000000000000000000000000000000000000001'};
   await route.fulfill({json:data});
  }catch{/* An old request may already have been cancelled. */}
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+f.path+'/app/?lang='+lang+'&wallet=rabby');await page.locator('[data-workspace-shell]').waitFor();
 const release=(key,mode='success')=>{const c=controls[key];c.mode=mode;c.held.splice(0).forEach(resolve=>resolve());};
 const close=async()=>{for(const key of Object.keys(controls))release(key);await context.close();};
 return {page,context,controls,release,close};
}
async function businessReady(page){await page.waitForFunction(()=>typeof state!=='undefined');await page.locator('[data-workspace-shell]').waitFor({state:'detached'});}
try{
 const base=await fixture();
 const first=await setup(base);
 assert.ok(await first.page.locator('#nav [data-page]').count()>0,'Navigation must appear before any chain data');
 assert.equal(await first.page.locator('form[data-action]').count(),0);
 assert.equal(await first.page.locator('[data-workspace-usdc]').count(),0,'Unknown balance must not render zero');
 await first.page.locator('#nav [data-page="transaction_log"]').click();
 assert.match(await first.page.locator('#wallet-workspace-title').innerText(),/交易日志/);
 first.release('balances');await first.page.locator('[data-workspace-usdc]').waitFor();
 assert.equal(await first.page.locator('[data-workspace-section="metadata"]').getAttribute('aria-busy'),'true');
 assert.equal(await first.page.locator('[data-workspace-section="records"]').getAttribute('aria-busy'),'true');
 first.release('records');await first.page.locator('[data-workspace-section="records"][aria-busy="false"]').waitFor();
 first.release('metadata');first.release('products');
 await first.page.locator('#nav [data-page="product_hall"]').click();await first.page.locator('[data-workspace-product]').first().waitFor();
 await first.page.screenshot({path:join(out,'progressive-loading.zh.png')});
 await first.page.locator('[data-workspace-product]').first().click();
 await first.page.waitForFunction(()=>page==='pool_detail');
 await first.page.waitForFunction(()=>walletWorkspaceLoad?.product===selectedProduct&&!!selectedProduct);
 const until=Date.now()+5000;while(first.controls.state.reads<2&&Date.now()<until)await first.page.waitForTimeout(25);
 assert.equal(first.controls.state.reads,2,'Selecting a product cancels the former full read and loads that product');
 first.controls.state.held.shift()?.();
 await first.page.waitForTimeout(100);assert.equal(await first.page.evaluate(()=>state),undefined,'Old product response cannot replace the selected workspace');
 await first.page.evaluate(()=>runBusinessAction('subscribe',{amountUSDC6:'1000000'}));
 assert.equal(await first.page.locator('form[data-action]').count(),0);
 await first.page.locator('#language').click();assert.equal(await first.page.locator('html').getAttribute('lang'),'en');
 await first.page.locator('#nav [data-page="position"]').click();
 first.release('state');await businessReady(first.page);
 assert.equal(await first.page.locator('#nav [data-page="position"]').getAttribute('class'),'nav-item active');
 assert.equal(first.controls.state.reads,2,'Sidebar navigation cannot launch another full state query');
 results.push('Immediate shell/navigation; independent balances, metadata, products and records; English switching and selected page retained after sync');await first.close();

 const failed=await setup(base,{full:'failure',sections:{metadata:'success',balances:'failure',products:'success',records:'success'}});
 await failed.page.locator('#wallet-load-retry').waitFor();await failed.page.locator('[data-workspace-section-retry="balances"]').waitFor();
 assert.ok(await failed.page.locator('[data-workspace-product]').count()>0);
 failed.controls.balances.mode='success';await failed.page.locator('[data-workspace-section-retry="balances"]').click();await failed.page.locator('[data-workspace-usdc]').waitFor();
 const reads=Object.fromEntries(Object.entries(failed.controls).map(([k,v])=>[k,v.reads]));
 failed.controls.state.mode='hold';await failed.page.locator('#wallet-load-retry').click();
 await failed.page.locator('.workspace-sync-status[aria-busy="true"]').waitFor();
 assert.ok(await failed.page.locator('[data-workspace-usdc]').count()>0,'Retry must retain already loaded cards');
 failed.release('state');await businessReady(failed.page);
 for(const name of ['metadata','balances','products','records'])assert.equal(failed.controls[name].reads,reads[name],'Retry should reuse '+name);
 results.push('Section-only failure/retry and full-state retry retain successful cards without reconnecting or signing');await failed.close();

 const invalid=await setup(base,{sections:{balances:'wrong-wallet',metadata:'wrong-chain',products:'success',records:'success'}});
 await invalid.page.locator('[data-workspace-section-retry="balances"]').waitFor();await invalid.page.locator('[data-workspace-section-retry="metadata"]').waitFor();
 assert.equal(await invalid.page.locator('[data-workspace-usdc]').count(),0);
 await invalid.page.evaluate(()=>window.__progressiveEmit('accountsChanged',[]));
 for(const name of ['state','metadata','balances','products','records'])invalid.release(name);
 await invalid.page.locator('#wallet-connect-main').waitFor();assert.equal(await invalid.page.locator('#nav [data-page]').count(),0);
 assert.equal(await invalid.page.evaluate(()=>state),undefined);
 results.push('Wrong-chain/wrong-wallet partial data rejected; wallet changes cancel all reads and prevent stale protected rendering');await invalid.close();

 const mobile=await setup(base,{lang:'en',mobile:true,fastTimeout:true,sections:{metadata:'success',balances:'success',products:'success',records:'success'}});
 await mobile.page.locator('#wallet-load-retry').waitFor();assert.match(await mobile.page.locator('.workspace-sync-status').innerText(),/timed out/);
 assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No mobile horizontal page overflow');
 await mobile.page.locator('#nav [data-page="transaction_log"]').focus();
 mobile.controls.records.mode='hold';await mobile.page.evaluate(()=>{void requestWorkspaceSection(walletWorkspaceLoad,'records',true);});
 // The evaluation returns immediately when it does not await the held request.
 mobile.release('records');
 await mobile.page.waitForFunction(()=>document.activeElement?.getAttribute('data-page')==='transaction_log');
 const animation=await mobile.page.locator('.workspace-sync-icon').evaluate(e=>getComputedStyle(e).animationName);assert.equal(animation,'none');
 await mobile.page.screenshot({path:join(out,'mobile-recovery.en.png')});
 mobile.release('state');await mobile.page.locator('#wallet-load-retry').click();await businessReady(mobile.page);
 results.push('English mobile timeout/recovery, reduced motion, focus retention and no overflow');await mobile.close();

 for(const role of ['owner','agent','trustee']){
  const f=await fixture('base-sepolia',role),s=await setup(f,{sections:{metadata:'success',balances:'success',products:'success',records:'success'}});
  assert.equal(await s.page.locator('#roles .active').getAttribute('data-wallet-role'),role);
  assert.ok(await s.page.locator('#nav [data-page]').count()>2);s.release('state');await businessReady(s.page);await s.close();
 }
 results.push('All four signed-in roles can browse their own navigation before financial state completes');
 const local=await setup(await fixture('private'),{sections:{metadata:'success',balances:'success',products:'success',records:'success'}});
 await local.page.locator('[data-workspace-usdc]').waitFor();local.release('state');await businessReady(local.page);await local.close();
 results.push('Private demo chain supports the same progressive flow');
 assert.deepEqual(errors,[]);writeFileSync(join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),origin,headless:true,realSignedSessions:true,controlledReadResponses:true,noBusinessTransactions:true,results,errors},null,2));
 console.log('PASS '+results.length+' progressive workspace scenarios; no business transactions');
}finally{await browser.close();}
