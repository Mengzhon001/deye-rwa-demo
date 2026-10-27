import {chromium} from 'playwright';
import {join} from 'node:path';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {HDNodeWallet} from 'ethers';
import {config,root,roles,labels} from './environment.mjs';
export async function launchRole(stage,role,{headless=true}={}){
 const c=config(stage),profile=join(c.dir,'profiles/rabby',role),extension=join(root,'.data/remote-demo/tools/rabby-0.94.11');
 if(!existsSync(join(extension,'manifest.json')))throw Error('Install the verified official Rabby release first');
 mkdirSync(profile,{recursive:true,mode:0o700});
 const context=await chromium.launchPersistentContext(profile,{headless,channel:'chromium',reducedMotion:headless?'reduce':'no-preference',viewport:{width:1440,height:950},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 context.setDefaultTimeout(12000);
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const extensionId=new URL(worker.url()).host;
 const wallet=await context.newPage();await wallet.goto(`chrome-extension://${extensionId}/index.html`);
 await wallet.waitForTimeout(400);
 return {context,wallet,extensionId,role,config:c,profile};
}
export async function initializeRole(s,{allowImport=false}={}){
 try{
  const p=s.wallet;
  await p.waitForURL(/#\/(unlock|dashboard)/,{timeout:5000}).catch(()=>{});
  if(p.url().includes('/unlock')){
   await p.locator('input[type=password]').fill(s.config.password);await p.getByRole('button',{name:'Unlock',exact:true}).click();
   await p.waitForURL(/#\/dashboard/,{timeout:12000});
  }
  await p.waitForTimeout(300);
  if(p.url().includes('/dashboard'))return;
  if(!allowImport)throw Error('Private onboarding must be completed before visible testing');
  await p.goto(`chrome-extension://${s.extensionId}/index.html#/new-user/guide`);
  await p.getByText('I already have an address',{exact:true}).click();
  await p.getByText('Seed Phrase or Private Key',{exact:true}).click();
  await p.getByText('Private Key',{exact:true}).click();
  await p.getByPlaceholder('Input private key',{exact:true}).fill(HDNodeWallet.fromPhrase(s.config.wallets[s.role].phrase).privateKey);
  await p.getByRole('button',{name:'Next',exact:true}).click();
  await p.getByPlaceholder('Password (8 characters min)',{exact:true}).waitFor();
  for(const f of await p.locator('input[type=password]').all())await f.fill(s.config.password);
  await p.getByRole('button',{name:'Confirm',exact:true}).click();
  await p.getByRole('button',{name:'Open Wallet',exact:true}).waitFor();
  await p.goto(`chrome-extension://${s.extensionId}/index.html#/dashboard`);
  await p.waitForTimeout(200);
 }catch{throw Error('Rabby private setup failed for '+s.role+'; secret inputs and details omitted');}
}
if(process.argv[1]?.endsWith('/rabby.mjs')){
 if(process.argv[2]!=='setup')throw Error('Use setup to initialize isolated wallets privately');
 for(const role of roles){const s=await launchRole(process.env.REVENUE_GUIDANCE_LOCAL_QA==='true'?'guidance-local':'remote-qa',role);try{await initializeRole(s,{allowImport:true});console.log('Prepared isolated Rabby test wallet:',labels[role],s.config.wallets[role].address);}finally{await s.context.close();}}
}
