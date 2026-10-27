import {chromium} from 'playwright';
import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
import {config,base,labels} from './environment.mjs';
export async function launchRole(stage,role,{recordVideo,headless=true}={}) {
 const c=config(stage),profile=join(c.dir,'profiles',role),extension=join(base,'tools/metamask-13.49.0');
 mkdirSync(profile,{recursive:true});
 const context=await chromium.launchPersistentContext(profile,{headless,channel:'chromium',viewport:{width:1440,height:900},recordVideo,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 context.setDefaultTimeout(12000);
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const extensionId=worker.url().split('/')[2];
 let wallet=context.pages().find(p=>p.url().startsWith('chrome-extension:'));
 if(!wallet){wallet=await context.newPage();await wallet.goto(`chrome-extension://${extensionId}/home.html`);}
 await wallet.waitForLoadState();
 return {context,wallet,extensionId,role,config:c,profile};
}
async function initializeRolePrivate(session) {
 const {wallet:page,config:c,role}=session;
 for(let i=0;i<120;i++) {
  await page.waitForTimeout(400);
  const url=page.url();
  const screen=await page.locator('body').innerText();if(!screen.trim())continue;
  if(url.includes('onboarding/welcome')){
   const existing=page.getByRole('button',{name:'I have an existing wallet'});
   if(await existing.isVisible()){await existing.click();continue;}
   await page.getByRole('button',{name:'Import using Secret Recovery Phrase'}).click();continue;
  }
  if(url.includes('import-with-recovery-phrase')) {
   // Setup is intentionally never recorded, photographed, traced or logged.
   const words=c.wallets[role].phrase.split(' ');
   await page.getByTestId('srp-input-import__srp-note').fill(words[0]);
   await page.getByTestId('srp-input-import__srp-note').press('Space');
   for(let word=1;word<words.length;word++){
     const field=page.getByTestId(`import-srp__srp-word-${word}`);
     await field.fill(words[word]);
     if(word<words.length-1)await field.press('Space');
     else await field.press('Tab');
   }
   await page.getByRole('button',{name:'Continue',exact:true}).click();
   await page.waitForTimeout(600);continue;
  }
  if(url.includes('create-password')){
   const inputs=page.locator('input[type="password"]');
   for(const input of await inputs.all())await input.fill(c.password);
   for(const checkbox of await page.getByRole('checkbox').all())if(!await checkbox.isChecked())await checkbox.check();
   const buttons=await page.getByRole('button').all();let acted=false;
   for(const button of buttons){if(/create|import|continue/i.test(await button.innerText())&&await button.isEnabled()){await button.click();acted=true;break;}}
   if(!acted)throw Error('MetaMask password screen requires inspection');
   await page.waitForTimeout(1200);continue;
  }
  if(url.includes('unlock')){
   await page.locator('input[type="password"]').fill(c.password);await page.getByRole('button',{name:'Unlock',exact:true}).click();continue;
  }
  const text=await page.locator('body').innerText();
  if(/Help us improve MetaMask|Help improve MetaMask/.test(text)){
   const no=page.getByRole('button',{name:/No thanks|I don.t agree/});
   if(await no.isVisible()){await no.click();continue;}
  }
  const skip=page.getByRole('button',{name:/^(Skip|Not now|Maybe later|Open wallet|No thanks|Done|Got it|Continue|Get started)$/i}).first();
  if(await skip.isVisible()){try{await skip.click({timeout:4000});}catch(e){if(url.includes('/completion'))await page.goto('chrome-extension://'+session.extensionId+'/home.html');else throw e;}continue;}
  if(!url.includes('onboarding')&&await page.getByRole('button',{name:/Account/}).first().count()){
   console.log(`MetaMask initialized: ${labels[role]} ${c.wallets[role].address}`);return;
  }
  // No input values or recovery words are included in inspection logs.
  console.log('MetaMask setup screen requires a handler; contents intentionally omitted.');
  throw Error('MetaMask setup screen needs a handler');
 }
 throw Error('MetaMask setup exceeded expected stages');
}

export async function initializeRole(session){
 try{return await initializeRolePrivate(session);}catch{
  // Playwright input errors can include the filled value. Never propagate a
  // setup error containing a recovery phrase or password into run logs.
  throw Error('MetaMask initialization failed for '+session.role+'; private setup details omitted.');
 }
}
