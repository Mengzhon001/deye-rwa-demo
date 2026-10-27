import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { RevenueManifest } from "../../../onchain/scripts/deploy-revenue";
import {
  Assumptions,
  Station,
  Valuation,
} from "../../../offchain/src/revenue/model";
export type StaticActor =
  | "owner"
  | "agent"
  | "trustee"
  | "trustee2"
  | "investor"
  | "investor2";
export type Actor = StaticActor | `investor:${string}`;
export type Application = {
  id: string;
  stationId: string;
  owner: string;
  status:
    | "submitted"
    | "supplement"
    | "rejected"
    | "approved"
    | "offered"
    | "accepted"
    | "signed"
    | "pooled";
  notes: string;
  assumptions: Assumptions;
  offer?: Valuation;
  priceUSDC6?: string;
  agreementHash?: string;
  agreementSignature?: string;
  revisions?: Array<{
    at: number;
    reason: string;
    offer?: Valuation;
    priceUSDC6?: string;
    agreementHash?: string;
  }>;
  reassessment?: {
    report: Valuation;
    createdAt: number;
    ownerAccepted: boolean;
    trusteeApproved: boolean;
  };
};
export type Operation = {
  id: string;
  actor: Actor;
  action: string;
  bodyHash: string;
  body: Record<string, unknown>;
  status: "running" | "confirmed" | "failed";
  steps: Record<
    string,
    { hash: string; raw: string; status: "sent" | "mined" | "reverted"; block?: number }
  >;
  prepared?: Array<{
    step: string;
    from: string;
    to: string;
    data: string;
    value: string;
  }>;
  error?: string;
  result?: unknown;
  startedAt: number;
};
export type RevenueStore = {
  version: "revenue-rights.v2";
  eligibilityApplications?: Array<{
    id: string;
    investor: Actor;
    address: string;
    submittedAt: number;
    status: "pending" | "approved" | "rejected";
    riskAccepted: true;
    demoAcknowledged: true;
    reviewedAt?: number;
    reviewer?: string;
    reviewNote?: string;
  }>;
  lastReset?: {
    id: string;
    previousVault: string;
    vault: string;
    backup: string;
    at: number;
    stationsPreserved: number;
  };
  manifest: RevenueManifest | null;
  walletInvestors?: string[];
  faucetClaims?: Record<
    string,
    { at: number; ethHash?: string; usdcHash?: string }
  >;
  stations: Station[];
  applications: Application[];
  valuations: Valuation[];
  approvedReports: string[];
  activeReports: Record<string, string>;
  operations: Operation[];
  audit: Array<{
    at: number;
    actor: string;
    action: string;
    entity?: string;
    message: string;
  }>;
  mode: "synthetic" | "live" | "replay";
  poolProjection?: ReturnType<
    typeof import("../../../offchain/src/revenue/pool").projectPool
  >;
  captureFile?: string;
  lastSyncError?: string;
  liveAcceptance: { retrieved: boolean; mapped: boolean; stationId?: string };
  income: Array<{
    id: string;
    stationId: string;
    period: number;
    amountUSDC6: string;
    billing?: ReturnType<typeof import("../../../offchain/src/revenue/model").monthlyRevenue>;
    sourceHash: string;
    collected: boolean;
    payment?: {
      version: "household-usdc.v1";
      payer: string;
      householdUSDC6: string;
      exportUSDC6: string;
      costsUSDC6: string;
      assignedUSDC6: string;
      retainedUSDC6: string;
      roundingDeltaUSDC6: string;
      householdPaid: boolean;
      exportPaid: boolean;
      confirmed: boolean;
      ownerTransaction?: string;
      exportTransaction?: string;
      confirmationTransaction?: string;
    };
  }>;
  receipts: Array<{
    id: string;
    stationId: string;
    amountUSDC6: string;
    sourceHash: string;
    simulated: boolean;
    householdUSDC6?: string;
    exportUSDC6?: string;
    costsUSDC6?: string;
    householdTransaction?: string;
    confirmationTransaction?: string;
    exportSimulated?: boolean;
  }>;
  trades: Array<{
    id: string;
    seller: string;
    buyer: string;
    shares: string;
    payment: string;
    until: number;
    nonce: number;
    status: "proposed" | "consented" | "reviewed" | "settled";
  }>;
  servicing: Array<{
    id: number;
    reason: string;
    stationId: string;
    status: string;
  }>;
  nextTrade: number;
};
export class RevenueRepository {
  private draft?: RevenueStore;
  constructor(readonly path: string) {}
  read(): RevenueStore {
    if (this.draft) return structuredClone(this.draft);
    return this.disk();
  }
  private disk(): RevenueStore {
    if (existsSync(this.path)) {
      const s = JSON.parse(readFileSync(this.path, "utf8"));
      if (s.version !== "revenue-rights.v2")
        throw new Error("Unsupported revenue store version");
      return s;
    }
    return emptyRevenueStore();
  }
  write(state: RevenueStore) {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = this.path + ".tmp";
    writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
    renameSync(temp, this.path);
  }
  update(fn: (s: RevenueStore) => void) {
    const s = this.read();
    fn(s);
    if (this.draft) this.draft = s;
    else this.write(s);
    return s;
  }
  /** Transaction intents survive independently; workflow changes commit atomically with success. */
  durable(fn: (s: RevenueStore) => void) {
    const s = this.disk();
    fn(s);
    this.write(s);
    if (this.draft) {
      this.draft.operations = structuredClone(s.operations);
    }
    return s;
  }
  begin() {
    if (this.draft) throw new Error("Nested workflow transaction");
    this.draft = this.disk();
  }
  commit() {
    if (!this.draft) throw new Error("No workflow transaction");
    this.write(this.draft);
    this.draft = undefined;
  }
  rollback() {
    this.draft = undefined;
  }
}
export function emptyRevenueStore(): RevenueStore {
  return {
    version: "revenue-rights.v2",
    manifest: null,
    walletInvestors: [],
    faucetClaims: {},
    stations: [],
    applications: [],
    eligibilityApplications: [],
    valuations: [],
    approvedReports: [],
    activeReports: {},
    operations: [],
    audit: [],
    mode: "synthetic",
    liveAcceptance: { retrieved: false, mapped: false },
    income: [],
    receipts: [],
    trades: [],
    servicing: [],
    nextTrade: 1,
  };
}
