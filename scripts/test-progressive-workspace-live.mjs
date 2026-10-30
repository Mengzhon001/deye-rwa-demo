import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {HDNodeWallet} from 'ethers';
import {chromium} from 'playwright';

// Real, authenticated read-only queries. No API response interception.
const dir=process.env.REVENUE_UNIFIED_DATA_DIR,rolesFile=process.env.BASE_EXISTING_ROLES_FILE;
if(!dir||!rolesFile)throw Error('Explicit test directories and dedicated wallets required');
const origin=JSON.parse(readFileSync(join(dir,'public.json'))).app,keys=JSON.parse(readFileSync(rolesFile)).wallets;
const out=join(dir,'validation/progressive-workspace');mkdirSync(out,{recursive:true});
const results=[],browser=await chromium.launch({headless:true});
try{
 for(const [id,chainId] of [['base-sepolia',84532],['private',20261008]]){
  const path='/networks/'+id,network=await(await fetch(origin+path+'/api/network')).json();
  assert.equal(network.chainId,chainId);assert.equal(network.progressiveWorkspace,true);
  const investor=HDNodeWallet.fromPhrase(keys.investor.phrase);let investorCookie;
  for(const role of ['investor','owner','agent','trustee']){
   const wallet=HDNodeWallet.fromPhrase(keys[role].phrase);
   const post=async(url,body)=>{const r=await fetch(origin+path+url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});assert.ok(r.ok);return r;};
   const challenge=await(await post('/api/auth/challenge',{address:wallet.address,requestedRole:role})).json();
   const verified=await post('/api/auth/verify',{nonce:challenge.nonce,signature:await wallet.signMessage(challenge.message)});
   const cookie=verified.headers.get('set-cookie').split(';')[0];if(role==='investor')investorCookie=cookie;
   const sections=await Promise.all(['metadata','balances','records'].map(async name=>{
    const start=performance.now(),r=await fetch(origin+path+'/api/workspace/'+name,{headers:{Cookie:cookie},signal:AbortSignal.timeout(20000)});
    assert.ok(r.ok,name+' must load for '+role);const data=await r.json();assert.equal(data.chainId,chainId);
    if(name==='balances'){assert.equal(data.address.toLowerCase(),wallet.address.toLowerCase());assert.match(data.usdc,/^\d+$/);assert.match(data.nativeBalanceWei,/^\d+$/);}
    if(name==='metadata')assert.deepEqual(Object.keys(data).sort(),['chainId','mode','product','readAt','stations','vault']);
    if(name==='records')for(const record of data.records)assert.deepEqual(Object.keys(record).sort(),['action','actor','hashes','id','status']);
    return {name,ms:Math.round(performance.now()-start),vault:data.vault};
   }));
   results.push({id,role,sections});
  }
  for(const name of ['metadata','balances','records']){
   const denied=await fetch(origin+path+'/api/workspace/'+name);assert.equal(denied.status,401,'Workspace reads require wallet sign-in');
   const cors=await fetch(origin+path+'/api/workspace/'+name,{headers:{Cookie:investorCookie,Origin:'https://mengzhon001.github.io'}});
   assert.equal(cors.headers.get('access-control-allow-origin'),null,'Only public overview/deployment have Pages CORS');
  }
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),split=investorCookie.indexOf('=');
  await context.addCookies([{name:investorCookie.slice(0,split),value:investorCookie.slice(split+1),url:origin+path+'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
  await context.addInitScript(({address,chainId})=>{
   localStorage.setItem('revenue.lang','zh');localStorage.setItem('revenue.wallet','rabby');
   window.ethereum={isRabby:true,on(){},removeListener(){},request:async({method})=>{if(method==='eth_chainId')return'0x'+chainId.toString(16);if(method==='eth_accounts')return[address];throw Error('Read-only browser must not reconnect, sign or transact: '+method);}};
  },{address:investor.address,chainId});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/**',route=>{assert.equal(route.request().method(),'GET','Business mutations prohibited');return route.continue();});
  const start=performance.now();await page.goto(origin+path+'/app/');await page.locator('[data-workspace-shell]').waitFor();
  const shellMs=Math.round(performance.now()-start);assert.ok(await page.locator('#nav [data-page]').count()>0);
  await page.locator('#nav [data-page="position"]').click();
  await page.locator('[data-workspace-usdc]').waitFor();const balanceMs=Math.round(performance.now()-start);
  await page.screenshot({path:join(out,'live-'+id+'-partial.png')});
  await page.waitForFunction(()=>typeof state!=='undefined');const completeMs=Math.round(performance.now()-start);
  assert.equal(await page.evaluate(()=>state.manifest.chainId),chainId);assert.equal(await page.evaluate(()=>page),'position');
  assert.ok(shellMs<completeMs,'Real navigation must precede full state');assert.ok(balanceMs<completeMs,'Real wallet balance must precede full state');
  assert.deepEqual(errors,[]);await page.keyboard.press('Escape');await page.screenshot({path:join(out,'live-'+id+'-complete.png')});
  results.push({id,browser:{shellMs,balanceMs,completeMs,errors,noAdditionalSignature:true}});await context.close();
 }
 writeFileSync(join(out,'live-results.json'),JSON.stringify({at:new Date().toISOString(),origin,headless:true,realBackend:true,noBusinessTransactions:true,results},null,2));
 console.log('PASS real progressive APIs, auth/CORS isolation and browser loading on both chains');
 console.log(JSON.stringify(results.filter(r=>r.browser)));
}finally{await browser.close();}
