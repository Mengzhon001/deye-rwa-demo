import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {guard,chainId,dir} from '../../scripts/revenue-guidance-local.mjs';
import {launchRole,initializeRole} from './recording/rabby.mjs';
import {BrowserDriver} from './recording/rabby-driver.mjs';
guard();if(process.env.REVENUE_GUIDANCE_LOCAL_QA!=='true')throw Error('Dedicated local QA mode required');
const driver=new BrowserDriver('guidance-local');
try{
 await driver.guardLocalNode();
 const s=await launchRole('guidance-local','investor');driver.sessions.investor=s;await initializeRole(s,{allowImport:true});s.page=await s.context.newPage();await driver.login('investor');
 const before=await driver.state('investor');assert.equal(before.manifest.chainId,chainId);assert.equal(before.chain.phase,'1');assert.equal(before.selectedProduct.kind,'experience');assert.equal(before.mode,'replay');assert(before.accounts.investor.eligible);assert.equal(before.accounts.investor.subscription.amount,'0');assert.equal(before.applications[0].assumptions.revenueModel,'household-export');assert.equal(before.applications[0].assumptions.shareBps,10000);
 await driver.nav('investor','subscribe');await driver.action('investor','subscribe',{amountUSDC6:'10'});
 let state=await driver.state('investor');assert.equal(state.accounts.investor.subscription.amount,'10000000');assert.equal(state.accounts.investor.shares,'0');assert.equal(state.accounts.investor.subscription.approved,false);
 await driver.nav('investor','subscribe');await driver.action('investor','refund');
 state=await driver.state('investor');assert.equal(state.accounts.investor.subscription.amount,'0');assert.equal(state.accounts.investor.usdc,before.accounts.investor.usdc);
 writeFileSync(dir+'/prebuilt-rabby-check.json',JSON.stringify({passed:true,chainId,vault:state.manifest.addresses.vault,source:state.stations[0].source,observedAt:state.stations[0].observedAt,subscriptionUSDC:'10',refunded:true,issuedShares:'0',transactions:driver.proofs.flatMap(p=>p.transactions).map(t=>({hash:t.hash,matched:t.matched,method:t.method}))},null,2));console.log('PASS real Rabby prebuilt-product subscription, escrow status and full refund');
}finally{await driver.close();}
