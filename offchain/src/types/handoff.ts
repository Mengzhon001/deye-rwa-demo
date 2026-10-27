export type FacilityDeploymentSubmission = {
  facilityId: `0x${string}`;
  admin: `0x${string}`;
  serialHash: `0x${string}`;
  siteHash: `0x${string}`;
  metadataHash: `0x${string}`;
  acquisitionCostUSDC6: string;
  commissionedAt: number;
  activateOnMint: boolean;
};

export type TeamBToTeamAInput = {
  facilityId: `0x${string}`;
  periodId: `0x${string}`;
  reviewTimestamp: number;
  signedDecisionUri: string;
  productionReport: {
    amountUSDC6: string;
    evidenceHash: `0x${string}`;
    reportHash: `0x${string}`;
    schemaVersionHash: `0x${string}`;
  };
  cashflowReport: {
    amountUSDC6: string;
    settlementRef: string;
    reportHash: `0x${string}`;
  };
  rewardFunding: {
    amountUSDC6: string;
    claimRoot: `0x${string}`;
  };
};

export type FacilityLifecycleSubmission = {
  facilityId: `0x${string}`;
  status: "PENDING" | "ACTIVE" | "RETIRED";
  eventHash: `0x${string}`;
};

export type TeamAToTeamBOutput = {
  facilityId: `0x${string}`;
  periodId: `0x${string}`;
  productionReportTxHash: `0x${string}`;
  cashflowReportTxHash: `0x${string}`;
  revenueDepositTxHash: `0x${string}`;
  rewardOpenTxHash: `0x${string}`;
  chainStatus: "REPORTED" | "OPENED" | "FAILED";
};
