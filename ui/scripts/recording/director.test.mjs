import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Director} from './director.mjs';

test('an earlier successful transaction or missing decoded events cannot satisfy explorer readiness',async()=>{
 const original=globalThis.fetch,states=[];let current=0;
 const director=Object.create(Director.prototype);
 director.c={urls:{explorer:'http://recording.invalid'}};
 director.setScene=async state=>states.push(state);
 globalThis.fetch=async url=>{
  if(url.endsWith('/logs'))return {ok:true,json:async()=>({items:current<4?[]:[{address:{hash:'0xab'},decoded:{method_call:'StationAdmitted(bytes32 stationId)'}}]})};
  current++;if(current===1)return {ok:false,status:404};
  return {ok:true,json:async()=>({hash:current===2?'0xprevious':'0xcurrent',block_number:19})};
 };
 try{
  await director.waitForIndex({hash:'0xcurrent',blockNumber:19,events:[{contract:'0xab',name:'StationAdmitted'}]});
  assert.equal(current,4);
  assert.match(states[0].proof,/等待 Blockscout 索引/);
 }finally{globalThis.fetch=original;}
});
