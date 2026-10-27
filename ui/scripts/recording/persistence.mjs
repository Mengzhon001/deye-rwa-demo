import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {launchRole} from './metamask.mjs';
import {config,base} from './environment.mjs';

const [mode='before',stage='recording',input]=process.argv.slice(2),run=resolve(input||''),c=config(stage);
assert(['before','after'].includes(mode));
const take=JSON.parse(readFileSync(join(run,'run.json'),'utf8'));assert.equal(take.status,'complete');
const s=await launchRole(stage,'agent');let state;
try{const r=await s.context.request.get(c.urls.app+'/api/state');assert(r.ok(),'The preserved test session must still be valid');state=await r.json();}finally{await s.context.close();}
assert.equal(state.chain.phase,'4');
const block=async url=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]})});return(await r.json()).result;};
const stable={manifest:state.manifest,operations:state.operations.map(o=>({id:o.id,action:o.action,status:o.status})),income:state.income,receipts:state.receipts,cases:state.cases,applications:state.applications.map(a=>({id:a.id,status:a.status,chainAdmission:a.chainAdmission})),source:state.stations.map(s=>({id:s.id,observedAt:s.observedAt,sourceHash:s.sourceHash})),chain:Object.fromEntries(['phase','vaultCash','unpaidDistributions','feeLiability','expenseLiability','feeMonths','totalSupply','distributionCount','collectionRecipient'].map(k=>[k,state.chain[k]]))};
const snapshot={at:new Date().toISOString(),chainId:c.chainId,block:await block(c.urls.rpc),fingerprint:createHash('sha256').update(JSON.stringify(stable)).digest('hex'),operations:stable.operations.length,receipts:stable.receipts.length,contracts:state.manifest.addresses};
const original=JSON.parse(readFileSync(join(base,'original-environment.json'),'utf8'));
const current=await fetch('http://127.0.0.1:4174/api/public/deployment').then(r=>r.json());
assert.equal(current.chainId,original.chainId);assert.equal(await block('http://127.0.0.1:18545'),original.block);
for(const contract of original.contracts){const found=current.contracts.find(c=>c.name===contract.name);assert.equal(found.address.toLowerCase(),contract.address.toLowerCase());assert.equal(found.deploymentTransaction,contract.tx);}
snapshot.originalEnvironmentUnchanged=true;
if(mode==='before')writeFileSync(join(run,'persistence-before.json'),JSON.stringify(snapshot,null,2));
else{
 const before=JSON.parse(readFileSync(join(run,'persistence-before.json'),'utf8'));
 assert.equal(snapshot.fingerprint,before.fingerprint,'Business state changed after service restart');
 assert.equal(snapshot.block,before.block,'Chain history changed after service restart');
 writeFileSync(join(run,'persistence.json'),JSON.stringify({before,after:snapshot,passed:true},null,2));
}
console.log('PASS '+mode+' restart snapshot: '+snapshot.operations+' business operations and '+snapshot.receipts+' periods; original demo unchanged.');
