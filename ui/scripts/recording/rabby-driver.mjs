import {BrowserDriver as Base,sleep} from './browser-driver.mjs';
import {launchRole,initializeRole} from './rabby.mjs';
import {roles,labels} from './environment.mjs';
export class BrowserDriver extends Base{
 async start(){
  await this.guardLocalNode();
  for(const role of process.env.REVENUE_GUIDANCE_ISOLATED_QA==='true'?['owner','agent','investor','trustee']:roles){
   const s=await launchRole(this.stage,role,{headless:process.env.REVENUE_TEST_VISIBLE!=='true'});this.sessions[role]=s;await initializeRole(s,{allowImport:process.env.REVENUE_GUIDANCE_ISOLATED_QA==='true'});
   for(const p of s.context.pages())if(p!==s.wallet)await p.close();
   s.page=await s.context.newPage();await this.visit(s.page,s.config.urls.app+'/');this.sessions[role]=s;
  }
  return this;
 }
 async pump(role,until,timeout=90000){
  const s=this.sessions[role],end=Date.now()+timeout;let last='';
  while(Date.now()<end){
   if(await until())return;
   let p=s.context.pages().find(p=>!p.isClosed()&&p.url().includes('notification.html'));
   if(!p)for(const candidate of s.context.pages().filter(q=>!q.isClosed()&&q.url().startsWith('chrome-extension://'))){if((await candidate.locator('body').innerText({timeout:1000}).catch(()=>'' )).includes('Add Custom Network')){p=candidate;break;}}
   if(!p){await sleep(150);continue;}
   try{
    const text=await p.locator('body').innerText();
    if(/Flagged by Rabby\s+Yes|Malicious site|Scam site|Forbidden/i.test(text)){
     await p.screenshot({path:s.config.dir+'/rabby-alert-'+role+'.png'});throw Error('Rabby flagged this domain or request; no malicious warning override accepted');
    }
    if(text!==last){console.log('Rabby:',labels[role],text.includes('Add Custom Network')?'network addition':text.includes('Sign Text')?'login signature':text.includes('Connect to Dapp')?'connection':'transaction confirmation');if(text.includes('Connect to Dapp'))console.log('Connection review:',text);last=text;}
    if(this.rejectOnce){const cancel=p.getByRole('button',{name:/^(Cancel|Reject)$/}).last();if(await cancel.isVisible()){this.rejectOnce=false;await cancel.click();continue;}}
    if(text.includes('Risk Detail') && await p.getByText('Ignore the alert',{exact:true}).isVisible()){
     const detail=text.split('Risk Detail').at(-1);
     // Only ordinary new-demo-site notices are acknowledged. Never dismiss
     // a malicious-domain classification or arbitrary transaction risk.
     if(!/has not been listed on any community platforms|has very low popularity/i.test(detail))throw Error('Rabby notice requires review: '+detail);
     await p.getByText('Ignore the alert',{exact:true}).click();await p.keyboard.press('Escape');continue;
    }
    if(process.env.REVENUE_GUIDANCE_LOCAL_QA==='true'&&text.includes('Ignore all')&&text.includes('Risk Detail')&&!text.includes('Danger')&&/has not been listed on any community platforms|has very low popularity/.test(text)){
     await p.getByText('Ignore all',{exact:true}).click();continue;
    }
    if(process.env.REVENUE_GUIDANCE_LOCAL_QA==='true'&&text.includes('Risk Detail')&&(text.includes('\nUndo')||text.includes('Risk alert have been ignored'))){await p.keyboard.press('Escape');const close=p.locator('.ant-drawer-close:visible,.ant-modal-close:visible').first();if(await close.count())await close.click();continue;}
    const warning=p.locator(process.env.REVENUE_GUIDANCE_LOCAL_QA==='true'?'.security-level-tag.warning:visible,.security-level-tag.danger:visible':'.security-level-tag.warning:visible');
    if(await warning.count()&&!text.includes('Risk alert have been ignored')&&!text.includes('\nUndo')){await warning.first().click();continue;}
    if(text.includes('Connect to Dapp')){
     if(!text.includes(s.config.urls.app))throw Error('Unexpected Rabby connection domain');
     await p.getByRole('button',{name:'Connect',exact:true}).click({timeout:1000});continue;
    }
    if(text.includes('Add Custom Network')){
     const values=await p.locator('input').evaluateAll(es=>es.map(e=>e.value));
     if(process.env.REVENUE_GUIDANCE_ISOLATED_QA==='true'&&this.lastNetworkFields!==JSON.stringify(values)){this.lastNetworkFields=JSON.stringify(values);console.log('Dedicated QA network fields:',p.url(),values);}
     if(!values.includes(String(s.config.chainId))||!values.includes(s.config.urls.rpc)||!values.includes(s.config.urls.explorer)){await sleep(250);continue;}
     await p.getByRole('button',{name:'Add',exact:true}).click();continue;
    }
    const button=p.getByRole('button',{name:/^(Sign|Confirm|Sign and Submit|Sign & Submit)$/}).last();
    if(await button.isVisible()&&await button.isEnabled()){
     await this.director?.walletView(p);if(!this.currentRepeated)await sleep(800);
     if(await until())return;
     await button.click({timeout:2000});await sleep(150);continue;
    }
   }catch(e){if(p.isClosed()||await until())continue;if(e.name==='TimeoutError'){await sleep(150);continue;}throw e;}
   await sleep(200);
  }
  if(process.env.REVENUE_GUIDANCE_LOCAL_QA==='true'){for(const page of s.context.pages()){if(page.url().includes('notification.html')){console.log('Local confirmation timeout screen:',await page.locator('body').innerText());await page.screenshot({path:s.config.dir+'/failure-wallet-'+role+'.png'});}}}
  await s.page.screenshot({path:s.config.dir+'/failure-rabby-'+role+'.png'});
  throw Error('Timed out awaiting Rabby confirmation for '+role);
 }
}
