import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentAmounts} from './household-billing';
import type {monthlyRevenue} from '../../../offchain/src/revenue/model';
const bill=(household:number,exported:number,costs:number,assigned='0')=>({householdPaymentLocal:household,exportRevenueLocal:exported,costsLocal:costs,assignedUSDC6:assigned} as ReturnType<typeof monthlyRevenue>);
test('separate FX rounding conserves every micro-USDC at 100% and 80% assignment',()=>{
 for(const bps of [10000,8000]){const p=paymentAmounts(bill(2020.72,331.84,8.75),0.14,bps);assert.equal(p.householdUSDC6,'282900800');assert.equal(p.exportUSDC6,'46457600');assert.equal(BigInt(p.householdUSDC6)+BigInt(p.exportUSDC6),BigInt(p.costsUSDC6)+BigInt(p.assignedUSDC6)+BigInt(p.retainedUSDC6));if(bps===10000)assert.equal(p.retainedUSDC6,'0');}
 const tiny=paymentAmounts(bill(0.0000006,0.0000006,0,'1'),1,10000);assert.equal(tiny.assignedUSDC6,'2');assert.equal(tiny.roundingDeltaUSDC6,'1');
});
test('zero household usage is not invoiced and expenses cannot allocate more than funded gross cash',()=>{
 const p=paymentAmounts(bill(0,20,30),1,10000);assert.equal(p.householdUSDC6,'0');assert.equal(p.costsUSDC6,'20000000');assert.equal(p.assignedUSDC6,'0');assert.equal(p.retainedUSDC6,'0');
});
