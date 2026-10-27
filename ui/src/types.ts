import type { DemoDeploymentManifest } from "../../onchain/scripts/deploy";
import type {
  FacilityDeploymentInput,
  FacilityDeploymentRecord,
  FacilityLifecycleEvent,
  FacilityLifecycleEventInput
} from "../../offchain/src/types/schemas";

export type UiMessageKey =
  | "messages.notice.marketStateRealOnchainDemoUsdc"
  | "messages.notice.simulationDisclosure"
  | "messages.notice.networkModeLocalhost"
  | "messages.notice.networkModeNonLocalhost"
  | "messages.activity.schedulerTickSettled"
  | "messages.activity.periodSubmission"
  | "messages.activity.vaultClaim"
  | "messages.activity.schedulerTickPaused"
  | "messages.activity.schedulerSkipStatus"
  | "messages.activity.schedulerSkipIneligible"
  | "messages.activity.deployment"
  | "messages.activity.vaultDeposit"
  | "messages.activity.lifecycle"
  | "messages.activity.demoUsdcFaucet"
  | "messages.activity.demoEthFaucet"
  | "messages.activity.marketBuy"
  | "messages.activity.marketRedeem"
  | "messages.activity.tokenApproval"
  | "messages.tx.approveDemoUsdc"
  | "messages.tx.buyDbond"
  | "messages.tx.approveDbond"
  | "messages.tx.redeemDbond"
  | "messages.legacy.text";

export type UiMessage = {
  key: UiMessageKey;
  values?: Record<string, string>;
};

export type ActivityEntry = {
  id: string;
  timestamp: number;
  source: "onchain" | "scheduler" | "system";
  kind:
    | "DEPLOYMENT"
    | "VAULT_DEPOSIT"
    | "PERIOD_SUBMISSION"
    | "VAULT_CLAIM"
    | "LIFECYCLE"
    | "MARKET_BUY"
    | "MARKET_REDEEM"
    | "TOKEN_APPROVAL"
    | "DEMO_USDC_FAUCET"
    | "DEMO_ETH_FAUCET"
    | "SCHEDULER_TICK"
    | "SCHEDULER_SKIP";
  summary: UiMessage;
  status: "PENDING" | "MINED" | "INFO";
  txHash?: `0x${string}`;
  walletAddress?: `0x${string}`;
  facilityAssetId?: `0x${string}`;
  amountUSDC6?: string;
  shareAmount?: string;
};

export type MarketTradeRecord = {
  id: string;
  kind: "BUY" | "REDEEM" | "APPROVAL" | "FAUCET";
  walletAddress: `0x${string}`;
  txHash?: `0x${string}`;
  shareAmount?: string;
  amountUSDC6?: string;
  status: "PENDING" | "MINED";
  createdAt: number;
};

export type ManagedFacilityRecord = {
  facility: FacilityDeploymentRecord;
  displayName: string;
  onchainStatus: "NOT_DEPLOYED" | "ACTIVE" | "PENDING" | "RETIRED";
  currentHolder: string | null;
  deploymentTxHash?: `0x${string}`;
  vaultDepositTxHash?: `0x${string}`;
  latestLifecycleEvent?: FacilityLifecycleEvent;
  latestPeriodId?: string;
  totalRewardedUSDC6: string;
  tickCount: number;
  nextRevenueTickAtMs: number;
  lastSettlementEndTs?: number;
};

export type ManagedPeriodRecord = {
  facilityAssetId: `0x${string}`;
  facilityDisplayId: string;
  periodId: string;
  rewardAmountUSDC6: string;
  productionAmountUSDC6: string;
  cashflowAmountUSDC6: string;
  rewardStatus: "OPENED" | "CLAIMED";
  claimMode: "VAULT";
  txHashes: {
    productionReportTxHash: `0x${string}`;
    cashflowReportTxHash: `0x${string}`;
    revenueDepositTxHash: `0x${string}`;
    rewardOpenTxHash: `0x${string}`;
    claimTxHash?: `0x${string}`;
  };
};

export type DemoStore = {
  manifest: DemoDeploymentManifest | null;
  facilities: ManagedFacilityRecord[];
  periods: ManagedPeriodRecord[];
  marketTrades: MarketTradeRecord[];
  activity: ActivityEntry[];
  scheduler: {
    tickIntervalMs: number;
    economicPeriodSec: number;
    autoMode: boolean;
  };
  lastUpdatedAt: number;
};

export type ManagerOverview = {
  facilitiesTotal: number;
  activeFacilities: number;
  pendingFacilities: number;
  retiredFacilities: number;
  periodsClaimed: number;
  totalRewardsUSDC6: string;
  bondSupplyOnchain: string;
  marketInventoryOnchain: string;
  reserveUSDC6: string;
};

export type ContractHealth = {
  network: string;
  chainId: number;
  addresses: DemoDeploymentManifest["contracts"];
  accounts: DemoDeploymentManifest["accounts"];
  totalVaultAssetsUSDC6: string;
  navPerShareUSDC6: string;
  backingFacilityCount: number;
  dbondTotalSupply: string;
  marketInventoryDBOND: string;
  marketReserveUSDC6: string;
  marketPriceUSDC6: string;
};

export type InvestorSnapshot = {
  walletAddress: `0x${string}` | null;
  onchainBalance: string;
  usdcBalance: string;
  nativeBalanceWei: string;
  marketTrades: MarketTradeRecord[];
};

export type UiState = {
  managerOverview: ManagerOverview;
  facilities: ManagedFacilityRecord[];
  periods: ManagedPeriodRecord[];
  bondMetrics: {
    totalSupplyOnchain: string;
    marketInventoryOnchain: string;
    marketReserveUSDC6: string;
    navPerShareUSDC6: string;
    marketPriceUSDC6: string;
    returnPct: string;
    simulatedApyPct: string;
  };
  contractHealth: ContractHealth;
  investor: InvestorSnapshot;
  scheduler: DemoStore["scheduler"] & {
    nextTickAtMs: number | null;
  };
  activity: ActivityEntry[];
  notices: {
    marketState: UiMessage;
    simulationDisclosure: UiMessage;
    networkMode: UiMessage;
  };
};

export type ManagerDeployRequest = {
  deploymentInput: FacilityDeploymentInput;
  adminAddress?: `0x${string}`;
};

export type ManagerLifecycleRequest = {
  facilityAssetId: `0x${string}`;
  eventInput: FacilityLifecycleEventInput;
};

export type InvestorTradeRequest = {
  walletAddress: `0x${string}`;
  amountUnits: number;
};

export type InvestorTxPreparation = {
  kind: "BUY" | "REDEEM";
  walletAddress: `0x${string}`;
  shareAmount: string;
  amountUSDC6: string;
  steps: Array<{
    kind: "TOKEN_APPROVAL" | "MARKET_BUY" | "MARKET_REDEEM";
    label: UiMessage;
    amountUSDC6?: string;
    shareAmount?: string;
    request: {
      from: `0x${string}`;
      to: `0x${string}`;
      data: `0x${string}`;
      value?: `0x${string}`;
    };
  }>;
};

export type MarketTxRecordRequest = {
  walletAddress: `0x${string}`;
  txHash: `0x${string}`;
  kind: ActivityEntry["kind"];
  shareAmount?: string;
  amountUSDC6?: string;
};
