import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../ui/public/revenue/wallet-login.js',import.meta.url),'utf8');
test('Rabby discovery, explicit wallet routing, unavailable wallets and event isolation',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const p=await browser.newPage();
  await p.route('http://wallet.test/**',route=>{
   const path=new URL(route.request().url()).pathname;
   const result=path==='/api/auth/challenge'?{nonce:'test',message:'Test login'}:path==='/api/auth/verify'?{role:'investor',actor:'investor',authenticated:true}:{};
   return route.fulfill({contentType:path==='/screen'?'text/html':'application/json',body:path==='/screen'?'<html><body></body></html>':JSON.stringify(result)});
  });
  await p.goto('http://wallet.test/screen');
  await p.evaluate(()=>{
   window.calls=[];window.logoutCount=0;window.rabbyChainReady=false;
   const originalFetch=window.fetch;
   window.fetch=(url,options)=>{if(url==='/api/auth/logout')window.logoutCount++;return originalFetch(url,options);};
   const make=(name,address)=>({request:async({method})=>{window.calls.push([name,method]);if(name==='rabby'&&method==='wallet_switchEthereumChain'&&!window.rabbyChainReady)throw {code:-32603,message:'Unrecognized chain ID \"0x1352910\". Try adding the chain first.'};if(name==='rabby'&&method==='wallet_addEthereumChain'){window.rabbyChainReady=true;window.rabby.emit('chainChanged','0x1352910');return null;}return method==='eth_chainId'?(name==='rabby'&&!window.rabbyChainReady?'0x1':'0x1352910'):method==='personal_sign'?'test-signature':[address];},listeners:{},on(event,callback){(this.listeners[event]||=[]).push(callback);},removeListener(event,callback){this.listeners[event]=(this.listeners[event]||[]).filter(c=>c!==callback);},emit(event,value){for(const c of this.listeners[event]||[])c(value);}});
   window.meta=make('metamask','0x1111111111111111111111111111111111111111');window.meta.isMetaMask=true;
   window.rabby=make('rabby','0x2222222222222222222222222222222222222222');window.rabby.isRabby=true;
   window.ethereum=window.meta;
   window.addEventListener('eip6963:requestProvider',()=>{
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{rdns:'io.metamask',name:'MetaMask'},provider:window.meta}}));
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{rdns:'io.rabby',name:'Rabby'},provider:window.rabby}}));
   });
  });
  await p.addScriptTag({content:script});
  const open=()=>p.evaluate(()=>window.RoleLogin.open({role:'investor',network:{chainIdHex:'0x1352910',chainName:'Test',roleAddresses:{investor:[]}},onSuccess:s=>window.signedIn=s}));
  await open();
  assert.equal(await p.locator('[data-wl-wallet]').inputValue(),'rabby');
  await p.locator('[data-wl-connect]').click();
  await p.waitForFunction(()=>window.signedIn);
  assert((await p.evaluate(()=>window.calls)).every(([name])=>name==='rabby'));
  assert((await p.evaluate(()=>window.calls)).some(([,method])=>method==='wallet_addEthereumChain'),'Rabby unknown-network response must trigger standard network addition');
  await open();await p.locator('[data-wl-wallet]').selectOption('metamask');
  const before=await p.evaluate(()=>window.logoutCount);
  await p.evaluate(()=>window.rabby.emit('accountsChanged'));
  assert.equal(await p.evaluate(()=>window.logoutCount),before,'Unselected wallet events must not invalidate selected wallet');
  await p.evaluate(()=>{window.calls=[];window.signedIn=null;});
  await p.locator('[data-wl-connect]').click();await p.waitForFunction(()=>window.signedIn);
  assert((await p.evaluate(()=>window.calls)).every(([name])=>name==='metamask'));
  await p.evaluate(()=>window.meta.emit('chainChanged'));
  assert.equal(await p.evaluate(()=>window.logoutCount),before+1);
  await open();
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{rdns:'test.extra',name:'Extra wallet'},provider:{request:async()=>[]}}})));
  assert.equal(await p.locator('[data-wl-wallet] option[value="test.extra"]').count(),1);
  const second=await browser.newPage();await second.route('http://wallet.test/**',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));await second.goto('http://wallet.test/screen');await second.addScriptTag({content:script});
  await second.evaluate(()=>window.RoleLogin.open({role:'investor',network:{chainIdHex:'0x1352910',roleAddresses:{investor:[]}}}));
  await second.locator('[data-wl-wallet]').selectOption('rabby');await second.locator('[data-wl-connect]').click();
  await second.waitForFunction(()=>document.querySelector('.wl-error').textContent.includes('未检测到所选钱包'));
 }finally{await browser.close();}
});
