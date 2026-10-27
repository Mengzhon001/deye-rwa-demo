import { addMonths, amount, hash, irr, units, Valuation } from "./model";

/** Deterministic hold-to-expiry illustration. No secondary trades/redemptions assumed.
 * Pool-wide costs are charged once, independently of the number of station reports.
 * Fees on projected opening NAV are iterated because projected NAV deducts future fees.
 */
export function projectPool(
  reports: Valuation[],
  input: {
    cashUSDC6: string;
    purchasePriceUSDC6: string;
    monthlyCostUSDC6: string;
    receivablesUSDC6?: string;
    distributionIntervalMonths?: 1 | 3;
  }
) {
  const interval=input.distributionIntervalMonths||3;
  if(![1,3].includes(interval))throw new Error("Unsupported distribution interval");
  if (!reports.length) throw new Error("Pool needs station reports");
  const first = reports[0],
    asOf = first.asOf,
    start = first.startAt,
    term = first.assumptions.termMonths;
  if (
    reports.some(
      (r) =>
        r.asOf !== asOf ||
        r.startAt !== start ||
        r.assumptions.termMonths !== term
    )
  )
    throw new Error("Pool reports must share cutoff and term");
  const discount = first.assumptions.discountBps / 10000,
    monthlyCost = amount(input.monthlyCostUSDC6);
  const rows = reports.flatMap((r) => r.rows).sort((a, b) => a.dueAt - b.dueAt);
  const principal = amount(input.purchasePriceUSDC6),
    initialCash =
      amount(input.cashUSDC6) + amount(input.receivablesUSDC6 || "0");
  const initialInvestment = principal + initialCash;
  const schedule = Array.from({ length: term }, (_, i) => ({
    month: i + 1,
    at: addMonths(start, i + 1),
  })).filter((m) => m.at > asOf);
  let estimates = schedule.map(() => 0),
    finalFlows: Array<{ at: number; value: number }> = [],
    fees: number[] = [],
    periods: Array<{ month: number; at: number; receiptsUSDC6: string; feeUSDC6: string; mandatoryCostUSDC6: string; payoutUSDC6: string; endingCashUSDC6: string; redemptionRetainedUSDC6: string }> = [],
    unfunded = false;
  for (let iteration = 0; iteration < 24; iteration++) {
    let cash = initialCash,
      receipts = 0,
      quarterCosts = 0,
      redemptionRetained = 0,
      cursor = asOf,
      consumed = 0;
    finalFlows = [{ at: asOf, value: -initialInvestment }];
    fees = [];
    periods = [];
    unfunded = false;
    for (let i = 0; i < schedule.length; i++) {
      const point = schedule[i];
      let periodReceipts = 0, periodPayout = 0;
      const rights = rows
        .filter((r) => r.dueAt > cursor)
        .reduce(
          (v, r) =>
            v +
            amount(r.assignedUSDC6) /
              (1 + discount) ** ((r.dueAt - cursor) / 31557600),
          0
        );
      const remainingExpenses = schedule
        .slice(i)
        .reduce(
          (v, m, j) =>
            v +
            (monthlyCost + estimates[i + j]) /
              (1 + discount) ** ((m.at - cursor) / 31557600),
          0
        );
      const openingNAV = Math.max(
        0,
        cash + rights - remainingExpenses - quarterCosts
      );
      const fee = (openingNAV * 0.005) / 12;
      fees.push(fee);
      quarterCosts += fee + monthlyCost;
      while (consumed < rows.length && rows[consumed].dueAt <= point.at) {
        const value = amount(rows[consumed++].assignedUSDC6);
        cash += value;
        receipts += value;
        periodReceipts += value;
      }
      if (point.month % interval === 0) {
        if (cash < quarterCosts) unfunded = true;
        cash = Math.max(0, cash - quarterCosts);
        redemptionRetained = Math.min(
          redemptionRetained,
          Math.max(0, cash - monthlyCost * 6)
        );
        const surplus = Math.min(
          Math.max(0, receipts - quarterCosts),
          Math.max(0, cash - monthlyCost * 6 - redemptionRetained)
        );
        const payout = surplus * 0.75;
        periodPayout = payout;
        redemptionRetained += surplus - payout;
        cash -= payout;
        finalFlows.push({ at: point.at, value: payout });
        receipts = 0;
        quarterCosts = 0;
      }
      periods.push({ month: point.month, at: point.at, receiptsUSDC6: units(periodReceipts), feeUSDC6: units(fee), mandatoryCostUSDC6: units(monthlyCost), payoutUSDC6: units(periodPayout), endingCashUSDC6: units(cash), redemptionRetainedUSDC6: units(redemptionRetained) });
      cursor = point.at;
    }
    const winddown = Math.max(
      addMonths(start, term),
      ...rows.map((r) => r.dueAt),
      asOf
    );
    cash += rows
      .slice(consumed)
      .reduce((v, r) => v + amount(r.assignedUSDC6), 0);
    finalFlows.push({ at: winddown, value: Math.max(0, cash - quarterCosts) });
    estimates = fees;
  }
  const futureExpenses = schedule.reduce(
    (v, m, i) =>
      v +
      (monthlyCost + fees[i]) / (1 + discount) ** ((m.at - asOf) / 31557600),
    0
  );
  const result = {
    version: "pool-projection.v3",
    distributionIntervalMonths: interval,
    periods,
    asOf,
    sourceReports: reports.map((r) => r.reportHash),
    initialInvestmentUSDC6: units(initialInvestment),
    futureExpensesUSDC6: units(futureExpenses),
    projectedNetIRRPct: irr(finalFlows),
    unfundedExpenses: unfunded,
    cashflows: finalFlows.map((f) => ({
      at: f.at,
      valueUSDC6: Math.round(f.value * 1e6).toString(),
    })),
    assumptions:
      `Hold to expiry, no early exits; collectible receivables assumed collected before next dealing; projected monthly NAV, settlement-relative ${interval===1?"monthly":"quarterly"} distributions, observed history plus simulated tariffs/FX/costs`,
  };
  return { ...result, hash: hash(result) };
}
