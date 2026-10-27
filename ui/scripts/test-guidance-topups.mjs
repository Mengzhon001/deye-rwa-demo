import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {guard,chainId,dir,urls} from '../../scripts/revenue-guidance-local.mjs';
import {launchRole,initializeRole} from './recording/rabby.mjs';
import {BrowserDriver} from './recording/rabby-driver.mjs';
guard();assert.equal(process.env.REVENUE_GUIDANCE_LOCAL_QA,'true');
const testKey=process.env.GUIDANCE_PRODUCT_KEY||'guidance-topups-v4';assert(/^guidance-topups-[a-z0-9-]+$/.test(testKey),'Use a dedicated top-up test product');
const vault=JSON.parse(readFileSync(dir+'/'+testKey+'.json')).vault,driver=new BrowserDriver('guidance-local');
driver.state=async(role='agent')=>{const r=await driver.sessions[role].context.request.get(urls.app+'/api/state',{headers:{'X-Revenue-Product':vault}});assert(r.ok());return r.json();};
driver.evidence=async(role,action,show,operationId)=>{const r=await driver.sessions[role].context.request.get(urls.app+'/api/recording/operations/'+operationId,{headers:{'X-Revenue-Product':vault},maxRetries:3});assert(r.ok());const proof=await r.json();assert(proof.offchain||proof.matched);driver.proofs.push(proof);};
mkdirSync(dir+'/topup-check',{recursive:true,mode:0o700});
try{
 await driver.guardLocalNode();
 for(const role of ['agent','investor']){
  const s=await launchRole('guidance-local',role);driver.sessions[role]=s;await initializeRole(s);s.page=await s.context.newPage();await s.page.addInitScript(v=>sessionStorage.setItem('revenue.selected-product',v),vault);await driver.login(role);
 }
 let before=await driver.state('investor');assert.equal(before.manifest.chainId,chainId);assert.equal(before.manifest.addresses.vault,vault);assert.equal(before.chain.subscriptionTopUpsAllowed,true);assert.equal(before.selectedProduct.key,testKey);assert.equal(before.chain.phase,'1','Provision a new dedicated test product instead of touching the current colleague product');
 if(before.accounts.investor.subscription.amount!=='0'){await driver.nav('investor','subscribe');await driver.action('investor','refund');before=await driver.state('investor');}
 const firstNonce=BigInt(before.accounts.investor.subscription.nonce),firstHistory=before.accounts.investor.subscription.history.length;
 for(const amount of ['10','20','30']){
  await driver.nav('investor','subscribe');assert(await driver.sessions.investor.page.locator('form[data-action="subscribe"] button').isEnabled());
  await driver.action('investor','subscribe',{amountUSDC6:amount});
  if(amount==='10'){
   await driver.nav('agent','agent_product');await driver.action('agent','review-subscription',{approved:'true',reviewNote:'已核对第一笔认购及对应发行条款。'});
   assert.equal((await driver.state('investor')).accounts.investor.subscription.approved,true);
  }
 }
 let s=await driver.state('investor');assert.equal(s.accounts.investor.subscription.amount,'60000000');assert.equal(s.accounts.investor.subscription.nonce,(firstNonce+3n).toString());assert.equal(s.accounts.investor.subscription.approved,false);assert.equal(s.chain.totalSubscriptions,'60000000');assert.equal(s.accounts.investor.usdc,(BigInt(before.accounts.investor.usdc)-60000000n).toString());assert.equal(s.accounts.investor.shares,'0');
 assert.deepEqual(s.accounts.investor.subscription.history.slice(firstHistory).filter(e=>e.kind==='subscription').map(e=>e.amountUSDC6),['10000000','20000000','30000000']);
 const op=s.operations.filter(o=>o.action==='subscribe'&&o.actor==='investor'&&o.status==='confirmed').at(-1);assert(op);
 const retry=await driver.sessions.investor.context.request.post(urls.app+'/api/wallet/prepare',{headers:{Origin:urls.app,'X-Revenue-Product':vault},data:{expectedVault:vault,action:'subscribe',payload:op.body,idempotencyKey:op.id}});assert(retry.ok());assert.equal((await retry.json()).transactions.length,0);assert.equal((await driver.state('investor')).accounts.investor.subscription.amount,'60000000');
 await driver.sessions.investor.page.reload();await driver.sessions.investor.page.locator('form[data-action="subscribe"]').waitFor();assert(await driver.sessions.investor.page.locator('form[data-action="subscribe"] button').isEnabled());await driver.sessions.investor.page.screenshot({path:dir+'/topup-check/three-payments.png'});
 await driver.nav('agent','agent_product');await driver.action('agent','review-subscription',{approved:'true',reviewNote:'已核对三笔付款，累计六十 USDC 的审核版本。'});assert.equal((await driver.state('investor')).accounts.investor.subscription.approved,true);
 await driver.nav('investor','subscribe');await driver.action('investor','subscribe',{amountUSDC6:'40'});s=await driver.state('investor');assert.equal(s.accounts.investor.subscription.amount,'100000000');assert.equal(s.accounts.investor.subscription.approved,false);
 await driver.nav('agent','agent_product');await driver.action('agent','review-subscription',{approved:'false',reviewNote:'测试累计退款，将全部累计认购款原路退回。'});
 s=await driver.state('investor');assert.equal(s.accounts.investor.subscription.amount,'0');assert.equal(s.accounts.investor.usdc,before.accounts.investor.usdc);assert.equal(s.chain.totalSubscriptions,'0');
 await driver.nav('investor','subscribe');await driver.action('investor','subscribe',{amountUSDC6:'5'});await driver.nav('investor','subscribe');await driver.action('investor','subscribe',{amountUSDC6:'5'});await driver.nav('investor','subscribe');await driver.action('investor','refund');
 s=await driver.state('investor');assert.equal(s.accounts.investor.subscription.amount,'0');assert.equal(s.accounts.investor.usdc,before.accounts.investor.usdc);
 assert.deepEqual(s.stations.map(x=>[x.id,x.observedAt,x.sourceHash]),before.stations.map(x=>[x.id,x.observedAt,x.sourceHash]));
 writeFileSync(dir+'/topup-check/real-rabby.json',JSON.stringify({passed:true,at:new Date().toISOString(),vault,chainId,consecutivePayments:['10','20','30','40'],cumulativeUSDC:'100',previousApprovalInvalidated:true,retryDidNotPayAgain:true,refreshRetainedForm:true,rejectionRefundedFull:true,investorCancellationRefundedFull:true,endingEscrow:'0',endingShares:'0',transactions:driver.proofs.flatMap(p=>p.transactions).map(t=>({hash:t.hash,matched:t.matched,method:t.method}))},null,2));
 console.log('PASS real Rabby repeated payments, changed review nonce, cumulative reapproval, idempotent retry, refresh, rejection and full cancellation refunds');
}finally{await driver.close();}
