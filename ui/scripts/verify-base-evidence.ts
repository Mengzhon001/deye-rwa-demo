import hre from 'hardhat';import{Contract}from'ethers';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{join,resolve}from'node:path';
import{RevenueRuntime}from'../src/revenue/runtime';import{PublicReadProvider}from'../src/revenue/public-rpc';import{recordingEvidence}from'../src/revenue/recording-evidence';import{ERC20_ABI}from'../../onchain/scripts/revenue-network';
async function main(){
 const data=process.env.REVENUE_DATA_DIR!,runtime=new RevenueRuntime(data),s=runtime.repo.read(),m=s.manifest!;if(m.chainId!==84532||Number((await hre.ethers.provider.getNetwork()).chainId)!==84532)throw Error('Wrong chain');
 const provider=new PublicReadProvider(process.env.REVENUE_RPC_URL,84532,{staticNetwork:true,batchMaxCount:10});
 runtime.vault=new Contract(m.addresses.vault,(await hre.artifacts.readArtifact(m.contractName!)).abi,provider);
 runtime.station=new Contract(m.addresses.station,(await hre.artifacts.readArtifact('DeyeRWA')).abi,provider);
 runtime.usdc=new Contract(m.addresses.usdc,ERC20_ABI,provider);
 if(m.addresses.billing)runtime.billing=new Contract(m.addresses.billing,(await hre.artifacts.readArtifact('HouseholdBilling')).abi,provider);
 const proofs=[];
 for(const op of s.operations.filter(o=>o.status==='confirmed')){
  const proof=await recordingEvidence(runtime,op.id);if(!proof.offchain&&!proof.matched)throw Error('Evidence mismatch '+op.action+': '+JSON.stringify(proof.transactions.flatMap(t=>t.checks?.filter(c=>!c.matched)||[])));
  proofs.push({...proof,transactions:proof.transactions.map(t=>({...t,checks:t.checks?.map(c=>({field:c.field,matched:c.matched}))}))});console.log('MATCH',op.action,proof.offchain?'offchain':proof.transactions.length);
 }
 const out=resolve(__dirname,'../../docs/validation');mkdirSync(out,{recursive:true});
 const balances=await Promise.all(Object.entries(m.accounts).map(async([role,address])=>({role,address,usdc6:String(await runtime.usdc.balanceOf(address)),ethWei:String(await provider.getBalance(address))})));
 const totals=await runtime.readTogether([{contract:runtime.vault,method:'phase'},{contract:runtime.vault,method:'totalSubscriptions'},{contract:runtime.vault,method:'totalSupply'}]);
 const report={at:new Date().toISOString(),chainId:84532,contracts:m.addresses,proofs,balances,state:{phase:String(totals[0]),escrowUSDC6:String(totals[1]),totalSupply:String(totals[2])}};
 if(report.state.escrowUSDC6!=='0'||report.state.totalSupply!=='0')throw Error('Public test escrow was not fully refunded');
 writeFileSync(join(out,'base-sepolia-transactions-2026-10-29.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS public receipts, calldata, events, amount reconciliation and clean fundraising state');provider.destroy();
}
main().catch(e=>{console.error(e.shortMessage||e.message);process.exitCode=1;});
