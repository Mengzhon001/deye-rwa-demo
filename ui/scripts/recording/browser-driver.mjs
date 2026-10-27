import {launchRole,initializeRole} from './metamask.mjs';
import {roles,labels,config} from './environment.mjs';
import {writeFileSync} from 'node:fs';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export class BrowserDriver {
 constructor(stage){this.stage=stage;this.sessions={};this.proofs=[];this.seen=new Set();this.revision=0;this.pageRevisions={};}
 async guardLocalNode(){
  if(process.env.REVENUE_GUIDANCE_LOCAL_QA!=='true')return;
  const c=config(this.stage),network=await fetch(c.urls.app+'/api/network').then(r=>r.json());
  const response=await fetch(c.urls.rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})}).then(r=>r.json());
  if(network.chainId!==c.chainId||!network.guidanceEnabled||Number(BigInt(response.result))!==c.chainId)throw Error('Local guidance tests refuse the wrong backend or actual RPC chain');
 }
 async visit(page,url){await page.goto(url);if(/\.ngrok(?:-free)?\.(dev|app)$/.test(new URL(url).hostname)){const visit=page.getByRole('button',{name:'Visit Site',exact:true});if(await visit.isVisible()){await visit.click();await page.waitForLoadState('domcontentloaded');}}}
 async start(){await this.guardLocalNode();for(const role of roles){const s=await launchRole(this.stage,role);await initializeRole(s);for(const p of s.context.pages())if(p!==s.wallet)await p.close();s.page=await s.context.newPage();await this.visit(s.page,s.config.urls.app+'/');s.popup=await s.context.newPage();await s.popup.setViewportSize({width:600,height:900});await s.popup.goto(`chrome-extension://${s.extensionId}/notification.html`);this.sessions[role]=s;}return this;}
 async pump(role,until,timeout=90000){const s=this.sessions[role],end=Date.now()+timeout;let last='',idle=0;while(Date.now()<end){if(await until())return;let popup=s.context.pages().find(p=>!p.isClosed()&&p.url().includes('notification.html'));if(!popup){popup=s.popup=await s.context.newPage();await popup.setViewportSize({width:600,height:900});await popup.goto(`chrome-extension://${s.extensionId}/notification.html`);}const locked=s.context.pages().find(p=>!p.isClosed()&&p.url().includes('#unlock'));
 if(locked||await popup.locator('input[type="password"]').count()){
  await this.director?.walletView(null);const unlock=locked||popup;
  try{await unlock.locator('input[type="password"]').fill(s.config.password);await unlock.getByRole('button',{name:'Unlock',exact:true}).click();}catch{throw Error('The local test wallet could not be unlocked; secret input details omitted');}
  await sleep(500);continue;
 }
 let body='';try{body=await popup.locator('body').innerText({timeout:1000});}catch{}
 const warning=popup.getByRole('button',{name:'Review alert',exact:true});
 if(await warning.isVisible()){
  await warning.click();await sleep(200);const detail=await popup.locator('body').innerText();
  if(detail.includes('Malicious site')){await popup.screenshot({path:s.config.dir+'/metamask-alert-'+role+'.png'});throw Error('MetaMask blocked this application domain as Malicious site; no risk override was accepted.');}
 }
 const confirm=popup.getByRole('button',{name:/^(Connect|Confirm|Approve|Add network|Switch network|Next)$/}).last();if(await confirm.isVisible()&&await confirm.isEnabled()){
 if(this.rejectOnce){this.rejectOnce=false;await popup.getByRole('button',{name:/^(Cancel|Reject)$/}).click();await sleep(500);continue;}
 if(this.director){await this.director.walletView(popup);if(this.director.record)await sleep(this.currentRepeated?700:3200);}if(body!==last){console.log('MetaMask:',labels[role],body.includes('Signature request')?'message signature':body.includes('Connect this website')?'connection':'confirmation');last=body;}
 // A confirmation can disappear between the visibility check and click
 // once MetaMask has already delivered the result. Check the business
 // response before treating that transient popup change as a failure.
 if(await until())return;
 try{await confirm.click({timeout:2000});}catch(e){
  if(await until())return;
  if(popup.isClosed()||!await confirm.isVisible())continue;
  throw e;
 }
 await sleep(350);idle=0;
 }else{idle++;if(idle===12&&!/connect\/|confirm-transaction/.test(popup.url())){await popup.reload();idle=0;}await sleep(250);}
 }const p=s.page;await p.screenshot({path:s.config.dir+'/failure-'+role+'.png'});console.log('APP FAILURE', (await p.locator('body').innerText()).slice(-3500));throw Error('Timed out awaiting UI operation for '+role);}
 async login(role){const s=this.sessions[role],p=s.page;await this.visit(p,s.config.urls.app+'/app/');await p.locator('#nav [data-page], [data-wl-role]').first().waitFor({state:'visible',timeout:30000});if(await p.locator('#nav [data-page]').count()){await this.pauseLocalGuidance(p);return;}await p.locator(`[data-wl-role="${role.replace(/2$/,'')}"]`).click();await p.locator('[data-wl-connect]').click();await this.pump(role,async()=>await p.locator('#nav [data-page]').count()>0);if(this.director)await this.director.walletView(null);const state=await this.state(role);if(state.mode!=='replay')throw Error('Recording requires real recorded station data');this.pageRevisions[role]=this.revision;console.log('Signed in:',labels[role]);await this.pauseLocalGuidance(p);}
 async pauseLocalGuidance(page){if(process.env.REVENUE_GUIDANCE_LOCAL_QA!=='true')return;await sleep(200);const later=page.locator('[data-guide-later]');if(await later.isVisible())await later.click();const pause=page.locator('[data-guide-pause]');if(await pause.isVisible())await pause.click();}
 async checkWrongRole(role){
  const s=this.sessions[role],p=s.page;
  await this.visit(p,s.config.urls.app+'/app/');
  await p.locator('#nav [data-page],.wallet-login[open] [data-wl-role]').first().waitFor({state:'visible',timeout:30000});
  if(await p.locator('#nav [data-page]').count())await p.locator('#wallet-connect').click();
  await p.locator('[data-wl-role="owner"]').click();
  await p.locator('[data-wl-connect]').click();
  await this.pump(role,async()=>await p.locator('.wl-error').innerText().then(t=>t.includes('不具备')));
  const current=await s.context.request.get(s.config.urls.app+'/api/session/current');
  const session=await current.json();if(session.authenticated&&session.role==='owner')throw Error('Wrong role unexpectedly authenticated');
  await this.director?.walletView(null);
  console.log('PASS real '+(process.env.REVENUE_RECORDING_WALLET==='rabby'?'Rabby':'MetaMask')+' wrong-role denial');
 }
 async state(role='agent'){const s=this.sessions[role];const r=await s.context.request.get(s.config.urls.app+'/api/state',{maxRetries:3});if(!r.ok())throw Error('State '+r.status());return r.json();}
 async nav(role,id){const p=this.sessions[role].page;
  // Successful UI actions already refresh their own page. Refresh another
  // participant only after a handoff changed shared state.
  if(this.pageRevisions[role]!==this.revision){const refreshed=p.waitForResponse(r=>r.url().endsWith('/api/state')&&r.request().method()==='GET');await p.locator('#refresh').click();await (await refreshed).finished();await sleep(120);this.pageRevisions[role]=this.revision;}
  await p.locator(`#nav [data-page="${id}"]`).click();await sleep(160);
 }
 async openApplication(role,page){await this.nav(role,page);const p=this.sessions[role].page;await p.locator('[data-wf-open]').first().click();}
 async fill(form,values){for(const [name,value] of Object.entries(values)){const e=form.locator(`[name="${name}"]`);if(!await e.count())throw Error('Missing field '+name);const tag=await e.evaluate(n=>n.tagName);if(tag==='SELECT')await e.selectOption(String(value));else if(await e.getAttribute('type')==='checkbox')await e.setChecked(Boolean(value));else await e.fill(String(value));}}
 async action(role,action,values={},options={}){if(process.env.REVENUE_GUIDANCE_LOCAL_QA==='true')await this.checkGuidance(role,action,options);this.currentRepeated=options.proof===false;const s=this.sessions[role],p=s.page;let f=p.locator(`form[data-action="${action}"]${process.env.REVENUE_GUIDANCE_LOCAL_QA==='true'?':not(.wf-next form):not(.wf-owner-intro form):not(.iv-steps form)':''}`);if(options.index!==undefined)f=f.nth(options.index);else f=f.first();await f.waitFor({state:'attached',timeout:15000});await f.evaluate(e=>{for(let parent=e.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;});await this.fill(f,values);await f.scrollIntoViewIfNeeded();let response;const listener=r=>{if(r.url().endsWith('/api/actions')&&r.request().method()==='POST'){try{if(r.request().postDataJSON().action===action)response=r;}catch{}}};p.on('response',listener);await this.director?.setScene({role,task:options.task||(await f.locator('button').last().innerText()),caption:options.caption||'',next:options.next||'',mode:'',proof:''});this.director?.mark('action-start',{role,action});try{
 const submit=f.locator('button[type="submit"],button:not([type])').last();if(!await submit.isEnabled())throw Error(`Disabled ${action}: `+(await f.innerText()).slice(0,600));if(this.director?.record){await submit.evaluate(e=>{e.style.outline='3px solid #31b894';e.style.outlineOffset='4px';});await sleep(800);}await submit.click();await this.pump(role,async()=>!!response||await p.locator('#feedback.error').count()>0);if(!response)throw Error(await p.locator('#feedback').innerText());const result=await response.json();if(!response.ok()||result.error)throw Error(result.error||action+' HTTP '+response.status());await this.pump(role,async()=>await p.locator('#feedback').innerText().then(t=>t.includes('操作已确认')));await this.director?.walletView(null);this.director?.mark('action-done',{role,action,result:result.result});this.pageRevisions[role]=++this.revision;console.log('PASS',role,action);if(this.onDone)this.onDone({role,action,result:result.result,operationId:response.request().postDataJSON().idempotencyKey});
 await this.evidence(role,action,options.proof!==false,response.request().postDataJSON().idempotencyKey);
 if(options.proof!==false&&this.director){await this.director.setScene({mode:'',proof:'业务结果已根据确认回执更新',caption:options.caption||'操作已确认，请查看更新后的业务状态。'});await sleep(this.director.record?2500:100);}
 return result.result;
 }catch(e){this.revision++;await p.screenshot({path:s.config.dir+'/failure-'+action+'.png'});console.log('Failed UI',role,action,(await p.locator('#feedback').innerText()).slice(0,600));throw e;}finally{p.off('response',listener);}}
 async evidence(role,action,show=true,operationId){const s=operationId?{operations:[{id:operationId,action,status:'confirmed'}]}:await this.state(role);for(const op of s.operations.filter(o=>o.action===action&&!this.seen.has(o.id)&&o.status==='confirmed')){const r=await this.sessions[role].context.request.get(this.sessions[role].config.urls.app+'/api/recording/operations/'+op.id,{maxRetries:3});const proof=await r.json();if(!r.ok())throw Error('Evidence endpoint: '+JSON.stringify(proof));if(!proof.offchain&&!proof.matched)throw Error('Unmatched evidence '+JSON.stringify(proof.transactions.flatMap(t=>t.checks.filter(c=>!c.matched))));this.seen.add(op.id);this.proofs.push(proof);if(this.director){writeFileSync(this.director.dir+'/evidence.json',JSON.stringify(this.proofs,null,2));if(show&&proof.transactions.length)await this.director.proof(proof);this.director.mark('proof',{operationId:op.id,action,hashes:proof.transactions.map(t=>t.hash)});}}}
 async faucet(role){const p=this.sessions[role].page;const wait=p.waitForResponse(r=>r.url().endsWith('/api/faucet'));await p.locator('#wallet-faucet').click();const r=await wait;if(!r.ok())throw Error('Faucet failed');const receipt=await r.json();this.revision++;this.director?.mark('funding',{role,...receipt.result});await sleep(this.director?.record?2000:300);if(this.director?.record&&role==='investor')await this.director.funding([receipt.result.ethHash,receipt.result.usdcHash]);}
 async checkGuidance(role,action,options={}){
  const p=this.sessions[role].page;if(!await p.locator('#guide-panel').count())await p.locator('#guide-launch').click();
  const paused=await p.locator('#guide-panel').innerText();if(paused.includes('引导已暂停'))await p.locator('[data-guide-pause]').click();
  const task=await p.evaluate(({action,role})=>window.RevenueGuide.model().find(t=>t.action===action&&t.role===role.replace(/2$/,'')&&t.status!=='complete'),{action,role});
  if(!task)return;
  await p.locator('.guide-checklist').evaluate(e=>e.open=true);
  await p.locator('[data-guide-task-id]').filter({hasText:task.title}).first().click();
  if(['ready','failed','processing'].includes(task.status)){
   await p.locator('[data-guide-locate]').click();
   try{await p.locator('.driver-popover').waitFor({timeout:7000});}catch{throw Error('Guidance could not locate '+action+': '+await p.locator('#guide-panel').innerText());}
   if(options.proof!==false)await p.screenshot({path:this.sessions[role].config.dir+'/guide-action-'+action+'.png'});
   await p.keyboard.press('Escape');
  }
  this.director?.mark('guidance',{role,action,status:task.status,entity:task.entity});
 }
 async close(){for(const s of Object.values(this.sessions))await s.context.close();}
}
