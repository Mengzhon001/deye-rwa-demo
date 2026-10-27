/** Starts a disposable chain and app. Never connects to the shared local/public chain. */
import {existsSync,mkdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {Mnemonic,HDNodeWallet} from 'ethers';
if(process.env.REVENUE_REMOTE_QA==='true'||process.env.REVENUE_REMOTE_PROJECT)throw Error('Public deployment flags are forbidden for isolated QA');
const root=process.cwd(),dir=root+'/.data/guidance-isolated-qa';
mkdirSync(dir,{recursive:true,mode:0o700});
if(existsSync(dir+'/store/store.json'))throw Error('Archive the dedicated isolated QA directory before another clean walkthrough; existing records are never reset automatically');
for(const port of [4193,18555])await new Promise((ok,no)=>{const s=createServer();s.once('error',no);s.listen(port,'127.0.0.1',()=>s.close(ok));});
const roles=['owner','agent','investor','investor2','trustee','trustee2'];
const c=existsSync(dir+'/private.json')?JSON.parse(readFileSync(dir+'/private.json')):{mnemonic:Mnemonic.entropyToPhrase(randomBytes(16)),password:randomBytes(18).toString('base64url'),wallets:Object.fromEntries(roles.map(r=>{const phrase=Mnemonic.entropyToPhrase(randomBytes(16));return[r,{phrase,address:HDNodeWallet.fromPhrase(phrase).address}]}))};
writeFileSync(dir+'/private.json',JSON.stringify(c),{mode:0o600});writeFileSync(dir+'/empty.env','',{mode:0o600});
const env={...process.env,HARDHAT_NETWORK:'revenue',HARDHAT_CONFIG:root+'/onchain/hardhat.config.ts',REVENUE_CHAIN_ID:'20261015',REVENUE_RPC_URL:'http://127.0.0.1:18555',REVENUE_PUBLIC_RPC_URL:'http://127.0.0.1:18555',REVENUE_EXPLORER_URL:'http://127.0.0.1:4009',REVENUE_SYSTEM_MNEMONIC:c.mnemonic,REVENUE_PORT:'4193',REVENUE_DATA_DIR:dir+'/store',REVENUE_ENV_FILE:dir+'/empty.env',REVENUE_ALLOWED_ORIGINS:'http://127.0.0.1:4193',REVENUE_AUTH_DOMAIN:'127.0.0.1:4193',REVENUE_WALLET_REQUIRED:'true',REVENUE_GUIDANCE_ENABLED:'true',REVENUE_INITIAL_REPLAY:'true',DEYE_REPLAY_FILE:root+'/.data/demo-recording/source/station.json',REVENUE_AUTO_SYNC_STATION_ID:'',REVENUE_MONITOR_LIVE:'false',REVENUE_AUTO_VERIFY:'false',REVENUE_DEMO_RECORDING:'true',REVENUE_DISTRIBUTION_INTERVAL_MONTHS:'1',REVENUE_GUIDANCE_LOCAL_QA:'true',REVENUE_GUIDANCE_ISOLATED_QA:'true',REVENUE_TEST_VISIBLE:'false',PLAYWRIGHT_BROWSERS_PATH:root+'/.data/playwright-browsers'};
for(const [r,w] of Object.entries(c.wallets))env['REVENUE_'+r.toUpperCase()+'_ADDRESS']=w.address;
const children=[];
function run(cmd,args,file,extra={}){const p=spawn(cmd,args,{cwd:root,env,...extra});children.push(p);let log='';p.stdout?.on('data',b=>{log+=b;writeFileSync(dir+'/'+file,log,{mode:0o600});});p.stderr?.on('data',b=>{log+=b;writeFileSync(dir+'/'+file,log,{mode:0o600});});return p;}
async function wait(url){for(let i=0;i<120;i++){try{const r=await fetch(url,{...(url.endsWith(':18555')?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})}:{}),signal:AbortSignal.timeout(2000)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Dedicated QA service failed: '+url);}
try{
 run(join(homedir(),'.foundry/bin/anvil'),['--host','127.0.0.1','--port','18555','--chain-id','20261015','--mnemonic',c.mnemonic,'--state',dir+'/chain-state.json','--silent'],'node.log');
 await wait('http://127.0.0.1:18555');
 run(process.execPath,['--import','tsx',root+'/ui/src/revenue/server.ts'],'server.log');await wait('http://127.0.0.1:4193/api/network');
 const test=run(process.execPath,['ui/scripts/test-guidance-isolated-browser.mjs'],'browser.log',{stdio:'inherit'});
 const code=await new Promise(r=>test.on('exit',r));if(code!==0)throw Error('Actual Rabby browser walkthrough failed');
}finally{for(const p of children.reverse())if(p.exitCode===null)p.kill('SIGTERM');if(existsSync(dir+'/chain-state.json'))chmodSync(dir+'/chain-state.json',0o600);}
