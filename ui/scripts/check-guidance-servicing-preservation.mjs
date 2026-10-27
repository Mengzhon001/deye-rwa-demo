import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {JsonRpcProvider} from 'ethers';
import {guard,root,dir,urls,chainId} from '../../scripts/revenue-guidance-local.mjs';
guard();const folder=dir+'/service-check',before=JSON.parse(readFileSync(folder+'/environment-before.json')),digest=x=>createHash('sha256').update(x).digest('hex');
function walk(d){return readdirSync(d).flatMap(n=>{const file=join(d,n);return statSync(file).isDirectory()?walk(file):[file];});}
const comparisons=[];
for(const path of walk(folder+'/before-application').filter(f=>f.endsWith('/store.json'))){const name=relative(folder+'/before-application',path),old=JSON.parse(readFileSync(path)),current=JSON.parse(readFileSync(join(folder+'/after-application',name)));const {audit:oldAudit,...oldBusiness}=old,{audit:newAudit,...newBusiness}=current;assert.deepEqual(newBusiness,oldBusiness,`Business progress changed: ${name}`);const extra=newAudit.slice(oldAudit.length);assert.deepEqual(newAudit.slice(0,oldAudit.length),oldAudit);assert(extra.every(e=>e.action==='contract-verification'),'Only startup source-verification audit entries may be appended');comparisons.push({file:name,businessUnchanged:true,startupVerificationAuditEntries:extra.length});}
const provider=new JsonRpcProvider(urls.rpc);assert.equal(Number((await provider.getNetwork()).chainId),chainId);const block=await provider.getBlock('latest');assert.deepEqual({number:block.number,hash:block.hash,timestamp:block.timestamp},before.block,'The local chain or financial time changed');provider.destroy();
for(const [file,expected]of Object.entries(before.remote))assert.equal(digest(readFileSync(root+'/'+file)),expected,'Public environment configuration changed');
const assets=['app.js','product.js','investor.js','workflow.js','guidance.js','guidance-model.js','style.css'];
for(const name of assets){const response=await fetch(urls.app+'/'+name);assert(response.ok);assert.equal(digest(Buffer.from(await response.arrayBuffer())),digest(readFileSync(root+'/ui/public/revenue/'+name)),`Stale deployed asset: ${name}`);}
const network=await fetch(urls.app+'/api/network').then(r=>r.json());assert.equal(network.chainId,chainId);assert.equal(network.guidanceEnabled,true);
const result={passed:true,at:new Date().toISOString(),chainId,block:before.block,comparisons,publicConfigUnchanged:true,servedAssetsMatch:assets};writeFileSync(folder+'/preservation.json',JSON.stringify(result,null,2),{mode:0o600});console.log(`PASS preservation: ${comparisons.length} stores, chain/time, public configuration and ${assets.length} served assets unchanged or matching source.`);
