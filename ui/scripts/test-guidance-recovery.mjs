import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {Wallet,JsonRpcProvider,Interface} from 'ethers';
import {guard,urls,chainId,dir,project} from '../../scripts/revenue-guidance-local.mjs';
guard();const provider=new JsonRpcProvider(urls.rpc);assert.equal(Number((await provider.getNetwork()).chainId),chainId);
const run=readdirSync(dir+'/runs').sort().reverse().find(r=>{try{return JSON.parse(readFileSync(dir+'/runs/'+r+'/run.json')).status==='complete';}catch{return false;}});assert(run,'Complete real wallet run is required');const final=JSON.parse(readFileSync(dir+'/runs/'+run+'/final-state.json'));
const release=final.operations.filter(o=>o.action==='release-station'&&o.status==='confirmed').at(-1),hash=Object.values(release.steps)[0].hash;
function docker(args){const r=spawnSync('docker',args,{stdio:'inherit'});if(r.status!==0)throw Error('Dedicated local recovery command failed');}
async function waitNetwork(){for(let i=0;i<30;i++){try{assert.equal(Number(BigInt(await provider.send('eth_chainId',[]))),chainId);return;}catch{await new Promise(r=>setTimeout(r,500));}}throw Error('Local chain did not recover');}
try{
 const receipt=await provider.getTransactionReceipt(hash);assert.equal(receipt.status,1);const code=await provider.getCode(final.manifest.addresses.vault);
 docker(['restart',project+'-anvil-1']);await waitNetwork();assert.equal(await provider.getCode(final.manifest.addresses.vault),code);assert.equal((await provider.getTransactionReceipt(hash)).blockHash,receipt.blockHash);
 const abi=new Interface(['function phase() view returns (uint8)']);const phase=await provider.call({to:final.manifest.addresses.vault,data:abi.encodeFunctionData('phase')});assert.equal(abi.decodeFunctionResult('phase',phase)[0],4n);
 const key=JSON.parse(readFileSync(dir+'/wallet-import.private.json')).owner.privateKey,w=new Wallet(key),headers={Origin:urls.app,'Content-Type':'application/json'};
 let r=await fetch(urls.app+'/api/auth/challenge',{method:'POST',headers,body:JSON.stringify({address:w.address,requestedRole:'owner'})});const ch=await r.json();r=await fetch(urls.app+'/api/auth/verify',{method:'POST',headers,body:JSON.stringify({nonce:ch.nonce,signature:await w.signMessage(ch.message)})});assert(r.ok);const cookie=r.headers.get('set-cookie').split(';')[0];
 docker(['stop',project+'-blockscout-1']);
 try{r=await fetch(urls.app+'/api/state',{headers:{Cookie:cookie}});assert(r.ok);const state=await r.json();assert.equal(state.chain.phase,'4');assert.equal(state.chain.feeMonths,'60');assert(state.applications[0].chainAdmission.released);const tx=state.operations.find(o=>o.id===release.id);assert.equal(tx.status,'confirmed');assert.equal(Object.values(tx.steps)[0].status,'mined');}finally{docker(['start',project+'-blockscout-1']);}
 for(let i=0;i<60;i++){try{const tx=await fetch(urls.explorer+'/api/v2/transactions/'+hash).then(r=>r.json());if(tx.hash?.toLowerCase()===hash.toLowerCase()){writeFileSync(dir+'/recovery-check.json',JSON.stringify({passed:true,chainId,run,hash,persistedBlockHash:receipt.blockHash,nodeRestart:true,explorerPausePreservesConfirmedState:true,explorerRecovered:true},null,2));console.log('PASS local node persistence and explorer pause/recovery');break;}}catch{}if(i===59)throw Error('Blockscout did not recover indexing');await new Promise(r=>setTimeout(r,500));}
}finally{provider.destroy();}
