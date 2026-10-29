import {chromium} from 'playwright';import{readFileSync,mkdirSync,writeFileSync,existsSync}from'node:fs';import{join}from'node:path';import{randomBytes}from'node:crypto';
import{dir}from'./revenue-base-sepolia.mjs';import{initializeRole}from'../ui/scripts/recording/rabby.mjs';import{BrowserDriver}from'../ui/scripts/recording/rabby-driver.mjs';
const pub=JSON.parse(readFileSync(join(dir,'public.json'))),keys=JSON.parse(readFileSync(process.env.BASE_EXISTING_ROLES_FILE));if(pub.chainId!==84532)throw Error('Wrong chain');
const extension=process.env.BASE_RABBY_EXTENSION;if(!extension||!existsSync(join(extension,'manifest.json')))throw Error('Official local Rabby extension required');
const secret=join(dir,'browser.private.json');if(!existsSync(secret))writeFileSync(secret,JSON.stringify({password:randomBytes(18).toString('base64url')}),{mode:0o600});const password=JSON.parse(readFileSync(secret)).password;
const previous=existsSync(join(dir,"validation/rabby-result.json"))?JSON.parse(readFileSync(join(dir,"validation/rabby-result.json"))).results:[];
const result=[];
for(const role of (process.env.BASE_BROWSER_ROLES||'investor').split(',')){
 const profile=join(dir,'profiles',role);mkdirSync(profile,{recursive:true,mode:0o700});
 const context=await chromium.launchPersistentContext(profile,{headless:true,channel:'chromium',viewport:{width:1600,height:1000},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});context.setDefaultTimeout(20000);
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),extensionId=new URL(worker.url()).host;
  const wallet=await context.newPage();await wallet.goto(`chrome-extension://${extensionId}/index.html`);
  const config={dir,chainId:84532,password,wallets:keys.wallets,urls:{app:pub.app,rpc:pub.rpc,explorer:pub.explorer}};
  const s={role,context,wallet,extensionId,config};await initializeRole(s,{allowImport:true});
  const page=await context.newPage();s.page=page;await page.goto(pub.app+'/app/?lang=en&wallet=rabby');
  const driver=Object.create(BrowserDriver.prototype);driver.sessions={[role]:s};
  await Promise.race([page.locator('[data-wl-role]').first().waitFor({timeout:90000}),page.locator('#nav [data-page]').first().waitFor({timeout:90000})]);
  if(!await page.locator('#nav [data-page]').count()){
  await page.locator(`[data-wl-role="${role.replace(/2$/,'')}"]`).click();await page.locator('[data-wl-connect]').click();
  await driver.pump(role,async()=>await page.locator('#nav [data-page]').count()>0,120000);
  }
  const res=await context.request.get(pub.app+'/api/session/current'),session=await res.json();if(!session.authenticated||session.address.toLowerCase()!==keys.wallets[role].address.toLowerCase())throw Error('Rabby login did not match role');
  await page.keyboard.press('Escape');await page.screenshot({path:join(dir,'validation',`rabby-${role}.en.png`),fullPage:true});
  if(process.env.BASE_BROWSER_TRANSACTIONS==='true'&&role==='investor'){
    await page.keyboard.press('Escape');const collapse=page.locator('[data-guide-collapse]');if(await collapse.count())await collapse.click();
    await page.locator('#nav [data-page="subscribe"]').click();
    const form=page.locator('form[data-action="subscribe"]').first();await form.locator('[name="amountUSDC6"]').fill('1');
    async function submit(action,reject=false){
      let response;const listener=r=>{if(r.url().endsWith('/api/actions')&&r.request().method()==='POST'&&r.request().postDataJSON().action===action)response=r;};page.on('response',listener);
      try{
        driver.rejectOnce=reject;
        const submit=action==='subscribe'?page.locator('form[data-action="subscribe"] button[type=submit], form[data-action="subscribe"] button:not([type])').last():page.locator('form[data-action="refund"] button[type="submit"]').first();
        await submit.click();await driver.pump(role,async()=>!!response||await page.locator('#feedback.error').count()>0,150000);
        if(reject){if(response?.ok())throw Error('Rejected wallet request unexpectedly completed');console.log('PASS real Rabby rejection, no payment');return;}
        if(!response?.ok())throw Error(await page.locator('#feedback').innerText());
        await page.waitForFunction(()=>typeof state!=='undefined'&&state.accounts[actor].subscription.amount===(document.body.dataset.expectedEscrow||'0'),{},{timeout:90000});
        console.log('PASS real Rabby transaction',action);
      }finally{page.off('response',listener);}
    }
    if(await page.locator('form[data-action="refund"] button[type="submit"]').count()){
      await page.evaluate(()=>document.body.dataset.expectedEscrow='0');await submit('refund');await page.locator('form[data-action="subscribe"] [name="amountUSDC6"]').fill('1');
    }
    await submit('subscribe',true);
    await page.waitForTimeout(1000);
    if(Number(await page.locator('form[data-action="subscribe"] [name="amountUSDC6"]').inputValue())!==1)throw Error('Rejected subscription lost the entered amount');
    await page.evaluate(()=>document.body.dataset.expectedEscrow='1000000');
    await submit('subscribe');await page.reload();await page.locator('form[data-action="refund"] button[type="submit"]').first().waitFor({timeout:90000});
    await page.evaluate(()=>document.body.dataset.expectedEscrow='0');await submit('refund');
  }
  if(process.env.BASE_CAPTURE==='true'&&role==='investor'){
    const out=join(dir,'validation/manual-captures');mkdirSync(out,{recursive:true});
    for(const lang of ['en','zh']){
      await page.goto(pub.app+'/app/?lang='+lang+'&wallet=rabby');await page.locator('#nav [data-page]').first().waitFor({timeout:90000});
      const collapse=page.locator('[data-guide-collapse]');if(await collapse.count())await collapse.click();
      await page.locator('#nav [data-page]').first().click();await page.locator('.iv-product-card').first().waitFor({timeout:90000});
      await page.evaluate(()=>{for(const [selector,n] of [['.iv-product-card',1],['.iv-product-card [data-product-target="subscribe"]',2],['#wallet-faucet',3]]){const e=document.querySelector(selector);if(!e)continue;const r=e.getBoundingClientRect(),mark=document.createElement('div');mark.dataset.manualMark='true';mark.textContent=n;Object.assign(mark.style,{position:'fixed',left:Math.max(4,r.left-14)+'px',top:Math.max(4,r.top-12)+'px',width:'28px',height:'28px',borderRadius:'50%',background:'black',color:'white',font:'bold 18px/28px sans-serif',textAlign:'center',zIndex:99999,pointerEvents:'none'});document.body.append(mark);}});
      await page.screenshot({path:join(out,'base-product.'+lang+'.png')});await page.evaluate(()=>document.querySelectorAll('[data-manual-mark]').forEach(e=>e.remove()));
      await page.locator('#nav [data-page="position"]').click();await page.locator('#wallet-faucet').click();await page.locator('dialog[open]').waitFor();await page.screenshot({path:join(out,'base-wallet.'+lang+'.png')});await page.keyboard.press('Escape');
    }
  }
  result.push({role,address:session.address,authenticated:true,extension:'Rabby 0.94.11',headless:true});console.log('PASS real Rabby HTTPS sign-in',role);
 }catch(e){const pages=context.pages();for(let i=0;i<pages.length;i++){const p=pages[i];if(!p.isClosed()&&(!p.url().includes('chrome-extension')||p.url().includes('notification'))){await p.screenshot({path:join(dir,'validation',`rabby-failure-${role}-${i}.png`)});console.log('Public test UI:',(await p.locator('body').innerText()).slice(0,1800));}}throw e;}
 finally{await context.close();}
}
writeFileSync(join(dir,'validation/rabby-result.json'),JSON.stringify({at:new Date().toISOString(),origin:pub.app,results:[...previous.filter(p=>!result.some(r=>r.role===p.role)),...result]},null,2));
