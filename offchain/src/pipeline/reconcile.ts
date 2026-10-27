export type ReconciliationInput = {
  periodId: string;
  inflowUSDC6: string;
  fundedUSDC6: string;
  claimedUSDC6: string;
};

export type ReconciliationOutput = {
  periodId: string;
  inflowUSDC6: string;
  fundedUSDC6: string;
  claimedUSDC6: string;
  remainingUSDC6: string;
  reconciled: boolean;
};

export function reconcilePeriod(input: ReconciliationInput): ReconciliationOutput {
  const inflow = BigInt(input.inflowUSDC6);
  const funded = BigInt(input.fundedUSDC6);
  const claimed = BigInt(input.claimedUSDC6);

  const remaining = inflow - funded;
  const reconciled = inflow >= funded && funded >= claimed;

  return {
    periodId: input.periodId,
    inflowUSDC6: inflow.toString(),
    fundedUSDC6: funded.toString(),
    claimedUSDC6: claimed.toString(),
    remainingUSDC6: remaining.toString(),
    reconciled
  };
}
