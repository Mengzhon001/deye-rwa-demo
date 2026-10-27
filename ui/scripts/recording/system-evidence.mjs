import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {JsonRpcProvider,Interface,id} from 'ethers';

/** Inspect deployment and faucet transactions without signing anything. */
export async function systemEvidence(c,run){
 const {manifest}=JSON.parse(readFileSync(join(run,'session-info.json'),'utf8'));
 const timeline=readFileSync(join(run,'timeline.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const provider=new JsonRpcProvider(c.urls.rpc,c.chainId,{staticNetwork:true});
 const abi=new Interface(['function mint(address to,uint256 value)','function grantRole(bytes32 role,address account)','event Transfer(address indexed from,address indexed to,uint256 value)']);
 const requests=[];
 for(let block=1;block<=manifest.deployedBlock;block++){
  const data=await provider.getBlock(block);
  for(const hash of data.transactions)requests.push({hash,kind:'deployment'});
 }
 for(const item of timeline.filter(e=>e.type==='funding')){
  for(const key of ['ethHash','usdcHash'])if(item[key])requests.push({hash:item[key],kind:key==='ethHash'?'faucet-ETH':'faucet-USDC',role:item.role,seconds:item.seconds});
 }
 const rows=[];
 for(const item of [...new Map(requests.map(r=>[r.hash,r])).values()]){
  const tx=await provider.getTransaction(item.hash),receipt=await provider.getTransactionReceipt(item.hash);
  assert(tx&&receipt?.status===1,'System receipt missing or failed');
  assert.equal(Number(tx.chainId),c.chainId);assert.equal(tx.from.toLowerCase(),manifest.accounts.admin.toLowerCase());
  const checks=['chainId','system-sender','confirmed-receipt'];let amount,asset,method,recipient;
  if(item.kind==='faucet-ETH'){
   recipient=manifest.accounts[item.role];assert.equal(tx.to.toLowerCase(),recipient.toLowerCase());
   const before=await provider.getBalance(recipient,receipt.blockNumber-1);
   assert.equal(tx.value,5n*10n**18n-before);amount=tx.value.toString();asset='DETH';method='native transfer';checks.push('recipient','five-ETH-target');
  }else if(item.kind==='faucet-USDC'){
   assert.equal(tx.to.toLowerCase(),manifest.addresses.usdc.toLowerCase());
   const call=abi.parseTransaction({data:tx.data});assert.equal(call.name,'mint');
   recipient=manifest.accounts[item.role];assert.equal(call.args.to.toLowerCase(),recipient.toLowerCase());
   const event=receipt.logs.map(l=>{try{return l.address.toLowerCase()===manifest.addresses.usdc.toLowerCase()?abi.parseLog(l):null;}catch{return null;}}).find(e=>e?.name==='Transfer');
   assert.equal(event.args.from,'0x0000000000000000000000000000000000000000');assert.equal(event.args.to.toLowerCase(),recipient.toLowerCase());assert.equal(event.args.value,call.args.value);
   amount=call.args.value.toString();asset='mUSDC';method='mint';checks.push('token-contract','recipient','mint-event-amount');
  }else if(!tx.to){
   assert(Object.values(manifest.addresses).some(a=>a.toLowerCase()===receipt.contractAddress.toLowerCase()));
   recipient=receipt.contractAddress;method='contract deployment';checks.push('deployed-contract-address');
  }else{
   const call=abi.parseTransaction({data:tx.data});assert.equal(call.name,'grantRole');assert.equal(tx.to.toLowerCase(),manifest.addresses.station.toLowerCase());assert.equal(call.args.role,id('ISSUER_ROLE'));assert.equal(call.args.account.toLowerCase(),manifest.accounts.agent.toLowerCase());
   method='grantRole';recipient=call.args.account;checks.push('station-issuer-role','intermediary-address');
  }
  const indexed=await fetch(c.urls.explorer+'/api/v2/transactions/'+item.hash);assert(indexed.ok,'System transaction not indexed');
  rows.push({...item,chainId:c.chainId,from:tx.from,to:tx.to,recipient,method,blockNumber:receipt.blockNumber,status:'confirmed',matched:true,checks,amount,asset,decimals:asset==='DETH'?18:asset==='mUSDC'?6:undefined,url:c.urls.explorer+'/tx/'+item.hash});
 }
 writeFileSync(join(run,'system-evidence.json'),JSON.stringify(rows,null,2));return rows;
}
