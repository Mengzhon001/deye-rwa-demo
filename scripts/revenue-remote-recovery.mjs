// Read-only recovery check, run after restarting the isolated browser-QA node
// and backend. Uses the same real wallet profiles as the full lifecycle.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const rabby=process.env.REVENUE_RECORDING_WALLET==='rabby';
if(process.env.REVENUE_REMOTE_QA!=='true'||(!rabby&&process.env.REVENUE_REMOTE_QA_LOCAL_LOGIN!=='true'))throw Error('Explicit wallet remote QA flags required');
const {BrowserDriver}=await import(rabby?'../ui/scripts/recording/rabby-driver.mjs':'../ui/scripts/recording/browser-driver.mjs');
const {roles,config}=await import('../ui/scripts/recording/environment.mjs');
const c=config('remote-qa');
assert(JSON.parse(readFileSync(join(c.dir,'../compose.json'),'utf8')).name.endsWith('-qa'),'Recovery checks require the isolated QA stack');
const run=readdirSync(join(c.dir,'runs')).sort().at(-1);
const before=JSON.parse(readFileSync(join(c.dir,'runs',run,'final-state.json'),'utf8'));
const driver=new BrowserDriver('remote-qa');
try{
 await driver.start();
 for(const role of roles)await driver.login(role);
 const after=await driver.state();
 assert.equal(after.chain.phase,'4');assert.equal(after.chain.feeMonths,'60');
 assert.equal(after.receipts.length,60);assert(after.applications[0].chainAdmission.released);
 assert.deepEqual(after.manifest,before.manifest);
 assert.equal(after.operations.length,before.operations.length);
 assert.deepEqual(after.stations.map(s=>[s.id,s.observedAt,s.sourceHash]),before.stations.map(s=>[s.id,s.observedAt,s.sourceHash]));
 const confirmed=after.operations.filter(o=>o.status==='confirmed');
 const sample=new Set([...new Map(confirmed.map(o=>[o.action,o.id])).values(),...confirmed.slice(-10).map(o=>o.id)]);
 for(const op of confirmed.filter(o=>sample.has(o.id)))await driver.evidence('agent',op.action,false,op.id);
 const proof=driver.proofs.flatMap(p=>p.transactions).at(-1);
 const indexed=await fetch(c.urls.explorer+'/api/v2/transactions/'+proof.hash).then(r=>{assert(r.ok);return r.json();});
 assert.equal(indexed.status,'ok');
 const result={passed:true,wallet:rabby?'Rabby':'MetaMask',application:c.urls.app,testedAt:new Date().toISOString(),phase:after.chain.phase,receipts:after.receipts.length,operations:after.operations.length,proofs:driver.proofs.length,lastTransaction:proof.hash,indexedBlock:indexed.block_number};
 writeFileSync(join(c.dir,'recovery-result.json'),JSON.stringify(result,null,2));console.log('PASS real '+result.wallet+' re-login, node/backend restart, preserved chain proofs and no repeated operations',JSON.stringify(result));
}finally{await driver.close();}
