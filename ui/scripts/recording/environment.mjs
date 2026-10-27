import {readFileSync,writeFileSync,mkdirSync,existsSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Mnemonic,HDNodeWallet} from 'ethers';
export const root=resolve(import.meta.dirname,'../../..');
export const base=join(root,'.data/demo-recording');
export const roles=['owner','agent','investor','investor2','trustee','trustee2'];
export const labels={owner:'业主',agent:'中介机构',investor:'投资者 A',investor2:'投资者 B',trustee:'受托管理人 A',trustee2:'受托管理人 B'};
const guidanceQA=process.env.REVENUE_GUIDANCE_LOCAL_QA==='true';
const isolatedQA=process.env.REVENUE_GUIDANCE_ISOLATED_QA==='true';
if(isolatedQA&&!guidanceQA)throw Error('Isolated QA requires the local guidance guard');
const remoteQA=process.env.REVENUE_REMOTE_QA==='true';
if(guidanceQA&&remoteQA)throw Error('Local guidance tests cannot use remote QA.');
const remoteDir=join(root,'.data/remote-demo');
const remotePublic=remoteQA?JSON.parse(readFileSync(join(remoteDir,'public.json'),'utf8')):null;
export const ports=isolatedQA?{app:4193,explorer:4009,rpc:18555}:guidanceQA?{app:4191,explorer:4008,rpc:18553}:remoteQA?{app:4178,explorer:4004,rpc:18549}:{app:4176,explorer:4002,rpc:18547};
export const chainId=isolatedQA?20261015:guidanceQA?20261014:remoteQA?20261008:20260924;
export const urls=isolatedQA?{app:'http://127.0.0.1:4193',explorer:'http://127.0.0.1:4009',rpc:'http://127.0.0.1:18555'}:guidanceQA?{app:'http://127.0.0.1:4191',explorer:'http://127.0.0.1:4008',rpc:'http://127.0.0.1:18553'}:remoteQA?{app:process.env.REVENUE_REMOTE_QA_LOCAL_LOGIN==='true'?`http://127.0.0.1:${ports.app}`:remotePublic.app,explorer:remotePublic.explorer,rpc:remotePublic.rpc}:{app:`http://127.0.0.1:${ports.app}`,explorer:`http://127.0.0.1:${ports.explorer}`,rpc:`http://127.0.0.1:${ports.rpc}`};
export function config(stage='rehearsal') {
 if(isolatedQA){
  if(stage!=='guidance-isolated')throw Error('Isolated browser QA requires its dedicated stage');
  const dir=join(root,'.data/guidance-isolated-qa');
  return {...JSON.parse(readFileSync(join(dir,'private.json'),'utf8')),dir,stage,urls,chainId};
 }
 if(guidanceQA){
  if(stage!=='guidance-local')throw Error('Guidance QA requires the isolated guidance-local stage');
  const dir=join(root,'.data/guidance-local'),c=JSON.parse(readFileSync(join(dir,'private.json'),'utf8'));
  const net=JSON.parse(readFileSync(join(dir,'public.json'),'utf8'));
  if(net.chainId!==chainId||net.app!==urls.app||net.rpc!==urls.rpc||net.explorer!==urls.explorer)throw Error('Guidance QA only permits fixed local endpoints');
  return {...c,dir,stage,urls,chainId};
 }

 if(remoteQA){
  if(stage!=='remote-qa'||remotePublic.chainId!==20261008)throw Error('Explicit isolated remote-qa stage is required');
  const suffix=process.env.REVENUE_REMOTE_QA_PROFILE||'';
  if(suffix&&!/^[a-z0-9-]{1,40}$/.test(suffix))throw Error('Invalid QA profile suffix');
  const c=JSON.parse(readFileSync(join(remoteDir,'private.json'),'utf8')),dir=join(remoteDir,'browser-qa'+(suffix?'-'+suffix:''));mkdirSync(dir,{recursive:true});
  return {...c,stage,dir,urls,chainId};
 }
 if(!['rehearsal','recording','probe'].includes(stage))throw Error('Unknown recording stage');
 const dir=join(base,stage),file=join(dir,'private.json');mkdirSync(dir,{recursive:true});
 if(!existsSync(file)){
  const mnemonic=Mnemonic.entropyToPhrase(randomBytes(16));
  const wallets=Object.fromEntries(roles.map(role=>{const phrase=Mnemonic.entropyToPhrase(randomBytes(16));return[role,{phrase,address:HDNodeWallet.fromPhrase(phrase).address}]}));
  const project=`deye-demo-${stage}-${Date.now()}`;
  writeFileSync(file,JSON.stringify({project,mnemonic,wallets,password:randomBytes(18).toString('base64url')},null,2),{mode:0o600,flag:'wx'});
 }
 return {...JSON.parse(readFileSync(file,'utf8')),stage,dir,urls,chainId};
}
export function compose(stage){return join(config(stage).dir,'compose.yml');}
export function prepare(stage){
 const c=config(stage),source=join(base,'source/station.json');if(!existsSync(source))throw Error('Verified real station capture is required');
 const capture=JSON.parse(readFileSync(source,'utf8'));if(!capture.capturedAt || !capture.history)throw Error('Invalid capture');
 const infrastructureFile=join(c.dir,'infrastructure.private.json');
  const infrastructure=existsSync(infrastructureFile)?JSON.parse(readFileSync(infrastructureFile,'utf8')):{databasePassword:randomBytes(32).toString('hex'),blockscoutSecret:randomBytes(64).toString('hex')};
  if(!existsSync(infrastructureFile))writeFileSync(infrastructureFile,JSON.stringify(infrastructure),{mode:0o600});
  const env=join(c.dir,'environment.env');
 const system=index=>HDNodeWallet.fromPhrase(c.mnemonic,undefined,`m/44'/60'/0'/0/${index}`).address;
 const accounts={admin:system(0),treasury:system(4),...Object.fromEntries(roles.map(r=>[r,c.wallets[r].address]))};
 writeFileSync(env,[`ANVIL_MNEMONIC=${c.mnemonic}`,`REVENUE_SYSTEM_MNEMONIC=${c.mnemonic}`,...Object.entries(accounts).map(([r,a])=>`REVENUE_${r.toUpperCase()}_ADDRESS=${a}`),`LOCAL_DATABASE_PASSWORD=${infrastructure.databasePassword}`,`LOCAL_BLOCKSCOUT_SECRET=${infrastructure.blockscoutSecret}`,`DEYE_DOCKER_PLATFORM=linux/${process.arch==='arm64'?'arm64':'amd64'}`,'REVENUE_WALLET_REQUIRED=true',`REVENUE_AUTH_DOMAIN=127.0.0.1:${ports.app}`,`REVENUE_ALLOWED_ORIGINS=${urls.app}`,'REVENUE_INITIAL_REPLAY=true','DEYE_REPLAY_FILE=/recording-evidence/station.json','REVENUE_DEMO_RECORDING=true','REVENUE_CHAIN_NAME=Deye RWA Recording'].join('\n')+'\n',{mode:0o600});
 let text=readFileSync(join(root,'infra/revenue-web3/docker-compose.yml'),'utf8');
 text=text.replace('name: deye-rwa-platform',`name: ${c.project||'deye-demo-'+stage}`)
 .replaceAll('20260922',String(chainId)).replaceAll('18545',String(ports.rpc)).replaceAll('4174',String(ports.app)).replaceAll('4000',String(ports.explorer))
 .replaceAll('../../.env.web3.local',env).replaceAll('../../.env.revenue',env)
 .replace('context: ../..',`context: ${root}`).replaceAll('./rpc-gateway.mjs',join(root,'infra/revenue-web3/rpc-gateway.mjs'))
 .replaceAll('./explorer-nginx.conf',join(c.dir,'explorer-nginx.conf'))
 .replace('REVENUE_AUTO_SYNC_STATION_ID: ${REVENUE_AUTO_SYNC_STATION_ID:-}','REVENUE_AUTO_SYNC_STATION_ID: ""')
 .replace(`      - ${env}:/app/.env.revenue:ro`,`      - ${env}:/app/.env.revenue:ro\n      - ${join(base,'source')}:/recording-evidence:ro\n      - ${join(root,'ui/src/revenue')}:/app/ui/src/revenue:ro\n      - ${join(root,'ui/public/revenue')}:/app/ui/public/revenue:ro`)
 .replaceAll('Deye RWA Local','Deye RWA Recording')
 .replace('      NEXT_PUBLIC_IS_TESTNET:', '      NEXT_PUBLIC_AD_BANNER_PROVIDER: none\n      NEXT_PUBLIC_AD_TEXT_PROVIDER: none\n      NEXT_PUBLIC_IS_TESTNET:');
 // All internal explorer ports also move, including nginx upstreams.
 writeFileSync(join(c.dir,'explorer-nginx.conf'),readFileSync(join(root,'infra/revenue-web3/explorer-nginx.conf'),'utf8').replaceAll('4000',String(ports.explorer)));
 writeFileSync(compose(stage),text,{mode:0o600});
 writeFileSync(join(c.dir,'public-environment.json'),JSON.stringify({stage,chainId,urls,accounts,capture:{capturedAt:capture.capturedAt,sha256:createHash('sha256').update(readFileSync(source)).digest('hex')}},null,2));
 console.log(`Prepared ${stage}: ${urls.app}; ${urls.explorer}; chain ${chainId}. Private wallet material is excluded from output.`);
}
export function docker(stage,args){const result=spawnSync('docker-compose',['--env-file',join(config(stage).dir,'environment.env'),'-f',compose(stage),...args],{cwd:root,stdio:'inherit'});if(result.status!==0)throw Error('Recording compose command failed');}
export async function health(stage='rehearsal'){const c=config(stage);for(const [name,url] of [['application',urls.app+'/api/network'],['explorer',urls.explorer+'/api/v2/stats']]){const r=await fetch(url,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error(`${name}: ${r.status}`);const data=await r.json();if(name==='application'&&(data.chainId!==chainId||data.roleAddresses.owner[0].toLowerCase()!==c.wallets.owner.address.toLowerCase()))throw Error('Wrong recording stage or chain');console.log(`OK ${name}`);}}
