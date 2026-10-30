import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventCache} from './event-cache';
import {assertPublicConfiguration,assertLocalCapability,CIRCLE_BASE_SEPOLIA_USDC} from '../../../onchain/scripts/revenue-network';
test('public RPC paging is bounded, survives restart and replaces reorged events',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'revenue-events-'));let height=611,reorg=false,fail=false;const queries:number[][]=[];
 const provider:any={getBlock:async(n:any)=>({number:n==='latest'?height:n,hash:(reorg?'b':'a')+(n==='latest'?height:n),timestamp:Number(n==='latest'?height:n)*2}),getLogs:async(f:any)=>{assert.ok(f.toBlock-f.fromBlock<200);queries.push([f.fromBlock,f.toBlock]);if(fail&&f.fromBlock>=200)throw Error('upstream');return Array.from({length:f.toBlock-f.fromBlock+1},(_,i)=>({blockNumber:f.fromBlock+i,index:0,data:reorg?'new':'old',topics:[],transactionHash:'tx'+(f.fromBlock+i)}));}};
 try{
  const first=await new EventCache(provider,dir).read('0xabc',10);assert.equal(first.logs.length,602);assert.equal(queries.length,4);
  queries.length=0;height=620;const next=await new EventCache(provider,dir).read('0xabc',10);assert.equal(next.logs.length,611);assert.equal(queries[0][0],600);
  reorg=true;const fixed=await new EventCache(provider,dir).read('0xabc',10);assert.ok(fixed.logs.every(l=>l.data==='new'));
  height=1000;fail=true;await assert.rejects(new EventCache(provider,dir).read('0xabc',10));
  fail=false;assert.equal((await new EventCache(provider,dir).read('0xabc',10)).logs.length,991);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Base configuration rejects implicit keys, mock tokens, and management capabilities',()=>{
 const previous={...process.env};try{
  process.env.REVENUE_WALLET_REQUIRED='true';process.env.REVENUE_EXTERNAL_USDC=CIRCLE_BASE_SEPOLIA_USDC;process.env.REVENUE_SYSTEM_MNEMONIC='explicit test fixture';delete process.env.REVENUE_AUTO_SYNC_STATION_ID;process.env.REVENUE_MONITOR_LIVE='false';
  assert.doesNotThrow(()=>assertPublicConfiguration(84532));
  for(const action of ['mint','reset','advance','faucet'])assert.throws(()=>assertLocalCapability(action,84532));
  assert.doesNotThrow(()=>assertLocalCapability('advance',20261008));
  process.env.REVENUE_WALLET_REQUIRED='false';assert.throws(()=>assertPublicConfiguration(84532));process.env.REVENUE_WALLET_REQUIRED='true';process.env.REVENUE_EXTERNAL_USDC='0x123';assert.throws(()=>assertPublicConfiguration(84532));
 }finally{process.env=previous;}
});
test('large history pages preserve complete events and primary-RPC reorg checks',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'revenue-history-'));let height=250123,mismatch=false,fail=false;
 const queries:{source:string;from:number;to:number}[]=[];
 const events=[15,50025,250118].map(blockNumber=>({blockNumber,index:0,data:'event',topics:[],transactionHash:'tx'+blockNumber}));
 const block=(n:number|string)=>{const number=n==='latest'?height:Number(n);return{number,hash:'canonical-'+number,timestamp:number*2};};
 const primary:any={getBlock:async(n:any)=>block(n),getLogs:async(f:any)=>{assert.ok(f.toBlock-f.fromBlock<200);queries.push({source:'primary',from:f.fromBlock,to:f.toBlock});return events.filter(e=>e.blockNumber>=f.fromBlock&&e.blockNumber<=f.toBlock);}};
 const history:any={getBlock:async(n:any)=>({...block(n),hash:mismatch?'different-chain':block(n).hash}),getLogs:async(f:any)=>{assert.ok(f.toBlock-f.fromBlock<50000);queries.push({source:'history',from:f.fromBlock,to:f.toBlock});if(fail)throw Error('history unavailable');return events.filter(e=>e.blockNumber>=f.fromBlock&&e.blockNumber<=f.toBlock);}};
 try{
  const result=await new EventCache(primary,dir,history,50000).read('0xabc',10);
  assert.deepEqual(result.logs.map(e=>e.blockNumber),[15,50025,250118]);assert.equal(queries.filter(q=>q.source==='history').length,6);
  assert.deepEqual(queries.at(-1),{source:'primary',from:250112,to:250123});
  const before=readFileSync(join(dir,'0xabc.json'),'utf8');height+=400;mismatch=true;
  await assert.rejects(new EventCache(primary,dir,history,50000).read('0xabc',10),/does not match/);
  assert.equal(readFileSync(join(dir,'0xabc.json'),'utf8'),before);
  mismatch=false;fail=true;await assert.rejects(new EventCache(primary,dir,history,50000).read('0xabc',10),/unavailable/);
  assert.equal(readFileSync(join(dir,'0xabc.json'),'utf8'),before);
  fail=false;const recovered=await new EventCache(primary,dir,history,50000).read('0xabc',10);assert.deepEqual(recovered.logs.map(e=>e.blockNumber),[15,50025,250118]);
  assert.throws(()=>new EventCache(primary,dir,history,50001),/Invalid/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
