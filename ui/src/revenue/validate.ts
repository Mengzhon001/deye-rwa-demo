import assert from "node:assert/strict";
// Preserve this legacy simulated-collection regression. Wallet bill coverage is in revenue-household-payments.test.mjs.
process.env.REVENUE_HOUSEHOLD_PAYMENTS_ENABLED="false";
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import hre from "hardhat";
import { RevenueRuntime } from "./runtime";
import { Actor } from "./store";
import { hash, monthlyRevenue } from "../../../offchain/src/revenue/model";
async function validateExpiredApprovalRecovery(original: RevenueRuntime) {
  const snapshot=await hre.network.provider.send("evm_snapshot");
  const path=mkdtempSync(join(tmpdir(),"deye-expired-approval-"));
  writeFileSync(join(path,"store.json"),JSON.stringify(original.repo.read()));
  try {
    let runtime=new RevenueRuntime(path);await runtime.start();
    await runtime.action("agent","prepare-valuation",{},randomUUID());
    const id=randomUUID(),body={acceptProvisional:true};
    const prepared=await runtime.walletTransactions("trustee","approve-valuation",body,undefined,id);
    const step=prepared.transactions[0];assert(step);
    const proposal=await runtime.vault.proposed();
    await hre.network.provider.send("evm_setNextBlockTimestamp",[Number(proposal.validUntil)+1]);
    await hre.network.provider.send("evm_mine");
    await assert.rejects(()=>runtime.walletTransactions("trustee","approve-valuation",body,undefined,randomUUID()),/valuation expired/i);
    // Reproduce a wallet request that was prepared while valid but signed after the time jump.
    const signer=await hre.ethers.getSigner(step.from);
    let txHash:string;
    try{txHash=(await signer.sendTransaction({to:step.to,data:step.data,gasLimit:2000000})).hash;}
    catch(error){txHash=(error as any).transactionHash;assert(txHash,"Hardhat must retain the reverted transaction hash");}
    await runtime.recordWalletSubmission("trustee",id,step.step,txHash);
    assert.equal((await hre.ethers.provider.getTransactionReceipt(txHash))!.status,0);
    await assert.rejects(()=>runtime.confirmWalletTransaction("trustee",id,step.step,txHash),/reverted/);
    const failed=runtime.repo.read().operations.find(o=>o.id===id)!;assert.equal(failed.steps[step.step].status,"reverted");assert.equal(failed.status,"failed");
    await assert.rejects(()=>runtime.walletTransactions("trustee","approve-valuation",body,undefined,id),/reverted approval/);
    runtime=new RevenueRuntime(path);await runtime.start();
    const state=await runtime.state(),application=state.applications.find(a=>a.status==='pooled')!,station=state.stations.find(s=>s.id===application.stationId)!;
    await runtime.action("agent","book-revenue",{applicationId:application.id,period:1,historyMonth:station.history.filter(h=>h.complete&&h.exportKWh!==null&&h.generationKWh!==null).at(-1)!.month},randomUUID());
    const income=runtime.repo.read().income.at(-1)!;
    if(!income.collected)await runtime.action("agent","collect-revenue",{incomeId:income.id},randomUUID());
    const newId=randomUUID();await runtime.walletTransactions("agent","prepare-valuation",{},undefined,newId);
    await runtime.action("agent","prepare-valuation",{},newId);
    await runtime.action("trustee","approve-valuation",body,randomUUID());
    assert(await runtime.vault.feeBasisReady());assert(await runtime.vault.fresh());
    assert.equal(runtime.repo.read().operations.find(o=>o.id===id)!.steps[step.step].status,"reverted");
    console.log("Expired approval recovery passed: stale preflight blocked, delayed signature reverts, receipt persists across restart, new proposal and independent approval recover without reset.");
  } finally {await hre.network.provider.send("evm_revert",[snapshot]);}
}
async function validateReset(runtime: RevenueRuntime) {
  const original = runtime.repo.read();
  const oldVault = runtime.vault,
    oldSupply = await oldVault.totalSupply();
  const evidenceDir = join(runtime.dataDir, "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, "reset-fixture.json"), "retained evidence");
  const request = {
    confirmation: "RESET_DEMO",
    expectedVault: original.manifest!.addresses.vault,
    idempotencyKey: randomUUID(),
  };
  await assert.rejects(
    () => runtime.resetDemo("owner", request),
    /Only the local intermediary/
  );
  await assert.rejects(() =>
    runtime.resetDemo("agent", { ...request, confirmation: "" })
  );
  assert.deepEqual(runtime.repo.read(), original);
  // Fail after deployment, before the atomic scenario switch. The old product must survive.
  const write = runtime.repo.write.bind(runtime.repo);
  runtime.repo.write = (next) => {
    if (next.lastReset?.id === request.idempotencyKey)
      throw new Error("Injected reset commit outage");
    write(next);
  };
  await assert.rejects(
    () => runtime.resetDemo("agent", request),
    /Injected reset commit outage/
  );
  assert.deepEqual(runtime.repo.read(), original);
  assert.equal(await runtime.vault.getAddress(), request.expectedVault);
  const prepared = JSON.parse(
    readFileSync(
      join(
        runtime.dataDir,
        "reset-backups",
        request.idempotencyKey,
        "replacement.json"
      ),
      "utf8"
    )
  );
  runtime = new RevenueRuntime(runtime.dataDir);
  await runtime.start();
  const block = await hre.ethers.provider.getBlockNumber();
  const reset = runtime.resetDemo("agent", request);
  const stale = runtime.action(
    "owner",
    "apply",
    { stationId: original.stations[0].id },
    randomUUID(),
    request.expectedVault
  );
  const outcomes = await Promise.allSettled([reset, stale]);
  assert.equal(outcomes[0].status, "fulfilled");
  assert.equal(outcomes[1].status, "rejected");
  const result = await runtime.resetDemo("agent", request);
  assert.equal(result.vault, prepared.addresses.vault);
  assert.equal(
    await hre.ethers.provider.getBlockNumber(),
    block,
    "Retry must reuse the confirmed replacement deployment"
  );
  await assert.rejects(
    () =>
      runtime.resetDemo("agent", { ...request, idempotencyKey: randomUUID() }),
    /Demo has been reset/
  );
  await assert.rejects(
    () =>
      runtime.walletTransactions(
        "investor",
        "subscribe",
        { amountUSDC6: "1000000" },
        request.expectedVault
      ),
    /Demo has been reset/
  );
  const next = await runtime.state();
  for (const key of [
    "applications",
    "eligibilityApplications",
    "valuations",
    "approvedReports",
    "operations",
    "income",
    "receipts",
    "trades",
    "servicing",
  ] as const)
    assert.equal(next[key]?.length, 0, key);
  assert.deepEqual(next.activeReports, {});
  assert.deepEqual(next.stations, original.stations);
  assert.deepEqual(next.liveAcceptance, original.liveAcceptance);
  assert.equal(next.mode, original.mode);
  assert.equal(next.chain.phase, "0");
  assert.equal(await runtime.vault.totalSupply(), 0n);
  assert.equal(await runtime.vault.rightCount(), 0n);
  assert.equal(await runtime.usdc.balanceOf(runtime.address("investor")), 0n);
  assert.equal(
    await oldVault.totalSupply(),
    oldSupply,
    "Old contracts and other scenarios must remain intact"
  );
  assert.deepEqual(
    JSON.parse(
      readFileSync(join(runtime.dataDir, result.backup, "store.json"), "utf8")
    ),
    original
  );
  assert.equal(
    readFileSync(join(evidenceDir, "reset-fixture.json"), "utf8"),
    "retained evidence"
  );
  runtime = new RevenueRuntime(runtime.dataDir);
  await runtime.start();
  assert.deepEqual(await runtime.resetDemo("agent", request), result);
  await runtime.action(
    "owner",
    "apply",
    { stationId: original.stations[0].id },
    randomUUID(),
    result.vault
  );
  assert.equal(
    runtime.repo.read().applications.length,
    1,
    "Fresh applications must work after reset and restart"
  );
  const applicationId = runtime.repo.read().applications[0].id;
  const now = await runtime.now();
  runtime.repo.update((s) => {
    const st = s.stations[0];
    st.timezone = "UTC";
    st.observedAt = now;
    st.history = st.history.map((h) => ({
      ...h,
      generationKWh: 6000,
      exportKWh: 120,
    }));
    st.telemetry = {
      days: Array.from({ length: 16 }, (_, i) => ({
        date: new Date((now - (i + 1) * 86400) * 1000)
          .toISOString()
          .slice(0, 10),
        generationKWh: 200,
        exportKWh: 200,
      })),
    };
    st.sourceHash = hash({ history: st.history, telemetry: st.telemetry });
  });
  await runtime.action(
    "agent",
    "review",
    { applicationId, decision: "approved" },
    randomUUID()
  );
  const initial = await runtime.state();
  assert.equal(
    initial.valuationChecks[applicationId].audit.materialChange,
    true
  );
  assert.equal(initial.valuationChecks[applicationId].reviewRequired, true);
  assert.equal(
    initial.valuationChecks[applicationId].blocked,
    false,
    "First valuation is not a stale existing quote"
  );
  assert.equal(initial.valuationChecks[applicationId].reason, null);
  const assumptions = {
    ...initial.applications[0].assumptions,
    baselineMethod: "recent-export-ratio",
  };
  assert.ok(
    BigInt(
      (await runtime.previewOffer("agent", applicationId, assumptions))
        .rightsValueUSDC6
    ) > 0n
  );
  const before = runtime.repo.read().applications[0];
  await assert.rejects(
    () =>
      runtime.action(
        "agent",
        "offer",
        { applicationId, assumptions },
        randomUUID()
      ),
    /baseline/
  );
  assert.deepEqual(runtime.repo.read().applications[0], before);
  const reviewNote =
    "Reviewed source scope and seasonal comparison; recent ratio is a provisional scenario.";
  for (const incomplete of [
    {
      ...assumptions,
      baselineReviewSourceHash: initial.stations[0].sourceHash,
      baselineReviewNote: "short",
    },
    {
      ...assumptions,
      baselineReviewSourceHash: "old-source",
      baselineReviewNote: reviewNote,
    },
    {
      ...assumptions,
      baselineMethod: "historical",
      baselineReviewSourceHash: initial.stations[0].sourceHash,
      baselineReviewNote: "",
    },
  ]) {
    await assert.rejects(
      () =>
        runtime.action(
          "agent",
          "offer",
          { applicationId, assumptions: incomplete },
          randomUUID()
        ),
      /baseline/
    );
    assert.deepEqual(
      runtime.repo.read().applications[0],
      before,
      "Rejected submissions must preserve the application"
    );
  }
  // Simulate a persisted offer accepted by the previous submission endpoint.
  const invalidOffer = await runtime.previewOffer(
    "agent",
    applicationId,
    assumptions
  );
  runtime.repo.update((s) => {
    Object.assign(s.applications[0], {
      status: "offered",
      assumptions,
      offer: invalidOffer,
      priceUSDC6: invalidOffer.rightsValueUSDC6,
    });
  });
  assert.equal(
    (await runtime.state()).valuationChecks[applicationId].blocked,
    true
  );
  await assert.rejects(
    () =>
      runtime.action(
        "trustee",
        "approve-offer",
        { applicationId, acceptProvisional: true },
        randomUUID()
      ),
    /baseline/
  );
  await runtime.action(
    "agent",
    "offer",
    {
      applicationId,
      assumptions: {
        ...assumptions,
        baselineReviewNote: reviewNote,
        baselineReviewSourceHash: initial.stations[0].sourceHash,
      },
    },
    randomUUID()
  );
  await runtime.action(
    "trustee",
    "approve-offer",
    { applicationId, acceptProvisional: true },
    randomUUID()
  );
  assert.equal(
    (await runtime.state()).valuationChecks[applicationId].blocked,
    false
  );
  const approved = runtime.repo.read().applications[0];
  await assert.rejects(
    () =>
      runtime.action(
        "agent",
        "offer",
        { applicationId, assumptions },
        randomUUID()
      ),
    /baseline/
  );
  assert.deepEqual(runtime.repo.read().applications[0], approved);
  assert.ok(
    runtime.repo.read().approvedReports.includes(approved.offer!.reportHash)
  );
  await runtime.action("owner", "accept", { applicationId }, randomUUID());
  assert.equal(
    runtime.repo.read().applications[0].status,
    "accepted",
    "Correcting a previously blocked quote must allow trustee approval and owner acceptance"
  );
  console.log(
    "Demo reset passed: archive, fresh contracts and balances, preserved telemetry, authorization, duplicate retry, stale request rejection, restart and commit-outage recovery."
  );
}
async function validateReassessment() {
  const runtime = new RevenueRuntime(
    mkdtempSync(join(tmpdir(), "deye-reassessment-test-"))
  );
  await runtime.start();
  const run = (
    actor: Actor,
    action: string,
    payload: Record<string, unknown> = {}
  ) => runtime.action(actor, action, payload, randomUUID());
  await run("agent", "source", { mode: "synthetic" });
  const station = runtime.repo.read().stations[0];
  await run("owner", "apply", { stationId: station.id });
  const applicationId = runtime.repo.read().applications[0].id;
  await run("agent", "review", { applicationId, decision: "approved" });
  await run("agent", "offer", { applicationId });
  await run("trustee", "approve-offer", { applicationId, acceptProvisional: true });
  await run("owner", "accept", { applicationId });
  await run("owner", "sign", { applicationId });
  await run("agent", "admit", { applicationId });
  await run("agent", "prepare-valuation");
  const signed = JSON.parse(
    JSON.stringify(runtime.repo.read().applications[0])
  );
  const now = await runtime.now();
  runtime.repo.update((s) => {
    const st = s.stations[0];
    st.timezone = "UTC";
    st.observedAt = now;
    st.history = st.history.map((h) => ({
      ...h,
      generationKWh: 6000,
      exportKWh: 120,
    }));
    st.telemetry = {
      days: Array.from({ length: 16 }, (_, i) => ({
        date: new Date((now - (i + 1) * 86400) * 1000)
          .toISOString()
          .slice(0, 10),
        generationKWh: 200,
        exportKWh: 200,
      })),
    };
    st.sourceHash = hash({ history: st.history, telemetry: st.telemetry });
  });
  assert.equal(
    (await runtime.state()).valuationChecks[applicationId].blocked,
    true
  );
  for (const [actor, action] of [
    ["agent", "prepare-valuation"],
    ["trustee", "approve-valuation"],
    ["agent", "publish"],
    ["investor", "subscribe"],
  ] as const) {
    await assert.rejects(
      () =>
        run(actor, action, { amountUSDC6: "1000000", acceptProvisional: true }),
      /基线|baseline/
    );
  }
  const failedPreparationId = randomUUID();
  await assert.rejects(
    () =>
      runtime.walletTransactions("investor", "subscribe", {
        amountUSDC6: "1000000",
      }, undefined, failedPreparationId),
    /基线|baseline/
  );
  const failedPreparation = runtime.repo.read().operations.find(op => op.id === failedPreparationId)!;
  assert.equal(failedPreparation.status, "failed", "A rejected preflight is not a submitted wallet payment");
  assert.equal(Object.keys(failedPreparation.steps).length, 0);
  assert.equal(failedPreparation.prepared, undefined);
  const assumptions = {
    ...signed.assumptions,
    tariffLocal: 99, // A reassessment must never modify signed financial terms.
    baselineMethod: "recent-export-ratio",
    baselineReviewSourceHash: runtime.repo.read().stations[0].sourceHash,
    baselineReviewNote:
      "Reviewed changed export operation and meter evidence; recent ratio is a provisional scenario.",
  };
  await run("agent", "prepare-reassessment", { applicationId, assumptions });
  let a = runtime.repo.read().applications[0];
  assert.equal(
    a.reassessment!.report.assumptions.tariffLocal,
    signed.assumptions.tariffLocal
  );
  assert.equal(a.priceUSDC6, signed.priceUSDC6);
  assert.equal(a.agreementHash, signed.agreementHash);
  assert.deepEqual(a.assumptions, signed.assumptions);
  await assert.rejects(
    () =>
      run("agent", "approve-reassessment", {
        applicationId,
        acceptProvisional: true,
      }),
    /not authorized/
  );
  await assert.rejects(
    () => run("owner", "accept-reassessment", { applicationId }),
    /acknowledgment/
  );
  await run("trustee", "approve-reassessment", {
    applicationId,
    acceptProvisional: true,
  });
  await assert.rejects(
    () => run("agent", "prepare-valuation"),
    /基线|baseline/
  );
  await run("owner", "accept-reassessment", {
    applicationId,
    acceptProvisional: true,
  });
  assert.equal(
    (await runtime.state()).valuationChecks[applicationId].blocked,
    false
  );
  // The old proposed NAV must remain unusable even after the reassessment is accepted.
  await assert.rejects(
    () => run("trustee", "approve-valuation", { acceptProvisional: true }),
    /基线|baseline/
  );
  await assert.rejects(() => run("agent", "publish"), /fresh pool valuation/);
  await run("agent", "prepare-valuation");
  await run("trustee", "approve-valuation", { acceptProvisional: true });
  const state = runtime.repo.read();
  const report = state.valuations.find(
    (v) => v.reportHash === state.activeReports[station.id]
  )!;
  assert.equal(report.assumptions.baselineMethod, "recent-export-ratio");
  assert.equal(
    await runtime.vault.acquisitionTotal(),
    BigInt(signed.priceUSDC6)
  );
  await run("agent", "prepare-reassessment", { applicationId, assumptions });
  a = runtime.repo.read().applications[0];
  assert.equal(a.reassessment!.ownerAccepted, false);
  assert.equal(a.reassessment!.trusteeApproved, false);
  runtime.repo.update((s) => {
    s.stations[0].sourceHash = hash({ changed: true });
  });
  await assert.rejects(
    () =>
      run("trustee", "approve-reassessment", {
        applicationId,
        acceptProvisional: true,
      }),
    /基线|baseline/
  );
  console.log(
    "Reassessment passed: evidence-bound review, separate owner/trustee consent, stale NAV and subscription blocking, immutable signed terms, approval invalidation."
  );
}
async function main() {
  const path = mkdtempSync(join(tmpdir(), "deye-revenue-test-"));
  let r = new RevenueRuntime(path);
  await r.start();
  const run = (
    actor: Actor,
    action: string,
    payload: Record<string, unknown> = {},
    key = randomUUID()
  ) => r.action(actor, action, payload, key);
  await assert.rejects(() => run("owner", "publish"), /not authorized/);
  await run("agent", "source", { mode: "synthetic" });
  let s = await r.state();
  assert.equal(s.chain.monthlyMandatoryCost, "1000000");
  assert.equal(s.chain.feeBasisReady, false);
  assert.equal(s.chain.vaultCash, "0");
  assert.equal(s.chain.nextDistributionAt, "0");
  assert.equal(typeof s.chain.valuationReport, "string");
  const station = s.stations[0];
  await run("owner", "apply", {
    stationId: station.id,
    notes: "Household export account and ownership evidence",
  });
  s = await r.state();
  const applicationId = s.applications[0].id;
  await run("agent", "review", {
    applicationId,
    decision: "supplement",
    notes: "Provide remittance responsibility",
  });
  await run("owner", "supplement", {
    applicationId,
    notes: "Household collects eligible export cash and remits assigned share",
  });
  await run("agent", "review", { applicationId, decision: "approved" });
  const beforePreview = JSON.stringify(r.repo.read());
  const preview = await r.previewOffer(
    "agent",
    applicationId,
    s.applications[0].assumptions
  );
  assert.ok(BigInt(preview.rightsValueUSDC6) > 0n);
  assert.equal(
    JSON.stringify(r.repo.read()),
    beforePreview,
    "Preview must not persist an offer or transaction"
  );
  await assert.rejects(
    () => r.previewOffer("owner", applicationId, {}),
    /not authorized/
  );
  await assert.rejects(
    () =>
      r.previewOffer("agent", applicationId, {
        ...s.applications[0].assumptions,
        termMonths: 12,
      }),
    /five-year/
  );
  await run("agent", "offer", { applicationId });
  assert.equal(
    (await r.state()).applications[0].offer!.reportHash,
    preview.reportHash
  );
  await assert.rejects(
    () => run("owner", "accept", { applicationId }),
    /approved current offer/
  );
  await run("trustee", "approve-offer", { applicationId, acceptProvisional: true });
  await run("agent", "offer", {
    applicationId,
    priceUSDC6: (BigInt(preview.rightsValueUSDC6) + 1n).toString(),
  });
  await assert.rejects(
    () => run("owner", "accept", { applicationId }),
    /approved current offer/
  );
  await run("trustee", "approve-offer", { applicationId, acceptProvisional: true });
  await run("owner", "accept", { applicationId });
  await run("owner", "sign", { applicationId });
  // Simulate a transport failure AFTER durable signing but BEFORE the first broadcast.
  const provider = hre.ethers.provider,
    original = provider.broadcastTransaction.bind(provider);
  let broadcasts = 0;
  provider.broadcastTransaction = async (raw: string) => {
    if (++broadcasts === 2) {
      throw new Error("Injected transport outage");
    }
    return original(raw);
  };
  const admissionKey = randomUUID();
  await assert.rejects(
    () => run("agent", "admit", { applicationId }, admissionKey),
    /Injected/
  );
  provider.broadcastTransaction = original;
  r = new RevenueRuntime(path);
  await r.start();
  await run("agent", "admit", { applicationId }, admissionKey);
  assert.equal(String(await r.vault.totalSupply()), "0");
  assert.equal(String(await r.vault.rightCount()), "1");
  await run("agent", "admit", { applicationId }, admissionKey);
  assert.equal(String(await r.vault.rightCount()), "1");
  await assert.rejects(
    () => run("agent", "admit", { applicationId: "changed" }, admissionKey),
    /different request/
  );
  const serviceStates: Record<string, unknown>={};
  const captureService=async(name:string)=>{if(process.env.REVENUE_SERVICING_STATES){serviceStates[name]=await r.state();writeFileSync(process.env.REVENUE_SERVICING_STATES,JSON.stringify(serviceStates),{mode:0o600});}};
  const value = async () => {
    await run("agent", "prepare-valuation");
    await run("trustee", "approve-valuation", { acceptProvisional: true });
  };
  await value();
  await assert.rejects(
    () => run("investor", "eligible", { investor: "investor", eligible: true }),
    /not authorized/
  );
  await assert.rejects(
    () => run("investor", "apply-eligibility", {}),
    /declarations/
  );
  for (const investor of ["investor", "investor2"] as const) {
    await run(investor, "apply-eligibility", {
      riskAccepted: true,
      demoAcknowledged: true,
    });
    await assert.rejects(
      () =>
        run(investor, "apply-eligibility", {
          riskAccepted: true,
          demoAcknowledged: true,
        }),
      /already pending/
    );
    let request = r.repo
      .read()
      .eligibilityApplications!.filter((a) => a.investor === investor)
      .at(-1)!;
    if (investor === "investor") {
      await run("agent", "eligible", {
        investor,
        applicationId: request.id,
        eligible: false,
        reviewNote: "Please review the local wallet declaration",
      });
      await run(investor, "apply-eligibility", {
        riskAccepted: true,
        demoAcknowledged: true,
      });
      await assert.rejects(
        () =>
          run("agent", "eligible", {
            investor,
            applicationId: request.id,
            eligible: true,
            reviewNote: "Outdated application",
          }),
        /latest/
      );
      request = r.repo
        .read()
        .eligibilityApplications!.filter((a) => a.investor === investor)
        .at(-1)!;
    }
    await run("agent", "eligible", {
      investor,
      applicationId: request.id,
      eligible: true,
      reviewNote: "Reviewed both local demonstration declarations",
    });
    assert.equal(await r.vault.eligible(r.address(investor)), true);
  }
  await run("agent", "publish");
  s = await r.state();
  const target = BigInt(s.chain.target as string),
    first = (target * 6n) / 10n;
  const installment=first/3n;
  await run("investor", "subscribe", { amountUSDC6: installment.toString() });
  let partial=((await r.state()).accounts as any).investor.subscription;
  await run("agent", "review-subscription", {investor:"investor",amountUSDC6:partial.amount,terms:partial.terms,orderNonce:partial.nonce,approved:true,reviewNote:"Reviewed initial installment"});
  await run("investor", "subscribe", { amountUSDC6: installment.toString() });
  await run("investor", "subscribe", { amountUSDC6: (first-2n*installment).toString() });
  let accumulated=((await r.state()).accounts as any).investor.subscription;
  assert.equal(accumulated.amount,first.toString());assert.equal(accumulated.approved,false);assert.equal(accumulated.history.filter((entry:any)=>entry.kind==="subscription").length,3);
  await assert.rejects(()=>run("agent", "review-subscription", {investor:"investor",amountUSDC6:partial.amount,terms:partial.terms,orderNonce:partial.nonce,approved:true,reviewNote:"Stale initial approval must fail"}),/InvalidSubscriptionReview/);
  await run("investor2", "subscribe", {
    amountUSDC6: (target - first).toString(),
  });
  await assert.rejects(() => run("agent", "settle"), /unconfirmed order/);
  for (const investor of ["investor", "investor2"] as const) {
    const order = ((await r.state()).accounts as any)[investor].subscription;
    await run("agent", "review-subscription", {investor,amountUSDC6:order.amount,terms:order.terms,orderNonce:order.nonce,approved:true,reviewNote:"Reviewed wallet, escrow and issuance terms"});
  }
  await run("agent", "settle");
  await validateExpiredApprovalRecovery(r);
  await value();
  await captureService("settled");
  assert.equal(String(await r.vault.totalSupply()), target.toString());
  const observedAt = station.observedAt;
  const beforeClock=await r.now(),firstCutoff=Number(await r.vault.nextFeeAt());
  await assert.rejects(()=>run("agent","advance",{by:"month",expectedCutoff:firstCutoff-1}),/Monthly cutoff changed/);
  assert.equal(await r.now(),beforeClock);
  await assert.rejects(()=>run("investor","advance",{by:"month",expectedCutoff:firstCutoff}),/not authorized/);
  assert.equal(await r.now(),beforeClock);
  for (let i = 1; i <= 3; i++) {
    const cutoff=Number(await r.vault.nextFeeAt()),advanceKey=randomUUID();
    await run("agent", "advance", { by: "month",expectedCutoff:cutoff },advanceKey);
    assert.equal(await r.now(),cutoff);
    await run("agent", "advance", { by: "month",expectedCutoff:cutoff },advanceKey);
    assert.equal(await r.now(),cutoff);
    await assert.rejects(()=>run("agent","advance",{by:"month",expectedCutoff:cutoff}),/Accrue the due fee/);
    assert.equal((await r.state()).stations[0].observedAt,observedAt);
    await run("agent", "accrue-fee");
    await run("agent", "book-revenue", {
      applicationId,
      period: i,
      historyMonth: station.history.at(-1)!.month,
    });
    s = await r.state();
    const incomeId = s.income.at(-1)!.id;
    const observedMonth = station.history.at(-1)!;
    const calculated = monthlyRevenue(s.applications[0].assumptions, { generationKWh: observedMonth.generationKWh!, exportKWh: observedMonth.exportKWh!, importKWh: observedMonth.importKWh }, i);
    assert.deepEqual(s.income.at(-1)!.billing, calculated);
    assert.equal(s.income.at(-1)!.amountUSDC6, calculated.assignedUSDC6);
    await value();
    const before = await r.vault.nav();
    if(i===1)await run("agent","prepare-valuation");
    await run("agent", "collect-revenue", { incomeId });
    if(i===1){
      assert.equal((await r.state()).chain.proposedValuationOutdated,true);
      await assert.rejects(()=>run("trustee","approve-valuation",{acceptProvisional:true}),/Financial inputs changed/);
      await captureService("month1-unreconciled");
    }
    await value();
    await captureService(`month${i}-approved`);
    if(i<3&&Number(s.chain.distributionIntervalMonths)===1){
      await run("agent","distribute");await captureService(`month${i}-declared`);
      const distributionId=Number(await r.vault.distributionCount());
      assert(BigInt(((await r.state()).accounts.investor as any).claims.find((claim:any)=>claim.id===distributionId)!.amountUSDC6)>0n);
      await run("investor","claim",{distributionId});await value();
    }
    const after = await r.vault.nav();
    if(Number(s.chain.distributionIntervalMonths)!==1)assert.ok(
      after > before - 100000n && after < before + 100000n,
      "collection must not double count cash and receivables"
    );
  }
  await captureService("quarter-ready");
  await run("agent", "distribute");
  await captureService("quarter-declared");
  assert.equal(
    ((await r.state()).accounts.investor as any).performance.projectedNetIRRPct,
    null,
    "Distributions must invalidate the previous projected return until valuation reconciliation"
  );
  await value();
  s = await r.state();
  assert.equal(s.stations[0].observedAt, observedAt);
  const claims = (s.accounts.investor as any).claims;
  assert.ok(claims.some((claim:any)=>BigInt(claim.amountUSDC6)>0n));
  assert.ok(
    Number.isFinite((s.accounts.investor as any).performance.projectedNetIRRPct)
  );
  const claimKey = randomUUID(),latestDistributionId=Number(await r.vault.distributionCount());
  const latestClaim=claims.find((c:any)=>c.id===latestDistributionId)!;
  await run("investor", "claim", { distributionId: latestDistributionId }, claimKey);
  const nav = await r.vault.nav();
  await run("investor", "claim", { distributionId: latestDistributionId }, claimKey);
  assert.equal(await r.vault.nav(), nav);
  assert.equal(
    ((await r.state()).accounts.investor as any).claims.find((c:any)=>c.id===latestDistributionId).paidUSDC6,
    latestClaim.amountUSDC6
  );
  await captureService("investor-paid");
  if(process.env.REVENUE_SERVICING_STATES)writeFileSync(process.env.REVENUE_SERVICING_STATES,JSON.stringify(serviceStates),{mode:0o600});
  let queued = 0n;
  for (let month = 4; month <= 9; month++) {
    await run("agent", "advance", { by: "month" });
    await run("agent", "accrue-fee");
    await run("agent", "book-revenue", {
      applicationId,
      period: month,
      historyMonth: station.history.at(-1)!.month,
    });
    await run("agent", "collect-revenue", {
      incomeId: r.repo.read().income.at(-1)!.id,
    });
    await value();
    if (month % 3 === 0 || Number((await r.state()).chain.distributionIntervalMonths)===1) {
      await run("agent", "distribute");
      await value();
    }
    if (month === 6) {
      await run("investor", "propose-trade", {
        buyer: "investor2",
        sharesUSDC6: "1000000",
        paymentUSDC6: "5000000",
      });
      const tradeId = r.repo.read().trades.at(-1)!.id;
      await run("investor2", "consent-trade", { tradeId });
      await assert.rejects(
        () => run("investor2", "consent-trade", { tradeId }),
        /already consented/
      );
      await run("agent", "review-trade", { tradeId });
      await run("investor", "settle-trade", { tradeId });
      assert.equal((await r.state()).trades.at(-1)!.settled, true);
      await assert.rejects(
        () => run("investor", "settle-trade", { tradeId }),
        /already settled/
      );
      queued = (await r.vault.balanceOf(r.address("investor"))) / 2n;
      await run("investor", "request-redemption", {
        sharesUSDC6: queued.toString(),
      });
      await run("investor", "cancel-redemption");
      await run("investor", "request-redemption", {
        sharesUSDC6: queued.toString(),
      });
      await run("agent", "open-case", {
        applicationId,
        reason: "missing-remittance",
        notes: "Independent local servicing test evidence",
      });
      const caseId = r.repo.read().servicing.at(-1)!.id;
      await run("investor", "support-case", { caseId });
      await run("trustee", "approve-case", { caseId });
      await assert.rejects(
        () => run("trustee", "approve-case", { caseId }),
        /distinct trustee/
      );
      await run("trustee2", "approve-case", { caseId });
      assert.equal((await r.state()).cases.at(-1)!.executed, true);
    }
  }
  await run("agent", "process-redemptions");
  const remainingRequest = (await r.vault.redemptions(r.address("investor")))
    .shares;
  assert.ok(
    remainingRequest > 0n && remainingRequest < queued,
    "Partial fills must retain the unfilled request"
  );
  r = new RevenueRuntime(path);
  await r.start();
  s = await r.state();
  assert.equal(s.applications[0].status, "pooled");
  assert.equal(s.receipts.length, 9);
  assert.equal(
    s.eligibilityApplications!.filter((a) => a.status === "approved").length,
    2
  );
  const clientState = JSON.stringify(s);
  assert.ok(!clientState.includes('"raw":'));
  assert.ok(!clientState.includes("test test test"));
  const actualStore = JSON.parse(
    readFileSync(join(path, "store.json"), "utf8")
  );
  assert.ok(
    actualStore.operations.some((o: any) =>
      Object.values(o.steps).some((step: any) => step.raw)
    )
  );
  console.log(
    "Revenue walkthrough passed: four roles, eligibility applications/rejection, custody, recovery, settlement, nine monthly periods, distributions/claims, atomic peer trade, partial redemption, distinct trustees and restart."
  );
  await validateReassessment();
  await validateReset(r);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
