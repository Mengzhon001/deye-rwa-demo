import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {monthlyCode} from '../../onchain/scripts/monthly-code';
const folder=resolve(process.cwd(),'.data/guidance-local/monthly-distribution-check'),base=join(folder,'before-application');
async function main(){
 const catalog=JSON.parse(readFileSync(join(base,'products.json'),'utf8'));
 const products=[];
 for(const entry of catalog.products.filter((e:any)=>!e.archived)){
  const relative=entry.key==='primary'?'':'products/'+entry.key,store=JSON.parse(readFileSync(join(base,relative,'store.json'),'utf8')),m=store.manifest;
  assert.equal(m.chainId,20261014);if(m.contractName==='RevenueShareVaultV5')continue;assert.equal(m.contractName,'RevenueShareVaultV4');
  const patch=await monthlyCode({usdc:m.addresses.usdc,stationToken:m.addresses.station,feeRecipient:m.accounts.treasury});
  products.push({key:entry.key,relative,vault:m.addresses.vault,...patch});
 }
 writeFileSync(join(folder,'plan.json'),JSON.stringify({chainId:20261014,products},null,2),{mode:0o600});console.log(`Prepared ${products.length} storage-compatible local monthly-code updates.`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
