import { units } from '../../../offchain/src/revenue/model';
import type { monthlyRevenue } from '../../../offchain/src/revenue/model';
/** Allocate rounded USDC once. One micro-USDC of FX rounding must not become an unfunded receipt. */
export function paymentAmounts(billing: ReturnType<typeof monthlyRevenue>, fxUSDC: number, shareBps: number) {
  const household=BigInt(units(billing.householdPaymentLocal*fxUSDC));
  const exported=BigInt(units(billing.exportRevenueLocal*fxUSDC));
  const gross=household+exported;
  const requestedCost=BigInt(units(billing.costsLocal*fxUSDC));
  const costs=requestedCost>gross?gross:requestedCost;
  const assigned=(gross-costs)*BigInt(shareBps)/10000n;
  return {householdUSDC6:String(household),exportUSDC6:String(exported),costsUSDC6:String(costs),assignedUSDC6:String(assigned),retainedUSDC6:String(gross-costs-assigned),roundingDeltaUSDC6:String(assigned-BigInt(billing.assignedUSDC6))};
}
