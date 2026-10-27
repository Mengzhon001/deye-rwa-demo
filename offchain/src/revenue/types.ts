/** Wire contract for integrations. Money and token quantities are six-decimal integer strings. */
export type RevenueVersion = "revenue-rights.v2";
export type EvidenceRef = {
  version: RevenueVersion;
  hash: string;
  source: "live" | "replay" | "synthetic";
  observedAt: number;
  archiveId: string;
};
export type RevenueRightAgreement = {
  version: RevenueVersion;
  stationId: string;
  owner: string;
  equipmentTransferred: false;
  assignedShareBps: number;
  termMonths: 60;
  start: "product-settlement";
  deductibleCostIds: string[];
  collectionResponsibility: string;
  purchasePriceUSDC6: string;
  agreementHash: string;
  approvedOfferHash: string;
};
export type SubscriptionOrder = {
  version: RevenueVersion;
  investor: string;
  amountUSDC6: string;
  issuanceTermsHash: string;
  coolingEnd?: number; // Legacy contracts only.
  submittedAt: number;
  orderNonce: string;
  approved: boolean;
  status: "awaiting-review" | "approved" | "refunded" | "settled";
  transactionHash: string;
};
export type DistributionPeriod = {
  version: RevenueVersion;
  id: number;
  cutoff: number;
  declaredUSDC6: string;
  claimable: Record<string, string>;
  evidenceHash: string;
  transactionHash: string;
};
export type RedemptionWindow = {
  version: RevenueVersion;
  dealingAt: number;
  cutoff: number;
  navUSDC6: string;
  liquidityUSDC6: string;
  gateBps: 500;
  requests: Array<{
    investor: string;
    escrowedShares6: string;
    filledShares6: string;
    paidUSDC6: string;
  }>;
  transactionHash?: string;
};
export type PeerTransfer = {
  version: RevenueVersion;
  id: string;
  seller: string;
  buyer: string;
  shares6: string;
  paymentUSDC6: string;
  expiry: number;
  intermediaryApproval?: string;
  settlementHash?: string;
};
export type ServicingCase = {
  version: RevenueVersion;
  id: number;
  reason:
    | "missing-remittance"
    | "diverted-receipts"
    | "breached-obligations"
    | "prolonged-incident";
  evidenceHash: string;
  snapshotSupply6: string;
  support6: string;
  trusteeApprovals: string[];
  recipient: string;
  executed: boolean;
};
