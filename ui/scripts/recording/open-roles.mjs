import {existsSync} from 'node:fs';
import {join} from 'node:path';
const {launchRole,initializeRole}=await import(process.env.REVENUE_RECORDING_WALLET==='rabby'?'./rabby.mjs':'./metamask.mjs');
import {config,roles,labels,health} from './environment.mjs';

const stage=process.argv[2]||'recording',requested=process.argv.slice(3).filter(a=>a!=='--login');
const autoLogin=process.argv.includes('--login');
const driver=autoLogin?new (await import(process.env.REVENUE_RECORDING_WALLET==='rabby'?'./rabby-driver.mjs':'./browser-driver.mjs')).BrowserDriver(stage):null;
const selected=requested.length?requested:roles,c=config(stage);
if(selected.some(r=>!roles.includes(r)))throw Error('Roles: '+roles.join(', '));
await health(stage);
for(const role of selected)if(!existsSync(join(c.dir,'profiles',...(process.env.REVENUE_RECORDING_WALLET==='rabby'?['rabby']:[]),role,'Default')))throw Error('Initialize local test wallets before reopening profiles');
const sessions=[];
async function close(){await Promise.all(sessions.map(s=>s.context.close()));}
process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
try{
 for(const role of selected){
  const s=await launchRole(stage,role,{headless:false});sessions.push(s);
  await initializeRole(s);
  const app=await s.context.newPage();s.page=app;await app.goto(c.urls.app+'/app/'+(process.env.REVENUE_RECORDING_WALLET==='rabby'?'?wallet=rabby':''));
  if(driver){driver.sessions[role]=s;await driver.login(role);}
  await app.evaluate(label=>{document.title=label+' · Deye RWA';},labels[role]);
  console.log('Opened '+labels[role]+' '+c.wallets[role].address+(autoLogin?' with real-wallet login.':'. Sign in manually if the session has expired.'));
 }
 console.log('These are isolated local test profiles. No business action is automated. Close all windows or press Ctrl+C to finish.');
 await Promise.all(sessions.map(s=>new Promise(resolve=>s.context.once('close',resolve))));
}catch{await close();throw Error('Could not reopen the selected local profiles. Stop any recorder using them first. Private details omitted.');}
