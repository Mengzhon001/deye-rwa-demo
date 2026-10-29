import {Contract,Provider}from'ethers';
// Official Multicall3 deployment. Used only with eth_call; it never holds funds or signs transactions.
export const MULTICALL3='0xcA11bde05977b3631167028862bE2a173976CA11';
export type ViewCall={contract:Contract;method:string;args?:unknown[]};
export async function readTogether(provider:Provider|undefined,calls:ViewCall[]):Promise<any[]>{
 if(!calls.length)return [];
 if(!provider)return Promise.all(calls.map(c=>c.contract.getFunction(c.method)(...(c.args||[]))));
 const multicall=new Contract(MULTICALL3,['function aggregate3(tuple(address target,bool allowFailure,bytes callData)[] calls) payable returns(tuple(bool success,bytes returnData)[] returnData)'],provider);
 const results=await multicall.aggregate3.staticCall(await Promise.all(calls.map(async c=>({target:await c.contract.getAddress(),allowFailure:false,callData:c.contract.interface.encodeFunctionData(c.method,c.args||[])}))));
 return results.map((r:any,i:number)=>{if(!r.success)throw Error('Read aggregation failed');const decoded=calls[i].contract.interface.decodeFunctionResult(calls[i].method,r.returnData);return decoded.length===1?decoded[0]:decoded;});
}
export async function readNativeBalances(provider:Provider,addresses:string[]):Promise<bigint[]>{
 const multicall=new Contract(MULTICALL3,['function getEthBalance(address) view returns(uint256)'],provider);
 return readTogether(provider,addresses.map(address=>({contract:multicall,method:'getEthBalance',args:[address]})));
}
