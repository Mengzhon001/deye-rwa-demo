/** Explicit public-testnet integration test. Keys are loaded from an ignored local file. */
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {HDNodeWallet,JsonRpcProvider} from 'ethers';
import {dir,environment} from './revenue-base-sepolia.mjs';
const config=JSON.parse(readFileSync(join(dir,'public.json'))),env=environment();
if(config.chainId!==84532)throw Error('Refusing a different test chain');
const privateFile=process.env.BASE_EXISTING_ROLES_FILE;if(!privateFile)throw Error('Local ignored role file required');
const secrets=JSON.parse(readFileSync(privateFile,'utf8'));
const provider=new JsonRpcProvider(env.REVENUE_RPC_URL,84532,{staticNetwork:true,batchMaxCount:1});
const roles=['owner','agent','trustee','trustee2','investor','investor2'];
const wallets=Object.fromEntries(roles.map(r=>[r,HDNodeWallet.fromPhrase(secrets.wallets[r].phrase).connect(provider)]));
const base=process.env.BASE_TEST_ORIGIN||'http://127.0.0.1:4194';
const runId=process.env.BASE_TEST_RUN_ID||'default';if(!/^[a-zA-Z0-9-]{1,80}$/.test(runId))throw Error('Invalid public test run ID');
const progressFile=join(dir,runId==='default'?'validation/public-test-progress.json':`validation/public-test-${runId}.json`);mkdirSync(join(dir,'validation'),{recursive:true});
const progress=existsSync(progressFile)?JSON.parse(readFileSync(progressFile)):{actions:{},transactions:[],assertions:[]};
const cookies={};let selected='';
const save=()=>writeFileSync(progressFile,JSON.stringify(progress,null,2),{mode:0o600});
async function request(role,path,body,allowError=false){
 const started=Date.now();const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:base,'Content-Type':'application/json',...(cookies[role]?{Cookie:cookies[role]}:{}),...(selected?{'X-Revenue-Product':selected}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
 const raw=await r.text();let data;try{data=JSON.parse(raw);}catch{throw Error(`${path} HTTP ${r.status}`);}
 if(!r.ok&&!allowError)throw Error(`${path}: ${data.error}`);
 const cookie=r.headers.get('set-cookie');if(cookie)cookies[role]=cookie.split(';')[0];
 if(Date.now()-started>15000)console.log('slow read',path,Math.round((Date.now()-started)/1000));
 return allowError?{status:r.status,data}:data;
}
async function login(role){const c=await request(role,'/api/auth/challenge',{address:wallets[role].address,requestedRole:role.startsWith('investor')?'investor':role.startsWith('trustee')?'trustee':role});await request(role,'/api/auth/verify',{nonce:c.nonce,signature:await wallets[role].signMessage(c.message)});}
async function action(role,name,payload={},chain=false,tag=''){
 const key=createHash('sha256').update(JSON.stringify([role,name,payload,tag])).digest('hex').slice(0,32),idempotencyKey=(runId==='default'?'base-public-':`base-${runId}-`)+key;
 if(progress.actions[key])return progress.actions[key];
 if(chain){
  const plan=await request(role,'/api/wallet/prepare',{expectedVault:selected,action:name,payload,idempotencyKey});
  for(const step of plan.transactions){
   progress.intents||={};const intentKey=plan.operationId+':'+step.step;
   let tx=progress.intents[intentKey];
   if(!tx){
   const nonce=Number(BigInt(await provider.send('eth_getTransactionCount',[wallets[role].address,'pending'])));
   tx=await wallets[role].sendTransaction({to:step.to,data:step.data,value:BigInt(step.value),nonce});
   progress.intents[intentKey]={hash:tx.hash};save();console.log('broadcast',name,step.step,tx.hash);
   }
   await request(role,'/api/wallet/submitted',{expectedVault:selected,operationId:plan.operationId,step:step.step,hash:tx.hash});
   const receipt=await provider.waitForTransaction(tx.hash,1,120000);assert.equal(receipt.status,1);
   await request(role,'/api/wallet/confirm',{expectedVault:selected,operationId:plan.operationId,step:step.step,hash:tx.hash});
   progress.transactions.push({role,action:name,step:step.step,hash:tx.hash,block:receipt.blockNumber,to:step.to,explorer:config.explorer+'/tx/'+tx.hash});save();
  }
 }
 const result=await request(role,'/api/actions',{expectedVault:selected,action:name,payload,idempotencyKey});progress.actions[key]=result;save();console.log('PASS',role,name);return result;
}
async function main(){
 assert.equal(Number(BigInt(await provider.send('eth_chainId',[]))),84532);
 const n=await request('','/api/network');assert.equal(n.paymentToken.address.toLowerCase(),config.usdc.toLowerCase());assert.equal(n.demoTimeAdvanceEnabled,false);assert.equal(n.resetEnabled,false);assert.equal(n.nativeCurrency.symbol,'ETH');
 for(const role of roles)await login(role);
 let s=await request('agent','/api/state');selected=s.manifest.addresses.vault;
 for(const op of s.operations.filter(o=>o.action==='mint-station'&&o.status!=='confirmed')){
  const original=progress.intents?.[op.id+':mint'];if(!original)continue;
  await request('agent','/api/wallet/submitted',{expectedVault:selected,operationId:op.id,step:'mint',hash:original.hash});
  await request('agent','/api/wallet/confirm',{expectedVault:selected,operationId:op.id,step:'mint',hash:original.hash});
  const reconciled=await request('agent','/api/actions',{expectedVault:selected,action:op.action,payload:op.body,idempotencyKey:op.id});
  progress.transactions.push({role:'agent',action:'mint-station',step:'mint',hash:original.hash,recovered:true,explorer:config.explorer+'/tx/'+original.hash});save();console.log('PASS recover original mint after delayed registration');
 }
 const wrong=await request('investor','/api/auth/challenge',{address:wallets.investor.address,requestedRole:'owner'},true);assert.ok(wrong.status>=400);
 const blockedFaucet=await request('investor','/api/faucet',{expectedVault:selected},true);assert.ok(blockedFaucet.status>=400);
 const blockedTime=await request('agent','/api/actions',{expectedVault:selected,action:'advance',payload:{by:'day'},idempotencyKey:'base-no-time-advance'},true);assert.ok(blockedTime.status>=400);
 if(!s.applications.length)await action('owner','apply',{stationId:s.stations[0].id,notes:'Base Sepolia public-chain compatibility test. Recorded station evidence; simulated financial assumptions; no real assignment of rights.'});
 s=await request('agent','/api/state');const id=s.applications[0].id,b={applicationId:id};
 if(s.applications[0].status==='submitted')await action('agent','review',{...b,decision:'approved',notes:'Recorded evidence reviewed for independent public-testnet testing.'});
 s=await request('agent','/api/state');
 if(s.applications[0].status==='approved')await action('agent','offer',{...b,assumptions:{...s.applications[0].assumptions,baselineMethod:'historical',baselineReviewSourceHash:s.stations[0].sourceHash,baselineReviewNote:'Recorded station data contains reconciliation differences. Use reviewed historical monthly generation and valid export observations as a provisional seasonal baseline. Tariffs, costs, FX and delivery factors remain disclosed test assumptions; no guaranteed returns.'}});
 s=await request('agent','/api/state');
 if(s.applications[0].status==='offered'){await action('trustee','approve-offer',{...b,acceptProvisional:true});await action('owner','accept',b);}
 s=await request('agent','/api/state');
 if(s.applications[0].status==='accepted'){const m=await request('owner','/api/wallet/agreement',{...b,expectedVault:selected});await action('owner','sign',{...b,walletSignature:await wallets.owner.signMessage(m.message)});}
 s=await request('agent','/api/state');if(!s.applications[0].chainAdmission.minted)await action('agent','mint-station',b,true);
 s=await request('agent','/api/state');if(!s.applications[0].chainAdmission.approvedToVault&&!s.applications[0].chainAdmission.admitted)await action('owner','custody-consent',b,true);
 s=await request('agent','/api/state');if(!s.applications[0].chainAdmission.admitted)await action('agent','admit',b,true);
 s=await request('agent','/api/state');if(!s.activeReports.aggregate)await action('agent','prepare-valuation',{},true);
 s=await request('agent','/api/state');if(!s.chain.fresh)await action('trustee','approve-valuation',{acceptProvisional:true},true);
 s=await request('agent','/api/state');if(Number(s.chain.phase)===0)await action('agent','publish',{},true);
 for(const role of ['investor','investor2']){
  s=await request('agent','/api/state');if(s.accounts[role].eligible)continue;
  const applied=await action(role,'apply-eligibility',{riskAccepted:true,demoAcknowledged:true});await action('agent','eligible',{investor:role,applicationId:applied.result.id,eligible:true,reviewNote:'Dedicated public-chain test account; risk declaration reviewed.'},true);
 }
 if(process.env.BASE_TEST_SUBSCRIPTIONS==='true'&&!progress.final){
  for(const role of ['investor','investor2']){
   const before=BigInt(await (new (await import('ethers')).Contract(config.usdc,['function balanceOf(address) view returns(uint256)'],provider)).balanceOf(wallets[role].address));
   await action(role,'subscribe',{amountUSDC6:'1000000'},true,'first');
   // Record the precise order version required by the current contract.
   s=await request('agent','/api/state');const order=s.accounts[role].subscription;
   if(order.amount==='1000000')await action('agent','review-subscription',{investor:role,amountUSDC6:order.amount,orderNonce:order.nonce,terms:order.terms,approved:true,reviewNote:'Verify the first real Circle test-USDC order.'},true,'review-first');
   await action(role,'subscribe',{amountUSDC6:'2000000'},true,'additional');
   s=await request('agent','/api/state');assert.equal(String(s.accounts[role].subscription.amount),'3000000');
   const latest=s.accounts[role].subscription;assert.equal(latest.approved,false);
   await action('agent','review-subscription',{investor:role,amountUSDC6:latest.amount,orderNonce:latest.nonce,terms:latest.terms,approved:true,reviewNote:'Review the updated accumulated public-chain test order.'},true,'review-total');
   await action(role,'refund',{},true,'cancel-all');
   const after=BigInt(await (new (await import('ethers')).Contract(config.usdc,['function balanceOf(address) view returns(uint256)'],provider)).balanceOf(wallets[role].address));assert.equal(after,before);
  }
 }
 s=await request('agent','/api/state');assert.equal(Number(s.chain.phase),1);assert.equal(String(s.chain.totalSupply),'0');
 progress.assertions=['Base Sepolia chain and Circle USDC bindings','All six role signatures authenticated','Wrong role rejected','Application faucet and time advance rejected','Reviewed real recorded station evidence; full issuance preparation','NFT mint, custody approval and admission confirmed','Valuation submission and distinct trustee approval confirmed','Published fundraising product; both test investors eligible',...(process.env.BASE_TEST_SUBSCRIPTIONS==='true'?['Two investors: subscription, additional subscription, whole-order refund; exact USDC balances restored']:[])];
 progress.final={at:new Date().toISOString(),origin:base,chainId:84532,vault:selected,phase:s.chain.phase,target:s.chain.target,totalSubscriptions:s.chain.totalSubscriptions,totalSupply:s.chain.totalSupply,observedAt:s.stations[0].observedAt,sourceHash:s.stations[0].sourceHash};save();console.log(JSON.stringify(progress.final,null,2));
}
main().catch(e=>{console.error(e.shortMessage||e.message);process.exitCode=1;}).finally(()=>provider.destroy());
