import hre from "hardhat";
import { paymentAmounts } from "./household-billing";
import {
  Contract,
  HDNodeWallet,
  TransactionRequest,
  keccak256,
  getAddress,
  verifyMessage,
} from "ethers";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import {
  deployRevenue,
  RevenueManifest,
  verifyRevenue,
} from "../../../onchain/scripts/deploy-revenue";
import {
  addMonths,
  amount,
  AssumptionsSchema,
  forecast,
  monthlyRevenue,
  hash,
  irr,
  units,
  Valuation,
  valuationBlockReason,
} from "../../../offchain/src/revenue/model";
import { analyzeBaseline } from "../../../offchain/src/revenue/baseline";
import {
  demoAssumptions,
  syntheticStation,
} from "../../../offchain/src/revenue/fixtures";
import { projectPool } from "../../../offchain/src/revenue/pool";
import {
  DeyeClient,
  deyeConfig,
  fieldMapping,
  replayCapture,
} from "../../../offchain/src/revenue/deye";
import {
  Actor,
  StaticActor,
  Application,
  Operation,
  RevenueRepository,
  RevenueStore,
  emptyRevenueStore,
} from "./store";

const staticActors = [
  "owner",
  "agent",
  "trustee",
  "trustee2",
  "investor",
  "investor2",
] as const;
type Role = "owner" | "agent" | "trustee" | "investor";
const actorSchema = z.string().refine(
  (value): value is Actor =>
    staticActors.includes(value as StaticActor) ||
    /^investor:0x[0-9a-f]{40}$/u.test(value),
  "Invalid actor"
);
function roleOfActor(actor: Actor): Role {
  if (actor === "investor" || actor === "investor2" || actor.startsWith("investor:"))
    return "investor";
  if (actor === "trustee" || actor === "trustee2") return "trustee";
  if (actor === "owner" || actor === "agent") return actor;
  throw new Error("Unknown actor role");
}
const uint = z.string().regex(/^[1-9]\d{0,17}$/);
const access: Record<string, readonly Role[]> = {
  source: ["agent"],
  sync: ["agent"],
  discover: ["agent"],
  apply: ["owner"],
  supplement: ["owner"],
  review: ["agent"],
  offer: ["agent"],
  "reopen-offer": ["agent"],
  "prepare-reassessment": ["agent"],
  "approve-reassessment": ["trustee"],
  "accept-reassessment": ["owner"],
  "approve-offer": ["trustee"],
  accept: ["owner"],
  sign: ["owner"],
  "mint-station": ["agent"],
  "custody-consent": ["owner"],
  admit: ["agent"],
  "prepare-valuation": ["agent"],
  "approve-valuation": ["trustee"],
  publish: ["agent"],
  eligible: ["agent"],
  "apply-eligibility": ["investor"],
  subscribe: ["investor"],
  "review-subscription": ["agent"],
  refund: ["investor"],
  settle: ["agent"],
  fail: ["agent"],
  advance: ["agent"],
  "accrue-fee": ["agent"],
  "book-revenue": ["agent"],
  "collect-revenue": ["agent"],
  "publish-household-bill": ["agent"],
  "pay-household-bill": ["owner"],
  "fund-export": ["agent"],
  "confirm-receipt": ["agent"],
  distribute: ["agent"],
  claim: ["investor"],
  "request-redemption": ["investor"],
  "cancel-redemption": ["investor"],
  "process-redemptions": ["agent"],
  "carry-window": ["agent"],
  "propose-trade": ["investor"],
  "consent-trade": ["investor"],
  "review-trade": ["agent"],
  "settle-trade": ["investor"],
  "open-case": ["agent"],
  "support-case": ["investor"],
  "approve-case": ["trustee"],
  close: ["agent"],
  "wallet-fund": ["investor"],
  "wallet-confirm": ["investor"],
  "release-station": ["owner", "agent"],
};
export function safeError(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string };
  const text = (err.shortMessage || err.message || "Operation failed").slice(
    0,
    400
  );
  return text.replace(/https?:\/\/\S+/g, "[upstream]");
}
export class RevenueRuntime {
  readonly repo: RevenueRepository;
  private queue: Promise<unknown> = Promise.resolve();
  private wallets: Record<string, HDNodeWallet> = {};
  private walletPreparation?: {
    actor: Actor;
    transactions: Array<{
      step: string;
      from: string;
      to: string;
      data: string;
      value: string;
    }>;
  };
  vault!: Contract;
  usdc!: Contract;
  billing?: Contract;
  station!: Contract;
  constructor(readonly dataDir: string) {
    this.repo = new RevenueRepository(join(dataDir, "store.json"));
  }
  async start() {
    const connectedChainId = Number(
      (await hre.ethers.provider.getNetwork()).chainId
    );
    const configuredChainId = Number(
      process.env.REVENUE_CHAIN_ID || connectedChainId
    );
    if (connectedChainId !== configuredChainId)
      throw new Error(
        `Revenue chain mismatch: expected ${configuredChainId}, received ${connectedChainId}`
    );
    let s = this.repo.read();
    if (!s.manifest) {
      s.manifest = await deployRevenue();
      this.repo.write(s);
      writeFileSync(
        join(this.dataDir, "deployment.json"),
        JSON.stringify(s.manifest, null, 2),
        { mode: 0o600 }
      );
    }
    const m = s.manifest!;
    if (m.chainId !== connectedChainId)
      throw new Error("Deployment manifest belongs to another chain");
    if (
      (await hre.ethers.provider.getCode(m.addresses.vault)) === "0x" ||
      (await hre.ethers.provider.getBlock(m.deployedBlock))?.hash !==
        m.deployedBlockHash
    )
      throw new Error(
        "Local chain was reset; restore the matching chain or explicitly reset the revenue store. No automatic redeployment occurred."
      );
    // The atomic store is authoritative if a process stopped while updating the manifest mirror.
    writeFileSync(
      join(this.dataDir, "deployment.json"),
      JSON.stringify(m, null, 2),
      { mode: 0o600 }
    );
    const systemMnemonic =
      process.env.REVENUE_SYSTEM_MNEMONIC ||
      "test test test test test test test test test test test junk";
    const walletRequired = process.env.REVENUE_WALLET_REQUIRED === "true";
    for (const [name, address] of Object.entries(m.accounts)) {
      if (walletRequired && !["admin", "treasury"].includes(name)) continue;
      const index = [
        "admin",
        "agent",
        "trustee",
        "trustee2",
        "treasury",
        "owner",
        "investor",
        "investor2",
      ].indexOf(name);
      const wallet = HDNodeWallet.fromPhrase(
        systemMnemonic,
        undefined,
        `m/44'/60'/0'/0/${index}`
      ).connect(hre.ethers.provider);
      if (getAddress(wallet.address) === getAddress(address))
        this.wallets[name] = wallet;
    }
    for (const system of ["admin", "treasury"])
      if (!this.wallets[system])
        throw new Error(`System wallet ${system} does not match deployment`);
    this.vault = await hre.ethers.getContractAt(
      m.contractName || "RevenueShareVault",
      m.addresses.vault
    );
    this.usdc = await hre.ethers.getContractAt("MockUSDC", m.addresses.usdc);
    this.station = await hre.ethers.getContractAt(
      "DeyeRWA",
      m.addresses.station
    );
    if (!m.addresses.billing && process.env.REVENUE_HOUSEHOLD_PAYMENTS_ENABLED === "true" && Number(await this.vault.phase())<=2) {
      const journal=join(this.dataDir,"household-billing-install.json");
      let installed: {vault:string;billing:string;transaction?:string;block?:number}|undefined;
      if(existsSync(journal))installed=JSON.parse(readFileSync(journal,"utf8"));
      if(installed && installed.vault!==m.addresses.vault)throw new Error("Billing installation belongs to another product");
      if(!installed){
        const deployed=await (await hre.ethers.getContractFactory("HouseholdBilling",this.wallets.admin)).deploy(m.addresses.usdc,m.addresses.vault,m.accounts.agent,m.accounts.treasury);
        await deployed.waitForDeployment();const receipt=await deployed.deploymentTransaction()!.wait();installed={vault:m.addresses.vault,billing:await deployed.getAddress(),transaction:receipt!.hash,block:receipt!.blockNumber};
        writeFileSync(journal,JSON.stringify(installed),{mode:0o600});
      }
      if(await hre.ethers.provider.getCode(installed.billing)==="0x")throw new Error("Billing installation is absent from this chain");
      if(!await this.vault.hasRole(await this.vault.TREASURY(),installed.billing))await(await this.vault.connect(this.wallets.admin).getFunction("grantRole")(await this.vault.TREASURY(),installed.billing)).wait();
      m.addresses.billing=installed.billing;
      if(installed.transaction&&installed.block)m.billingDeployment={transaction:installed.transaction,block:installed.block};
      this.repo.update(v=>{v.manifest=m;});
      writeFileSync(join(this.dataDir,"deployment.json"),JSON.stringify(m,null,2),{mode:0o600});
    }
    if(m.addresses.billing){
      this.billing=await hre.ethers.getContractAt("HouseholdBilling",m.addresses.billing);
      if(getAddress(await this.billing.vault())!==getAddress(m.addresses.vault)||getAddress(await this.billing.usdc())!==getAddress(m.addresses.usdc)||getAddress(await this.billing.manager())!==getAddress(m.accounts.agent)||getAddress(await this.billing.exportTreasury())!==getAddress(m.accounts.treasury))throw new Error("Billing contract does not match this product and roles");
      await this.reconcileHouseholdPayments();
    }
    await this.reconcileRevertedApprovals();
    if (process.env.REVENUE_INITIAL_REPLAY === "true" && !this.repo.read().stations.length) {
      const capture = process.env.DEYE_REPLAY_FILE;
      if (!capture || !existsSync(capture)) throw new Error("Explicit recording replay capture is required");
      const station = replayCapture(capture);
      this.repo.update(state => { state.mode = "replay"; state.stations = [station]; });
    }
    await this.syncConfiguredLiveStation();
    this.scheduleVerification(m);
    // Resume journaled operations before accepting new mutations, in original order.
    for (const op of s.operations.filter((o) => o.status === "running")) {
      this.repo.update((state) =>
        state.audit.push({
          at: Date.now(),
          actor: "system",
          action: "recovery",
          message: `Pending operation ${op.id}; retry its original request to resume safely`,
        })
      );
    }
  }
  private async reconcileHouseholdPayments() {
    if(!this.billing)return;
    const state=this.repo.read();
    for(const r of state.income.filter(i=>i.payment&&!i.collected)){
      const bill=await this.billing.bills(r.id);if(!bill.householdPaid&&!bill.exportPaid&&!bill.confirmed)continue;
      const events=await this.billing.queryFilter(this.billing.filters.HouseholdPaid(r.id),state.manifest!.deployedBlock);
      const confirmations=bill.confirmed?await this.billing.queryFilter(this.billing.filters.ReceiptConfirmed(r.id),state.manifest!.deployedBlock):[];
      if(bill.confirmed&&BigInt(r.amountUSDC6)>0n&&!await this.vault.receiptUsed(r.id))throw new Error("Confirmed bill is missing its vault receipt");
      this.repo.update(v=>{
        const row=v.income.find(i=>i.id===r.id)!;row.payment!.householdPaid=bill.householdPaid;row.payment!.exportPaid=bill.exportPaid;row.payment!.confirmed=bill.confirmed;
        row.payment!.ownerTransaction=events.at(-1)?.transactionHash||row.payment!.ownerTransaction;
        if(bill.confirmed){row.collected=true;row.payment!.confirmationTransaction=confirmations.at(-1)?.transactionHash;
          if(!v.receipts.some(i=>i.id===r.id))v.receipts.push({id:r.id,stationId:r.stationId,amountUSDC6:r.amountUSDC6,sourceHash:r.sourceHash,simulated:false,exportSimulated:true,householdUSDC6:r.payment!.householdUSDC6,exportUSDC6:r.payment!.exportUSDC6,costsUSDC6:r.payment!.costsUSDC6,householdTransaction:row.payment!.ownerTransaction,confirmationTransaction:row.payment!.confirmationTransaction});
        }
      });
    }
  }
  private async syncConfiguredLiveStation() {
    const sourceId = process.env.REVENUE_AUTO_SYNC_STATION_ID;
    if (!sourceId) return;
    const current = this.repo.read();
    // Once an application exists, evidence changes must be initiated by an
    // intermediary so any affected valuation is explicitly invalidated.
    if (current.applications.length) return;
    this.repo.update((state) => {
      state.mode = "live";
      state.stations = state.stations.filter(
        (station) => station.source !== "synthetic"
      );
      state.lastSyncError = undefined;
    });
    try {
      const station = await new DeyeClient(deyeConfig()).capture(
        sourceId,
        Math.floor(Date.now() / 1000),
        fieldMapping(),
        join(this.dataDir, "evidence")
      );
      this.repo.update((state) => {
        const index = state.stations.findIndex(
          (candidate) => candidate.id === station.id
        );
        if (index >= 0) state.stations[index] = station;
        else state.stations.push(station);
        state.mode = "live";
        state.liveAcceptance = {
          retrieved: true,
          mapped:
            station.mappingVerified &&
            station.history.some(
              (month) => month.complete && month.exportKWh !== null
            ),
          stationId: station.id,
        };
        state.lastSyncError = undefined;
        state.audit.push({
          at: Date.now(),
          actor: "system",
          action: "live-station-sync",
          message: `Deye station ${sourceId} synchronized from the live API`,
        });
      });
    } catch (error) {
      const message = safeError(error);
      this.repo.update((state) => {
        state.mode = "live";
        state.lastSyncError = message;
        state.audit.push({
          at: Date.now(),
          actor: "system",
          action: "live-station-sync",
          message: `Live station synchronization failed: ${message}`,
        });
      });
    }
  }
  private scheduleVerification(manifest: RevenueManifest) {
    if (process.env.REVENUE_AUTO_VERIFY === "true") {
      void (async () => {
        const attempts = 8;
        let results: Awaited<ReturnType<typeof verifyRevenue>> = [];
        for (let attempt = 1; attempt <= attempts; attempt++) {
          results = await verifyRevenue(manifest);
          if (results.every((result) => result.verified)) {
            this.repo.update((state) =>
              state.audit.push({
                at: Date.now(),
                actor: "system",
                action: "contract-verification",
                message: `Blockscout source verification completed for all contracts (attempt ${attempt})`,
              })
            );
            return;
          }
          if (attempt < attempts)
            await new Promise((done) => setTimeout(done, attempt * 2_000));
        }
        this.repo.update((state) =>
          state.audit.push({
            at: Date.now(),
            actor: "system",
            action: "contract-verification",
            message: `Blockscout source verification incomplete after ${attempts} attempts: ${results
              .filter((result) => !result.verified)
              .map((result) => result.address)
              .join(", ")}`,
          })
        );
      })().catch((error) =>
        this.repo.update((state) =>
        state.audit.push({
          at: Date.now(),
          actor: "system",
          action: "contract-verification",
          message: `Blockscout source verification failed: ${safeError(error)}`,
        })
      ));
    }
  }
  async now() {
    return (await hre.ethers.provider.getBlock("latest"))!.timestamp;
  }
  private checkScenario(expectedVault?: string) {
    if (
      expectedVault !== undefined &&
      expectedVault !== this.repo.read().manifest?.addresses.vault
    )
      throw new Error(
        "Demo has been reset. Refresh before continuing. 演示已重置，请刷新后重新操作。"
      );
  }
  resetDemo(
    actor: Actor,
    body: {
      confirmation: string;
      expectedVault: string;
      idempotencyKey: string;
    }
  ) {
    const work = this.queue.then(() => this.performReset(actor, body));
    this.queue = work.catch(() => {});
    return work;
  }
  private async performReset(
    actor: Actor,
    body: {
      confirmation: string;
      expectedVault: string;
      idempotencyKey: string;
    }
  ) {
    if (actor !== "agent")
      throw new Error(
        "Only the local intermediary can reset this demo / 仅中介演示账户可重置"
      );
    z.literal("RESET_DEMO").parse(body.confirmation);
    const id = z.string().uuid().parse(body.idempotencyKey);
    z.string()
      .regex(/^0x[0-9a-fA-F]{40}$/)
      .parse(body.expectedVault);
    const old = this.repo.read();
    if (old.lastReset?.id === id) {
      if (old.lastReset.previousVault !== body.expectedVault)
        throw new Error("Reset key belongs to another request");
      return old.lastReset;
    }
    this.checkScenario(body.expectedVault);
    if (
      Number((await hre.ethers.provider.getNetwork()).chainId) !==
        old.manifest?.chainId ||
      !["localhost", "hardhat", "revenue"].includes(hre.network.name)
    )
      throw new Error("Reset requires the configured local demo chain");
    if (
      old.operations.some(
        (o) =>
          o.status !== "confirmed" &&
          Object.values(o.steps).some((s) => s.status === "sent")
      )
    )
      throw new Error(
        "Resolve unconfirmed transactions in Transaction log before reset / 请先在交易日志重试未确认交易，再重置"
      );
    const backup = `reset-backups/${id}`,
      folder = join(this.dataDir, backup);
    mkdirSync(folder, { recursive: true });
    const snapshotFile = join(folder, "store.json");
    if (!existsSync(snapshotFile)) {
      writeFileSync(snapshotFile, JSON.stringify(old, null, 2), {
        mode: 0o600,
        flag: "wx",
      });
      writeFileSync(
        join(folder, "deployment.json"),
        JSON.stringify(old.manifest, null, 2),
        { mode: 0o600 }
      );
    } else if (
      JSON.parse(readFileSync(snapshotFile, "utf8")).manifest.addresses
        .vault !== body.expectedVault
    ) {
      throw new Error("Reset key belongs to another archived scenario");
    }
    // A failed attempt may be retried after other operations; archive the latest state too.
    writeFileSync(snapshotFile + ".tmp", JSON.stringify(old, null, 2), {
      mode: 0o600,
    });
    renameSync(snapshotFile + ".tmp", snapshotFile);
    const preparedFile = join(folder, "replacement.json");
    let manifest: RevenueManifest;
    if (existsSync(preparedFile)) {
      manifest = JSON.parse(readFileSync(preparedFile, "utf8"));
    } else {
      manifest = await deployRevenue();
      writeFileSync(preparedFile + ".tmp", JSON.stringify(manifest, null, 2), {
        mode: 0o600,
      });
      renameSync(preparedFile + ".tmp", preparedFile);
    }
    if (
      (await hre.ethers.provider.getBlock(manifest.deployedBlock))?.hash !==
        manifest.deployedBlockHash ||
      (await hre.ethers.provider.getCode(manifest.addresses.vault)) === "0x"
    )
      throw new Error("Replacement deployment does not match the local chain");
    const vault = await hre.ethers.getContractAt(
      manifest.contractName || "RevenueShareVault",
      manifest.addresses.vault
    );
    const usdc = await hre.ethers.getContractAt(
      "MockUSDC",
      manifest.addresses.usdc
    );
    const station = await hre.ethers.getContractAt(
      "DeyeRWA",
      manifest.addresses.station
    );
    const result = {
      id,
      previousVault: body.expectedVault,
      vault: manifest.addresses.vault,
      backup,
      at: Date.now(),
      stationsPreserved: old.stations.length,
    };
    const next = emptyRevenueStore();
    Object.assign(next, {
      manifest,
      stations: old.stations,
      walletInvestors: old.walletInvestors || [],
      mode: old.mode,
      captureFile: old.captureFile,
      liveAcceptance: old.liveAcceptance,
      lastSyncError: old.lastSyncError,
      lastReset: result,
    });
    next.audit.push({
      at: result.at,
      actor,
      action: "demo-reset",
      message: `Previous scenario archived at ${backup}; station evidence retained`,
    });
    // Publish only after backup and the complete replacement deployment are confirmed.
    this.repo.write(next);
    this.vault = vault;
    this.usdc = usdc;
    this.station = station;
    writeFileSync(
      join(this.dataDir, "deployment.json"),
      JSON.stringify(manifest, null, 2),
      { mode: 0o600 }
    );
    this.scheduleVerification(manifest);
    return result;
  }
  async previewOffer(
    actor: Actor,
    applicationId: string,
    assumptions: unknown,
    expectedVault?: string
  ) {
    await this.queue;
    this.checkScenario(expectedVault);
    if (actor !== "agent")
      throw new Error("Actor not authorized for offer preview");
    const a = this.app(applicationId);
    if (
      !["approved", "offered", "accepted", "signed", "pooled"].includes(
        a.status
      )
    )
      throw new Error("Application requires assessment first");
    const parsed = AssumptionsSchema.parse(assumptions || a.assumptions);
    if (parsed.termMonths !== 60)
      throw new Error("This product has a five-year term");
    const station = this.repo
      .read()
      .stations.find((s) => s.id === a.stationId)!;
    const now = await this.now();
    const start =
      a.status === "pooled" ? Number(await this.vault.settledAt()) || now : now;
    return forecast(station, parsed, start, now);
  }
  address(actor: string) {
    if (actor.startsWith("investor:")) return getAddress(actor.slice(9));
    return this.repo.read().manifest!.accounts[actor];
  }
  registerInvestor(address: string): Actor {
    const normalized = getAddress(address);
    const manifest = this.repo.read().manifest!;
    const fixed = Object.entries(manifest.accounts).find(
      ([name, value]) =>
        ["investor", "investor2"].includes(name) &&
        getAddress(value) === normalized
    );
    if (fixed) return fixed[0] as Actor;
    this.repo.update((state) => {
      state.walletInvestors ||= [];
      if (!state.walletInvestors.some((value) => getAddress(value) === normalized)) {
        if (state.walletInvestors.length + 2 >= 64)
          throw new Error("Investor holder limit reached");
        state.walletInvestors.push(normalized);
      }
    });
    return `investor:${normalized.toLowerCase()}`;
  }
  actorForAddress(address: string, register = true): Actor {
    const normalized = getAddress(address);
    const fixed = Object.entries(this.repo.read().manifest!.accounts).find(
      ([name, value]) =>
        staticActors.includes(name as StaticActor) && getAddress(value) === normalized
    );
    if (fixed) return fixed[0] as Actor;
    return register
      ? this.registerInvestor(normalized)
      : (`investor:${normalized.toLowerCase()}` as Actor);
  }
  actorRole(actor: Actor) {
    return roleOfActor(actor);
  }
  private app(id: unknown): Application {
    const a = this.repo.read().applications.find((a) => a.id === id);
    if (!a) throw new Error("Application not found");
    return a;
  }
  private effectiveAssumptions(a: Application) {
    return a.reassessment?.ownerAccepted && a.reassessment?.trusteeApproved
      ? a.reassessment.report.assumptions
      : a.assumptions;
  }
  private assertValuationReady(a: Application, now: number) {
    const station = this.repo
      .read()
      .stations.find((v) => v.id === a.stationId)!;
    const r =
      a.reassessment?.ownerAccepted && a.reassessment?.trusteeApproved
        ? a.reassessment.report
        : a.offer;
    const reason = valuationBlockReason(station, r, now);
    if (reason) throw new Error(reason);
  }
  private assertPoolEvidence(now: number) {
    const s = this.repo.read();
    for (const a of s.applications.filter((a) => a.status === "pooled")) {
      this.assertValuationReady(a, now);
      const station = s.stations.find((v) => v.id === a.stationId)!;
      const report = s.valuations.find(
        (r) => r.reportHash === s.activeReports[a.stationId]
      );
      const reason = valuationBlockReason(station, report, now);
      if (reason)
        throw new Error(
          "请重新编制并审批资产池估值。Prepare and approve a fresh pool valuation. " +
            reason
        );
    }
  }
  private async valuationFinancialInputs() {
    const s=this.repo.read(),v=this.vault;
    const [phase,cash,fees,expenses,unpaid,feeMonths,settledAt]=await Promise.all([
      v.phase(),this.usdc.balanceOf(await v.getAddress()),v.feeLiability(),v.expenseLiability(),v.unpaidDistributions(),v.feeMonths(),v.settledAt()
    ]);
    const now=await this.now();
    let completedMonths=0;
    if(Number(phase)===2)for(let period=1;period<=60&&addMonths(Number(settledAt),period)<=now;period++)completedMonths=period;
    return hash({distributionIntervalMonths:s.manifest?.contractName==="RevenueShareVaultV5"?1:3,phase:String(phase),cash:String(cash),fees:String(fees),expenses:String(expenses),unpaid:String(unpaid),feeMonths:String(feeMonths),completedMonths,
      income:s.income.map(r=>({id:r.id,stationId:r.stationId,period:r.period,amount:r.amountUSDC6,collected:r.collected})).sort((a,b)=>a.id.localeCompare(b.id))});
  }
  private async proposalOutdated(report: string) {
    const s=this.repo.read();
    if(!s.activeReports.aggregate||report!==s.activeReports.aggregate||s.approvedReports.includes(report))return false;
    const file=join(this.dataDir,"valuation-evidence",`${report}.json`);
    // Older drafts have no financial fingerprint. Require a new draft instead of asserting unverified inputs.
    if(!existsSync(file))return Number(await this.vault.phase())===2;
    const archived=JSON.parse(readFileSync(file,"utf8"));
    if(!archived.financialInputs)return Number(await this.vault.phase())===2;
    return archived.financialInputs!==await this.valuationFinancialInputs();
  }
  private saveApp(a: Application) {
    this.repo.update((s) => {
      s.applications[s.applications.findIndex((v) => v.id === a.id)] = a;
    });
  }
  private async sendWithFreshNonce(
    wallet: HDNodeWallet,
    request: TransactionRequest
  ) {
    const nonce = Number(
      BigInt(
        await hre.ethers.provider.send("eth_getTransactionCount", [
          wallet.address,
          "pending",
        ])
      )
    );
    return wallet.sendTransaction({ ...request, nonce });
  }
  private terminalApproval(op: Operation) {
    return op.action === "approve-valuation" && Object.values(op.steps).length > 0 &&
      Object.values(op.steps).every(step => step.status === "reverted");
  }
  private async reconcileRevertedApprovals() {
    for (const op of this.repo.read().operations.filter(o => o.action === "approve-valuation" && o.status !== "confirmed")) {
      for (const [key,step] of Object.entries(op.steps)) {
        if(step.status !== "sent") continue;
        const receipt=await hre.ethers.provider.getTransactionReceipt(step.hash);
        if(receipt?.status !== 0) continue;
        this.repo.durable(s=>{
          const current=s.operations.find(o=>o.id===op.id)!;
          current.steps[key].status="reverted";current.steps[key].block=receipt.blockNumber;
          current.status="failed";
          current.error="估值批准交易已在链上失败。请核对报告有效期，由中介重新编制过期报告后，再提交新的审批，不要重试同一交易哈希。Valuation approval reverted on chain; replace expired evidence before a new approval.";
        });
      }
    }
  }
  private async tx(
    op: Operation,
    key: string,
    contract: Contract,
    method: string,
    args: unknown[],
    signer = op.actor as string
  ) {
    let saved = this.repo.read().operations.find((v) => v.id === op.id)!.steps[
      key
    ];
    if (this.walletPreparation) {
      if (saved) {
        const receipt = await hre.ethers.provider.getTransactionReceipt(saved.hash);
        if (!receipt || receipt.status !== 1)
          throw new Error(`Previously submitted wallet step ${key} is not confirmed`);
        return receipt;
      }
      const expectedSigner = this.address(signer);
      if (["admin", "treasury"].includes(signer))
        return { logs: [], status: 1, blockNumber: 0 } as any;
      if (
        getAddress(expectedSigner) !==
        getAddress(this.address(this.walletPreparation.actor))
      )
        throw new Error(`Wallet step ${key} belongs to another signer`);
      const request = await contract
        .getFunction(method)
        .populateTransaction(...args);
      this.walletPreparation.transactions.push({
        step: key,
        from: expectedSigner,
        to: getAddress(String(request.to)),
        data: String(request.data),
        value: `0x${BigInt(request.value || 0).toString(16)}`,
      });
      return { logs: [], status: 1, blockNumber: 0 } as any;
    }
    if (!saved) {
      const wallet = this.wallets[signer];
      if (!wallet) throw new Error(`Wallet signature required for ${signer}`);
      const request = await contract
        .connect(wallet)
        .getFunction(method)
        .populateTransaction(...args);
      const nonce = Number(
        BigInt(
          await hre.ethers.provider.send("eth_getTransactionCount", [
            wallet.address,
            "pending",
          ])
        )
      );
      const populated = await wallet.populateTransaction({ ...request, nonce });
      const raw = await wallet.signTransaction(populated);
      const txHash = keccak256(raw);
      saved = { hash: txHash, raw, status: "sent" };
      // Signed intent is durable BEFORE broadcast; resumption always reuses the identical transaction.
      this.repo.durable((s) => {
        s.operations.find((v) => v.id === op.id)!.steps[key] = saved;
      });
    }
    let receipt = await hre.ethers.provider.getTransactionReceipt(saved.hash);
    if (!receipt) {
      const existing = await hre.ethers.provider.getTransaction(saved.hash);
      if (!existing) await hre.ethers.provider.broadcastTransaction(saved.raw);
      for (let i = 0; i < 80; i++) {
        receipt = await hre.ethers.provider.getTransactionReceipt(saved.hash);
        if (receipt) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (receipt?.status === 0 && op.action === "approve-valuation") {
      await this.reconcileRevertedApprovals();
      throw new Error("估值批准交易已在链上失败，请重新编制过期报告后发起新的审批。Valuation approval reverted; do not retry the same hash.");
    }
    if (!receipt || receipt.status !== 1)
      throw new Error(`Transaction ${saved.hash} did not confirm successfully`);
    this.repo.durable((s) => {
      const step = s.operations.find((v) => v.id === op.id)!.steps[key];
      step.status = "mined";
      step.block = receipt!.blockNumber;
    });
    return receipt;
  }
  action(
    actor: unknown,
    action: string,
    body: Record<string, unknown>,
    id: string,
    expectedVault?: string
  ): Promise<unknown> {
    const work = this.queue.then(async () => {
      this.checkScenario(expectedVault);
      await this.reconcileRevertedApprovals();
      await this.reconcileHouseholdPayments();
      return this.execute(actorSchema.parse(actor), action, body, id);
    });
    this.queue = work.catch(() => {});
    return work;
  }
  private async execute(
    actor: Actor,
    action: string,
    body: Record<string, unknown>,
    id: string
  ) {
    if (!access[action]?.includes(roleOfActor(actor)))
      throw new Error("This role is not authorized for this action");
    z.string()
      .min(8)
      .max(100)
      .regex(/^[\w-]+$/)
      .parse(id);
    const bodyHash = hash({ actor, action, body });
    let op = this.repo.read().operations.find((o) => o.id === id);
    if (op && op.bodyHash !== bodyHash)
      throw new Error("Idempotency key already belongs to a different request");
    if (op?.status === "confirmed") return op.result;
    if (op && this.terminalApproval(op)) throw new Error("原估值审批交易已失败，请通过当前估值页面发起新的审批。The reverted approval cannot reuse its old transaction.");
    const pending = this.repo
      .read()
      .operations.find(
        (o) =>
          o.id !== id &&
          o.status !== "confirmed" &&
          Object.values(o.steps).some((s) => s.status === "sent")
      );
    if (pending)
      throw new Error(
        `Resolve pending transaction operation ${pending.id} before submitting another action`
      );
    if (!op) {
      op = {
        id,
        actor,
        action,
        bodyHash,
        body,
        status: "running",
        steps: {},
        startedAt: await this.now(),
      };
      this.repo.update((s) => s.operations.push(op!));
    } else
      this.repo.update((s) => {
        s.operations.find((o) => o.id === id)!.status = "running";
      });
    this.repo.begin();
    try {
      const result = await this.run(op, body);
      this.repo.update((s) => {
        const o = s.operations.find((v) => v.id === id)!;
        o.status = "confirmed";
        o.error = undefined;
        o.result = result ?? null;
        s.audit.push({
          at: Date.now(),
          actor,
          action,
          message: `Confirmed ${id}`,
        });
      });
      this.repo.commit();
      return result ?? null;
    } catch (e) {
      this.repo.rollback();
      const error = safeError(e);
      this.repo.update((s) => {
        const o = s.operations.find((v) => v.id === id)!;
        o.status = "failed";
        o.error = error;
        if (action === "sync") s.lastSyncError = error;
      });
      throw new Error(error);
    }
  }
  private async run(
    op: Operation,
    b: Record<string, unknown>
  ): Promise<unknown> {
    const { actor, action } = op;
    const now = op.startedAt;
    const s = this.repo.read();
    const vault = this.vault;
    const transact = (
      key: string,
      c: Contract,
      method: string,
      args: unknown[] = [],
      signer = actor as string
    ) => this.tx(op, key, c, method, args, signer);
    const app = () => this.app(b.applicationId);
    switch (action) {
      case "source": {
        const mode = z.enum(["synthetic", "live", "replay"]).parse(b.mode);
        if (s.applications.length)
          throw new Error(
            "Source mode is frozen once applications exist; use a separate demo store to change it"
          );
        if (mode === "live") deyeConfig();
        let stations = s.stations;
        if (mode === "synthetic") stations = [syntheticStation(now)];
        if (mode === "replay") {
          const file = process.env.DEYE_REPLAY_FILE;
          if (!file || !existsSync(file))
            throw new Error(
              "Set server DEYE_REPLAY_FILE to an archived capture"
            );
          stations = [replayCapture(file)];
        }
        if (mode === "live") stations = [];
        this.repo.update((v) => {
          v.mode = mode;
          v.stations = stations;
          v.lastSyncError = undefined;
        });
        return { mode };
      }
      case "discover":
        return new DeyeClient(deyeConfig()).listStations();
      case "sync": {
        if (s.mode !== "live")
          throw new Error("Select live mode explicitly first");
        try {
          const st = await new DeyeClient(deyeConfig()).capture(
            z.string().parse(b.sourceId),
            Math.floor(Date.now() / 1000),
            fieldMapping(),
            join(this.dataDir, "evidence")
          );
          if (Number(await vault.phase()) === 2)
            await transact("invalidate", vault, "invalidateValuation");
          this.repo.update((v) => {
            const i = v.stations.findIndex((x) => x.id === st.id);
            if (i >= 0) v.stations[i] = st;
            else v.stations.push(st);
            v.liveAcceptance = {
              retrieved: true,
              mapped:
                st.mappingVerified &&
                st.history.some((h) => h.complete && h.exportKWh !== null),
              stationId: st.id,
            };
            v.lastSyncError = undefined;
          });
          return { stationId: st.id };
        } catch (e) {
          this.repo.update((v) => {
            v.lastSyncError = safeError(e);
          });
          throw e;
        }
      }
      case "apply": {
        const station = s.stations.find((v) => v.id === b.stationId);
        if (!station) throw new Error("Import a station first");
        const id = hash({ stationId: station.id, owner: this.address(actor) });
        if (s.applications.some((a) => a.id === id))
          throw new Error("Station application already exists");
        this.repo.update((v) =>
          v.applications.push({
            id,
            stationId: station.id,
            owner: this.address(actor),
            status: "submitted",
            notes: z
              .string()
              .max(2000)
              .parse(b.notes || ""),
            assumptions: demoAssumptions(station.currency),
          })
        );
        return { id };
      }
      case "supplement": {
        const a = app();
        if (a.status !== "supplement")
          throw new Error("Supplementation was not requested");
        a.notes = z.string().min(1).max(2000).parse(b.notes);
        a.status = "submitted";
        this.saveApp(a);
        return;
      }
      case "review": {
        const a = app();
        if (a.status !== "submitted")
          throw new Error("Application is not awaiting review");
        a.status = z
          .enum(["approved", "supplement", "rejected"])
          .parse(b.decision);
        a.notes = z
          .string()
          .max(2000)
          .parse(b.notes || "");
        this.saveApp(a);
        return;
      }
      case "reopen-offer": {
        const a = app();
        if (!["offered", "accepted", "signed"].includes(a.status))
          throw new Error("Only unpooled agreements can be reopened");
        if (
          s.operations.some(
            (o) => o.action === "admit" && o.body.applicationId === a.id
          )
        )
          throw new Error("Admission has started; use reassessment instead");
        (a.revisions ||= []).push({
          at: now,
          reason: z.string().min(5).parse(b.notes),
          offer: a.offer,
          priceUSDC6: a.priceUSDC6,
          agreementHash: a.agreementHash,
        });
        const previous = a.offer?.reportHash;
        a.status = "approved";
        delete a.offer;
        delete a.priceUSDC6;
        delete a.agreementHash;
        delete a.reassessment;
        this.saveApp(a);
        this.repo.update((v) => {
          v.approvedReports = v.approvedReports.filter((h) => h !== previous);
        });
        return;
      }
      case "prepare-reassessment": {
        const a = app();
        if (!["signed", "pooled"].includes(a.status))
          throw new Error("A signed or pooled agreement is required");
        const proposed = AssumptionsSchema.parse(b.assumptions);
        // Change only the forecast baseline; all signed economic terms stay fixed.
        const assumptions = AssumptionsSchema.parse({
          ...a.assumptions,
          baselineMethod: proposed.baselineMethod,
          baselineReviewNote: proposed.baselineReviewNote,
          baselineReviewSourceHash: proposed.baselineReviewSourceHash,
        });
        const report = forecast(
          s.stations.find((v) => v.id === a.stationId)!,
          assumptions,
          a.status === "pooled" ? Number(await vault.settledAt()) || now : now,
          now
        );
        const block = valuationBlockReason(
          s.stations.find((v) => v.id === a.stationId)!,
          report,
          now
        );
        if (block) throw new Error(block);
        a.reassessment = {
          report,
          createdAt: now,
          ownerAccepted: false,
          trusteeApproved: false,
        };
        this.saveApp(a);
        return report;
      }
      case "approve-reassessment":
      case "accept-reassessment": {
        const a = app(),
          r = a.reassessment;
        if (!r || r.report.validUntil < now)
          throw new Error("Current reassessment required");
        const block = valuationBlockReason(
          s.stations.find((v) => v.id === a.stationId)!,
          r.report,
          now
        );
        if (block) throw new Error(block);
        if (b.acceptProvisional !== true)
          throw new Error("Explicit reassessment acknowledgment required");
        if (action === "approve-reassessment") r.trusteeApproved = true;
        else r.ownerAccepted = true;
        this.saveApp(a);
        return;
      }
      case "offer": {
        const a = app();
        if (!["approved", "offered"].includes(a.status))
          throw new Error("Application requires assessment first");
        a.assumptions = AssumptionsSchema.parse(b.assumptions || a.assumptions);
        const previousReport = a.offer?.reportHash;
        if (a.assumptions.termMonths !== 60)
          throw new Error("This first product has a frozen five-year term");
        a.offer = forecast(
          s.stations.find((v) => v.id === a.stationId)!,
          a.assumptions,
          now
        );
        // Preview may be incomplete, but the trustee queue must contain reviewable offers.
        // This runs inside the repository transaction so rejection preserves the prior quote.
        this.assertValuationReady(a, now);
        a.priceUSDC6 = b.priceUSDC6
          ? uint.parse(b.priceUSDC6)
          : a.offer.rightsValueUSDC6;
        a.status = "offered";
        this.saveApp(a);
        this.repo.update((v) => {
          // A changed purchase price can have an identical model report hash.
          // Every resubmitted offer therefore requires a new trustee approval.
          v.approvedReports = v.approvedReports.filter(
            (h) => h !== previousReport && h !== a.offer!.reportHash
          );
          v.valuations.push(a.offer!);
        });
        return a.offer;
      }
      case "approve-offer": {
        const a = app();
        if (!a.offer || a.status !== "offered" || a.offer.validUntil < now)
          throw new Error("Current offer required");
        this.assertValuationReady(a, now);
        if (a.offer.provisional && b.acceptProvisional !== true)
          throw new Error("Explicit provisional-estimate approval required");
        if (!s.approvedReports.includes(a.offer.reportHash))
          this.repo.update((v) => v.approvedReports.push(a.offer!.reportHash));
        return;
      }
      case "accept": {
        const a = app();
        this.assertValuationReady(a, now);
        if (
          a.status !== "offered" ||
          !a.offer ||
          !s.approvedReports.includes(a.offer.reportHash) ||
          a.offer.validUntil < now
        )
          throw new Error("Trustee-approved current offer required");
        a.status = "accepted";
        this.saveApp(a);
        return;
      }
      case "sign": {
        const a = app();
        this.assertValuationReady(a, now);
        if (a.status !== "accepted") throw new Error("Accept the offer first");
        const agreement = {
          version: s.version,
          chainId: s.manifest!.chainId,
          vault: s.manifest!.addresses.vault,
          applicationId: a.id,
          stationId: a.stationId,
          owner: a.owner,
          assumptions: a.assumptions,
          price: a.priceUSDC6,
          offer: a.offer!.reportHash,
          rights: this.rightsDescription(a.assumptions),
          collection: a.assumptions.revenueModel === "household-export"
            ? "household pays discounted monthly solar electricity bills and remits eligible collected export revenue to the pool"
            : "household remits collected eligible cash to pool",
          settlement: "term begins at product settlement",
        };
        const message = this.agreementMessage(agreement);
        if (process.env.REVENUE_WALLET_REQUIRED === "true") {
          const signature = z
            .string()
            .regex(/^0x[0-9a-fA-F]+$/)
            .parse(b.walletSignature);
          if (getAddress(verifyMessage(message, signature)) !== getAddress(a.owner))
            throw new Error("Agreement signature does not match the owner wallet");
          a.agreementSignature = signature;
        }
        a.agreementHash = hash(agreement);
        a.status = "signed";
        this.saveApp(a);
        return { agreementHash: a.agreementHash };
      }
      case "mint-station": {
        const a = app();
        this.assertValuationReady(a, now);
        if (a.status !== "signed")
          throw new Error("Signed agreement required");
        await transact(
          "mint",
          this.station,
          "mintFacility",
          [
            a.stationId,
            a.owner,
            hash({ station: a.stationId }),
            hash({ site: a.stationId }),
            a.agreementHash,
            a.priceUSDC6,
            now,
            true,
          ],
          "agent"
        );
        return;
      }
      case "custody-consent": {
        const a = app();
        this.assertValuationReady(a, now);
        if (a.status !== "signed" || a.owner !== this.address(actor))
          throw new Error("Signed owner agreement required");
        await transact(
          "custody-consent",
          this.station,
          "approve",
          [await vault.getAddress(), BigInt(a.stationId)],
          "owner"
        );
        return;
      }
      case "admit": {
        const a = app();
        this.assertValuationReady(a, now);
        if (!["signed", "pooled"].includes(a.status))
          throw new Error("Signed agreement required");
        if (process.env.REVENUE_WALLET_REQUIRED !== "true") {
          await transact(
            "mint",
            this.station,
            "mintFacility",
            [
              a.stationId,
              a.owner,
              hash({ station: a.stationId }),
              hash({ site: a.stationId }),
              a.agreementHash,
              a.priceUSDC6,
              now,
              true,
            ],
            "agent"
          );
          await transact(
            "custody-consent",
            this.station,
            "approve",
            [await vault.getAddress(), BigInt(a.stationId)],
            "owner"
          );
        }
        await transact("admit", vault, "admit", [
          a.stationId,
          a.owner,
          a.priceUSDC6,
          a.agreementHash,
        ]);
        a.status = "pooled";
        this.saveApp(a);
        return;
      }
      case "prepare-valuation": {
        const pooled = s.applications.filter((a) => a.status === "pooled");
        if (!pooled.length) throw new Error("Admit at least one station");
        for (const a of pooled) this.assertValuationReady(a, now);
        const start = Number(await vault.settledAt()) || now;
        if (Number(await vault.phase()) === 2) {
          for (const a of pooled)
            for (
              let period = 1;
              period <= 60 && addMonths(start, period) <= now;
              period++
            ) {
              if (
                !s.income.some(
                  (r) => r.stationId === a.stationId && r.period === period
                )
              )
                throw new Error(
                  `Reconcile completed station service month ${period} before valuation; missing collections cannot be silently valued as zero`
                );
            }
        }
        const reports = pooled.map((a) =>
          forecast(
            s.stations.find((v) => v.id === a.stationId)!,
            this.effectiveAssumptions(a),
            start,
            now
          )
        );
        const rights = reports.reduce(
          (v, r) => v + BigInt(r.rightsValueUSDC6),
          0n
        );
        const receivables = s.income
          .filter((v) => !v.collected)
          .reduce((v, r) => v + BigInt(r.amountUSDC6), 0n);
        const active = Number(await vault.phase()) === 2;
        const purchase = BigInt(await vault.acquisitionTotal());
        const cash = active
          ? BigInt(await this.usdc.balanceOf(await vault.getAddress())) -
            BigInt(await vault.unpaidDistributions()) -
            BigInt(await vault.feeLiability()) -
            BigInt(await vault.expenseLiability())
          : (purchase + 8n) / 9n;
        const projection = projectPool(reports, {
          cashUSDC6: (cash > 0n ? cash : 0n).toString(),
          purchasePriceUSDC6: active ? rights.toString() : purchase.toString(),
          monthlyCostUSDC6: String(await vault.monthlyMandatoryCost()),
          receivablesUSDC6: receivables.toString(),
          distributionIntervalMonths: s.manifest?.contractName==="RevenueShareVaultV5"?1:3,
        });
        const fees = BigInt(projection.futureExpensesUSDC6);
        const financialInputs=await this.valuationFinancialInputs();
        const aggregate = hash({
          financialInputs,
          version: s.version,
          reports: reports.map((r) => r.reportHash),
          poolProjection: projection.hash,
          receivables: receivables.toString(),
          cutoff: now,
        });
        // Retain the exact aggregate inputs, not just the most recent projection.
        // Content-addressed draft evidence is harmless until its hash is approved.
        const archiveDir = join(this.dataDir, "valuation-evidence");
        mkdirSync(archiveDir, { recursive: true });
        const archived = { version: s.version, reportHash: aggregate, reports, financialInputs,
          poolProjection: projection, receivables: receivables.toString(), cutoff: now };
        const archivePath = join(archiveDir, `${aggregate}.json`);
        if (!existsSync(archivePath)) {
          writeFileSync(archivePath + ".tmp", JSON.stringify(archived), { mode: 0o600 });
          renameSync(archivePath + ".tmp", archivePath);
        }
        await transact("propose", vault, "proposeValuation", [
          aggregate,
          rights,
          receivables,
          fees,
          now,
          Math.min(...reports.map((r) => r.validUntil)),
        ]);
        this.repo.update((v) => {
          for (const report of reports) {
            if (!v.valuations.some((r) => r.reportHash === report.reportHash))
              v.valuations.push(report);
          }
          v.poolProjection = projection;
          v.activeReports = {
            ...Object.fromEntries(
              reports.map((r) => [r.stationId, r.reportHash])
            ),
            aggregate,
          };
        });
        return { reportHash: aggregate };
      }
      case "approve-valuation": {
        for (const a of s.applications.filter((a) => a.status === "pooled"))
          this.assertValuationReady(a, now);
        const p = await vault.proposed();
        if(Number(p.validUntil)<=now)throw new Error("待批准估值已过期，请由中介重新编制当前估值，再由受托人审批。Prepared valuation expired; the intermediary must prepare a current report.");
        if (
          !s.activeReports.aggregate ||
          p.report !== s.activeReports.aggregate
        )
          throw new Error("No matching prepared evidence");
        if(await this.proposalOutdated(p.report))throw new Error("报告编制后现金、应收款或费用已变化，请由中介重新编制后再审批。Financial inputs changed after proposal; prepare a reconciled valuation.");
        const reports = Object.values(s.activeReports)
          .map((h) => s.valuations.find((r) => r.reportHash === h))
          .filter(Boolean) as Valuation[];
        for (const r of reports) {
          const reason = valuationBlockReason(
            s.stations.find((v) => v.id === r.stationId)!,
            r,
            now
          );
          if (reason) throw new Error(reason);
        }
        if (reports.some((r) => r.provisional) && b.acceptProvisional !== true)
          throw new Error("Explicit provisional-estimate approval required");
        await transact("approve", vault, "approveValuation", [p.nonce]);
        this.repo.update((v) => {
          if (!v.approvedReports.includes(p.report))
            v.approvedReports.push(p.report);
        });
        return;
      }
      case "apply-eligibility": {
        if (b.riskAccepted !== true || b.demoAcknowledged !== true)
          throw new Error(
            "请先确认收益风险及本地演示声明 / Accept both declarations first"
          );
        if (await vault.eligible(this.address(actor)))
          throw new Error(
            "资格已通过，无需重复申请 / Eligibility already approved"
          );
        if (
          s.eligibilityApplications?.some(
            (r) => r.investor === actor && r.status === "pending"
          )
        )
          throw new Error("已有待审核申请 / An application is already pending");
        const request = {
          id: op.id,
          investor: actor,
          address: this.address(actor),
          submittedAt: now,
          status: "pending" as const,
          riskAccepted: true as const,
          demoAcknowledged: true as const,
        };
        this.repo.update((v) =>
          (v.eligibilityApplications ??= []).push(request)
        );
        return { id: request.id };
      }
      case "eligible": {
        const investor = actorSchema.parse(b.investor);
        if (roleOfActor(investor) !== "investor")
          throw new Error("Eligibility applicant must be an investor wallet");
        const eligible = z.boolean().parse(b.eligible);
        const request = s.eligibilityApplications
          ?.filter((r) => r.investor === investor)
          .at(-1);
        if (
          !request ||
          request.id !== b.applicationId ||
          (eligible
            ? request.status !== "pending"
            : !["pending", "approved"].includes(request.status))
        )
          throw new Error(
            "请从最新资格申请中审核 / Review the latest eligibility application"
          );
        const reviewNote = z
          .string()
          .trim()
          .min(4)
          .max(1000)
          .parse(b.reviewNote);
        await transact("eligibility", vault, "setEligible", [
          this.address(investor),
          eligible,
        ]);
        this.repo.update((v) =>
          Object.assign(
            v.eligibilityApplications!.find((r) => r.id === request.id)!,
            {
              status: eligible ? "approved" : "rejected",
              reviewedAt: now,
              reviewer: actor,
              reviewNote,
            }
          )
        );
        return;
      }
      case "publish": {
        this.assertPoolEvidence(now);
        const minimum =
          (BigInt(await vault.acquisitionTotal()) * 10n + 8n) / 9n;
        const target = b.targetUSDC6
          ? BigInt(uint.parse(b.targetUSDC6))
          : minimum;
        const terms = hash({
          agreements: s.applications
            .filter((a) => a.status === "pooled")
            .map((a) => a.agreementHash),
          target: target.toString(),
          issuancePriceUSDC6: "1000000",
          initialReserveBps: 1000,
          report: s.activeReports.aggregate,
        });
        await transact("publish", vault, "publish", [
          target,
          now + 30 * 86400,
          terms,
        ]);
        return { terms };
      }
      case "subscribe": {
        this.assertPoolEvidence(now);
        const value = uint.parse(b.amountUSDC6);
        if (!(await vault.eligible(this.address(actor))))
          throw new Error(
            "请先申请投资资格并等待中介审核 / Investor eligibility approval required"
          );
        const order = await vault.subscriptions(this.address(actor));
        if (
          !op.steps.subscribe &&
          (Number(await vault.phase()) !== 1 ||
            now >= Number(await vault.deadline()) ||
            (!["RevenueShareVaultV4", "RevenueShareVaultV5"].includes(s.manifest?.contractName || "") && BigInt(order.amount) > 0n) ||
            BigInt(value) + BigInt(await vault.totalSubscriptions()) >
              BigInt(await vault.getFunction("target")()))
        )
          throw new Error(
            "认购期或剩余额度不符合要求；旧合约不支持追加 / Check fundraising and capacity; older contracts do not support additions"
          );
        if (process.env.REVENUE_WALLET_REQUIRED !== "true")
          await transact(
            "demo-fund",
            this.usdc,
            "mint",
            [this.address(actor), value],
            "admin"
          );
        if (this.walletPreparation && !op.steps.subscribe &&
            BigInt(await this.usdc.balanceOf(this.address(actor))) < BigInt(value))
          throw new Error("演示 USDC 余额不足，请先领取测试资金 / Insufficient demo USDC; use the faucet before subscribing");
        await transact("approve-usdc", this.usdc, "approve", [
          await vault.getAddress(),
          value,
        ]);
        await transact("subscribe", vault, "subscribe", [
          value,
          await vault.issuanceTerms(),
        ]);
        return;
      }
      case "wallet-fund":
        await transact(
          "demo-wallet-fund",
          this.usdc,
          "mint",
          [this.address(actor), uint.parse(b.amountUSDC6)],
          "admin"
        );
        return;
      case "review-subscription": {
        if (!["RevenueShareVaultV3", "RevenueShareVaultV4", "RevenueShareVaultV5"].includes(s.manifest?.contractName || "")) throw new Error("Legacy orders require refund and resubscription in the current product / 旧版订单请退款后在新产品认购");
        const investor = actorSchema.parse(b.investor);
        if (roleOfActor(investor) !== "investor") throw new Error("Order must belong to an investor wallet");
        const address = this.address(investor);
        const expectedAmount = uint.parse(b.amountUSDC6);
        const expectedNonce = uint.parse(b.orderNonce);
        const expectedTerms = z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(b.terms);
        const approved = z.boolean().parse(b.approved);
        const note = z.string().trim().min(4).max(1000).parse(b.reviewNote);
        const evidence = hash({version:"subscription-review.v1",investor:address,orderNonce:expectedNonce,amountUSDC6:expectedAmount,terms:expectedTerms,approved,note});
        await transact("review-order",vault,"reviewSubscription",[address,expectedNonce,expectedAmount,expectedTerms,approved,evidence]);
        return {investor,approved,evidence,note};
      }
      case "wallet-confirm": {
        const txHash = z
          .string()
          .regex(/^0x[0-9a-fA-F]{64}$/)
          .parse(b.hash);
        const tx = await hre.ethers.provider.getTransaction(txHash),
          receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
        if (
          !tx ||
          !receipt ||
          receipt.status !== 1 ||
          tx.from.toLowerCase() !== this.address(actor).toLowerCase() ||
          ![await vault.getAddress(), await this.usdc.getAddress()]
            .map((a) => a.toLowerCase())
            .includes(tx.to!.toLowerCase())
        )
          throw new Error(
            "Wallet transaction is not a confirmed transaction for this role and deployment"
          );
        return { hash: txHash, block: receipt.blockNumber };
      }
      case "refund":
        await transact("refund", vault, "withdrawSubscription");
        return;
      case "settle":
        this.assertPoolEvidence(now);
        await transact("settle", vault, "settle", [
          hash({
            terms: await vault.issuanceTerms(),
            approvedReport: s.activeReports.aggregate,
            totalSubscriptions: String(await vault.totalSubscriptions()),
            agreements: s.applications
              .filter((a) => a.status === "pooled")
              .map((a) => a.agreementHash),
          }),
        ]);
        return;
      case "fail":
        await transact("fail", vault, "failFundraising");
        return;
      case "release-station":
        await transact("release", vault, "releaseStation", [
          z.number().int().nonnegative().parse(b.index),
        ]);
        return;
      case "advance": {
        const choice = z.enum(["cooling", "month", "day"]).parse(b.by);
        if (choice === "cooling" && ["RevenueShareVaultV3", "RevenueShareVaultV4", "RevenueShareVaultV5"].includes(s.manifest?.contractName || "")) throw new Error("This product has no cooling period / 本产品不设冷静期，无需推进三天时间");
        let target = now + (choice === "cooling" ? 3 * 86400 + 1 : 86400);
        if (choice === "month") target = Number(await vault.nextFeeAt());
        if (b.expectedCutoff !== undefined &&
            (choice !== "month" || z.number().int().positive().parse(b.expectedCutoff) !== target))
          throw new Error("Monthly cutoff changed. Refresh the task and confirm the new date / 月度截止日已变化，请刷新任务并重新确认日期");
        if (target <= now)
          throw new Error(
            "Accrue the due fee and approve a new valuation before advancing another month"
          );
        if (
          Number(await vault.phase()) === 2 &&
          target > Number(await vault.nextFeeAt()) &&
          Number(await vault.feeMonths()) < 60
        )
          throw new Error(
            "Advance to the next monthly cutoff, accrue fees, then prepare and approve the monthly valuation"
          );
        await hre.network.provider.send("evm_setNextBlockTimestamp", [target]);
        await hre.network.provider.send("evm_mine");
        return { financialTime: target, telemetryUnchanged: true };
      }
      case "accrue-fee":
        await transact("accrue", vault, "accrueFees");
        return;
      case "book-revenue": {
        const a = app();
        if (a.status !== "pooled" || Number(await vault.phase()) !== 2)
          throw new Error("Active admitted rights required");
        const period = z.number().int().min(1).max(60).parse(b.period);
        const start = Number(await vault.settledAt());
        if (addMonths(start, period) > now)
          throw new Error("Service period has not ended");
        const st = s.stations.find((x) => x.id === a.stationId)!;
        const h = st.history.find((h) => h.month === b.historyMonth);
        if (!h?.complete || h.exportKWh === null)
          throw new Error(
            "Select an observed complete historical export month"
          );
        const id = hash({ station: a.stationId, period });
        if (s.income.some((i) => i.id === id))
          throw new Error("Period already booked");
        const a0 = this.effectiveAssumptions(a);
        if (h.generationKWh === null)
          throw new Error("Complete observed generation is required for monthly billing");
        const billing = monthlyRevenue(a0, {
          generationKWh: h.generationKWh,
          exportKWh: h.exportKWh,
          importKWh: h.importKWh,
        }, period);
        const payments=this.billing?paymentAmounts(billing,a0.fxUSDC,a0.shareBps):undefined;
        const value = payments?.assignedUSDC6 || billing.assignedUSDC6;
        const sourceHash=hash({source:st.sourceHash,history:h,billing,assumptions:a0,historyMonth:h.month,
          ...(payments?{financialAssumptionsSimulated:true,ownerPayment:"wallet-usdc",exportPayment:"simulated",payments}:{simulatedReceipt:true})});
        await transact("invalidate", vault, "invalidateValuation");
        if(payments)await transact("publish-bill",this.billing!,"publishBill",[id,a.owner,payments.householdUSDC6,payments.exportUSDC6,value,payments.costsUSDC6,sourceHash]);
        this.repo.update((v) =>
          v.income.push({
            id,
            stationId: a.stationId,
            period,
            amountUSDC6: value,
            billing,
            sourceHash,
            ...(payments?{payment:{version:"household-usdc.v1" as const,payer:a.owner,...payments,householdPaid:payments.householdUSDC6==="0",exportPaid:payments.exportUSDC6==="0",confirmed:false}}:{}),
            collected:payments?false:value === "0",
          })
        );
        return { id, amountUSDC6: value, simulated: !payments, householdPaymentRequired:!!payments };
      }
      case "publish-household-bill": {
        const r=s.income.find(i=>i.id===b.incomeId);
        if(!r||!r.billing||r.collected||r.payment||!this.billing)throw new Error("An unpaid legacy receivable and enabled billing contract are required / 仅可将未收款的旧账单发布为钱包缴费账单");
        const a=s.applications.find(a=>a.stationId===r.stationId)!;const terms=this.effectiveAssumptions(a);const payments=paymentAmounts(r.billing,terms.fxUSDC,terms.shareBps);
        const evidence=hash({previousEvidence:r.sourceHash,payments,version:"household-usdc.v1"});
        await transact("invalidate",vault,"invalidateValuation");
        await transact("publish-bill",this.billing,"publishBill",[r.id,a.owner,payments.householdUSDC6,payments.exportUSDC6,payments.assignedUSDC6,payments.costsUSDC6,evidence]);
        this.repo.update(v=>{const row=v.income.find(i=>i.id===r.id)!;row.amountUSDC6=payments.assignedUSDC6;row.sourceHash=evidence;row.payment={version:"household-usdc.v1",payer:a.owner,...payments,householdPaid:payments.householdUSDC6==="0",exportPaid:payments.exportUSDC6==="0",confirmed:false};});
        return;
      }
      case "pay-household-bill": {
        const r=s.income.find(i=>i.id===b.incomeId);if(!r?.payment||!this.billing)throw new Error("Published household bill required / 请等待中介发布缴费账单");
        if(getAddress(r.payment.payer)!==getAddress(this.address(actor)))throw new Error("Only this bill's household can pay / 只能由该账单业主的钱包缴费");
        const bill=await this.billing.bills(r.id);
        if((bill.householdPaid||bill.confirmed||bill.refunded)&&!op.steps.pay)throw new Error("Household bill already paid or unavailable / 本期业主电费已支付或不可支付，请勿重复付款");
        if(!op.steps.pay&&BigInt(await this.usdc.balanceOf(this.address(actor)))<BigInt(r.payment.householdUSDC6))throw new Error("Insufficient USDC for this bill. Receive test funds first / USDC 余额不足，请先领取测试资金");
        await transact("bill-allowance",this.usdc,"approve",[await this.billing.getAddress(),r.payment.householdUSDC6]);
        await transact("pay",this.billing,"payBill",[r.id]);
        this.repo.update(v=>{const p=v.income.find(i=>i.id===r.id)!.payment!;p.householdPaid=true;p.ownerTransaction=v.operations.find(o=>o.id===op.id)?.steps.pay?.hash;});
        return {incomeId:r.id,amountUSDC6:r.payment.householdUSDC6,awaitingIntermediary:true};
      }
      case "fund-export": {
        const r=s.income.find(i=>i.id===b.incomeId);if(!r?.payment||!this.billing)throw new Error("Published bill required");
        const bill=await this.billing.bills(r.id);if((bill.exportPaid||bill.confirmed||bill.refunded)&&!op.steps["export-fund"])throw new Error("Export receipt already funded or unavailable / 售电回款已登记，无需重复操作");
        // No household money is minted here. Only the separately disclosed grid-export leg is simulated.
        await transact("export-demo-cash",this.usdc,"mint",[this.address("treasury"),r.payment.exportUSDC6],"admin");
        await transact("export-allowance",this.usdc,"approve",[await this.billing.getAddress(),r.payment.exportUSDC6],"treasury");
        await transact("export-fund",this.billing,"fundExport",[r.id],"treasury");
        this.repo.update(v=>{const p=v.income.find(i=>i.id===r.id)!.payment!;p.exportPaid=true;p.exportTransaction=v.operations.find(o=>o.id===op.id)?.steps["export-fund"]?.hash;});
        return {exportSimulated:true,householdDebited:false,amountUSDC6:r.payment.exportUSDC6};
      }
      case "confirm-receipt": {
        const r=s.income.find(i=>i.id===b.incomeId);if(!r?.payment||!this.billing)throw new Error("Published bill required");
        const bill=await this.billing.bills(r.id);
        if((!bill.householdPaid||!bill.exportPaid||bill.confirmed||bill.refunded)&&!op.steps.confirm)throw new Error("Both household payment and export receipt must be confirmed first / 请先完成业主缴费和独立的售电回款登记，再核对确认");
        await transact("confirm",this.billing,"confirmReceipt",[r.id]);
        this.repo.update(v=>{const row=v.income.find(i=>i.id===r.id)!;row.collected=true;row.payment!.householdPaid=true;row.payment!.exportPaid=true;row.payment!.confirmed=true;row.payment!.confirmationTransaction=v.operations.find(o=>o.id===op.id)?.steps.confirm?.hash;
          if(!v.receipts.some(i=>i.id===r.id))v.receipts.push({id:r.id,stationId:r.stationId,amountUSDC6:r.amountUSDC6,sourceHash:r.sourceHash,simulated:false,exportSimulated:true,householdUSDC6:r.payment!.householdUSDC6,exportUSDC6:r.payment!.exportUSDC6,costsUSDC6:r.payment!.costsUSDC6,householdTransaction:row.payment!.ownerTransaction,confirmationTransaction:row.payment!.confirmationTransaction});});
        return {incomeId:r.id,amountUSDC6:r.amountUSDC6,confirmed:true};
      }
      case "collect-revenue": {
        const r = s.income.find((i) => i.id === b.incomeId);
        if (!r) throw new Error("Receivable not found");
        if(r.payment||this.billing)throw new Error("Use household wallet payment and intermediary confirmation / 请使用业主钱包缴费及中介确认，不再模拟全部回款");
        if (r.collected && !op.steps["receive"])
          throw new Error("Receipt already collected");
        await transact(
          "demo-cash",
          this.usdc,
          "mint",
          [this.address("treasury"), r.amountUSDC6],
          "admin"
        );
        await transact(
          "cash-allowance",
          this.usdc,
          "approve",
          [await vault.getAddress(), r.amountUSDC6],
          "treasury"
        );
        await transact(
          "receive",
          vault,
          "receiveRevenue",
          [r.id, r.amountUSDC6, r.sourceHash],
          "treasury"
        );
        this.repo.update((v) => {
          v.income.find((i) => i.id === r.id)!.collected = true;
          if (!v.receipts.some((i) => i.id === r.id))
            v.receipts.push({
              id: r.id,
              stationId: r.stationId,
              amountUSDC6: r.amountUSDC6,
              sourceHash: r.sourceHash,
              simulated: true,
            });
        });
        return;
      }
      case "distribute": {
        const monthly = BigInt(await vault.monthlyMandatoryCost());
        await transact("distribute", vault, "distribute", [
          monthly * 6n,
          monthly * (s.manifest?.contractName==="RevenueShareVaultV5"?BigInt(await vault.feeMonths())-BigInt(await vault.distributionMonths()):3n),
          hash({
            cutoff: now,
            receipts: s.receipts.map((r) => r.id),
            poolCost: "simulated mandatory monthly expense",
          }),
        ]);
        return;
      }
      case "claim":
        await transact("claim", vault, "claim", [
          z.number().int().positive().parse(b.distributionId),
        ]);
        return;
      case "request-redemption":
        await transact("request", vault, "requestRedemption", [
          uint.parse(b.sharesUSDC6),
        ]);
        return;
      case "cancel-redemption":
        await transact("cancel", vault, "cancelRedemption");
        return;
      case "carry-window":
        await transact("carry", vault, "carryMissedWindow");
        return;
      case "process-redemptions":
        await transact("deal", vault, "processRedemptions");
        return;
      case "propose-trade": {
        const buyer = actorSchema.parse(b.buyer);
        if (roleOfActor(buyer) !== "investor")
          throw new Error("Buyer must be an investor wallet");
        if (buyer === actor) throw new Error("Buyer must be another investor");
        const shares = uint.parse(b.sharesUSDC6),
          payment = uint.parse(b.paymentUSDC6),
          until = now + 7 * 86400,
          nonce = s.nextTrade;
        if (
          Number(await vault.phase()) !== 2 ||
          now < Number(await vault.unlockedAt()) ||
          now >= Number(await vault.expiresAt()) ||
          !(await vault.fresh())
        )
          throw new Error(
            "须在解锁后且估值有效时提出转让 / Transfer requires an unlocked active product and current valuation"
          );
        if (
          !(await vault.eligible(this.address(actor))) ||
          !(await vault.eligible(this.address(buyer))) ||
          BigInt(shares) > BigInt(await vault.balanceOf(this.address(actor)))
        )
          throw new Error(
            "双方须具备资格且卖方份额充足 / Check both investors' eligibility and available shares"
          );
        const id = await vault.transferId(
          this.address(actor),
          this.address(buyer),
          shares,
          payment,
          until,
          nonce
        );
        this.repo.update((v) => {
          v.trades.push({
            id,
            seller: actor,
            buyer,
            shares,
            payment,
            until,
            nonce,
            status: "proposed",
          });
          v.nextTrade++;
        });
        return { id };
      }
      case "consent-trade":
      case "review-trade":
      case "settle-trade": {
        const trade = s.trades.find((t) => t.id === b.tradeId);
        if (!trade) throw new Error("Trade not found");
        if (
          !Object.keys(op.steps).length &&
          (trade.until < now || (await vault.transferUsed(trade.id)))
        )
          throw new Error(
            "交易已过期或完成 / Trade expired or already settled"
          );
        if (action === "consent-trade") {
          if (trade.buyer !== actor)
            throw new Error("Only the named buyer can consent");
          if (
            !Object.keys(op.steps).length &&
            (await vault.buyerConsent(trade.id))
          )
            throw new Error("买方已确认 / Buyer already consented");
          if (process.env.REVENUE_WALLET_REQUIRED !== "true")
            await transact(
              "fund",
              this.usdc,
              "mint",
              [this.address(actor), trade.payment],
              "admin"
            );
          await transact("allow", this.usdc, "approve", [
            await vault.getAddress(),
            trade.payment,
          ]);
          await transact("consent", vault, "consentToTrade", [
            this.address(trade.seller),
            trade.shares,
            trade.payment,
            trade.until,
            trade.nonce,
          ]);
        } else if (action === "review-trade")
          await transact("review", vault, "approvePeerTransfer", [trade.id]);
        else {
          if (trade.seller !== actor)
            throw new Error("Only the seller can settle");
          await transact("trade", vault, "peerTransfer", [
            this.address(trade.buyer),
            trade.shares,
            trade.payment,
            trade.until,
            trade.nonce,
          ]);
        }
        this.repo.update((v) => {
          v.trades.find((t) => t.id === trade.id)!.status =
            action === "settle-trade"
              ? "settled"
              : action === "review-trade"
              ? "reviewed"
              : "consented";
        });
        return;
      }
      case "open-case": {
        const reason = z
          .enum([
            "missing-remittance",
            "diverted-receipts",
            "breached-obligations",
            "prolonged-incident",
          ])
          .parse(b.reason);
        const a = app();
        if (a.status !== "pooled")
          throw new Error("Servicing case requires admitted station rights");
        const recipient = z
          .enum(["treasury", "trustee2"])
          .parse(b.recipient || "trustee2");
        const receipt = await transact("open", vault, "openCase", [
          hash({
            station: a.stationId,
            reason,
            notes: z.string().min(1).max(2000).parse(b.notes),
          }),
          this.address(recipient),
        ]);
        const event = receipt.logs
          .map((l: any) => {
            try {
              return vault.interface.parseLog(l);
            } catch {
              return null;
            }
          })
          .find((l: any) => l?.name === "ServicingOpened");
        const id = event
          ? Number(event.args.id)
          : Number(await vault.caseCount()) + 1;
        this.repo.update((v) => {
          if (!v.servicing.some((c) => c.id === id))
            v.servicing.push({
              id,
              reason,
              stationId: a.stationId,
              status: "holder-review",
            });
        });
        return { id };
      }
      case "support-case":
        await transact("support", vault, "supportCase", [
          z.number().int().positive().parse(b.caseId),
        ]);
        return;
      case "approve-case":
        await transact("approve", vault, "approveCase", [
          z.number().int().positive().parse(b.caseId),
        ]);
        return;
      case "close":
        await transact("close", vault, "closeProduct");
        return;
      default:
        throw new Error("Unknown action");
    }
  }
  async walletTransactions(
    actor: Actor,
    action: string,
    b: Record<string, unknown>,
    expectedVault?: string,
    id?: string
  ) {
    await this.queue;
    this.checkScenario(expectedVault);
    await this.reconcileRevertedApprovals();
    await this.reconcileHouseholdPayments();
    if (!access[action]?.includes(roleOfActor(actor)))
      throw new Error("This role is not authorized for this wallet action");
    const operationId = z
      .string()
      .min(8)
      .max(100)
      .regex(/^[\w-]+$/)
      .parse(id || globalThis.crypto.randomUUID());
    const bodyHash = hash({ actor, action, body: b });
    let op = this.repo.read().operations.find((value) => value.id === operationId);
    if (op && op.bodyHash !== bodyHash)
      throw new Error("Idempotency key already belongs to a different request");
    if(op && this.terminalApproval(op))throw new Error("原估值审批交易已失败，请通过当前估值页面发起新的审批。The reverted approval cannot reuse its old transaction.");
    if (!op) {
      op = {
        id: operationId,
        actor,
        action,
        bodyHash,
        body: b,
        status: "running",
        steps: {},
        startedAt: await this.now(),
      };
      this.repo.update((state) => state.operations.push(op!));
    }
    if (op.status === "confirmed")
      return {
        chainId: `0x${this.repo.read().manifest!.chainId.toString(16)}`,
        account: this.address(actor),
        operationId,
        transactions: [],
      };
    const conflicting = this.repo
      .read()
      .operations.find(
        (value) =>
          value.id !== operationId &&
          value.status !== "confirmed" &&
          !this.terminalApproval(value) &&
          Object.keys(value.steps).length > 0
      );
    if (conflicting)
      throw new Error(
        `Resolve wallet operation ${conflicting.id} before starting another chain action`
      );
    if (op.prepared?.length)
      return {
        chainId: `0x${this.repo.read().manifest!.chainId.toString(16)}`,
        account: this.address(actor),
        operationId,
        transactions: op.prepared.filter((tx) => !op!.steps[tx.step]),
      };
    const transactions: NonNullable<
      RevenueRuntime["walletPreparation"]
    >["transactions"] = [];
    this.repo.begin();
    this.walletPreparation = { actor, transactions };
    let preparationError: unknown;
    try {
      await this.run(op, b);
    } catch (error) {
      preparationError = error;
    } finally {
      this.walletPreparation = undefined;
      this.repo.rollback();
    }
    if (preparationError) {
      const message = safeError(preparationError);
      this.repo.durable((state) => {
        const current = state.operations.find((value) => value.id === operationId)!;
        current.status = "failed";
        current.error = message;
      });
      throw new Error(message);
    }
    this.repo.durable((state) => {
      state.operations.find((value) => value.id === operationId)!.prepared =
        transactions;
    });
    return {
      chainId: `0x${this.repo.read().manifest!.chainId.toString(16)}`,
      account: this.address(actor),
      operationId,
      transactions,
    };
  }
  private async expectedWalletStep(
    actor: Actor,
    operationId: string,
    step: string,
    expectedVault?: string
  ) {
    const operation = this.repo
      .read()
      .operations.find((value) => value.id === operationId);
    if (!operation || operation.actor !== actor)
      throw new Error("Wallet operation was not found for this account");
    const persisted = operation.prepared?.find((tx) => tx.step === step);
    if (persisted) return { operation, expected: persisted };
    const prepared = await this.walletTransactions(
      actor,
      operation.action,
      operation.body,
      expectedVault,
      operationId
    );
    const expected = prepared.transactions.find((tx) => tx.step === step);
    return { operation, expected };
  }
  async recordWalletSubmission(
    actor: Actor,
    operationId: string,
    step: string,
    txHash: string,
    expectedVault?: string
  ) {
    const { expected } = await this.expectedWalletStep(
      actor,
      operationId,
      step,
      expectedVault
    );
    if (!expected)
      throw new Error("Wallet step is not expected for this operation");
    const hashValue = z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(txHash);
    const tx = await hre.ethers.provider.getTransaction(hashValue);
    if (
      !tx ||
      getAddress(tx.from) !== getAddress(expected.from) ||
      !tx.to ||
      getAddress(tx.to) !== getAddress(expected.to) ||
      tx.data.toLowerCase() !== expected.data.toLowerCase() ||
      tx.value !== BigInt(expected.value)
    )
      throw new Error("Submitted transaction does not match the stored wallet intent");
    this.repo.durable((state) => {
      state.operations.find((op) => op.id === operationId)!.steps[step] = {
        hash: hashValue,
        raw: "",
        status: "sent",
      };
    });
    return { hash: hashValue, step, status: "submitted" };
  }
  async confirmWalletTransaction(
    actor: Actor,
    operationId: string,
    step: string,
    txHash: string,
    expectedVault?: string
  ) {
    this.checkScenario(expectedVault);
    const hashValue = z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(txHash);
    const operation = this.repo
      .read()
      .operations.find((value) => value.id === operationId);
    const saved = operation?.steps[step];
    if (
      !operation ||
      operation.actor !== actor ||
      !saved ||
      saved.hash.toLowerCase() !== hashValue.toLowerCase()
    )
      throw new Error("Submitted wallet transaction was not registered");
    const receipt = await hre.ethers.provider.getTransactionReceipt(hashValue);
    if(receipt?.status===0 && operation.action==="approve-valuation"){
      await this.reconcileRevertedApprovals();
      throw new Error("估值批准交易已在链上失败，请核对有效期并重新编制报告。Valuation approval reverted on chain.");
    }
    if (!receipt || receipt.status !== 1)
      throw new Error("Wallet transaction has not confirmed successfully");
    this.repo.durable((state) => {
      const current = state.operations.find((op) => op.id === operationId)!.steps[
        step
      ];
      current.status = "mined";
      current.block = receipt.blockNumber;
    });
    return { hash: hashValue, block: receipt.blockNumber, step };
  }
  rejectWalletOperation(
    actor: Actor,
    operationId: string,
    reason: unknown,
    expectedVault?: string
  ) {
    this.checkScenario(expectedVault);
    const id = z.string().min(8).max(100).regex(/^[\w-]+$/).parse(operationId);
    const message = z.string().max(240).catch("Wallet request rejected").parse(reason);
    const operation = this.repo.read().operations.find((value) => value.id === id);
    if (!operation || operation.actor !== actor)
      throw new Error("Wallet operation was not found for this account");
    if (Object.keys(operation.steps).length)
      throw new Error("A submitted transaction must be confirmed or recovered");
    this.repo.durable((state) => {
      const current = state.operations.find((value) => value.id === id)!;
      current.status = "failed";
      current.error = `Wallet did not submit: ${message}`;
    });
    return { operationId: id, status: "failed" };
  }
  private rightsDescription(raw: unknown) {
    const a = AssumptionsSchema.parse(raw);
    return a.revenueModel === "household-export"
      ? `${a.shareBps / 100}% of net household solar electricity payments plus eligible grid export revenue; household pays ${a.householdPaymentBps / 100}% of grid energy tariff; equipment retained by household`
      : "net export revenue only; equipment retained by household";
  }
  private agreementMessage(agreement: Record<string, unknown>) {
    return [
      "Deye RWA revenue-rights agreement",
      `Chain ID: ${agreement.chainId}`,
      `Vault: ${agreement.vault}`,
      `Application: ${agreement.applicationId}`,
      `Station: ${agreement.stationId}`,
      `Owner: ${agreement.owner}`,
      `Offer report: ${agreement.offer}`,
      `Purchase price (USDC6): ${agreement.price}`,
      `Rights: ${agreement.rights}`,
      `Assumptions hash: ${hash(agreement.assumptions)}`,
      `Collection: ${agreement.collection}`,
      `Settlement: ${agreement.settlement}`,
    ].join("\n");
  }
  agreementSigningMessage(
    actor: Actor,
    applicationId: string,
    expectedVault?: string
  ) {
    this.checkScenario(expectedVault);
    if (roleOfActor(actor) !== "owner") throw new Error("Owner wallet required");
    const s = this.repo.read();
    const a = this.app(applicationId);
    if (a.status !== "accepted") throw new Error("Accept the offer first");
    return this.agreementMessage({
      version: s.version,
      chainId: s.manifest!.chainId,
      vault: s.manifest!.addresses.vault,
      applicationId: a.id,
      stationId: a.stationId,
      owner: a.owner,
      assumptions: a.assumptions,
      price: a.priceUSDC6,
      offer: a.offer!.reportHash,
      rights: this.rightsDescription(a.assumptions),
      collection: a.assumptions.revenueModel === "household-export"
            ? "household pays discounted monthly solar electricity bills and remits eligible collected export revenue to the pool"
            : "household remits collected eligible cash to pool",
      settlement: "term begins at product settlement",
    });
  }
  faucet(actor: Actor, expectedVault?: string) {
    const work = this.queue.then(async () => {
      this.checkScenario(expectedVault);
      const recipient = this.address(actor);
      const admin = this.wallets.admin;
      if (!admin) throw new Error("Demo faucet system wallet is unavailable");
      const current = this.repo.read().faucetClaims?.[recipient.toLowerCase()];
      const ethBalance = await hre.ethers.provider.getBalance(recipient);
      const usdcBalance = BigInt(await this.usdc.balanceOf(recipient));
      const target =
        BigInt(process.env.REVENUE_FAUCET_USDC || "1000000") * 1_000_000n;
      if (
        current &&
        Date.now() - current.at < 60_000 &&
        ethBalance >= hre.ethers.parseEther("1") &&
        usdcBalance >= target
      )
        return current;
      let ethHash: string | undefined;
      let usdcHash: string | undefined;
      if (ethBalance < hre.ethers.parseEther("1")) {
        const tx = await this.sendWithFreshNonce(admin, {
          to: recipient,
          value: hre.ethers.parseEther("5") - ethBalance,
        });
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1)
          throw new Error("Demo gas funding failed");
        ethHash = tx.hash;
      }
      if (usdcBalance < target) {
        const request = await this.usdc
          .connect(admin)
          .getFunction("mint")
          .populateTransaction(recipient, target - usdcBalance);
        const tx = await this.sendWithFreshNonce(admin, request);
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1)
          throw new Error("Demo USDC funding failed");
        usdcHash = tx.hash;
      }
      const result = { at: Date.now(), ethHash, usdcHash };
      this.repo.update((state) => {
        state.faucetClaims ||= {};
        state.faucetClaims[recipient.toLowerCase()] = result;
        state.audit.push({
          at: result.at,
          actor,
          action: "faucet",
          message: `Issued explicit demo funds to ${recipient}`,
        });
      });
      return result;
    });
    this.queue = work.catch(() => {});
    return work;
  }
  async state() {
    await this.queue;
    await this.queue;
    const s = this.repo.read();
    const v = this.vault;
    const names = [
      "phase",
      "target",
      "deadline",
      "totalSubscriptions",
      "acquisitionTotal",
      "settledAt",
      "expiresAt",
      "totalSupply",
      "nav",
      "price",
      "fresh",
      "operatingReserve",
      "redemptionCash",
      "unpaidDistributions",
      "feeLiability",
      "expenseLiability",
      "feeMonths",
      "nextFeeAt",
      "unlockedAt",
      "redemptionDate",
      "redemptionCutoff",
      "distributionCount",
      "collectionRecipient",
      "valuationDirty",
      "monthlyMandatoryCost",
      "feeBasisReady",
      "nextDistributionAt",
      "distributionMonths",
      "newReceipts",
    ];
    const values = await Promise.all(names.map((n) => v.getFunction(n)()));
    const chain = Object.fromEntries(
      names.map((n, i) => [
        n,
        typeof values[i] === "bigint" ? values[i].toString() : values[i],
      ])
    );
    chain.subscriptionReviewRequired = ["RevenueShareVaultV3", "RevenueShareVaultV4", "RevenueShareVaultV5"].includes(s.manifest?.contractName || "");
    chain.subscriptionTopUpsAllowed = ["RevenueShareVaultV4", "RevenueShareVaultV5"].includes(s.manifest?.contractName || "");
    chain.distributionIntervalMonths=s.manifest?.contractName==="RevenueShareVaultV5"?1:3;
    const approvedValuation = await v.valuation();
    const proposedValuation = await v.proposed();
    Object.assign(chain, {
      proposedValuationOutdated: await this.proposalOutdated(proposedValuation.report),
      proposedValuationReport: proposedValuation.report,
      proposedValuationAsOf: Number(proposedValuation.asOf),
      proposedValuationValidUntil: Number(proposedValuation.validUntil),
      proposedValuationNonce: String(proposedValuation.nonce),
      valuationReport: approvedValuation.report,
      valuationAsOf: Number(approvedValuation.asOf),
      valuationValidUntil: Number(approvedValuation.validUntil),
      rightsPV: String(approvedValuation.rightsPV),
      receivables: String(approvedValuation.receivables),
      futureFees: String(approvedValuation.futureFees),
      vaultCash: String(await this.usdc.balanceOf(await v.getAddress())),
    });
    const logs = await v.queryFilter("*", s.manifest!.deployedBlock);
    const blockTimes = new Map(
      await Promise.all(
        [...new Set(logs.map((l) => l.blockNumber))].map(
          async (n) =>
            [n, (await hre.ethers.provider.getBlock(n))!.timestamp] as const
        )
      )
    );
    const events = logs
      .map((log) => {
        try {
          return {
            parsed: v.interface.parseLog(log),
            at: blockTimes.get(log.blockNumber)!,
            hash: log.transactionHash,
            block: log.blockNumber,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const accounts: Record<string, unknown> = {};
    const accountActors: Actor[] = [
      "owner",
      "investor",
      "investor2",
      ...(s.walletInvestors || []).map(
        (address) => `investor:${address.toLowerCase()}` as Actor
      ),
    ];
    for (const who of accountActors) {
      const address = this.address(who),
        subscription = await v.subscriptions(address),
        redemption = await v.redemptions(address);
      const claims = [];
      for (let id = 1; id <= Number(chain.distributionCount); id++)
        claims.push({
          id,
          amountUSDC6: String(await v.claimable(id, address)),
          paidUSDC6: events
            .filter(
              (e) =>
                e?.parsed?.name === "DistributionClaimed" &&
                e.parsed.args.investor === address &&
                Number(e.parsed.args.id) === id
            )
            .reduce((sum, e) => sum + BigInt(e!.parsed!.args.amount), 0n)
            .toString(),
        });
      let invested =
          Number(chain.phase) >= 2 && Number(chain.phase) !== 3
            ? BigInt(subscription.amount)
            : 0n,
        received = 0n,
        distributions = 0n;
      const subscriptionHistory = events.filter(event =>
        event?.parsed && ["Subscribed", "Refunded"].includes(event.parsed.name) &&
        getAddress(event.parsed.args.investor) === getAddress(address)
      ).map(event => ({kind:event!.parsed!.name === "Subscribed" ? "subscription" : "refund",
        amountUSDC6:String(event!.parsed!.args.amount),at:event!.at,hash:event!.hash,block:event!.block}));
      // Each additional payment has its own date; do not date all invested cash at the latest addition.
      const cashflows: Array<{ at: number; value: number }> = invested > 0n
        ? subscriptionHistory.length ? subscriptionHistory.map(flow => ({at:flow.at,value:(flow.kind === "refund" ? 1 : -1)*Number(flow.amountUSDC6)/1e6}))
          : [{at:chain.subscriptionReviewRequired ? Number(subscription.submittedAt) : Number(subscription.coolingEnd)-3*86400,value:-Number(invested)/1e6}]
        : [];
      for (const event of events) {
        const e = event!.parsed;
        if (!e) continue;
        const at = event!.at;
        if (e.name === "DistributionClaimed" && e.args.investor === address) {
          received += e.args.amount;
          distributions += e.args.amount;
          cashflows.push({ at, value: Number(e.args.amount) / 1e6 });
        }
        if (e.name === "RedemptionFilled" && e.args.investor === address) {
          received += e.args.amount;
          cashflows.push({ at, value: Number(e.args.amount) / 1e6 });
        }
        if (e.name === "PeerTransfer") {
          if (e.args.buyer === address) {
            invested += e.args.payment;
            cashflows.push({ at, value: -Number(e.args.payment) / 1e6 });
          }
          if (e.args.seller === address) {
            received += e.args.payment;
            cashflows.push({ at, value: Number(e.args.payment) / 1e6 });
          }
        }
      }
      const economic = BigInt(await v.economicBalance(address));
      const remaining = (economic * BigInt(chain.price as string)) / 1000000n;
      const unclaimed = claims.reduce(
        (sum, c) => sum + BigInt(c.amountUSDC6),
        0n
      );
      const profit = remaining + unclaimed + received - invested;
      if (unclaimed > 0n)
        cashflows.push({
          at: await this.now(),
          value: Number(unclaimed) / 1e6,
        });
      if (
        s.poolProjection &&
        Number(chain.phase) === 2 &&
        BigInt(chain.totalSupply as string) > 0n
      ) {
        const share = Number(economic) / Number(chain.totalSupply);
        for (const flow of s.poolProjection.cashflows.slice(1))
          cashflows.push({
            at: flow.at,
            value: (Number(flow.valueUSDC6) / 1e6) * share,
          });
      }
      accounts[who] = {
        address,
        usdc: String(await this.usdc.balanceOf(address)),
        nativeBalanceWei: String(await hre.ethers.provider.getBalance(address)),
        faucetClaim: s.faucetClaims?.[address.toLowerCase()] || null,
        shares: String(await v.balanceOf(address)),
        economicShares: economic.toString(),
        eligible: await v.eligible(address),
        subscription: {
          amount: String(subscription.amount),
          coolingEnd: chain.subscriptionReviewRequired ? 0 : Number(subscription.coolingEnd),
          terms: subscription.terms,
          approved: chain.subscriptionReviewRequired ? await v.subscriptionApproved(address) : false,
          submittedAt: chain.subscriptionReviewRequired ? Number(subscription.submittedAt) : Number(subscription.coolingEnd) - 3 * 86400,
          nonce: chain.subscriptionReviewRequired ? String(await v.subscriptionNonce(address)) : "0",
          history: subscriptionHistory,
        },
        redemption: {
          shares: String(redemption.shares),
          requestedAt: Number(redemption.requestedAt),
        },
        claims,
        performance: {
          projectedNetIRRPct:
            chain.fresh && chain.valuationReport === s.activeReports.aggregate
              ? irr(cashflows.sort((a, b) => a.at - b.at))
              : null,
          investedUSDC6: invested.toString(),
          cashDistributionsUSDC6: distributions.toString(),
          cashReceivedUSDC6: received.toString(),
          remainingNAVUSDC6: remaining.toString(),
          unclaimedDistributionsUSDC6: unclaimed.toString(),
          totalProfitUSDC6: profit.toString(),
          totalReturnPct:
            invested > 0n && (chain.fresh || Number(chain.phase) === 4)
              ? (Number(profit) * 100) / Number(invested)
              : null,
        },
      };
    }
    const cases = await Promise.all(
      s.servicing.map(async (c) => {
        const onchain = await v.cases(c.id);
        return {
          ...c,
          support: String(onchain.support),
          supply: String(onchain.supply),
          firstTrustee: onchain.firstTrustee,
          recipient: onchain.recipient,
          executed: onchain.executed,
          voters: Object.fromEntries(
            await Promise.all(
              accountActors
                .filter((who) => roleOfActor(who) === "investor")
                .map(async (who) => [
                who,
                {
                  weight: String(await v.caseWeight(c.id, this.address(who))),
                  voted: await v.voted(c.id, this.address(who)),
                },
              ])
            )
          ),
        };
      })
    );
    const financialTime = await this.now();
    const trades = await Promise.all(
      s.trades.map(async (trade) => ({
        ...trade,
        buyerConsented: await v.buyerConsent(trade.id),
        intermediaryApproved: await v.transferApproval(trade.id),
        settled: await v.transferUsed(trade.id),
      }))
    );
    const valuationChecks = Object.fromEntries(
      s.applications.map((a) => {
        const station = s.stations.find((v) => v.id === a.stationId)!;
        const audit = analyzeBaseline(station, financialTime);
        const accepted =
          a.reassessment?.ownerAccepted && a.reassessment?.trusteeApproved;
        const report = accepted ? a.reassessment!.report : a.offer;
        // Initial pricing needs baseline guidance, not an invalid-existing-quote state.
        // Approval and settlement still use the strict valuation gate independently.
        const block = report
          ? valuationBlockReason(station, report, financialTime)
          : null;
        const comparison = station.history.some((h) => h.complete)
          ? forecast(
              station,
              { ...a.assumptions, baselineMethod: "historical" },
              a.status === "pooled"
                ? Number(chain.settledAt) || financialTime
                : financialTime,
              financialTime
            )
          : null;
        const reassessmentCurrent =
          !!a.reassessment &&
          a.reassessment.report.validUntil >= financialTime &&
          !valuationBlockReason(station, a.reassessment.report, financialTime);
        return [
          a.id,
          {
            blocked: !!block,
            reason: block,
            reviewRequired:
              audit.materialChange ||
              report?.assumptions.baselineMethod === "recent-export-ratio",
            audit,
            comparison,
            reassessmentCurrent,
          },
        ];
      })
    );
    const applications = await Promise.all(
      s.applications.map(async (application) => {
        const facility = await this.station.getFacility(application.stationId);
        const minted = Boolean(facility.exists);
        let approvedToVault = false;
        if (minted) {
          const approved = await this.station.getApproved(BigInt(application.stationId));
          approvedToVault =
            approved.toLowerCase() === (await v.getAddress()).toLowerCase();
        }
        return {
          ...application,
          chainAdmission: {
            minted,
            approvedToVault,
            admitted: await v.admitted(application.stationId),
            released: await v.custodyReleased(application.stationId),
            currentOwner: minted ? await this.station.ownerOf(BigInt(application.stationId)) : null,
            rightIndex: await (async () => { for(let i=0;i<Number(await v.rightCount());i++) if((await v.rights(i)).stationId===application.stationId)return i; return null; })(),
          },
        };
      })
    );
    const explorerApi = process.env.REVENUE_EXPLORER_API_URL?.replace(/\/$/, "");
    const recentHashes = [
      ...new Set(
        s.operations
          .slice(-25)
          .flatMap((operation) => Object.values(operation.steps))
          .map((step) => step.hash)
          .filter(Boolean)
      ),
    ];
    const indexed = new Map<string, boolean>();
    if (explorerApi && recentHashes.length) {
      await Promise.all(
        recentHashes.map(async (transactionHash) => {
          try {
            const response = await fetch(
              `${explorerApi}/api/v2/transactions/${transactionHash}`,
              { signal: AbortSignal.timeout(1500) }
            );
            indexed.set(transactionHash.toLowerCase(), response.ok);
          } catch {
            indexed.set(transactionHash.toLowerCase(), false);
          }
        })
      );
    }
    // Signed transaction payloads remain server-side. Source raw captures never enter client state.
    return {
      ...s,
      applications,
      trades,
      operations: s.operations.map(({ steps, prepared: _prepared, ...o }) => ({
        ...o,
        steps: Object.fromEntries(
          Object.entries(steps).map(([k, { raw, ...step }]) => [
            k,
            {
              ...step,
              indexed: explorerApi
                ? indexed.get(step.hash.toLowerCase()) || false
                : null,
            },
          ])
        ),
      })),
      income: await Promise.all(s.income.map(async r=>{
        if(!r.payment||!this.billing)return r;
        const chain=await this.billing.bills(r.id);
        return {...r,collected:chain.confirmed,payment:{...r.payment,householdPaid:chain.householdPaid,exportPaid:chain.exportPaid,confirmed:chain.confirmed,refunded:chain.refunded}};
      })),
      householdPaymentsEnabled:!!this.billing,
      financialTime,
      valuationChecks,
      chain,
      accounts,
      cases,
    };
  }
}
