import assert from 'node:assert/strict';
import hre from 'hardhat';
import {zeroPadValue,keccak256} from 'ethers';
// Local Anvil maintenance only. This is not a proxy upgrade or a business transaction.
export async function monthlyCode(addresses:{usdc:string;stationToken:string;feeRecipient:string}) {
  async function build(name:string){
    const fqn=`contracts/revenue/${name}.sol:${name}`,info:any=await hre.artifacts.getBuildInfo(fqn);
    assert(info,'Compile contracts first');const [source]=fqn.split(':'),contract=info.output.contracts[source][name];
    const declarations=new Map<string,string>();
    function visit(node:any){if(!node||typeof node!=='object')return;if(node.nodeType==='VariableDeclaration')declarations.set(String(node.id),node.name);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
    Object.values(info.output.sources).forEach((s:any)=>visit(s.ast));
    let code=contract.evm.deployedBytecode.object;
    for(const [id,refs]of Object.entries(contract.evm.deployedBytecode.immutableReferences) as any){const label=declarations.get(id)!;assert(label in addresses,`Unknown immutable ${label}`);for(const r of refs){const value=zeroPadValue(addresses[label as keyof typeof addresses],r.length).slice(2);code=code.slice(0,r.start*2)+value+code.slice((r.start+r.length)*2);}}
    const layout=contract.storageLayout;assert(layout,'Storage layout required');
    function type(id:string):any{const t=layout.types[id];return{encoding:t.encoding,label:t.label.replace(/RevenueShareVaultV[45]/g,'RevenueShareVault'),bytes:t.numberOfBytes,...(t.key?{key:type(t.key)}:{}),...(t.value?{value:type(t.value)}:{}),...(t.base?{base:type(t.base)}:{}),...(t.members?{members:t.members.map((m:any)=>({label:m.label,slot:m.slot,offset:m.offset,type:type(m.type)}))}:{})};}
    return{code:'0x'+code,layout:layout.storage.map((v:any)=>({label:v.label,slot:v.slot,offset:v.offset,type:type(v.type)}))};
  }
  const old=await build('RevenueShareVaultV4'),next=await build('RevenueShareVaultV5');assert.deepEqual(next.layout,old.layout,'Storage-incompatible monthly code');
  return {oldCode:old.code,code:next.code,oldCodeHash:keccak256(old.code),codeHash:keccak256(next.code),storageCompatible:true};
}
export function executable(code:string){const bytes=Number.parseInt(code.slice(-4),16);return code.slice(0,-(bytes+2)*2);}
