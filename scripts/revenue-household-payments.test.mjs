import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {HDNodeWallet,JsonRpcProvider} from 'ethers';
import {chromium} from 'playwright';
const root=process.cwd(),dir=process.env.REVENUE_HOUSEHOLD_QA_DIR,base='http://127.0.0.1:4196',rpc='http://127.0.0.1:18559',chainId=20261021;
assert(dir?.startsWith(root+'/.data/household-payment-qa/'));assert.equal(process.env.REVENUE_CHAIN_ID,String(chainId));assert.equal(process.env.REVENUE_DATA_DIR,dir+'/store');
const privateConfig=JSON.parse(readFileSync(dir+'/private.json')),provider=new JsonRpcProvider(rpc,chainId,{staticNetwork:true,cacheTimeout:-1,batchMaxCount:1});provider.pollingInterval=50;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const clients={},operations=[];let vault='',appId='';

const manualDir=process.env.REVENUE_HOUSEHOLD_MANUAL_DIR;
if(manualDir&&!manualDir.startsWith(root+'/.data/'))throw Error('Manual captures must stay in the private workspace');
const manualShots={zh:{},en:{}};let manualMonth=0;
async function manualShot(code,client,selector){
 if(!manualDir||manualMonth!==1||manualShots.en[code])return;
 mkdirSync(manualDir+'/assets',{recursive:true,mode:0o700});
 for(const language of ['zh','en']){
  await client.page.evaluate(language=>{lang=language;localStorage.setItem('revenue.lang',language);if(language==='en'){for(const st of state.stations||[]){st.name='Deye Shanghai Solar and Storage Station';st.address='Changning District, Shanghai';}}render();},language);
  await client.dismiss();if(language==='en')await client.page.evaluate(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode())if(n.textContent.includes('德业上海光储电站'))n.textContent=n.textContent.replaceAll('德业上海光储电站','Deye Shanghai Solar and Storage Station');});const target=client.page.locator(selector).first();await target.waitFor({state:'attached'});await target.evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});await target.waitFor({state:'visible'});await target.scrollIntoViewIfNeeded();
  const box=await target.boundingBox();assert(box,'Missing manual target '+code);
  await client.page.evaluate(box=>{const mark=document.createElement('div');mark.id='manual-target';mark.style.cssText=`position:fixed;pointer-events:none;z-index:2147483647;left:${box.x-5}px;top:${box.y-5}px;width:${box.width+10}px;height:${box.height+10}px;border:3px solid #b62028;`;const n=document.createElement('span');n.textContent='1';n.style.cssText='position:absolute;right:0;top:-27px;background:#b62028;color:white;font:700 20px Arial;padding:2px 8px;';mark.append(n);document.body.append(mark);},box);
  const file=code+'.'+language+'.png';await client.page.screenshot({path:manualDir+'/assets/'+file});
  const chinese=await client.page.locator('body').innerText().then(t=>[...new Set(t.match(/[\u3400-\u9fff]+/g)||[])].filter(t=>t!=='中文'));
  manualShots[language][code]={file,box,role:client.role,chinese:language==='en'?chinese:[],actionTarget:selector};
  await client.page.evaluate(()=>document.querySelector('#manual-target')?.remove());
 }
 await client.page.evaluate(()=>{lang='en';localStorage.setItem('revenue.lang','en');render();});await client.dismiss();
 for(const language of ['zh','en'])writeFileSync(manualDir+'/screenshots.'+language+'.json',JSON.stringify(manualShots[language],null,2));
}

const chainActions=new Set(['pay-household-bill','publish-household-bill','confirm-receipt','mint-station','custody-consent','admit','prepare-valuation','approve-valuation','eligible','publish','subscribe','review-subscription','refund','settle','accrue-fee','book-revenue','distribute','claim','request-redemption','cancel-redemption','carry-window','process-redemptions','consent-trade','review-trade','settle-trade','open-case','support-case','approve-case','close','release-station']);
class Client{
 constructor(role){this.role=role;this.wallet=HDNodeWallet.fromPhrase(privateConfig.wallets[role].phrase).connect(provider);}
 async request(path,body){const response=await this.context.request[body?'post':'get'](base+path,{headers:{Origin:base,...(vault?{'X-Revenue-Product':vault}:{})},...(body?{data:body}:{}),timeout:120000});const data=await response.json();if(!response.ok()||data.error)throw Error(this.role+' '+path+': '+String(data.error||response.status()));return data;}
 async state(){return this.request('/api/state');}
 async start(){this.context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,locale:'en-GB',reducedMotion:'reduce'});const c=await this.request('/api/auth/challenge',{address:this.wallet.address,requestedRole:this.role.replace(/2$/,'')});await this.request('/api/auth/verify',{nonce:c.nonce,signature:await this.wallet.signMessage(c.message)});
  await this.context.exposeFunction('billingWalletRequest',async({method,params=[]})=>{if(method==='eth_sendTransaction'){const tx=params[0];assert.equal(tx.from.toLowerCase(),this.wallet.address.toLowerCase());const sent=await this.wallet.sendTransaction({to:tx.to,data:tx.data,value:BigInt(tx.value||0),nonce:Number(BigInt(await provider.send('eth_getTransactionCount',[this.wallet.address,'pending'])))});return sent.hash;}if(method==='personal_sign')return this.wallet.signMessage(params[0]);if(['wallet_switchEthereumChain','wallet_addEthereumChain','wallet_watchAsset'].includes(method))return null;return provider.send(method,params);});
  await this.context.addInitScript(({address,chainId,role})=>{localStorage.setItem('revenue.lang','en');localStorage.setItem('revenue.wallet','rabby');localStorage.setItem('revenue.role',role.replace(/2$/,''));localStorage.setItem('revenue.actor',role);window.ethereum={isRabby:true,request:async({method,params=[]})=>{if(['eth_accounts','eth_requestAccounts'].includes(method))return[address];if(method==='eth_chainId')return'0x'+chainId.toString(16);return window.billingWalletRequest({method,params});},on(){},removeListener(){}};},{address:this.wallet.address,chainId,role:this.role});
  this.page=await this.context.newPage();await this.page.goto(base+'/app/?lang=en');await this.page.waitForFunction(()=>typeof state!=='undefined'&&!!state?.manifest,{timeout:60000});await this.dismiss();vault ||= (await this.state()).manifest.addresses.vault;await this.request('/api/faucet',{expectedVault:vault});}
 async dismiss(){await this.page.keyboard.press('Escape');await this.page.evaluate(()=>{window.RevenueGuide?.clearSpotlight?.();document.querySelectorAll('dialog[open]').forEach(x=>x.close());});const later=this.page.locator('[data-guide-later]');if(await later.isVisible().catch(()=>false))await later.click();const close=this.page.locator('#guide-panel [data-guide-collapse]');if(await close.isVisible().catch(()=>false))await close.click();}
 async nav(id,detail=false){await this.dismiss();await this.page.evaluate(async({id,vault})=>{if(vault){selectedProduct=vault;sessionStorage.setItem('revenue.selected-product',vault);}page=id;wfSelected='';sessionStorage.removeItem('revenue.application');await refresh();},{id,vault});await this.dismiss();if(detail){const row=this.page.locator('[data-wf-open]').first();if(await row.count())await row.click();}await this.page.waitForTimeout(80);}
}
async function act(role,action,payload={},operationId){const client=clients[role];const capture={advance:['E1','agent_product'],"accrue-fee":['E4','agent_product'],"approve-valuation":['E5','trustee_events'],distribute:['E6','agent_product'],claim:['E7','position']}[action];if(capture&&manualMonth===1&&!(action==='claim'&&role!=='investor')){await client.nav(capture[1]);await manualShot(capture[0],client,`form[data-action="${action}"] button[type="submit"]`);}const id=operationId||randomUUID(),request={action,payload,idempotencyKey:id,expectedVault:vault};if(chainActions.has(action)){const prepared=await client.request('/api/wallet/prepare',request);assert.equal(prepared.account.toLowerCase(),client.wallet.address.toLowerCase());assert.equal(prepared.chainId,'0x'+chainId.toString(16));for(const tx of prepared.transactions){const sent=await client.wallet.sendTransaction({to:tx.to,data:tx.data,value:BigInt(tx.value),nonce:Number(BigInt(await provider.send('eth_getTransactionCount',[client.wallet.address,'pending'])))});await client.request('/api/wallet/submitted',{operationId:prepared.operationId,step:tx.step,hash:sent.hash,expectedVault:vault});assert.equal((await sent.wait()).status,1);await client.request('/api/wallet/confirm',{operationId:prepared.operationId,step:tx.step,hash:sent.hash,expectedVault:vault});}}
 const result=(await client.request('/api/actions',request)).result;operations.push({id,role,action});return result;}
async function valuePool(){await act('agent','prepare-valuation');await act('trustee','approve-valuation',{acceptProvisional:true});}
async function uiAct(role,nav,action,id){
 const c=clients[role];await c.nav(nav);if(['pay-household-bill','confirm-receipt'].includes(action)){await c.page.locator('#guide-launch').click();const resume=c.page.getByRole('button',{name:'Resume',exact:true});if(await resume.isVisible())await resume.click();await c.page.locator(`#guide-panel [data-guide-task="${action}"]`).waitFor({timeout:10000});await c.page.locator('[data-guide-locate]').click();await c.page.locator('.driver-popover').waitFor({timeout:10000});assert.match(await c.page.locator('.driver-active-element').evaluate(e=>(e.closest('form')||e).getAttribute('data-action')),new RegExp(action));await c.dismiss();}const form=c.page.locator(`[data-billing-id="${id}"] form[data-action="${action}"]`);await form.waitFor({state:'visible'});await manualShot({'pay-household-bill':'E3','fund-export':'E3a','confirm-receipt':'E3b'}[action],c,`[data-billing-id="${id}"] form[data-action="${action}"] button[type="submit"]`);const response=c.page.waitForResponse(r=>r.url().endsWith('/api/actions')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action===action,{timeout:60000});await form.locator('button').click();const r=await response;const body=await r.json();assert(r.ok(),JSON.stringify(body));await c.page.waitForFunction(()=>!sessionStorage.getItem('revenue.pending'),{timeout:30000});await c.dismiss();await c.page.screenshot({path:dir+'/'+role+'-'+action+'-'+id.slice(2,8)+'.png'});return body.result;
}
async function uiBook(period,historyMonth){
 const c=clients.agent;await c.nav('agent_monitor');
 const form=c.page.locator('form[data-action="book-revenue"]');
 for(const name of ['applicationId','period','historyMonth'])assert.equal(await form.locator(`[name="${name}"]`).count(),1,`Monthly bill form is missing ${name}`);
 assert.equal(await form.locator('button[type="submit"]').textContent(),'Publish monthly bill');assert.equal(await form.locator('button[type="submit"]').isDisabled(),false);
 await c.page.locator('#guide-launch').click();const resume=c.page.getByRole('button',{name:'Resume',exact:true});if(await resume.isVisible())await resume.click();
 const task=await c.page.evaluate(period=>RevenueGuide.model().find(t=>t.action==='book-revenue'&&Number(t.period)===period),period);assert(task,'Monthly billing task must exist');await c.page.locator('.guide-checklist').evaluate(e=>e.open=true);await c.page.locator(`[data-guide-task-id="${task.id}"]`).click();
 await c.page.locator('#guide-panel [data-guide-task="book-revenue"]').waitFor();
 for(let i=0;i<2;i++){
  await c.page.locator('[data-guide-locate]').click();await c.page.locator('.driver-popover').waitFor();
  assert.equal(await c.page.locator('.driver-active-element').evaluate(e=>e.closest('form')?.dataset.action),'book-revenue');
  assert.equal(await form.locator('[name="applicationId"]').inputValue(),appId);assert.equal(await form.locator('[name="period"]').inputValue(),String(period));
  await c.page.keyboard.press('Escape');
 }
 await c.dismiss();await form.locator('[name="historyMonth"]').fill(historyMonth);await manualShot('E2',c,'form[data-action="book-revenue"] button[type="submit"]');
 const response=c.page.waitForResponse(r=>r.url().endsWith('/api/actions')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='book-revenue',{timeout:60000});
 await form.locator('button[type="submit"]').click();const r=await response;assert(r.ok(),JSON.stringify(await r.json()));await c.page.waitForFunction(()=>!sessionStorage.getItem('revenue.pending'),{timeout:30000});
 const s=await c.state();assert.equal(s.income.at(-1).period,period);assert(s.income.at(-1).payment);await c.dismiss();await c.page.screenshot({path:dir+'/agent-publish-bill-'+period+'.png'});
}
async function expectFailure(role,action,payload,pattern,chain=false){try{if(chain){await clients[role].request('/api/wallet/prepare',{action,payload,idempotencyKey:randomUUID(),expectedVault:vault});}else await act(role,action,payload);throw Error('Unexpected success');}catch(e){assert.match(e.message,pattern);}}
try{
 for(const role of ['owner','agent','trustee','investor','investor2']){clients[role]=new Client(role);await clients[role].start();}
 let s=await clients.agent.state();assert(s.householdPaymentsEnabled);assert(s.manifest.addresses.billing);const telemetry=s.stations.map(x=>[x.sourceHash,x.observedAt]);
 await act('owner','apply',{stationId:s.stations[0].id,notes:'Isolated household USDC collection test'});s=await clients.agent.state();appId=s.applications[0].id;
 await act('agent','review',{applicationId:appId,decision:'approved',notes:'Reviewed evidence and payment responsibilities'});
 await act('agent','offer',{applicationId:appId,assumptions:{...s.applications[0].assumptions,baselineMethod:'historical',baselineReviewNote:'Historical monthly generation and export baseline reviewed. Tariffs and FX remain demo assumptions.',baselineReviewSourceHash:s.stations[0].sourceHash}});
 await act('trustee','approve-offer',{applicationId:appId,acceptProvisional:true});await act('owner','accept',{applicationId:appId});const agreement=await clients.owner.request('/api/wallet/agreement',{applicationId:appId,expectedVault:vault});await act('owner','sign',{applicationId:appId,walletSignature:await clients.owner.wallet.signMessage(agreement.message)});
 await act('agent','mint-station',{applicationId:appId});await act('owner','custody-consent',{applicationId:appId});await act('agent','admit',{applicationId:appId});await valuePool();await act('agent','publish');
 for(const role of ['investor','investor2']){await act(role,'apply-eligibility',{riskAccepted:true,demoAcknowledged:true});s=await clients.agent.state();await act('agent','eligible',{investor:role,applicationId:s.eligibilityApplications.filter(x=>x.investor===role).at(-1).id,eligible:true,reviewNote:'Demo declarations reviewed'});}
 s=await clients.agent.state();const target=BigInt(s.chain.target),half=target/2n;await act('investor','subscribe',{amountUSDC6:half.toString()});await act('investor2','subscribe',{amountUSDC6:(target-half).toString()});
 for(const role of ['investor','investor2']){s=await clients.agent.state();const q=s.accounts[role].subscription;await act('agent','review-subscription',{investor:role,amountUSDC6:q.amount,terms:q.terms,orderNonce:q.nonce,approved:true,reviewNote:'Amount and terms reconciled'});}
 await act('agent','settle');await valuePool();
 const {Contract}=await import('ethers'),token=new Contract(s.manifest.addresses.usdc,['function balanceOf(address) view returns(uint256)','function transfer(address,uint256) returns(bool)'],provider),billingAddress=s.manifest.addresses.billing;
 const initialOwner=await token.balanceOf(clients.owner.wallet.address);
 for(let month=1;month<=2;month++){
  manualMonth=month;
  await act('agent','advance',{by:'month'});s=await clients.agent.state();const hist=s.stations[0].history.filter(h=>h.complete&&h.generationKWh!==null&&h.exportKWh!==null).at(-1).month;
  await uiBook(month,hist);s=await clients.agent.state();const bill=s.income.at(-1),id=bill.id;assert(BigInt(bill.payment.householdUSDC6)>0n);assert(!bill.collected);const vaultBefore=await token.balanceOf(vault),ownerBefore=await token.balanceOf(clients.owner.wallet.address);
  await expectFailure('agent','collect-revenue',{incomeId:id},/wallet payment|业主钱包/);await expectFailure('agent','confirm-receipt',{incomeId:id},/Both household|请先完成/,true);await expectFailure('investor','pay-household-bill',{incomeId:id},/authorized|role|权限|allowed/,true);
  if(month===1){
   // A rejected wallet request must not mark the bill paid. Retry the same persisted intent.
   await clients.owner.nav('owner_funds');await clients.owner.page.evaluate(()=>{const original=window.ethereum.request;window.ethereum.request=async q=>{if(q.method==='eth_sendTransaction'){window.ethereum.request=original;const e=new Error('User rejected request');e.code=4001;throw e;}return original(q);};});
   await clients.owner.page.locator(`[data-billing-id="${id}"] form[data-action="pay-household-bill"] button`).click();await clients.owner.page.waitForTimeout(800);s=await clients.owner.state();assert(!s.income.at(-1).payment.householdPaid);await clients.owner.page.reload();await clients.owner.dismiss();
  }
  // Exercise the actual owner form and wallet transaction bridge, not an API substitute.
  if(month===2){
   // Exhaust the test wallet explicitly, verify no silent mint, then claim funds before paying.
   const destination=HDNodeWallet.createRandom().address;const owned=await token.balanceOf(clients.owner.wallet.address);await(await token.connect(clients.owner.wallet).transfer(destination,owned)).wait();
   await expectFailure('owner','pay-household-bill',{incomeId:id},/Insufficient USDC|余额不足/,true);assert.equal(await token.balanceOf(clients.owner.wallet.address),0n);await clients.owner.request('/api/faucet',{expectedVault:vault});
   // Let both signed steps mine, then restart before business finalization.
   const opId=randomUUID(),request={action:'pay-household-bill',payload:{incomeId:id},idempotencyKey:opId,expectedVault:vault},prepared=await clients.owner.request('/api/wallet/prepare',request);
   for(const tx of prepared.transactions){const sent=await clients.owner.wallet.sendTransaction({to:tx.to,data:tx.data,value:BigInt(tx.value),nonce:Number(BigInt(await provider.send('eth_getTransactionCount',[clients.owner.wallet.address,'pending'])))});await clients.owner.request('/api/wallet/submitted',{operationId:opId,step:tx.step,hash:sent.hash,expectedVault:vault});assert.equal((await sent.wait()).status,1);}
   const afterPay=await token.balanceOf(clients.owner.wallet.address);await new Promise((ok,no)=>{const timeout=setTimeout(()=>no(Error('Restart timeout')),60000);process.once('message',message=>{clearTimeout(timeout);message==='backend-restarted'?ok():no(Error('Restart failed'));});process.send('restart-backend');});
   s=await clients.owner.state();assert(s.income.at(-1).payment.householdPaid);const resumed=await clients.owner.request('/api/wallet/prepare',request);assert.equal(resumed.transactions.length,0);await act('owner','pay-household-bill',{incomeId:id},opId);assert.equal(await token.balanceOf(clients.owner.wallet.address),afterPay);
  }else await uiAct('owner','owner_funds','pay-household-bill',id);s=await clients.agent.state();assert(s.income.at(-1).payment.householdPaid);assert(!s.income.at(-1).collected);if(month===1)assert.equal(ownerBefore-await token.balanceOf(clients.owner.wallet.address),BigInt(bill.payment.householdUSDC6));assert.equal(await token.balanceOf(vault),vaultBefore);
  await expectFailure('owner','pay-household-bill',{incomeId:id},/already paid|已支付/,true);
  await clients.owner.page.reload();await clients.owner.page.waitForFunction(()=>state?.income?.at(-1)?.payment?.householdPaid);await clients.owner.dismiss();assert.equal(await clients.owner.page.locator(`[data-billing-id="${id}"] form[data-action="pay-household-bill"]`).count(),0);
  await uiAct('agent','agent_monitor','fund-export',id);assert.equal(await token.balanceOf(vault),vaultBefore);
  await uiAct('agent','agent_monitor','confirm-receipt',id);s=await clients.agent.state();assert(s.income.at(-1).collected);assert.equal(await token.balanceOf(vault)-vaultBefore,BigInt(bill.payment.assignedUSDC6));assert.equal(s.receipts.length,month);assert(s.receipts.at(-1).householdTransaction);assert(s.receipts.at(-1).confirmationTransaction);
  await expectFailure('agent','confirm-receipt',{incomeId:id},/Both household|请先完成/,true);await expectFailure('agent','fund-export',{incomeId:id},/already|已/);
  for(const action of ['pay-household-bill','confirm-receipt']){const op=s.operations.filter(o=>o.action===action&&o.status==='confirmed').at(-1);const proof=await clients.agent.request('/api/recording/operations/'+op.id);writeFileSync(dir+'/'+action+'-proof-'+month+'.json',JSON.stringify(proof));assert.equal(proof.matched,true,JSON.stringify(proof));}
  if(!s.chain.feeBasisReady)await valuePool();await act('agent','accrue-fee');await valuePool();await act('agent','distribute');
  for(const role of ['investor','investor2']){s=await clients[role].state();const claim=s.accounts[role].claims.find(c=>Number(c.id)===month);assert(BigInt(claim.amountUSDC6)>0n);await act(role,'claim',{distributionId:claim.id});}
  await valuePool();console.log('PASS real household wallet payment, receipt reconciliation and distribution month',month);
 }
 s=await clients.agent.state();assert.deepEqual(s.stations.map(x=>[x.sourceHash,x.observedAt]),telemetry);assert.equal(s.receipts.length,2);
 writeFileSync(dir+'/results.json',JSON.stringify({passed:true,chainId,months:2,operations:operations.length,browser:'Hidden Chromium, authenticated roles, actual rendered payment and confirmation forms. EIP-1193 test bridge signs real local-chain transactions outside the browser; not a claim of a real Rabby extension test.',telemetryUnchanged:true,backendRestartAfterPayment:true,insufficientFunds:true,publishBillsThroughActualPage:true,repeatedBillGuideLocation:true},null,2));console.log('HOUSEHOLD PAYMENT E2E PASSED');
}catch(e){console.error(e.stack);for(const[r,c]of Object.entries(clients))if(c.page)await c.page.screenshot({path:dir+'/failure-'+r+'.png'}).catch(()=>{});process.exitCode=1;}finally{await browser.close();provider.destroy();}
