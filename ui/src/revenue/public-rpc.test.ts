import {test}from'node:test';import assert from'node:assert/strict';import{createServer}from'node:http';import{FetchRequest}from'ethers';import{PublicReadProvider}from'./public-rpc';
test('public reads recover from rate limiting; transaction broadcasts are never retried',async()=>{
 const counts:Record<string,number>={};const server=createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;const input=JSON.parse(body),list=Array.isArray(input)?input:[input];const result=list.map(p=>{counts[p.method]=(counts[p.method]||0)+1;return p.method==='eth_call'&&counts[p.method]>1?{id:p.id,jsonrpc:'2.0',result:'0x01'}:{id:p.id,jsonrpc:'2.0',error:{code:-32007,message:'25/second request limit reached'}};});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(Array.isArray(input)?result:result[0]));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as any;const p=new PublicReadProvider(`http://127.0.0.1:${address.port}`,84532,{staticNetwork:true,batchMaxCount:1});
 try{assert.equal(await p.send('eth_call',[{to:'0x0000000000000000000000000000000000000001',data:'0x'},'latest']),'0x01');assert.equal(counts.eth_call,2);await assert.rejects(p.send('eth_sendRawTransaction',['0x1234']));assert.equal(counts.eth_sendRawTransaction,1);}finally{p.destroy();await new Promise<void>(r=>server.close(()=>r()));}
});
test('a stalled HTTP read times out and releases the read queue',async()=>{
 const server=createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;const p=JSON.parse(body);if(p.method==='eth_call')return;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:p.id,jsonrpc:'2.0',result:'0x123'}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${(server.address() as any).port}`,request=new FetchRequest(url);request.timeout=150;
 const p=new PublicReadProvider(request,84532,{staticNetwork:true,batchMaxCount:1}),normal=new PublicReadProvider(url,84532,{staticNetwork:true});
 try{
  assert.equal(normal._getConnection().timeout,10000);assert.equal(p._getConnection().timeout,150);
  const stalled=p.send('eth_call',[{to:'0x0000000000000000000000000000000000000001',data:'0x'},'latest']);
  const failure=assert.rejects(stalled,(e:any)=>e.code==='TIMEOUT');
  const next=p.send('eth_blockNumber',[]);
  await failure;assert.equal(await next,'0x123');
 }finally{p.destroy();normal.destroy();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
test('HTTP throttling never silently retries a broadcast',async()=>{
 let count=0;const server=createServer((req,res)=>{count++;res.writeHead(429,{'Content-Type':'application/json'});res.end('{}');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const p=new PublicReadProvider(`http://127.0.0.1:${(server.address() as any).port}`,84532,{staticNetwork:true,batchMaxCount:1});
 try{await assert.rejects(p.send('eth_sendRawTransaction',['0x1234']));assert.equal(count,1);}finally{p.destroy();await new Promise<void>(r=>server.close(()=>r()));}
});
