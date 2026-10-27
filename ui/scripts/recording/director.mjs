import {chromium} from 'playwright';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {labels,root} from './environment.mjs';
export class Director {
 constructor(config,sessions,{record=false}={}){this.c=config;this.sessions=sessions;this.record=record;this.status='running';this.scene={role:'owner',chapter:'01 · 项目与角色',task:'连接钱包',caption:''};this.started=Date.now();this.lastThumb=0;this.lastPreview=0;this.frames={};this.visibleRoles={owner:'owner',agent:'agent',investor:'investor',trustee:'trustee'};this.dir=join(config.dir,'runs',new Date().toISOString().replaceAll(':','-'));mkdirSync(this.dir,{recursive:true});}
 async start(){this.browser=await chromium.launch({headless:process.env.REVENUE_TEST_VISIBLE!=='true'});this.context=await this.browser.newContext({viewport:{width:2560,height:1440},...(this.record?{recordVideo:{dir:join(this.dir,'video'),size:{width:2560,height:1440}}}:{})});this.started=Date.now();this.page=await this.context.newPage();await this.page.goto('file://'+join(root,'ui/scripts/recording/director.html'));this.explorer=await this.context.newPage();await this.explorer.setViewportSize({width:1280,height:1080});await this.explorer.goto(this.c.urls.explorer);this.running=true;this.loop=this.pump();await this.setScene(this.scene);return this;}
 async setScene(scene){if(process.env.REVENUE_RECORDING_WALLET==='rabby')scene=Object.fromEntries(Object.entries(scene).map(([k,v])=>[k,typeof v==='string'?v.replaceAll('MetaMask','Rabby'):v]));this.scene={...this.scene,...scene};const role=this.scene.role;this.visibleRoles[role.replace(/2$/,'')]=role;const address=this.c.wallets[role]?.address||'';await this.page.evaluate(s=>window.setScene(s),{...this.scene,actor:labels[role],address:address.slice(0,8)+'…'+address.slice(-6)});this.mark('scene',this.scene);}
 mark(type,data){appendFileSync(join(this.dir,'timeline.jsonl'),JSON.stringify({seconds:(Date.now()-this.started)/1000,type,...data})+'\n');}
 async capture(key,page){if(!page||page.isClosed())return;let frame;try{frame=await page.screenshot({type:'jpeg',quality:85});}catch(error){if(page.isClosed())return;throw error;}const data='data:image/jpeg;base64,'+frame.toString('base64');await this.page.evaluate(({key,data})=>window.setFrame(key,data),{key,data});}
 async pump(){while(this.running){try{await this.capture(this.scene.role,this.scene.mode==='chain'&&this.proofPage?this.proofPage:this.sessions[this.scene.role]?.page);if(this.wallet&&!this.wallet.isClosed())await this.capture('wallet',this.wallet);if(this.scene.mode==='chain')await this.capture('explorer',this.explorer);if(Date.now()-this.lastThumb>12000){for(const role of Object.values(this.visibleRoles))if(role!==this.scene.role)await this.capture(role,this.sessions[role]?.page);this.lastThumb=Date.now();}if(this.record&&Date.now()-this.lastPreview>15000){await this.shot('preview');this.lastPreview=Date.now();}}catch(e){if(this.running)console.log('Capture:',String(e.message).split('\n')[0]);}await new Promise(r=>setTimeout(r,180));}}
 async walletView(page){this.wallet=page;await this.setScene({mode:page?'wallet':'',proof:page?'真实 MetaMask 扩展 · 请核对账户、网络和操作':'业务状态以确认回执为准'});if(page)await this.capture('wallet',page);}
 async waitForIndex(tx){
  const deadline=Date.now()+60000;
  await this.setScene({mode:'',proof:'链上已确认 · 正在等待 Blockscout 索引当前交易',caption:'链上确认与浏览器索引是两个独立状态。只有当前交易和事件已被索引，才进入并排核对。'});
  while(Date.now()<deadline){
   try{
    const response=await fetch(this.c.urls.explorer+'/api/v2/transactions/'+tx.hash,{signal:AbortSignal.timeout(5000)});
    if(response.ok){
     const data=await response.json();
     const logs=await fetch(this.c.urls.explorer+'/api/v2/transactions/'+tx.hash+'/logs',{signal:AbortSignal.timeout(5000)});
     if(data.hash?.toLowerCase()===tx.hash.toLowerCase()&&Number(data.block_number)===tx.blockNumber&&logs.ok){
      const decoded=(await logs.json()).items||[];
      const expected=tx.events||[];
      if(expected.every(e=>decoded.some(l=>l.address?.hash?.toLowerCase()===e.contract.toLowerCase()&&l.decoded?.method_call?.startsWith(e.name+'('))))return;
     }
    }
   }catch{}
   await new Promise(r=>setTimeout(r,800));
  }
  throw Error('Blockscout has not indexed this exact transaction and its decoded events: '+tx.hash);
 }
 async funding(hashes){
  if(this.proofPage&&!this.proofPage.isClosed())await this.proofPage.close();this.proofPage=null;
  for(const hash of hashes.filter(Boolean)){
   const response=await fetch(this.c.urls.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getTransactionReceipt',params:[hash]})});
   const receipt=(await response.json()).result;
   if(!receipt||receipt.status!=='0x1')throw Error('Faucet receipt not confirmed');
   await this.waitForIndex({hash,blockNumber:Number(receipt.blockNumber),events:[]});
   await this.explorer.goto(this.c.urls.explorer+'/tx/'+hash);
   await this.explorer.getByText(hash,{exact:true}).first().waitFor({timeout:30000});
   await this.explorer.getByText('Success',{exact:true}).first().waitFor({timeout:30000});
   await this.setScene({mode:'chain',proof:'系统水龙头 · '+hash,caption:'测试资金由独立系统账户发放。左侧显示到账余额，右侧显示同一笔测试资金交易。'});
   await this.capture('explorer',this.explorer);await new Promise(r=>setTimeout(r,3500));
  }
  await this.setScene({mode:'',proof:''});
 }
 async proof(evidence){
  const s=this.sessions[this.scene.role];
  if(this.proofPage&&!this.proofPage.isClosed())await this.proofPage.close();
  this.proofPage=await s.context.newPage();
  await this.proofPage.setViewportSize({width:1180,height:1010});
  await this.proofPage.goto(this.c.urls.app+'/app/recording/?operation='+evidence.operationId);
  await this.proofPage.waitForFunction(()=>document.querySelector('#summary h1').textContent!=='读取操作凭证'||document.querySelector('#error').textContent,{timeout:20000});
  const issue=await this.proofPage.locator('#error').innerText();if(issue)throw Error('Evidence view: '+issue);
  for(const tx of evidence.transactions){
   if(!tx.matched)throw Error('Transaction evidence mismatch: '+tx.hash);
   await this.waitForIndex(tx);
   await this.proofPage.reload();
   await this.proofPage.locator(`[data-transaction="${tx.hash}"]`).waitFor({timeout:30000});
   await this.explorer.goto(tx.explorerUrl,{waitUntil:'domcontentloaded'});
   await this.explorer.getByText(tx.hash,{exact:true}).first().waitFor({timeout:30000});
   await this.explorer.getByText('Success',{exact:true}).first().waitFor({timeout:30000});
   const card=this.proofPage.locator(`[data-transaction="${tx.hash}"]`);
   await card.evaluate(e=>e.scrollIntoView({block:'start'}));
   await this.proofPage.getByText(tx.hash,{exact:true}).first().evaluate(e=>{e.style.background='#fff0b3';e.style.padding='8px';});
   await this.explorer.getByText(tx.hash,{exact:true}).first().evaluate(e=>{e.style.background='#fff0b3';e.style.padding='4px';});
   await this.setScene({mode:'chain',proof:`${tx.method} · Block ${tx.blockNumber} · ${tx.hash}`,caption:'左侧业务记录与右侧区块链浏览器对应同一笔交易。请核对交易哈希、发送地址、合约和金额。'});
   await this.capture(this.scene.role,this.proofPage);await this.capture('explorer',this.explorer);
   this.mark('transaction-view',{operationId:evidence.operationId,hash:tx.hash,method:tx.method,phase:'summary'});
   await new Promise(r=>setTimeout(r,this.record?4000:300));
   const preferred={settle:'ProductSettled',approveCase:'ServicingApproved',processRedemptions:'RedemptionFilled',mintFacility:'FacilityMinted'}[tx.method];
   const event=tx.events.find(e=>e.name===preferred&&e.contract.toLowerCase()===tx.to.toLowerCase())||tx.events.filter(e=>e.contract.toLowerCase()===tx.to.toLowerCase()).at(-1)||tx.events.at(-1);
   if(event){
    await this.explorer.getByRole('tab',{name:'Logs',exact:true}).click();
    const decoded=this.explorer.getByText(new RegExp('^'+event.name+'\\(')).first();
    await decoded.waitFor({timeout:20000});
    await decoded.evaluate(e=>{e.style.background='#fff0b3';e.scrollIntoView({block:'start'});});
    const name=card.getByText(event.name,{exact:true}).first();
    await name.evaluate(e=>{e.style.background='#fff0b3';e.scrollIntoView({block:'start'});});
    await this.setScene({proof:`同一交易的事件核对 · ${event.name} · ${tx.hash}`,caption:'左侧解码字段与右侧合约事件逐项对应。金额采用代币的六位整数精度，NFT 编号和证据摘要保持原值。'});
    await this.capture(this.scene.role,this.proofPage);await this.capture('explorer',this.explorer);
    this.mark('transaction-view',{operationId:evidence.operationId,hash:tx.hash,method:tx.method,phase:'events'});
    await new Promise(r=>setTimeout(r,this.record?4500:300));
   }
  }
 }

 async shot(name){await this.page.screenshot({path:join(this.dir,name+'.png')});}
 async close(){this.running=false;await this.loop;await this.shot('last-frame');writeFileSync(join(this.dir,'run.json'),JSON.stringify({stage:this.c.stage,chainId:this.c.chainId,urls:this.c.urls,startedAt:this.started,endedAt:Date.now(),record:this.record,status:this.status},null,2));const mainVideo=this.page.video();await this.context.close();if(mainVideo)writeFileSync(join(this.dir,'main-video.txt'),await mainVideo.path());await this.browser.close();console.log('Recording run:',this.dir);}
}
