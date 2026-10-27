#!/usr/bin/env node
// One-time local demo maintenance. Refund original escrow, never invent investor acceptance of a new vault.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {Wallet,HDNodeWallet,Contract,JsonRpcProvider,keccak256} from 'ethers';
import {root,dir,urls,chainId,guard,archive} from './revenue-guidance-local.mjs';
guard();const file=join(dir,'topup-upgrade.json'),provider=new JsonRpcProvider(urls.rpc,chainId,{staticNetwork:true,batchMaxCount:1});
const keys=JSON.parse(readFileSync(join(dir,'wallet-import.private.json'))),config=JSON.parse(readFileSync(join(dir,'private.json')));
const manager=new Wallet(keys.agent.privateKey,provider),admin=HDNodeWallet.fromPhrase(config.mnemonic).connect(provider);
let plan,cookie;
const save=()=>writeFileSync(file,JSON.stringify(plan,(_,v)=>typeof v==='bigint'?v.toString():v,2),{mode:0o600});
async function request(path,body,vault){
 const r=await fetch(urls.app+path,{method:body===undefined?'GET':'POST',headers:{Origin:urls.app,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(vault?{'X-Revenue-Product':vault}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
 const value=await r.json();if(!r.ok)throw Error(path+': '+value.error);if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return value;
}
async function login(){const c=await request('/api/auth/challenge',{address:manager.address,requestedRole:'agent'});await request('/api/auth/verify',{nonce:c.nonce,signature:await manager.signMessage(c.message)});}
async function ready(){for(let attempt=0;attempt<30;attempt++){try{const n=await fetch(urls.app+'/api/network',{signal:AbortSignal.timeout(3000)}).then(r=>r.json());if(n.chainId===chainId)return;}catch{}await new Promise(r=>setTimeout(r,1000));}throw Error('Local app has not recovered after archive');}
async function send(key,wallet,tx){
 plan.transactions||={};let entry=plan.transactions[key];
 if(!entry){const populated=await wallet.populateTransaction({...tx,nonce:Number(BigInt(await provider.send('eth_getTransactionCount',[wallet.address,'pending'])))});assert.equal(Number(populated.chainId),chainId);const raw=await wallet.signTransaction(populated);entry=plan.transactions[key]={hash:keccak256(raw),raw};save();}
 let receipt=await provider.getTransactionReceipt(entry.hash);
 if(!receipt){if(!await provider.getTransaction(entry.hash))await provider.broadcastTransaction(entry.raw);receipt=await provider.waitForTransaction(entry.hash,1,120000);}
 assert(receipt&&receipt.status===1,'Maintenance transaction must confirm');entry.confirmed=true;entry.block=receipt.blockNumber;save();return receipt;
}
async function action(vault,key,action,payload={}){
 plan.intents||={};let intent=plan.intents[key];if(!intent){intent=plan.intents[key]={idempotencyKey:randomUUID(),action,payload};save();}
 const p=await request('/api/wallet/prepare',{expectedVault:vault,action:intent.action,payload:intent.payload,idempotencyKey:intent.idempotencyKey},vault);
 assert.equal(p.account.toLowerCase(),manager.address.toLowerCase());
 for(const step of p.transactions){const receipt=await send(key+':'+step.step,manager,{to:step.to,data:step.data,value:BigInt(step.value)});const body={expectedVault:vault,operationId:p.operationId,step:step.step,hash:receipt.hash};await request('/api/wallet/submitted',body,vault);await request('/api/wallet/confirm',body,vault);}
 return request('/api/actions',{expectedVault:vault,action:intent.action,payload:intent.payload,idempotencyKey:intent.idempotencyKey},vault);
}
async function main(){
 assert.equal(Number(BigInt(await provider.send('eth_chainId',[]))),chainId);
 assert(JSON.parse(readFileSync(join(dir,'topup-check/real-rabby.json'))).passed,'Complete real wallet validation first');
 await login();
 if(existsSync(file))plan=JSON.parse(readFileSync(file));
 else{
  const old=JSON.parse(readFileSync(join(dir,'experience-product.json'))).vault,s=await request('/api/state',undefined,old),primary=await request('/api/state');
  assert.equal(s.manifest.contractName,'RevenueShareVaultV3');assert.equal(s.chain.phase,'1');assert.equal(s.chain.totalSupply,'0');
  const backup=await archive();
  const sourceHashes=Object.fromEntries(['private.json','public.json','environment.env','compose.json'].map(f=>[f,createHash('sha256').update(readFileSync(join(root,'.data/remote-demo',f))).digest('hex')]));
  plan={version:1,chainId,backup,oldVault:old,oldToken:s.manifest.addresses.usdc,sourceHashes,orders:Object.entries(s.accounts).filter(([,a])=>BigInt(a.subscription.amount)>0n).map(([actor,a])=>({actor,address:a.address,amount:a.subscription.amount,nonce:a.subscription.nonce,terms:a.subscription.terms,eligible:a.eligible})),reset:{confirmation:'RESET_DEMO',expectedVault:old,idempotencyKey:randomUUID()},primary:primary.manifest.contractName==='RevenueShareVaultV3'&&primary.applications.length===0&&primary.chain.totalSubscriptions==='0'&&primary.chain.totalSupply==='0'?{confirmation:'RESET_DEMO',expectedVault:primary.manifest.addresses.vault,idempotencyKey:randomUUID()}:null,startedAt:new Date().toISOString()};save();
  await ready();await login();
 }
 if(plan.completed){console.log('Local top-up upgrade already complete; no funds or products changed.');return;}
 const tokenAbi=['function balanceOf(address) view returns(uint256)','function mint(address,uint256)'];
 const oldToken=new Contract(plan.oldToken,tokenAbi,provider);
 if(!plan.replaced){
  const canonical=(await request('/api/products/create',{idempotencyKey:'guidance-experience-current',kind:'experience',demoAcknowledged:true})).vault;
  if(canonical!==plan.oldVault){plan.replaced=(await request('/api/demo/reset',plan.reset,canonical)).result;save();}
 }
 if(!plan.replaced){
  for(const order of plan.orders){
   if(order.refunded)continue;
   const balance=await oldToken.balanceOf(order.address);
   await action(plan.oldVault,'refund-'+order.address,'review-subscription',{investor:order.actor,amountUSDC6:order.amount,orderNonce:order.nonce,terms:order.terms,approved:false,reviewNote:'本地演示升级追加认购合约，原认购测试款全额退回，不代投资者接受新发行条款。'});
   const next=await oldToken.balanceOf(order.address);assert.equal(next-balance,BigInt(order.amount));order.refunded=true;order.newTestBalance=next.toString();save();
  }
  let s=await request('/api/state',undefined,plan.oldVault);assert.equal(s.chain.totalSubscriptions,'0');
  if(s.chain.phase==='1')await action(plan.oldVault,'end-old','fail');
  s=await request('/api/state',undefined,plan.oldVault);
  for(const a of s.applications.filter(a=>a.chainAdmission.admitted&&!a.chainAdmission.released))await action(plan.oldVault,'release-old-'+a.id,'release-station',{index:a.chainAdmission.rightIndex});
  const current=(await request('/api/products/create',{idempotencyKey:'guidance-experience-current',kind:'experience',demoAcknowledged:true})).vault;
  plan.replaced=(await request('/api/demo/reset',plan.reset,current)).result;save();
 }
 if(plan.primary&&!plan.primary.result){plan.primary.result=(await request('/api/demo/reset',plan.primary)).result;save();}
 const p=spawnSync('npm',['run','guidance:provision'],{cwd:root,stdio:'inherit'});assert.equal(p.status,0,'Replacement experience must be fully provisioned');
 plan.newVault=JSON.parse(readFileSync(join(dir,'experience-product.json'))).vault;const current=await request('/api/state',undefined,plan.newVault);assert.equal(current.manifest.contractName,'RevenueShareVaultV4');assert.equal(current.chain.phase,'1');assert.equal(current.chain.totalSubscriptions,'0');
 const newToken=new Contract(current.manifest.addresses.usdc,tokenAbi,provider),vault=new Contract(plan.newVault,['function eligible(address) view returns(bool)','function setEligible(address,bool)'],provider);
 for(const order of plan.orders){
  if(order.eligible&&!await vault.eligible(order.address))await send('eligibility-'+order.address,manager,await vault.setEligible.populateTransaction(order.address,true));
  // Explicit demo funding only. A mint restores testing capacity but does not create a subscription or shares.
  if(!order.creditDone){const available=await newToken.balanceOf(order.address),desired=BigInt(order.newTestBalance);if(available<desired)await send('demo-credit-'+order.address,admin,await newToken.mint.populateTransaction(order.address,desired-available));order.creditDone=true;save();}
 }
 const qa=JSON.parse(readFileSync(join(dir,'guidance-topups-v4.json'))).vault;
 let test=await request('/api/state',undefined,qa);assert.equal(test.chain.totalSubscriptions,'0');assert.equal(test.chain.totalSupply,'0');
 if(test.chain.phase==='1')await action(qa,'end-qa','fail');
 test=await request('/api/state',undefined,qa);for(const a of test.applications.filter(a=>a.chainAdmission.admitted&&!a.chainAdmission.released))await action(qa,'release-qa-'+a.id,'release-station',{index:a.chainAdmission.rightIndex});
 await request('/api/products/retire',{expectedVault:qa});
 const rows=(await request('/api/products')).products;assert.equal(rows.length,1);assert.equal(rows[0].vault,plan.newVault);assert.equal(rows[0].subscriptionTopUpsAllowed,true);
 for(const [name,hash]of Object.entries(plan.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(join(root,'.data/remote-demo',name))).digest('hex'),hash);
 plan.completed=true;plan.completedAt=new Date().toISOString();save();
 console.log('Local V4 product ready. Original demo escrow refunded, explicit test balances restored, old records archived, and no new investor subscription fabricated.');
}
main().catch(e=>{console.error(e.shortMessage||e.message);process.exitCode=1;}).finally(()=>provider.destroy());
