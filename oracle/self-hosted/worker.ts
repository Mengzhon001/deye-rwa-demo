/** A private, self-hosted Oracle worker. It never exposes a signing endpoint. */
import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {AbiCoder,Contract,JsonRpcProvider,Wallet,getAddress,keccak256} from 'ethers';
import {AuthSchema,DEYE_HOSTS,DirectConfigSchema,joinDailyWindows,normalizeDirect,validateDirectConfig,type DirectConfig} from '../cre/monthly-bill/deye-direct';
import {CIRCLE_USDC,hash} from '../cre/monthly-bill/bill';

const reportFields=[
  {name:'purpose',type:'uint8'},{name:'observationMonth',type:'uint32'},{name:'servicePeriod',type:'uint16'},
  {name:'revision',type:'uint32'},{name:'issuedAt',type:'uint64'},{name:'validUntil',type:'uint64'},
  {name:'observationEndUtc',type:'uint64'},{name:'signerEpoch',type:'uint64'},
  {name:'vault',type:'address'},{name:'billing',type:'address'},{name:'paymentToken',type:'address'},
  {name:'payer',type:'address'},{name:'stationKey',type:'bytes32'},{name:'billId',type:'bytes32'},
  {name:'sourceKind',type:'bytes32'},
  {name:'sourceDigest',type:'bytes32'},{name:'inputDigest',type:'bytes32'},{name:'paramsHash',type:'bytes32'},
  {name:'householdAmount',type:'uint256'},{name:'exportAmount',type:'uint256'},
  {name:'costsAmount',type:'uint256'},{name:'assignedAmount',type:'uint256'},
];
const registryAbi=[
  'function digest((uint8 purpose,uint32 observationMonth,uint16 servicePeriod,uint32 revision,uint64 issuedAt,uint64 validUntil,uint64 observationEndUtc,uint64 signerEpoch,address vault,address billing,address paymentToken,address payer,bytes32 stationKey,bytes32 billId,bytes32 sourceKind,bytes32 sourceDigest,bytes32 inputDigest,bytes32 paramsHash,uint256 householdAmount,uint256 exportAmount,uint256 costsAmount,uint256 assignedAmount)) view returns(bytes32)',
  'function registerReport((uint8 purpose,uint32 observationMonth,uint16 servicePeriod,uint32 revision,uint64 issuedAt,uint64 validUntil,uint64 observationEndUtc,uint64 signerEpoch,address vault,address billing,address paymentToken,address payer,bytes32 stationKey,bytes32 billId,bytes32 sourceKind,bytes32 sourceDigest,bytes32 inputDigest,bytes32 paramsHash,uint256 householdAmount,uint256 exportAmount,uint256 costsAmount,uint256 assignedAmount),bytes) returns(bytes32)',
  'function getReport(bytes32) view returns((uint8 purpose,uint32 observationMonth,uint16 servicePeriod,uint32 revision,uint64 issuedAt,uint64 validUntil,uint64 observationEndUtc,uint64 signerEpoch,address vault,address billing,address paymentToken,address payer,bytes32 stationKey,bytes32 billId,bytes32 sourceKind,bytes32 sourceDigest,bytes32 inputDigest,bytes32 paramsHash,uint256 householdAmount,uint256 exportAmount,uint256 costsAmount,uint256 assignedAmount),address,bool,bool,bool)',
  'function reporter() view returns(address)','function signerEpoch() view returns(uint64)',
  'function vault() view returns(address)','function billing() view returns(address)',
  'function paymentToken() view returns(address)',
  'function activePolicy(bytes32) view returns(bytes32)',
  'function policies(bytes32) view returns(bytes32 stationKey,bytes32 paramsHash,uint32 firstMonth)',
  'function latestRevision(bytes32) view returns(uint32)',
  'function latestBillable(bytes32) view returns(bytes32)',
];
const vaultAbi=['function feeMonths() view returns(uint256)','function phase() view returns(uint8)','function nextFeeAt() view returns(uint256)'];
type WorkerConfig={rpcUrl:string;registry:string;vault:string;billing:string;payer:string;authFile:string;directConfigFile:string;reporterKeyFile:string;relayerKeyFile:string;journalFile:string;statusFile:string};
function readJson(file:string){return JSON.parse(readFileSync(resolve(file),'utf8'));}
function save(file:string,value:unknown){mkdirSync(dirname(file),{recursive:true,mode:0o700});writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});}
function privateKey(file:string){const st=statSync(file);if((st.mode&0o077)!==0)throw Error('Oracle key file permissions must be 0600');const value=readFileSync(file,'utf8').trim();if(!/^0x[0-9a-fA-F]{64}$/.test(value))throw Error('Invalid Oracle key file');return value;}
function monthAdd(first:number,elapsed:number){const y=Math.floor(first/100),m=first%100;if(m<1||m>12||elapsed<0||elapsed>359)throw Error('Invalid observation month');const t=y*12+m-1+elapsed;return Math.floor(t/12)*100+t%12+1;}
function nextConfig(template:DirectConfig,firstMonth:number,period:number):DirectConfig{
  if(template.sourceTimezone!=='PRC')throw Error('Explicit station timezone mapping required before automatic scheduling');
  const key=monthAdd(firstMonth,period-1),y=Math.floor(key/100),m=key%100;
  const start=(Date.UTC(y,m-1,1)-8*3600000)/1000,end=(Date.UTC(y,m,1)-8*3600000)/1000;
  return {...template,observationMonth:`${y}-${String(m).padStart(2,'0')}`,servicePeriod:period,
    observationStartUtc:start,observationEndUtc:end,expectedDays:new Date(Date.UTC(y,m,0)).getUTCDate()};
}
async function readDirect(config:DirectConfig,authFile:string){
  const now=Math.floor(Date.now()/1000);validateDirectConfig(config,now);
  const auth=AuthSchema.parse(readJson(authFile));
  async function post(path:string,body:unknown,token?:string){
    const url=DEYE_HOSTS[config.region]+path;
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
    if(!response.ok||Number(response.headers.get('content-length')||0)>200000)throw Error(`Deye read failed at ${path.split('?')[0]} (HTTP ${response.status})`);
    const raw=await response.text();if(raw.length>200000)throw Error('Deye response too large');
    const result=JSON.parse(raw);if(result?.success!==true)throw Error(`Deye rejected ${path.split('?')[0]}`);
    return result;
  }
  const token=await post(`/v1.0/account/token?appId=${encodeURIComponent(auth.appId)}`,{
    appSecret:auth.appSecret,email:auth.email,password:auth.passwordSha256,...(auth.companyId?{companyId:auth.companyId}:{})});
  if(typeof token.accessToken!=='string'||!token.accessToken)throw Error('Deye authentication token missing');
  const id=Number(config.stationId),[year,month]=config.observationMonth.split('-').map(Number);
  const read=(path:'/station/detail'|'/station/history',body:unknown)=>post('/v1.0'+path,body,token.accessToken);
  const detail=await read('/station/detail',{stationId:id});
  const monthly=await read('/station/history',{stationId:id,granularity:3,startAt:config.observationMonth,endAt:config.observationMonth});
  const daily=joinDailyWindows([
    await read('/station/history',{stationId:id,granularity:2,startAt:config.observationMonth+'-01',endAt:config.observationMonth+'-16'}),
    await read('/station/history',{stationId:id,granularity:2,startAt:config.observationMonth+'-16',endAt:new Date(Date.UTC(year,month,1)).toISOString().slice(0,10)}),
  ]);
  return normalizeDirect(config,detail,monthly,daily,now);
}

async function run(purpose:0|1,dryRun:boolean){
  const file=process.env.ORACLE_WORKER_CONFIG;
  if(!file)throw Error('ORACLE_WORKER_CONFIG must point to an ignored local JSON file');
  const c=readJson(file) as WorkerConfig;
  for(const field of ['rpcUrl','registry','vault','billing','payer','authFile','directConfigFile','reporterKeyFile','relayerKeyFile','journalFile','statusFile'] as const)if(!c[field])throw Error(`Missing ${field}`);
  const provider=new JsonRpcProvider(c.rpcUrl,84532,{staticNetwork:true,batchMaxCount:1});
  try{
    if(Number((await provider.getNetwork()).chainId)!==84532||Number(BigInt(await provider.send('eth_chainId',[])))!==84532)throw Error('Base Sepolia Chain ID required');
    const registry=new Contract(c.registry,registryAbi,provider),vault=new Contract(c.vault,vaultAbi,provider);
    const token=new Contract(CIRCLE_USDC,['function decimals() view returns(uint8)'],provider);
    if(Number(await token.decimals())!==6||getAddress(await registry.paymentToken())!==getAddress(CIRCLE_USDC)||
       getAddress(await registry.vault())!==getAddress(c.vault)||getAddress(await registry.billing())!==getAddress(c.billing))throw Error('Oracle contract configuration mismatch');
    const reporter=new Wallet(privateKey(c.reporterKeyFile));
    const relayer=new Wallet(privateKey(c.relayerKeyFile));
    if(reporter.address.toLowerCase()!==String(await registry.reporter()).toLowerCase()||relayer.address===reporter.address)throw Error('Reporter identity or key separation mismatch');
    const template=DirectConfigSchema.parse(readJson(c.directConfigFile));
    let direct=template,revision=1;
    if(purpose===1){
      const policyId=await registry.activePolicy(template.stationKey);
      if(policyId==='0x'+'0'.repeat(64))throw Error('Both trustees must approve the parameter policy');
      const policy=await registry.policies(policyId);
      if(policy.paramsHash.toLowerCase()!==template.expectedParametersHash.toLowerCase())throw Error('Approved parameters differ from the local snapshot');
      if(Number(await vault.phase())!==2)throw Error('Oracle product has not settled');
      const period=Number(await vault.feeMonths())+1;
      direct=nextConfig(template,Number(policy.firstMonth),period);
      if(Math.floor(Date.now()/1000)<Number(await vault.nextFeeAt()))throw Error('Service period has not ended');
      const key=keccak256(AbiCoder.defaultAbiCoder().encode(['address','bytes32','uint16'],[c.vault,template.stationKey,period]));
      const previous=await registry.latestBillable(key);
      if(previous!=='0x'+'0'.repeat(64)){
        const existing=await registry.getReport(previous);
        if(existing.exists&&!existing.revoked){console.log(JSON.stringify({reportId:previous,status:existing.consumed?'consumed':'registered'}));return;}
      }
      revision=Number(await registry.latestRevision(key))+1;
    }
    const result=await readDirect(direct,c.authFile);
    const now=Math.floor(Date.now()/1000),epoch=Number(await registry.signerEpoch());
    const journal=readJsonOr(c.journalFile,{} as Record<string,any>);
    const runKey=hash({purpose,stationKey:direct.stationKey,month:direct.observationMonth,period:direct.servicePeriod,
      revision,sourceDigest:result.sourceDigest,inputDigest:result.inputDigest,paramsHash:result.parametersHash,epoch});
    const issuedAt=journal[runKey]?.issuedAt||now;
    if(issuedAt+30*86400<=now)throw Error('Prepared report expired before registration; an explicit new revision is required');
    const billId=hash({station:direct.stationKey,period:direct.servicePeriod});
    const report={purpose,observationMonth:Number(direct.observationMonth.replace('-','')),servicePeriod:direct.servicePeriod,revision,
      issuedAt,validUntil:issuedAt+30*86400,observationEndUtc:direct.observationEndUtc,signerEpoch:epoch,
      vault:getAddress(c.vault),billing:getAddress(c.billing),paymentToken:CIRCLE_USDC,payer:getAddress(c.payer),
      stationKey:direct.stationKey,billId,sourceKind:keccak256(new TextEncoder().encode('deye-api-direct')),sourceDigest:result.sourceDigest,inputDigest:result.inputDigest,
      paramsHash:result.parametersHash,householdAmount:BigInt(result.householdUSDC6),exportAmount:BigInt(result.exportUSDC6),
      costsAmount:BigInt(result.costsUSDC6),assignedAmount:BigInt(result.assignedUSDC6)};
    const domain={name:'Deye Oracle Report',version:'1',chainId:84532,verifyingContract:getAddress(c.registry)};
    const signature=await reporter.signTypedData(domain,{Report:reportFields},report);
    const reportId=await registry.digest(report);
    const publicRecord={reportId,purpose:purpose===0?'validation-only':'billable',stationKey:direct.stationKey,
      observationMonth:direct.observationMonth,servicePeriod:direct.servicePeriod,sourceDigest:result.sourceDigest,
      inputDigest:result.inputDigest,paramsHash:result.parametersHash,reporter:reporter.address,billId,
      householdUSDC6:result.householdUSDC6,exportUSDC6:result.exportUSDC6,costsUSDC6:result.costsUSDC6,
      assignedUSDC6:result.assignedUSDC6,coveredDays:result.coveredDays,independentSourceVerified:false,
      sourceKind:'deye-api-direct',executionMode:'self-hosted-signed',observedAt:new Date().toISOString()};
    if(dryRun){console.log(JSON.stringify({...publicRecord,dryRun:true}));return;}
    journal[runKey]={issuedAt,reportId};save(c.journalFile,journal);
    const old=journal,prior=old[reportId];
    if(prior){const receipt=await provider.getTransactionReceipt(prior.hash);if(receipt?.status===1){recordStatus(c.statusFile,{...publicRecord,transaction:prior.hash,block:receipt.blockNumber,status:'registered'});console.log(JSON.stringify({reportId,transaction:prior.hash,status:'registered'}));return;}
      if(receipt?.status===0)throw Error('Previous Oracle registration transaction reverted');
      if(!await provider.getTransaction(prior.hash))await provider.broadcastTransaction(prior.raw);
      console.log(JSON.stringify({reportId,transaction:prior.hash,status:'pending'}));return;}
    const existing=await registry.getReport(reportId);
    if(existing.exists){recordStatus(c.statusFile,{...publicRecord,status:'registered',transaction:null,block:null});console.log(JSON.stringify({reportId,status:'registered'}));return;}
    const data=registry.interface.encodeFunctionData('registerReport',[report,signature]);
    const gas=await provider.estimateGas({from:relayer.address,to:c.registry,data});
    const fee=await provider.getFeeData();if(!fee.maxFeePerGas||!fee.maxPriorityFeePerGas)throw Error('Base Sepolia fee quote unavailable');
    const nonce=await provider.getTransactionCount(relayer.address,'pending');
    const raw=await relayer.signTransaction({chainId:84532,type:2,to:c.registry,data,gasLimit:gas*12n/10n,
      maxFeePerGas:fee.maxFeePerGas,maxPriorityFeePerGas:fee.maxPriorityFeePerGas,nonce});
    const hashTx=keccak256(raw);
    old[reportId]={hash:hashTx,raw,reportId,preparedAt:new Date().toISOString()};save(c.journalFile,old);
    recordStatus(c.statusFile,{...publicRecord,transaction:hashTx,status:'submitted'});
    await provider.broadcastTransaction(raw);
    const receipt=await provider.waitForTransaction(hashTx,1,120000);
    if(!receipt||receipt.status!==1)throw Error('Oracle registration is pending or reverted; reconcile the saved transaction before retrying');
    recordStatus(c.statusFile,{...publicRecord,transaction:hashTx,block:receipt.blockNumber,status:'registered'});
    console.log(JSON.stringify({reportId,transaction:hashTx,block:receipt.blockNumber,status:'registered'}));
  }finally{provider.destroy();}
}
function readJsonOr(file:string,fallback:any){try{return readJson(file);}catch(e:any){if(e.code==='ENOENT')return fallback;throw e;}}
function recordStatus(file:string,row:Record<string,unknown>){const old=readJsonOr(file,{version:1,reports:[]});const reports=old.reports.filter((x:any)=>x.reportId!==row.reportId);reports.push(row);save(file,{version:1,reports});}
async function main(){
  const args=new Set(process.argv.slice(2));
  if(args.has('--watch')){
    const tick=async()=>{try{await run(1,false);}catch(e:any){console.error('Oracle cycle skipped:',e.message);}};
    await tick();setInterval(tick,3600000);
  }else await run(args.has('--billable')?1:0,args.has('--dry-run'));
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;});
