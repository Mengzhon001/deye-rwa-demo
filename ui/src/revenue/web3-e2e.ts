import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { HDNodeWallet, JsonRpcProvider, TransactionRequest } from "ethers";

const root = resolve(__dirname, "../../..");
const envFile = resolve(root, process.env.REVENUE_E2E_ENV_FILE || ".env.web3.local");
if (!existsSync(envFile)) throw new Error("Run npm run web3:init first");
process.loadEnvFile(envFile);

const base = process.env.REVENUE_E2E_URL || "http://127.0.0.1:4174";
const origin = new URL(base).origin;
const rpc = process.env.REVENUE_PUBLIC_RPC_URL || "http://127.0.0.1:18545";
const expectedChainId = Number(process.env.REVENUE_CHAIN_ID || 20260922);
const provider = new JsonRpcProvider(rpc, expectedChainId, { staticNetwork: true });
provider.pollingInterval = 100;
const independentWallets = process.env.REVENUE_E2E_WALLETS_FILE
  ? JSON.parse(require("node:fs").readFileSync(process.env.REVENUE_E2E_WALLETS_FILE, "utf8")).wallets
  : null;
const phrase = process.env.REVENUE_SYSTEM_MNEMONIC;
if (!phrase) throw new Error("Local QA mnemonic is missing");

type Role =
  | "admin"
  | "agent"
  | "trustee"
  | "trustee2"
  | "treasury"
  | "owner"
  | "investor"
  | "investor2";

const indexes: Record<Role, number> = {
  admin: 0,
  agent: 1,
  trustee: 2,
  trustee2: 3,
  treasury: 4,
  owner: 5,
  investor: 6,
  investor2: 7,
};

class ApiClient {
  cookie = "";
  readonly wallet: HDNodeWallet;
  constructor(readonly role: Role) {
    this.wallet = HDNodeWallet.fromPhrase(
      independentWallets?.[role]?.phrase || phrase!,
      undefined,
      `m/44'/60'/0'/0/${independentWallets?.[role] ? 0 : indexes[role]}`
    ).connect(provider);
  }
  private async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Origin", origin);
    if (this.cookie) headers.set("Cookie", this.cookie);
    const response = await fetch(`${base}${path}`, { ...init, headers });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";", 1)[0];
    const body = await response.json();
    if (!response.ok || body.error)
      throw new Error(String(body.error || `HTTP ${response.status}`));
    return body;
  }
  get(path: string) {
    return this.request(path);
  }
  post(path: string, body: Record<string, unknown>) {
    return this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  async login() {
    const challenge = await this.post("/api/auth/challenge", {
      address: this.wallet.address,
      requestedRole: this.role.replace(/[2]$/, ""),
    });
    const signature = await this.wallet.signMessage(challenge.message);
    const session = await this.post("/api/auth/verify", {
      nonce: challenge.nonce,
      signature,
    });
    assert.equal(session.address.toLowerCase(), this.wallet.address.toLowerCase());
    return session;
  }
  state() {
    return this.get("/api/state");
  }
}

const clients = Object.fromEntries(
  (["agent", "trustee", "trustee2", "owner", "investor", "investor2"] as Role[])
    .map((role) => [role, new ApiClient(role)])
) as Record<Role, ApiClient>;

let vault = "";
const chainActions = new Set([
 "pay-household-bill", "confirm-receipt", "publish-household-bill",
  "mint-station",
  "custody-consent",
  "admit",
  "prepare-valuation",
  "approve-valuation",
  "eligible",
  "publish",
  "subscribe",
  "review-subscription",
  "refund",
  "settle",
  "accrue-fee",
  "book-revenue",
  "distribute",
  "claim",
  "request-redemption",
  "cancel-redemption",
  "carry-window",
  "process-redemptions",
  "consent-trade",
  "review-trade",
  "settle-trade",
  "open-case",
  "support-case",
  "approve-case",
  "close",
  "release-station",
]);

async function submitRegistration(
  client: ApiClient,
  body: Record<string, unknown>,
  attempts = 12
) {
  let error: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await client.post("/api/wallet/submitted", body);
    } catch (value) {
      error = value;
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  throw error;
}

async function act(
  role: Role,
  action: string,
  payload: Record<string, unknown> = {},
  id = randomUUID()
) {
  const client = clients[role];
  const request = { action, payload, idempotencyKey: id, expectedVault: vault };
  if (!chainActions.has(action)) {
    return (await client.post("/api/actions", request)).result;
  }
  const prepared = await client.post("/api/wallet/prepare", request);
  assert.equal(prepared.account.toLowerCase(), client.wallet.address.toLowerCase());
  assert.equal(prepared.chainId, "0x" + expectedChainId.toString(16));
  try {
    for (const item of prepared.transactions as Array<{
    step: string;
    from: string;
    to: string;
    data: string;
    value: string;
    }>) {
    assert.equal(item.from.toLowerCase(), client.wallet.address.toLowerCase());
    const tx: TransactionRequest = {
      to: item.to,
      data: item.data,
      value: BigInt(item.value),
      nonce: Number(
        BigInt(
          await provider.send("eth_getTransactionCount", [
            client.wallet.address,
            "pending",
          ])
        )
      ),
    };
    const sent = await client.wallet.sendTransaction(tx);
    await submitRegistration(client, {
      operationId: prepared.operationId,
      step: item.step,
      hash: sent.hash,
      expectedVault: vault,
    });
    const receipt = await sent.wait();
    assert.equal(receipt?.status, 1);
    await client.post("/api/wallet/confirm", {
      operationId: prepared.operationId,
      step: item.step,
      hash: sent.hash,
      expectedVault: vault,
    });
    }
  } catch (error) {
    await client.post("/api/wallet/reject", {
      operationId: prepared.operationId,
      reason: error instanceof Error ? error.message.slice(0, 240) : "rejected",
      expectedVault: vault,
    }).catch(() => {});
    throw error;
  }
  return (await client.post("/api/actions", request)).result;
}

async function expectFailure(work: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(work, pattern);
}

async function valuePool() {
  await act("agent", "prepare-valuation");
  await act("trustee", "approve-valuation", { acceptProvisional: true });
}

async function main() {
  const network = await (await fetch(`${base}/api/network`)).json();
  assert.equal(network.chainId, expectedChainId);
  assert.equal(await provider.getNetwork().then((v) => Number(v.chainId)), expectedChainId);

  for (const role of ["agent", "trustee", "trustee2", "owner", "investor", "investor2"] as Role[]) {
    await clients[role].login();
    if (independentWallets) await clients[role].post("/api/faucet", {});
  }

  let state = await clients.agent.state();
  const previousVault = state.manifest.addresses.vault;
  const reset = await clients.agent.post("/api/demo/reset", {
    confirmation: "RESET_DEMO",
    expectedVault: previousVault,
    idempotencyKey: randomUUID(),
  });
  vault = reset.result.vault;
  assert.notEqual(vault, previousVault);
  state = await clients.agent.state();
  assert.equal(state.manifest.addresses.vault, vault);
  assert.equal(state.applications.length, 0);

  await expectFailure(
    () => clients.owner.post("/api/actions", {
      action: "publish",
      payload: {},
      idempotencyKey: randomUUID(),
      expectedVault: vault,
    }),
    /authorized/
  );
  if (process.env.REVENUE_E2E_REAL_REPLAY !== "true") await act("agent", "source", { mode: "synthetic" });
  state = await clients.owner.state();
  const station = state.stations[0];
  assert.equal(station.source, process.env.REVENUE_E2E_REAL_REPLAY === "true" ? "replay" : "synthetic");
  await act("owner", "apply", {
    stationId: station.id,
    notes: "Owner and export-account evidence supplied for the local wallet test",
  });
  state = await clients.agent.state();
  const applicationId = state.applications[0].id;
  await act("agent", "review", {
    applicationId,
    decision: "supplement",
    notes: "Confirm who collects and remits eligible export cash",
  });
  await act("owner", "supplement", {
    applicationId,
    notes: "The household remits the assigned collected export revenue to the pool",
  });
  await act("agent", "review", { applicationId, decision: "approved" });
  state = await clients.agent.state();
  await act("agent", "offer", { applicationId, assumptions: {
    ...state.applications[0].assumptions,
    baselineMethod: "historical",
    baselineReviewNote: "Reviewed the recorded station history and recent export-ratio differences; the seasonal historical baseline is a provisional estimate, not a direct extrapolation of one day's revenue.",
    baselineReviewSourceHash: station.sourceHash,
  } });
  await act("trustee", "approve-offer", {
    applicationId,
    acceptProvisional: true,
  });
  await act("owner", "accept", { applicationId });
  const agreement = await clients.owner.post("/api/wallet/agreement", {
    applicationId,
    expectedVault: vault,
  });
  await act("owner", "sign", {
    applicationId,
    walletSignature: await clients.owner.wallet.signMessage(agreement.message),
  });

  // A prepared operation may be abandoned by the wallet and resumed after a browser refresh.
  const mintId = randomUUID();
  const preparedMint = await clients.agent.post("/api/wallet/prepare", {
    action: "mint-station",
    payload: { applicationId },
    idempotencyKey: mintId,
    expectedVault: vault,
  });
  assert.equal(preparedMint.transactions.length, 1);
  const refreshedAgent = new ApiClient("agent");
  await refreshedAgent.login();
  clients.agent = refreshedAgent;
  await act("agent", "mint-station", { applicationId }, mintId);
  await act("owner", "custody-consent", { applicationId });
  await act("agent", "admit", { applicationId });
  state = await clients.agent.state();
  assert.equal(state.applications[0].status, "pooled");
  assert.equal(state.chain.rightCount, undefined);

  await valuePool();
  for (const investor of ["investor", "investor2"] as Role[]) {
    await act(investor, "apply-eligibility", {
      riskAccepted: true,
      demoAcknowledged: true,
    });
    state = await clients.agent.state();
    const request = state.eligibilityApplications
      .filter((item: any) => item.investor === investor)
      .at(-1);
    await act("agent", "eligible", {
      investor,
      applicationId: request.id,
      eligible: true,
      reviewNote: "Local wallet declarations and demo eligibility reviewed",
    });
    await clients[investor].post("/api/faucet", { expectedVault: vault });
  }
  await act("agent", "publish");
  state = await clients.investor.state();
  const target = BigInt(state.chain.target);
  const first = (target * 6n) / 10n;
  assert.ok(first > 0n && target > first);
  await act("investor", "subscribe", { amountUSDC6: first.toString() });
  await act("investor", "refund");
  await act("investor", "subscribe", { amountUSDC6: first.toString() });
  await act("investor2", "subscribe", {
    amountUSDC6: (target - first).toString(),
  });
  await expectFailure(() => act("agent", "settle"), /unconfirmed order/);
  for (const investor of ["investor", "investor2"] as const) {
    const order = (await clients.agent.state()).accounts[investor].subscription;
    await act("agent", "review-subscription", {investor,amountUSDC6:order.amount,terms:order.terms,orderNonce:order.nonce,approved:true,reviewNote:"Reviewed wallet, escrow and issuance terms"});
  }
  // Ethers briefly caches identical estimateGas requests. Let the cache expire
  // after changing financial time before retrying the exact settlement call.
  await new Promise((done) => setTimeout(done, 500));
  await act("agent", "settle");
  await valuePool();
  state = await clients.investor.state();
  assert.equal(state.chain.phase, "2");
  assert.equal(BigInt(state.chain.totalSupply), target);
  process.stdout.write("PASS issuance: signed admission, qualification, refund and settlement.\n");

  let redemptionRequested = 0n;
  for (let month = 1; month <= 60; month++) {
    await act("agent", "advance", { by: "month" });
    await act("agent", "accrue-fee");
    await act("agent", "book-revenue", {
      applicationId,
      period: month,
      historyMonth: station.history.filter((m: any) => m.complete).at(-1).month,
    });
    state = await clients.agent.state();
    const incomeId=state.income.at(-1).id;
    if(state.householdPaymentsEnabled){await clients.owner.post("/api/faucet",{});await act("owner","pay-household-bill",{incomeId});await act("agent","fund-export",{incomeId});await act("agent","confirm-receipt",{incomeId});}
    else await act("agent","collect-revenue",{incomeId});
    await valuePool();
    if (month % 3 === 0) {
      await act("agent", "distribute");
      await valuePool();
    }
    if (month === 3) {
      state = await clients.investor.state();
      const claim = state.accounts.investor.claims.at(-1);
      assert.ok(BigInt(claim.amountUSDC6) > 0n);
      const claimId = randomUUID();
      await act("investor", "claim", { distributionId: claim.id }, claimId);
      await act("investor", "claim", { distributionId: claim.id }, claimId);
    }
    if (month === 6) {
      await act("investor", "propose-trade", {
        buyer: "investor2",
        sharesUSDC6: "1000000",
        paymentUSDC6: "5000000",
      });
      state = await clients.investor.state();
      const tradeId = state.trades.at(-1).id;
      await act("investor2", "consent-trade", { tradeId });
      await act("agent", "review-trade", { tradeId });
      await act("investor", "settle-trade", { tradeId });
      state = await clients.investor.state();
      redemptionRequested = BigInt(state.accounts.investor.shares) / 2n;
      await act("investor", "request-redemption", {
        sharesUSDC6: redemptionRequested.toString(),
      });
      await act("investor", "cancel-redemption");
      await act("investor", "request-redemption", {
        sharesUSDC6: redemptionRequested.toString(),
      });
      await act("agent", "open-case", {
        applicationId,
        reason: "missing-remittance",
        notes: "Local servicing-case evidence for threshold and trustee testing",
      });
      state = await clients.agent.state();
      const caseId = state.servicing.at(-1).id;
      await act("investor", "support-case", { caseId });
      await act("trustee", "approve-case", { caseId });
      await expectFailure(
        () => act("trustee", "approve-case", { caseId }),
        /distinct trustee/
      );
      await act("trustee2", "approve-case", { caseId });
    }
    if (month === 9) {
      await act("agent", "process-redemptions");
      state = await clients.investor.state();
      const remaining = BigInt(state.accounts.investor.redemption.shares);
      assert.ok(remaining > 0n && remaining < redemptionRequested);
      await act("investor", "cancel-redemption");
    }
    if (month % 10 === 0)
      process.stdout.write(`PASS service month ${month}/60.\n`);
  }

  state = await clients.agent.state();
  assert.equal(state.chain.feeMonths, "60");
  assert.equal(state.chain.distributionMonths, "60");
  assert.equal(state.receipts.length, 60);
  await act("agent", "close");
  state = await clients.investor.state();
  assert.equal(state.chain.phase, "4");
  for (const investor of ["investor", "investor2"] as Role[]) {
    const investorState = await clients[investor].state();
    for (const claim of investorState.accounts[investor].claims)
      if (BigInt(claim.amountUSDC6) > BigInt(claim.paidUSDC6 || "0"))
        await act(investor, "claim", { distributionId: claim.id });
  }
  await act("owner", "release-station", { index: 0 });

  const finalState = await clients.agent.state();
  assert.equal(finalState.chain.phase, "4");
  assert.ok(finalState.operations.length > 250);
  assert.ok(finalState.operations.every((op: any) => op.status === "confirmed" || op.status === "failed"));
  const hashes = finalState.operations.flatMap((op: any) =>
    Object.values(op.steps).map((step: any) => step.hash)
  );
  assert.ok(hashes.length > 200);
  let indexed = false;
  for (let attempt = 0; attempt < 60 && !indexed; attempt++) {
    const response = await fetch(
      `${process.env.REVENUE_E2E_EXPLORER || "http://127.0.0.1:4000"}/api/v2/transactions/${hashes.at(-1)}`
    );
    indexed = response.ok;
    if (!indexed) await new Promise((done) => setTimeout(done, 500));
  }
  assert.equal(indexed, true, "Blockscout did not index the final transaction");
  process.stdout.write(
    `PASS web3 E2E: ${finalState.operations.length} operations, ${hashes.length} confirmed transactions, 60 service months, closed product.\n`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
