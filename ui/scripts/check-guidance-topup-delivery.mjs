import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Contract,JsonRpcProvider} from 'ethers';
import {guard,root,dir,urls,chainId} from '../../scripts/revenue-guidance-local.mjs';
guard();const p=JSON.parse(readFileSync(dir+'/topup-upgrade.json')),provider=new JsonRpcProvider(urls.rpc);
try{
 assert(p.completed);assert.equal(Number(BigInt(await provider.send('eth_chainId',[]))),chainId);
 const deployment=await fetch(urls.app+'/api/public/deployment').then(r=>r.json());
 const manifest=JSON.parse(readFileSync(dir+'/experience-product.json'));
 assert.equal(manifest.vault,p.newVault);
 const vault=new Contract(p.newVault,['function totalSubscriptions() view returns(uint256)','function totalSupply() view returns(uint256)','function eligible(address) view returns(bool)','function usdc() view returns(address)'],provider);
 assert.equal(await vault.totalSubscriptions(),0n);assert.equal(await vault.totalSupply(),0n);
 const token=new Contract(await vault.usdc(),['function balanceOf(address) view returns(uint256)','event Transfer(address indexed from,address indexed to,uint256 value)'],provider);
 const refundChecks=[];
 for(const order of p.orders){
  assert(order.refunded&&order.creditDone);assert.equal(await token.balanceOf(order.address),BigInt(order.newTestBalance));if(order.eligible)assert(await vault.eligible(order.address));
  const tx=p.transactions['refund-'+order.address+':review-order'],receipt=await provider.getTransactionReceipt(tx.hash);assert.equal(receipt.status,1);
  const received=receipt.logs.filter(l=>l.address.toLowerCase()===p.oldToken.toLowerCase()).flatMap(l=>{try{return[token.interface.parseLog(l)];}catch{return[];}}).filter(l=>l?.name==='Transfer'&&l.args.from.toLowerCase()===p.oldVault.toLowerCase()&&l.args.to.toLowerCase()===order.address.toLowerCase()).reduce((sum,l)=>sum+l.args.value,0n);
  assert.equal(received,BigInt(order.amount));assert((await fetch(urls.explorer+'/api/v2/transactions/'+tx.hash)).ok);
  refundChecks.push({address:order.address,refundedUSDC6:order.amount,newTestBalanceUSDC6:order.newTestBalance,refundHash:tx.hash,explorer:urls.explorer+'/tx/'+tx.hash});
 }
 const hashes={};for(const name of ['investor.js','product.js','guidance-model.js']){const expected=readFileSync(root+'/ui/public/revenue/'+name),actual=Buffer.from(await fetch(urls.app+'/'+name).then(r=>r.arrayBuffer()));assert.deepEqual(actual,expected);hashes[name]=createHash('sha256').update(actual).digest('hex');}
 for(const [name,hash]of Object.entries(p.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(root+'/.data/remote-demo/'+name)).digest('hex'),hash);
 const contracts=Array.isArray(deployment.contracts)?deployment.contracts:Object.values(deployment.contracts||{});assert.equal(contracts.length,3);assert(contracts.every(c=>c.sourceMatch===true),'Public deployment source hashes must match chain code');
 writeFileSync(dir+'/topup-check/delivery.json',JSON.stringify({passed:true,at:new Date().toISOString(),chainId,vault:p.newVault,refundChecks,assetHashes:hashes,remoteConfigurationUnchanged:true,sourceMatches:true},null,2));
 console.log('PASS local V4 delivery, actual refunds, restored demo balances and eligibility, deployed source and unchanged remote configuration');
}finally{provider.destroy();}
