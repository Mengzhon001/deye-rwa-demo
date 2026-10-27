import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {dir,health,pages,chainId} from './revenue-remote.mjs';
const urls=JSON.parse(readFileSync(join(dir,'public.json'),'utf8'));
const request=(path,options={})=>fetch(urls.app+path,{signal:AbortSignal.timeout(20000),...options});
test('public HTTPS services retain wallet authorization, source correspondence and narrow CORS',async()=>{
 await health(urls);
 for(const path of ['/api/state','/api/recording/operations/00000000']){
  const r=await request(path);assert([401,404].includes(r.status),`Unauthenticated ${path}: ${r.status}`);
 }
 for(const path of ['/api/public/overview','/api/public/deployment']){
  const r=await request(path,{headers:{Origin:new URL(pages).origin}});
  assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),new URL(pages).origin);
  assert.equal(r.headers.get('access-control-allow-credentials'),null);
 }
 const privateRead=await request('/api/state',{headers:{Origin:new URL(pages).origin}});
 assert.equal(privateRead.headers.get('access-control-allow-origin'),null);
 const denied=await request('/api/auth/challenge',{method:'POST',headers:{Origin:'https://example.invalid','Content-Type':'application/json'},body:'{}'});
 assert.equal(denied.status,403);
 const role=await request('/api/auth/challenge',{method:'POST',headers:{Origin:urls.app,'Content-Type':'application/json'},body:JSON.stringify({address:urls.accounts.investor,requestedRole:'owner'})});
 assert.equal(role.status,400);assert.match((await role.json()).error,/authorized|权限/);
 const challenge=await request('/api/auth/challenge',{method:'POST',headers:{Origin:urls.app,'Content-Type':'application/json'},body:JSON.stringify({address:urls.accounts.owner,requestedRole:'owner'})});
 const message=(await challenge.json()).message;
 assert(message.startsWith(urls.app+' wants you to sign in'));
 assert(message.includes(`Chain ID: ${chainId}`)&&message.includes('Role: owner.'));
 const d=await (await request('/api/public/deployment')).json();
 assert.equal(d.contracts.length,4);assert(d.contracts.some(c=>c.name==="HouseholdBilling"));assert(d.contracts.every(c=>c.sourceMatch===true));
});
