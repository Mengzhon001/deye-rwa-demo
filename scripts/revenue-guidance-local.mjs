#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,cpSync,chmodSync,openSync,closeSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {Mnemonic,HDNodeWallet} from 'ethers';
const require=createRequire(import.meta.url),yaml=require('js-yaml');
export const root=resolve(import.meta.dirname,'..'),dir=join(root,'.data/guidance-local');
export const chainId=20261014,ports={app:4191,explorer:4008,rpc:18553},project='deye-guidance-local';
export const urls={app:'http://127.0.0.1:4191',explorer:'http://127.0.0.1:4008',rpc:'http://127.0.0.1:18553'};
const roles=['owner','agent','investor','investor2','trustee','trustee2'];
export function guard(settings={chainId,...urls}){
 if(process.env.REVENUE_REMOTE_QA==='true'||process.env.REVENUE_REMOTE_PROJECT)throw Error('Remote test flags are forbidden for guidance-local.');
 if(settings.chainId!==chainId)throw Error('Guidance tests require their own chain.');
 for(const name of Object.keys(urls))if(settings[name]!==urls[name])throw Error('Guidance tests require the fixed loopback endpoints.');
}
function run(cmd,args,options={}){const p=spawnSync(cmd,args,{cwd:root,stdio:'inherit',...options});if(p.error||p.status!==0)throw p.error||Error(cmd+' failed');return p.stdout;}
export function compose(c){
 const d=yaml.load(readFileSync(join(root,'infra/revenue-web3/docker-compose.yml'),'utf8'));d.name=project;const s=d.services,env=join(dir,'environment.env');
 s.anvil.env_file=[env];s.anvil.command=s.anvil.command.map(x=>x.replaceAll('20260922',String(chainId)));
 s.anvil.entrypoint=['sh','/state-tools/guidance-anvil.sh'];s.anvil.command=[];s.anvil.volumes=['anvil-data:/data',join(root,'infra/revenue-web3/guidance-anvil.sh')+':/state-tools/guidance-anvil.sh:ro'];
 s['state-keeper']={image:'node:22.19.0-alpine3.22',restart:'unless-stopped',command:['node','/state-tools/guidance-state.mjs'],environment:{STATE_CHAIN_ID:String(chainId),STATE_RPC:'http://anvil:8545'},volumes:['anvil-data:/data',join(root,'infra/revenue-web3/guidance-state.mjs')+':/state-tools/guidance-state.mjs:ro'],depends_on:{anvil:{condition:'service_healthy'}},healthcheck:{test:['CMD','node','-e',"fetch('http://127.0.0.1:8765/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],interval:'3s',timeout:'10s',retries:30}};

 s['rpc-gateway'].ports=[`127.0.0.1:${ports.rpc}:8545`];s['rpc-gateway'].volumes=[join(root,'infra/revenue-web3/rpc-gateway.mjs')+':/gateway/rpc-gateway.mjs:ro'];s['rpc-gateway'].environment.RPC_ALLOWED_ORIGINS=urls.app+','+urls.explorer;
 s.postgres.environment.POSTGRES_PASSWORD='${GUIDANCE_DATABASE_PASSWORD}';s.blockscout.environment.DATABASE_URL='postgresql://blockscout:${GUIDANCE_DATABASE_PASSWORD}@postgres:5432/blockscout?ssl=false';s.blockscout.environment.SECRET_KEY_BASE='${GUIDANCE_BLOCKSCOUT_SECRET}';s.blockscout.environment.CHAIN_ID=String(chainId);s.blockscout.environment.NETWORK='Deye Guidance Local';
 const fe=s['blockscout-frontend'].environment;
 Object.assign(fe,{NEXT_PUBLIC_APP_HOST:'127.0.0.1',NEXT_PUBLIC_APP_PORT:String(ports.explorer),NEXT_PUBLIC_APP_PROTOCOL:'http',NEXT_PUBLIC_API_HOST:'127.0.0.1',NEXT_PUBLIC_API_PORT:String(ports.explorer),NEXT_PUBLIC_API_PROTOCOL:'http',NEXT_PUBLIC_API_WEBSOCKET_PROTOCOL:'ws',NEXT_PUBLIC_NETWORK_ID:String(chainId),NEXT_PUBLIC_NETWORK_RPC_URL:urls.rpc,NEXT_PUBLIC_NETWORK_NAME:'Deye Guidance Local',NEXT_PUBLIC_AD_BANNER_PROVIDER:'none',NEXT_PUBLIC_AD_TEXT_PROVIDER:'none'});
 s.explorer.ports=[`127.0.0.1:${ports.explorer}:4000`];s.explorer.volumes=[join(root,'infra/revenue-web3/explorer-nginx.conf')+':/etc/nginx/conf.d/default.conf:ro'];
 s.app.build.context=root;s.app.build.dockerfile='infra/revenue-web3/guidance.Dockerfile';s.app.image='deye-rwa-guidance-app:local';s.app.env_file=[env];s.app.ports=[`127.0.0.1:${ports.app}:${ports.app}`];
 Object.assign(s.app.environment,{REVENUE_CHAIN_ID:String(chainId),REVENUE_CHAIN_NAME:'Deye Guidance Local',REVENUE_PORT:String(ports.app),REVENUE_PUBLIC_RPC_URL:urls.rpc,REVENUE_EXPLORER_URL:urls.explorer,REVENUE_DATA_DIR:'/data/guidance-local',REVENUE_ENV_FILE:'/app/.env.guidance',REVENUE_AUTO_SYNC_STATION_ID:'',REVENUE_GUIDANCE_ENABLED:'true',REVENUE_HOUSEHOLD_PAYMENTS_ENABLED:'true',REVENUE_DISTRIBUTION_INTERVAL_MONTHS:'1',REVENUE_MONITOR_LIVE:'false',REVENUE_INITIAL_REPLAY:'true',DEYE_REPLAY_FILE:'/guidance-evidence/station.json',DEYE_CREDENTIALS_FILE:'',REVENUE_DEMO_RECORDING:'true',REVENUE_SECURE_COOKIES:'false',REVENUE_AUTH_DOMAIN:'127.0.0.1:4191',REVENUE_ALLOWED_ORIGINS:urls.app});
 s.app.environment.REVENUE_STATE_CHECKPOINT_URL='http://state-keeper:8765/checkpoint';s.app.depends_on['state-keeper']={condition:'service_healthy'};
 s.app.healthcheck={test:['CMD','node','-e',`fetch('http://127.0.0.1:${ports.app}/api/network').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))`],interval:'15s',timeout:'10s',retries:20,start_period:'60s'};
 s.app.volumes=['revenue-app-data:/data/guidance-local',env+':/app/.env.guidance:ro',join(dir,'evidence')+':/guidance-evidence:ro'];
 for(const service of Object.values(s))service.logging={driver:'json-file',options:{'max-size':'10m','max-file':'3'}};
 return d;
}
export function init(){
 guard();mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);const path=join(dir,'private.json');
 if(!existsSync(path)){const phrase=()=>Mnemonic.entropyToPhrase(randomBytes(16));writeFileSync(path,JSON.stringify({mnemonic:phrase(),wallets:Object.fromEntries(roles.map(r=>{const p=phrase();return[r,{phrase:p,address:HDNodeWallet.fromPhrase(p).address}];})),password:randomBytes(24).toString('base64url'),databasePassword:randomBytes(24).toString('hex'),blockscoutSecret:randomBytes(64).toString('hex')},null,2),{mode:0o600,flag:'wx'});}
 const c=JSON.parse(readFileSync(path)),system=i=>HDNodeWallet.fromPhrase(c.mnemonic,undefined,`m/44'/60'/0'/0/${i}`).address;
 const accounts={admin:system(0),treasury:system(4),...Object.fromEntries(roles.map(r=>[r,c.wallets[r].address]))};
 const env=[`ANVIL_MNEMONIC=${c.mnemonic}`,`REVENUE_SYSTEM_MNEMONIC=${c.mnemonic}`,...Object.entries(accounts).map(([r,v])=>`REVENUE_${r.toUpperCase()}_ADDRESS=${v}`),`GUIDANCE_DATABASE_PASSWORD=${c.databasePassword}`,`GUIDANCE_BLOCKSCOUT_SECRET=${c.blockscoutSecret}`,'REVENUE_WALLET_REQUIRED=true','REVENUE_GUIDANCE_ENABLED=true','REVENUE_MONITOR_LIVE=false','DEYE_CREDENTIALS_FILE='];
 writeFileSync(join(dir,'environment.env'),env.join('\n')+'\n',{mode:0o600});
 mkdirSync(join(dir,'evidence'),{recursive:true,mode:0o700});const capture=join(root,'.data/demo-recording/source/station.json');if(!existsSync(capture))throw Error('Local recorded evidence is required. No live API fallback is permitted.');
 if(!existsSync(join(dir,'evidence/station.json')))cpSync(capture,join(dir,'evidence/station.json'));chmodSync(join(dir,'evidence/station.json'),0o600);
 writeFileSync(join(dir,'compose.json'),JSON.stringify(compose(c),null,2),{mode:0o600});writeFileSync(join(dir,'public.json'),JSON.stringify({chainId,...urls,accounts},null,2),{mode:0o600});
 writeFileSync(join(dir,'wallet-import.private.json'),JSON.stringify(Object.fromEntries(roles.map(r=>[r,{address:c.wallets[r].address,privateKey:HDNodeWallet.fromPhrase(c.wallets[r].phrase).privateKey}])),null,2),{mode:0o600});
 console.log('Prepared isolated local guidance configuration. Keys are only in .data/guidance-local/wallet-import.private.json.');
}
async function health(){guard();for(const [name,url]of [['app',urls.app+'/api/network'],['explorer',urls.explorer+'/api/v2/stats']]){const r=await fetch(url,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error(name+' unavailable');const data=await r.json();if(name==='app'&&(data.chainId!==chainId||!data.guidanceEnabled||data.rpcUrl!==urls.rpc))throw Error('Wrong local guidance environment');console.log('OK '+name);}const r=await fetch(urls.rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});if((await r.json()).result!=='0x'+chainId.toString(16))throw Error('Wrong local chain');console.log('OK loopback chain');}
function assertLocalCompose(){
 const d=JSON.parse(readFileSync(join(dir,'compose.json'),'utf8'));
 if(d.name!==project||d.services.app.environment.REVENUE_CHAIN_ID!==String(chainId))throw Error('Refusing non-guidance compose project');
 if(Object.values(d.volumes||{}).some(v=>v?.external||v?.name))throw Error('Refusing externally named volumes');
}
export async function archive(){
 guard();assertLocalCompose();await health();
 const destination=join(dir,'archives',new Date().toISOString().replaceAll(':','-'));mkdirSync(destination,{recursive:true,mode:0o700});
 // Quiesce the two local writers before copying Anvil's periodically rewritten state file.
 run('docker',['stop',project+'-app-1']);
 run('docker',['stop',project+'-state-keeper-1']);
 run('docker',['stop',project+'-anvil-1']);
 try{
  run('docker',['cp',project+'-app-1:/data/guidance-local',join(destination,'application')]);
  run('docker',['cp',project+'-anvil-1:/data/state.json',join(destination,'chain-state.json')]);
  const descriptor=openSync(join(destination,'blockscout.sql'),'w',0o600);
  try{run('docker',['exec',project+'-postgres-1','pg_dump','-U','blockscout','blockscout'],{stdio:['ignore',descriptor,'inherit']});}finally{closeSync(descriptor);}
 }finally{run('docker',['start',project+'-anvil-1',project+'-state-keeper-1',project+'-app-1']);}
 for(const file of ['public.json','progress.json','experience-product.json'])if(existsSync(join(dir,file)))cpSync(join(dir,file),join(destination,file));
 writeFileSync(join(destination,'archive.json'),JSON.stringify({project,chainId,urls,at:new Date().toISOString(),scope:'Only the dedicated local guidance environment'},null,2),{mode:0o600});
 console.log('Archived only local guidance state at '+destination);return destination;
}
async function fresh(){
 const destination=await archive();
 run('docker-compose',['-p',project,'--env-file',join(dir,'environment.env'),'-f',join(dir,'compose.json'),'down','--volumes']);
 for(const name of ['profiles','progress.json','experience-product.json'])if(existsSync(join(dir,name)))renameSync(join(dir,name),join(destination,'previous-'+name));
 console.log('Dedicated guidance test chain cleared after archiving. Run guidance:up and guidance:provision. Other environments were not changed.');
}
async function main(){guard();const command=process.argv[2]||'status';if(command==='init')return init();if(command==='health')return health();if(command==='archive')return archive();if(command==='fresh')return fresh();if(!existsSync(join(dir,'compose.json')))throw Error('Run guidance:init first.');if(command==='up'){
 const p=spawnSync('docker',['ps','--filter','label=com.docker.compose.project='+project,'--format','{{.ID}}'],{encoding:'utf8'});if(p.status!==0)throw Error('Docker is unavailable');if(!p.stdout.trim())for(const port of Object.values(ports))await new Promise((ok,no)=>{const s=createServer();s.once('error',()=>no(Error('Port '+port+' is occupied; existing services will not be reused.')));s.listen(port,'127.0.0.1',()=>s.close(ok));});
 }
 if(command==='up'){assertLocalCompose();const cached=spawnSync('docker',['image','inspect','deye-rwa-guidance-app:local'],{stdio:'ignore'}).status===0;run('docker-compose',['-p',project,'--env-file',join(dir,'environment.env'),'-f',join(dir,'compose.json'),'build',...(cached?['--build-arg','GUIDANCE_BASE_IMAGE=deye-rwa-guidance-app:local']:[]),'app']);}
 const args=command==='up'?['up','-d','--no-build','--wait','--wait-timeout','360']:command==='down'?['down']:command==='status'?['ps']:command==='logs'?['logs','--tail','60']:null;
 if(!args)throw Error('Commands: init, up, down, status, health, logs');assertLocalCompose();run('docker-compose',['-p',project,'--env-file',join(dir,'environment.env'),'-f',join(dir,'compose.json'),...args]);}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname)main().catch(e=>{console.error(e.message);process.exitCode=1;});
