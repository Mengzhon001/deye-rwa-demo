#!/usr/bin/env node
/** Isolated Base Sepolia Oracle test. Never changes an existing chain or store. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,cpSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {HDNodeWallet,Wallet,JsonRpcProvider,Contract} from 'ethers';

const root=resolve(import.meta.dirname,'..');
const dataRoot=existsSync(join(root,'.data/base-sepolia-test/environment.env'))?root:resolve(root,'../..');
const dir=resolve(process.env.ORACLE_SEPOLIA_DATA_DIR||join(dataRoot,'.data/oracle-base-sepolia'));
const baseDir=resolve(process.env.BASE_SEPOLIA_DATA_DIR||join(dataRoot,'.data/base-sepolia-test'));
const port=4198,project='deye-oracle-base-sepolia',chainId=84532;
const usdc='0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const localApp=`http://127.0.0.1:${port}`;
const explorer='https://base-sepolia.blockscout.com';
const envPath=join(dir,'environment.env');
const loadEnv=file=>Object.fromEntries(readFileSync(file,'utf8').trim().split('\n').map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
const save=(file,value)=>{mkdirSync(resolve(file,'..'),{recursive:true,mode:0o700});writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode:0o600});};
const env=()=>loadEnv(envPath);
function run(bin,args,options={}){const r=spawnSync(bin,args,{cwd:root,stdio:'inherit',...options});if(r.error||r.status!==0)throw r.error||Error(`${bin} failed`);}
function assertCompose(){const c=JSON.parse(readFileSync(join(dir,'compose.json'),'utf8'));if(c.name!==project||Object.keys(c.services).join()!=='app'||c.services.app.environment.REVENUE_CHAIN_ID!=='84532'||c.services.app.ports[0]!==`127.0.0.1:${port}:${port}`)throw Error('Refusing unrelated compose configuration');}
function compose(){
  save(join(dir,'compose.json'),{name:project,services:{app:{image:'deye-rwa-oracle-sepolia-app:local',build:{context:root,dockerfile:'infra/base-sepolia/app.Dockerfile',args:{BASE_APP_IMAGE:process.env.BASE_APP_IMAGE||'node:22.19.0-alpine3.22'}},restart:'unless-stopped',env_file:[envPath],environment:{REVENUE_HOST:'0.0.0.0',REVENUE_CHAIN_ID:'84532',REVENUE_PORT:String(port),REVENUE_DATA_DIR:'/data/application',REVENUE_ORACLE_STATUS_FILE:'/oracle/status.json',DEYE_REPLAY_FILE:'/evidence/station.json',HARDHAT_NETWORK:'revenue'},ports:[`127.0.0.1:${port}:${port}`],volumes:[join(dir,'application')+':/data/application',join(dir,'evidence')+':/evidence:ro',join(dir,'oracle/status.json')+':/oracle/status.json:ro'],healthcheck:{test:['CMD','node','-e',`fetch('http://127.0.0.1:${port}/api/network').then(async r=>{const j=await r.json();if(!r.ok||j.chainId!==84532||j.environmentId!=='oracle-base-sepolia'||!j.oracleMode)process.exit(1)}).catch(()=>process.exit(1))`],interval:'30s',timeout:'15s',retries:10,start_period:'120s'},logging:{driver:'json-file',options:{'max-size':'10m','max-file':'3'}}}}});
}
async function init(){
  if(existsSync(envPath))throw Error('Oracle environment already initialized; refusing to replace credentials or contracts');
  if(!existsSync(join(baseDir,'environment.env')))throw Error('Existing Base Sepolia environment is unavailable');
  const source=loadEnv(join(baseDir,'environment.env'));
  if(source.REVENUE_CHAIN_ID!=='84532'||source.REVENUE_EXTERNAL_USDC?.toLowerCase()!==usdc.toLowerCase()||!source.REVENUE_SYSTEM_MNEMONIC)throw Error('Existing Base Sepolia configuration mismatch');
  const credential=resolve(process.env.ORACLE_DEYE_AUTH_FILE||join(dataRoot,'.data/oracle-cre/direct/auth.private.json'));
  const template=resolve(process.env.ORACLE_DEYE_CONFIG_FILE||join(dataRoot,'.data/oracle-cre/direct/config.private.json'));
  if(!existsSync(credential)||!existsSync(template))throw Error('Direct Deye API credentials and configuration are required; no replay fallback');
  const direct=JSON.parse(readFileSync(template,'utf8'));
  const capture=resolve(process.env.ORACLE_INITIAL_CAPTURE||join(baseDir,'evidence/station.json'));
  if(!existsSync(capture))throw Error('Explicitly labeled initial station capture is required for product setup');
  mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
  for(const sub of ['application','evidence','oracle'])mkdirSync(join(dir,sub),{recursive:true,mode:0o700});
  cpSync(capture,join(dir,'evidence/station.json'));chmodSync(join(dir,'evidence/station.json'),0o600);
  cpSync(credential,join(dir,'oracle/auth.private.json'));chmodSync(join(dir,'oracle/auth.private.json'),0o600);
  cpSync(template,join(dir,'oracle/direct.private.json'));chmodSync(join(dir,'oracle/direct.private.json'),0o600);
  const reporter=Wallet.createRandom();
  const relayer=HDNodeWallet.fromPhrase(source.REVENUE_SYSTEM_MNEMONIC,undefined,"m/44'/60'/0'/0/4");
  if(reporter.address===relayer.address||reporter.address===source.REVENUE_ADMIN_ADDRESS)throw Error('Oracle signer and relayer must be independent');
  save(join(dir,'oracle/reporter.key'),reporter.privateKey+'\n');
  save(join(dir,'oracle/relayer.key'),relayer.privateKey+'\n');
  save(join(dir,'oracle/status.json'),{version:1,reports:[]});
  const names=['ADMIN','AGENT','TRUSTEE','TRUSTEE2','TREASURY','OWNER','INVESTOR','INVESTOR2'];
  const environment={REVENUE_CHAIN_ID:'84532',REVENUE_CHAIN_NAME:'Deye RWA · Oracle on Base Sepolia',REVENUE_ENVIRONMENT_ID:'oracle-base-sepolia',REVENUE_RPC_URL:source.REVENUE_RPC_URL,REVENUE_PUBLIC_RPC_URL:source.REVENUE_PUBLIC_RPC_URL,REVENUE_EXPLORER_URL:explorer,REVENUE_EXPLORER_API_URL:explorer,REVENUE_EXTERNAL_USDC:usdc,REVENUE_SYSTEM_MNEMONIC:source.REVENUE_SYSTEM_MNEMONIC,
    ...Object.fromEntries(names.map(k=>['REVENUE_'+k+'_ADDRESS',source['REVENUE_'+k+'_ADDRESS']])),
    REVENUE_PORT:String(port),REVENUE_DATA_DIR:join(dir,'application'),REVENUE_DEPLOYMENT_JOURNAL:join(dir,'deployment-intents.private.json'),REVENUE_ORACLE_MODE:'self-hosted-signed-v1',REVENUE_ORACLE_REPORTER_ADDRESS:reporter.address,REVENUE_ORACLE_STATUS_FILE:join(dir,'oracle/status.json'),REVENUE_WALLET_REQUIRED:'true',REVENUE_GUIDANCE_ENABLED:'true',REVENUE_DEMO_RECORDING:'false',REVENUE_MONITOR_LIVE:'false',REVENUE_HOUSEHOLD_PAYMENTS_ENABLED:'true',REVENUE_DISTRIBUTION_INTERVAL_MONTHS:'1',REVENUE_INITIAL_REPLAY:'true',DEYE_REPLAY_FILE:join(dir,'evidence/station.json'),DEYE_CREDENTIALS_FILE:'',REVENUE_AUTH_DOMAIN:`127.0.0.1:${port}`,REVENUE_ALLOWED_ORIGINS:localApp,REVENUE_PUBLIC_READ_ORIGINS:'https://mengzhon001.github.io',REVENUE_SECURE_COOKIES:'false',DEYE_LOCAL_SOLC:'1',HARDHAT_NETWORK:'revenue'};
  if(names.some(k=>!environment['REVENUE_'+k+'_ADDRESS']))throw Error('Role addresses missing from Base Sepolia environment');
  save(envPath,Object.entries(environment).map(([k,v])=>`${k}=${v}`).join('\n')+'\n');
  save(join(dir,'oracle/worker.private.json'),{rpcUrl:environment.REVENUE_RPC_URL,registry:'PENDING_DEPLOYMENT',vault:'PENDING_DEPLOYMENT',billing:'PENDING_DEPLOYMENT',payer:environment.REVENUE_OWNER_ADDRESS,authFile:join(dir,'oracle/auth.private.json'),directConfigFile:join(dir,'oracle/direct.private.json'),reporterKeyFile:join(dir,'oracle/reporter.key'),relayerKeyFile:join(dir,'oracle/relayer.key'),journalFile:join(dir,'oracle/transaction-journal.private.json'),statusFile:join(dir,'oracle/status.json')});
  save(join(dir,'public.json'),{environmentId:'oracle-base-sepolia',chainId,localApp,explorer,usdc,stationKey:direct.stationKey,reporter:reporter.address,contracts:null});
  compose();console.log('Prepared isolated Oracle environment. Existing Base Sepolia and private demo data were not changed.');
}
async function check(){const e=env();if(e.REVENUE_CHAIN_ID!=='84532'||e.REVENUE_ENVIRONMENT_ID!=='oracle-base-sepolia'||e.REVENUE_ORACLE_MODE!=='self-hosted-signed-v1')throw Error('Oracle environment identity mismatch');const p=new JsonRpcProvider(e.REVENUE_RPC_URL,chainId,{staticNetwork:true,batchMaxCount:1});try{if(Number(BigInt(await p.send('eth_chainId',[])))!==chainId)throw Error('Wrong public chain');const t=new Contract(usdc,['function decimals() view returns(uint8)'],p);if(Number(await t.decimals())!==6)throw Error('Circle test USDC mismatch');console.log(JSON.stringify({environmentId:e.REVENUE_ENVIRONMENT_ID,chainId,admin:e.REVENUE_ADMIN_ADDRESS,adminEthWei:String(await p.getBalance(e.REVENUE_ADMIN_ADDRESS)),relayerEthWei:String(await p.getBalance(e.REVENUE_TREASURY_ADDRESS))}));}finally{p.destroy();}}
async function deploy(verifyOnly=false){await check();run(process.execPath,['--import','tsx','scripts/base-deploy.ts',...(verifyOnly?['--verify-only']:[])],{cwd:join(root,'ui'),env:{...process.env,...env(),HARDHAT_CONFIG:'../onchain/hardhat.config.ts'}});
  const manifest=JSON.parse(readFileSync(join(dir,'application/deployment.json'),'utf8'));
  if(manifest.oracleMode!=='self-hosted-signed-v1'||manifest.chainId!==84532||!manifest.addresses.oracleRegistry)throw Error('Deployed product is not an isolated Oracle product');
  const file=join(dir,'oracle/worker.private.json'),worker=JSON.parse(readFileSync(file,'utf8'));Object.assign(worker,{registry:manifest.addresses.oracleRegistry,vault:manifest.addresses.vault,billing:manifest.addresses.billing});save(file,worker);
  const pub=JSON.parse(readFileSync(join(dir,'public.json'),'utf8'));pub.contracts=manifest.addresses;pub.transactions=manifest.deploymentTransactions;save(join(dir,'public.json'),pub);
}
async function start(){await check();if(!existsSync(join(dir,'application/deployment.json')))throw Error('Deploy the isolated product first');const s=createServer();await new Promise((ok,no)=>{s.once('error',()=>no(Error(`Port ${port} is occupied`)));s.listen(port,'127.0.0.1',()=>s.close(ok));});compose();assertCompose();run('docker-compose',['-p',project,'-f',join(dir,'compose.json'),'up','-d','--no-build','--wait','--wait-timeout','300']);}
async function main(){const c=process.argv[2]||'status';if(c==='init')return init();if(c==='check')return check();if(c==='deploy')return deploy();if(c==='verify')return deploy(true);if(c==='build'){compose();assertCompose();return run('docker-compose',['-p',project,'-f',join(dir,'compose.json'),'build','app']);}if(c==='start')return start();if(c==='stop'){assertCompose();return run('docker-compose',['-p',project,'-f',join(dir,'compose.json'),'stop']);}if(c==='status'){const pub=JSON.parse(readFileSync(join(dir,'public.json'),'utf8'));console.log(JSON.stringify(pub));assertCompose();return run('docker-compose',['-p',project,'-f',join(dir,'compose.json'),'ps']);}if(['dry-run','validate','billable','watch'].includes(c)){const args=['--import','tsx','oracle/self-hosted/worker.ts',...(c==='dry-run'?['--dry-run']:c==='billable'?['--billable']:c==='watch'?['--watch']:[])];return run(process.execPath,args,{env:{...process.env,ORACLE_WORKER_CONFIG:join(dir,'oracle/worker.private.json')}});}throw Error('Commands: init, check, deploy, verify, build, start, stop, status, dry-run, validate, billable, watch');}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
