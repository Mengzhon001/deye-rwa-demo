/** Read-only Base Sepolia acceptance; no transaction is sent. */
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {Contract,JsonRpcProvider,getAddress} from 'ethers';
const root=resolve(import.meta.dirname,'..');
const dataRoot=resolve(root,'../..');
const dir=resolve(process.env.ORACLE_SEPOLIA_DATA_DIR||join(dataRoot,'.data/oracle-base-sepolia'));
const env=Object.fromEntries(readFileSync(join(dir,'environment.env'),'utf8').trim().split('\n').map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)];}));
const manifest=JSON.parse(readFileSync(join(dir,'application/deployment.json'),'utf8'));
const status=JSON.parse(readFileSync(join(dir,'oracle/status.json'),'utf8'));
const row=status.reports.find(r=>r.purpose==='validation-only'&&r.status==='registered'&&r.transaction);
assert.ok(row,'A real API-derived validation-only report must be registered first');
assert.equal(manifest.chainId,84532);assert.equal(manifest.oracleMode,'self-hosted-signed-v1');
const provider=new JsonRpcProvider(env.REVENUE_RPC_URL,84532,{staticNetwork:true,batchMaxCount:1});
try{
  assert.equal(Number(BigInt(await provider.send('eth_chainId',[]))),84532);
  const receipt=await provider.getTransactionReceipt(row.transaction);assert.equal(receipt?.status,1);
  const registry=new Contract(manifest.addresses.oracleRegistry,[
    'function reporter() view returns(address)',
    'function billing() view returns(address)',
    'function getReport(bytes32) view returns((uint8 purpose,uint32 observationMonth,uint16 servicePeriod,uint32 revision,uint64 issuedAt,uint64 validUntil,uint64 observationEndUtc,uint64 signerEpoch,address vault,address billing,address paymentToken,address payer,bytes32 stationKey,bytes32 billId,bytes32 sourceKind,bytes32 sourceDigest,bytes32 inputDigest,bytes32 paramsHash,uint256 householdAmount,uint256 exportAmount,uint256 costsAmount,uint256 assignedAmount),address,bool,bool,bool)',
  ],provider);
  const billing=new Contract(manifest.addresses.billing,['function registry() view returns(address)','function publishBill(bytes32,bytes32)'],provider);
  const vault=new Contract(manifest.addresses.vault,['function TREASURY() view returns(bytes32)','function hasRole(bytes32,address) view returns(bool)'],provider);
  const report=await registry.getReport(row.reportId);
  assert.ok(report[2]&&!report[3]&&!report[4]);assert.equal(Number(report[0].purpose),0);
  assert.equal(getAddress(await registry.reporter()),getAddress(row.reporter));
  assert.equal(getAddress(await registry.billing()),getAddress(manifest.addresses.billing));
  assert.equal(getAddress(await billing.registry()),getAddress(manifest.addresses.oracleRegistry));
  assert.equal(await vault.hasRole(await vault.TREASURY(),manifest.accounts.treasury),false);
  assert.equal(await vault.hasRole(await vault.TREASURY(),manifest.addresses.billing),true);
  let rejected=false;
  try{await billing.publishBill.staticCall(row.billId,row.reportId,{from:manifest.accounts.agent});}catch(e){rejected=true;assert.match(String(e.shortMessage||e.message),/report unavailable|execution reverted/i);}
  assert.ok(rejected,'Historical validation report must not publish a bill');
  const base=JSON.parse(readFileSync(join(dataRoot,'.data/base-sepolia-test/application/deployment.json'),'utf8'));
  assert.notEqual(manifest.addresses.vault.toLowerCase(),base.addresses.vault.toLowerCase());
  assert.notEqual(manifest.addresses.billing.toLowerCase(),base.addresses.billing.toLowerCase());
  console.log(JSON.stringify({chainId:84532,reportId:row.reportId,registrationTransaction:row.transaction,block:receipt.blockNumber,validationOnlyCannotBill:true,treasuryEOARevoked:true,independentContracts:true}));
}finally{provider.destroy();}
