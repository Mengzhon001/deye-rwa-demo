import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Contract,Interface} from 'ethers';
import {MULTICALL3,readTogether,readNativeBalances} from './multiread';

test('native balances for several wallets use one read and retain address order',async()=>{
 const accounts=['0x'+'1'.repeat(40),'0x'+'2'.repeat(40),'0x'+'3'.repeat(40)];
 const abi=new Interface(['function aggregate3(tuple(address target,bool allowFailure,bytes callData)[] calls) payable returns(tuple(bool success,bytes returnData)[] returnData)','function getEthBalance(address) view returns(uint256)']);
 let calls=0;
 const provider:any={call:async(tx:any)=>{
  calls++;assert.equal(tx.to.toLowerCase(),MULTICALL3.toLowerCase());
  const entries=abi.decodeFunctionData('aggregate3',tx.data)[0];
  assert.deepEqual(entries.map((entry:any)=>abi.decodeFunctionData('getEthBalance',entry.callData)[0].toLowerCase()),accounts);
  return abi.encodeFunctionResult('aggregate3',[entries.map((_:any,i:number)=>({success:true,returnData:abi.encodeFunctionResult('getEthBalance',[BigInt(i+1)*10n**18n])}))]);
 }};
 assert.deepEqual(await readNativeBalances(provider,accounts),[10n**18n,2n*10n**18n,3n*10n**18n]);assert.equal(calls,1);
 assert.deepEqual(await readNativeBalances(provider,[]),[]);assert.equal(calls,1);
});
test('mixed batched reads preserve tuples, amounts and booleans and reject an incomplete result',async()=>{
 const abi=new Interface(['function aggregate3(tuple(address target,bool allowFailure,bytes callData)[] calls) payable returns(tuple(bool success,bytes returnData)[] returnData)']);
 const token=new Contract('0x'+'1'.repeat(40),['function value() view returns(uint256)','function eligible() view returns(bool)','function subscription() view returns(uint256 amount,bool approved)']);
 let fail=false;
 const provider:any={call:async()=>abi.encodeFunctionResult('aggregate3',[[{success:true,returnData:token.interface.encodeFunctionResult('value',[123456789n])},{success:!fail,returnData:token.interface.encodeFunctionResult('eligible',[true])},{success:true,returnData:token.interface.encodeFunctionResult('subscription',[456n,false])}]])};
 const calls=['value','eligible','subscription'].map(method=>({contract:token,method}));
 const result=await readTogether(provider,calls);assert.equal(result[0],123456789n);assert.equal(result[1],true);assert.equal(result[2].amount,456n);assert.equal(result[2].approved,false);
 fail=true;await assert.rejects(readTogether(provider,calls),/Read aggregation failed/);
});
