import {readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';import assert from'node:assert/strict';import{HDNodeWallet}from'ethers';
const dir=process.env.REVENUE_UNIFIED_DATA_DIR;if(!dir)throw Error('Explicit unified data directory required');const config=JSON.parse(readFileSync(join(dir,'public.json'))),origin=config.app;
const keys=JSON.parse(readFileSync(process.env.BASE_EXISTING_ROLES_FILE));const results=[],cookies={};
async function call(id,role,path,body,allow=false,customCookie){const r=await fetch(origin+`/networks/${id}`+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:customCookie??cookies[id+role]??''},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});const data=await r.json();if(!allow&&!r.ok)throw Error(data.error);const cookie=r.headers.get('set-cookie');if(cookie){assert.match(cookie,new RegExp(`Path=/networks/${id}/`));cookies[id+role]=cookie.split(';')[0];}return {r,data};}
for(const n of config.networks){
 const {data:net}=await call(n.id,'','/api/network');assert.equal(net.chainId,n.chainId);
 for(const role of['owner','agent','investor','investor2','trustee','trustee2']){
  const wallet=HDNodeWallet.fromPhrase(keys.wallets[role].phrase),requestedRole=role.replace(/2$/,'');
  const {data:c}=await call(n.id,role,'/api/auth/challenge',{address:wallet.address,requestedRole});
  assert.ok(c.message.includes(origin));assert.ok(c.message.includes('Chain ID: '+n.chainId));
  const {data:session}=await call(n.id,role,'/api/auth/verify',{nonce:c.nonce,signature:await wallet.signMessage(c.message)});assert.equal(session.address.toLowerCase(),wallet.address.toLowerCase());assert.equal(session.role,requestedRole);
  const {data:s}=await call(n.id,role,'/api/state');assert.equal(s.manifest.chainId,n.chainId);assert.equal(s.viewer.address.toLowerCase(),wallet.address.toLowerCase());
  results.push({network:n.id,chainId:n.chainId,role,address:wallet.address,vault:s.manifest.addresses.vault,USDC:s.accounts[session.actor]?.usdc ?? null,phase:s.chain.phase});console.log('PASS chain-bound login and state',n.id,role);
 }
 const wrong=await call(n.id,'investor','/api/auth/challenge',{address:keys.wallets.investor.address,requestedRole:'owner'},true);assert.ok(wrong.r.status>=400);
}
const cross=await call('base-sepolia','investor','/api/state',undefined,true,cookies['privateinvestor']);assert.equal(cross.r.status,401);
const unscoped=await fetch(origin+'/api/auth/challenge',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});assert.equal(unscoped.status,400);
assert.notEqual(results.find(r=>r.network==='private').vault,results.find(r=>r.network==='base-sepolia').vault);
writeFileSync(join(dir,'validation/api-results.json'),JSON.stringify({at:new Date().toISOString(),origin,results,crossChainCookieRejected:true,unscopedMutationRejected:true},null,2));
console.log('PASS all six roles on both networks, separate products, cookie isolation and mandatory namespace');
