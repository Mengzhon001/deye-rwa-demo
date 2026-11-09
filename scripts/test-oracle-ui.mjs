/** Headless wallet-signing and Oracle page smoke test. No transaction is submitted. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import {chromium} from 'playwright';

const root=resolve(import.meta.dirname,'..');
const dataRoot=process.env.ORACLE_SEPOLIA_DATA_DIR||resolve(root,'../..','.data/oracle-base-sepolia');
const file=process.env.ORACLE_UI_WALLETS;
if(!file)throw Error('Set ORACLE_UI_WALLETS to an ignored local test-wallet file');
const record=JSON.parse(readFileSync(file,'utf8')).investor;
const wallet=new Wallet(record.privateKey);
assert.equal(wallet.address.toLowerCase(),record.address.toLowerCase());
const entry=process.env.ORACLE_UI_ENTRY||'http://127.0.0.1:4196';
if(!/^http:\/\/127\.0\.0\.1:4196$/.test(entry)&&!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(entry))throw Error('Oracle UI test entry must be the isolated unified gateway');
const target=entry+'/networks/oracle-base-sepolia/app/?lang=en&wallet=rabby';
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:960}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const requests=[];
  page.on('response',response=>{if(response.url().includes('/api/'))requests.push({path:new URL(response.url()).pathname,status:response.status()});});
  page.on('requestfailed',request=>{if(request.url().includes('/api/'))requests.push({path:new URL(request.url()).pathname,error:request.failure()?.errorText});});
  await page.exposeFunction('oracleTestSign',message=>wallet.signMessage(message));
  await page.addInitScript(address=>{
    const listeners=new Map();
    window.ethereum={isRabby:true,request:async({method,params})=>{
      if(method==='eth_chainId')return '0x14a34';
      if(method==='eth_accounts'||method==='eth_requestAccounts')return [address];
      if(method==='personal_sign')return window.oracleTestSign(params[0]);
      throw Error('Unexpected wallet method '+method);
    },on(name,callback){listeners.set(name,callback);},removeListener(name){listeners.delete(name);}};
  },wallet.address);
  await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('[data-wl-role="investor"]').click();
  await page.locator('[data-wl-connect]').click();
  try { await page.locator('[data-page="oracle_reports"]').waitFor({timeout:45000}); }
  catch (error) {
    const out=join(dataRoot,'validation');mkdirSync(out,{recursive:true});
    await page.screenshot({path:join(out,'oracle-login-debug.png'),fullPage:true});
    console.error('Login view:',(await page.locator('body').innerText()).slice(0,1300));
    console.error('State:',await page.evaluate(()=>({state:typeof state,loaded:typeof state!=='undefined'&&!!state,load:typeof walletWorkspaceLoad!=='undefined'&&walletWorkspaceLoad?{pending:walletWorkspaceLoad.pending,error:walletWorkspaceLoad.error}:null,workspace:!!window.RevenueWorkspace,nav:document.querySelector('#nav')?.innerHTML.length,feedback:document.querySelector('#feedback')?.textContent})));
    console.error('Render probe:',await page.evaluate(()=>{try{return window.RevenueWorkspace.render({lang,role,page,network:networkConfig,session:walletSession,load:walletWorkspaceLoad,title:'Oracle reports'}).slice(0,120)}catch(e){return e.stack||e.message}}));
    console.error('API:',requests.slice(-20));
    console.error('Page errors:',errors.slice(0,5));
    throw error;
  }
  await page.locator('[data-page="oracle_reports"]').click();
  await page.getByText('Self-hosted Oracle reports',{exact:true}).waitFor({timeout:90000});
  const later=page.getByRole('button',{name:'Later',exact:true});
  if(await later.isVisible())await later.click();
  assert.ok(await page.locator('a[href*="0x3df71ae9d301c9a5736316fac0857e9f1507549492f5c39e6a79be41cf51e411"]').count());
  assert.match(await page.locator('#main').innerText(),/Validation only/);
  const out=join(dataRoot,'validation');mkdirSync(out,{recursive:true});
  await page.screenshot({path:join(out,'oracle-reports.en.png'),fullPage:true});
  await page.locator('#network-select').click();
  await page.locator('#network-dialog [data-network="base-sepolia"]').click();
  await page.waitForURL(/\/networks\/base-sepolia\/app\//,{timeout:30000});
  assert.equal(await page.evaluate(()=>localStorage.getItem('revenue.preferred-network')),'base-sepolia');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('revenue.pending:environment:base-sepolia')),null);
  await page.locator('[data-wl-role="investor"]').waitFor({timeout:15000});
  assert.deepEqual(errors,[]);
  writeFileSync(join(out,'oracle-ui.json'),JSON.stringify({at:new Date().toISOString(),entry,chainId:84532,environmentId:'oracle-base-sepolia',walletLogin:true,reportVisible:true,sameChainEnvironmentSwitch:true,errors},null,2)+'\n');
  console.log('PASS headless signed wallet login, Oracle report, Blockscout link, same-chain environment switch and no page errors');
}finally{await browser.close();}
