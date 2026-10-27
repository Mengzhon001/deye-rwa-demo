const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
function fixture() {
  const start = Date.UTC(2026, 0, 1) / 1000;
  const c = vm.createContext({
    state: {
      financialTime: start,
      applications: [{ id: "A", status: "pooled" }],
      valuationChecks: {},
      activeReports: { S: "report", aggregate: "aggregate" },
      approvedReports: ["aggregate"],
      valuations: [
        {
          reportHash: "report",
          startAt: start,
          validUntil: start + 31 * 86400,
        },
      ],
      accounts: {
        investor: {
          eligible: true,
          subscription: { amount: "0", coolingEnd: 0 },
          redemption: { shares: "0", requestedAt: 0 },
        },
      },
      chain: {
        phase: "0",
        fresh: true,
        valuationReport: "aggregate",
        acquisitionTotal: "900000000",
        target: "0",
        totalSubscriptions: "0",
        monthlyMandatoryCost: "1000000",
        feeLiability: "0",
        expenseLiability: "0",
        vaultCash: "0",
        unpaidDistributions: "0",
        feeMonths: "0",
        distributionMonths: "0",
        price: "1000000",
        nextFeeAt: 0,
      },
      poolProjection: {
        sourceReports: ["report"],
        asOf: start,
        initialInvestmentUSDC6: "1000000000",
        futureExpensesUSDC6: "50000000",
        projectedNetIRRPct: 3.444698984095529,
        cashflows: [
          { at: start, valueUSDC6: "-1000000000" },
          { at: start + 90 * 86400, valueUSDC6: "100000000" },
          { at: start + 400 * 86400, valueUSDC6: "200000000" },
          { at: start + 5 * 366 * 86400, valueUSDC6: "900000000" },
        ],
      },
    },
    t: (en, zh) => en,
    esc: (s) => String(s ?? ""),
    money: (v) => (Number(v || 0) / 1e6).toFixed(2),
    date: (v) => new Date(Number(v) * 1000).toISOString(),
    table: (headers, rows) => JSON.stringify({ headers, rows }),
    wfPoolGuide: (action) => action || "",
    role: "agent",
    page: "agent_product",
    phaseNames: [
      ["Draft", "待发行"],
      ["Fundraising", "募集中"],
      ["Active", "存续中"],
      ["Failed", "已终止"],
      ["Closed", "已结束"],
    ],
    investorLabel: k => k,
    input: () => "",
    tag: v => v,
    form: () => "",
    select: () => "",
  });
  c.document ||= { addEventListener() {} };
  vm.runInContext(readFileSync(resolve(__dirname, "../../public/revenue/period-timeline.js"), "utf8"), c);
  vm.runInContext(readFileSync(resolve(__dirname, "../../public/revenue/cashflow.js"), "utf8"), c);
  vm.runInContext(
    readFileSync(resolve(__dirname, "../../public/revenue/product.js"), "utf8"),
    c
  );
  return (code) => vm.runInContext(code, c);
}
test("completed service-month billing is due independently of fee accrual and blocks missing-evidence valuation",()=>{
 const r=fixture();r("state.chain.phase='2';state.chain.settledAt=state.financialTime;state.financialTime=productAddMonths(state.chain.settledAt,1);state.chain.feeMonths='0';state.applications[0].stationId='S';state.income=[]");assert.equal(r("productModel().completedServiceMonths"),1);assert.equal(r("productModel().unbookedPeriods[0].period"),1);assert.equal(r("productModel().can('valuation')"),false);r("state.income=[{stationId:'S',period:1,amountUSDC6:'0',collected:true}]");assert.equal(r("productModel().unbookedPeriods.length"),0);assert.equal(r("productModel().can('valuation')"),true);
});
test("pending pool valuation expires at its on-chain boundary and cannot be approved again",()=>{
 const r=fixture();r("state.chain.proposedValuationReport='aggregate';state.chain.proposedValuationValidUntil=state.financialTime;state.approvedReports=[]");assert.equal(r("productModel().proposalExpired"),true);assert.equal(r("productModel().proposalCanApprove"),false);r("state.chain.proposedValuationValidUntil=state.financialTime+100");assert.equal(r("productModel().proposalCanApprove"),true);r("state.approvedReports=['aggregate'];state.chain.fresh=false");assert.equal(r("productModel().proposalCanApprove"),false);
});
test("settlement shortfall is exact to USDC precision and retention needs no separate operation", () => {
  const r=fixture();r("state.chain.phase='1';state.chain.target='14769725817';state.chain.acquisitionTotal='13292753235';state.chain.totalSubscriptions='14760730000';state.chain.deadline=state.financialTime+86400;state.chain.subscriptionReviewRequired=true;state.accounts.investor.subscription={amount:'14760730000',approved:true}");
  assert.equal(r("productModel().funding.shortfall.toString()"),'8995817');
  assert.equal(r("productExactUSDC6(productModel().funding.shortfall)"),'8.995817');
  assert.equal(r("productModel().can('settle')"),false);
  assert.match(r("productSettlementHelp(productModel())"),/8\.995817 USDC/);
  assert.match(r("productSettlementHelp(productModel())"),/no separate retention payment or button/);
  assert.match(r("productSettlementHelp(productModel())"),/data-wf-handoff="investor"/);
  assert.match(r("productSettlementHelp(productModel(),{investor:true,canSubscribe:true})"),/data-investor-funding-fill/);
  r("state.chain.totalSubscriptions=state.chain.target;state.accounts.investor.subscription.amount=state.chain.target");
  assert.equal(r("productModel().can('settle')"),true);
  assert.equal(r("productModel().funding.shortfall"),0n);
  assert(!r("productSettlementHelp(productModel(),{investor:true,canSubscribe:true})").includes('data-investor-funding-fill'));
  r("state.chain.acquisitionTotal='900000000';state.chain.target='2000000000';state.chain.totalSubscriptions='1000000000'");
  assert.equal(r("productModel().funding.shortfall.toString()"),'400000000');
  assert.equal(r("productModel().checks.settle[3][0]"),true);
  assert.equal(r("productModel().checks.settle[2][0]"),false);
});
test("net IRR and cash schedule use pool projection, exclude initial outflow and count liquidation once", () => {
  const r = fixture();
  assert.equal(r("productProjectionData().total.toString()"), "1200000000");
  assert.equal(
    r("productProjectionData().annual[0].amount.toString()"),
    "100000000"
  );
  assert.equal(
    r("productProjectionData().annual[1].amount.toString()"),
    "200000000"
  );
  assert.equal(
    r("productProjectionData().annual.reduce((s,r)=>s+r.amount,0n).toString()"),
    "300000000"
  );
  assert.match(r("productReturnPanel()"), /3.44%/);
  assert.match(r("productReturnPanel()"), /1.20×/);
  assert.match(r("productReturnPanel()"), /20.00%/);
  assert.match(
    r("productReturnPanel()"),
    /Discount rate is not investor yield/
  );
  r("state.poolProjection.projectedNetIRRPct=-2.5");
  assert.match(r("productReturnPanel()"), /-2.50%/);
  r("state.poolProjection.projectedNetIRRPct=null");
  assert.ok(!r("productReturnPanel()").includes("null%"));
});
test("missing, mismatched, stale and closed projections cannot advertise a current rate", () => {
  const r = fixture();
  r("state.chain.phase='1';state.chain.fresh=false");
  assert.ok(!r("productReturnPanel()").includes("3.44%"));
  assert.match(r("productReturnPanel()"), /Valuation update required/);
  r("state.poolProjection.sourceReports=['other']");
  assert.equal(r("productProjectionData()"), null);
  r("state.chain.phase='3'");
  assert.match(r("productReturnPanel()"), /claim their escrow refunds/);
  r("state.chain.phase='4'");
  assert.match(r("productReturnPanel()"), /Product closed/);
});
test("publication and settlement distinguish 70 percent from purchase funding and cooling", () => {
  const r = fixture();
  assert.equal(r("productModel().can('publish')"), true);
  assert.equal(r("productModel().target.toString()"), "1000000000");
  r(
    "state.chain.phase='1';state.chain.target='1000000000';state.chain.deadline=state.financialTime+86400;state.chain.totalSubscriptions='700000000';state.accounts.investor.subscription.amount='700000000';"
  );
  assert.equal(r("productModel().checks.settle[2][0]"), true);
  assert.equal(r("productModel().can('settle')"), false);
  r(
    "state.chain.totalSubscriptions='1000000000';state.accounts.investor.subscription.amount='1000000000';state.accounts.investor.subscription.coolingEnd=state.financialTime+1"
  );
  assert.equal(r("productModel().can('settle')"), false);
  r("state.accounts.investor.subscription.coolingEnd=state.financialTime");
  assert.equal(r("productModel().can('settle')"), true);
  r(
    "state.accounts.investor2={eligible:false,subscription:{amount:'0',coolingEnd:state.financialTime+100}}"
  );
  assert.equal(
    r("productModel().can('settle')"),
    true,
    "Refunded orders should not block settlement"
  );
  r("state.chain.valuationReport='old'");
  assert.equal(r("productModel().can('settle')"), false);
});
test("ready publication has a direct action before returns; unavailable or other-role publication is hidden", () => {
  const r = fixture();
  const html = r("productOperations()");
  assert.ok(html.indexOf('data-action="publish"') < html.indexOf("3.44%"));
  assert.match(r("productPublishEntry(productModel())"), /1000.00 USDC/);
  r("t=(en,zh)=>zh");
  assert.match(r("productPublishEntry(productModel())"), /发布产品，开始募集/);
  for (const change of [
    "role='investor'",
    "page='agent_pool'",
    "state.chain.phase='1'",
    "state.chain.fresh=false",
    "state.approvedReports=[]",
    "state.valuationChecks.A={blocked:true}",
  ]) {
    const check = fixture();
    check(change);
    assert.equal(check("productPublishEntry(productModel())"), "", change);
  }
});
test("monthly and quarterly controls expose their cash, approval and dealing constraints", () => {
  const r = fixture();
  r(
    "state.chain.phase='2';state.chain.nextFeeAt=state.financialTime;state.chain.feeBasisReady=true"
  );
  assert.equal(r("productModel().can('fee')"), true);
  assert.equal(r("productModel().can('distribute')"), false);
  r(
    "state.chain.nextFeeAt=state.financialTime+86400;state.chain.nextDistributionAt=state.financialTime;state.chain.expenseLiability='3000000';state.chain.vaultCash='3000000';"
  );
  assert.equal(r("productModel().can('distribute')"), true);
  r("state.chain.vaultCash='2999999'");
  assert.equal(r("productModel().can('distribute')"), false);
  r(
    "state.chain.redemptionDate=state.financialTime;state.chain.unlockedAt=state.financialTime-1;state.chain.valuationAsOf=state.financialTime;state.accounts.investor.redemption={shares:'1000000',requestedAt:state.financialTime-30*86400}"
  );
  assert.equal(r("productModel().can('redeem')"), true);
  r("state.chain.valuationAsOf-=86400");
  assert.equal(r("productModel().can('redeem')"), false);
  assert.equal(r("productModel().can('close')"), false);
});
test("bilingual operations explain disabled controls and show returns before publication", () => {
  const r = fixture();
  assert.match(r("productOperations()"), /3.44%/);
  assert.match(r("productOperations()"), /data-operation-unavailable/);
  assert.match(
    r("productOperations()"),
    /cash payment occurs at quarterly distribution/
  );
  r("t=(en,zh)=>zh");
  const html = r("productOperations()");
  for (const text of [
    "预计年化收益率（净 IRR）",
    "发行与结算",
    "月度回款与估值",
    "季度分配与退出",
    "现金在结算时自动留存",
    "结算最低额还须满足70%募集门槛",
    "投资者需另行领取",
  ])
    assert.ok(html.includes(text), text);
});

test("subscription entry requires publication and eligibility; refund follows cooling and failed phases", () => {
  const r = fixture();
  assert.equal(
    r("productSubscriptionState(state.accounts.investor).canSubscribe"),
    false
  );
  assert.equal(
    r("productSubscriptionState(state.accounts.investor).remaining"),
    ""
  );
  r(
    "state.chain.phase='1';state.chain.target='1000000000';state.chain.deadline=state.financialTime+86400"
  );
  assert.equal(
    r("productSubscriptionState(state.accounts.investor).canSubscribe"),
    true
  );
  r("state.accounts.investor.eligible=false");
  assert.equal(
    r("productSubscriptionState(state.accounts.investor).canSubscribe"),
    false
  );
  r(
    "state.accounts.investor.subscription={amount:'1000000',coolingEnd:state.financialTime+1}"
  );
  assert.equal(
    r("productSubscriptionState(state.accounts.investor).canRefund"),
    true
  );
  r("state.accounts.investor.subscription.coolingEnd=state.financialTime");
  assert.equal(
    r("productSubscriptionState(state.accounts.investor).canRefund"),
    false
  );
  r("state.chain.phase='3'");
  assert.equal(
    r("productSubscriptionState(state.accounts.investor).canRefund"),
    true
  );
  r("state.chain.phase='2'");
  assert.equal(
    r("productSubscriptionState(state.accounts.investor).canRefund"),
    false
  );
});
test("new contract settlement requires per-order approval, never elapsed waiting time", () => {
  const r=fixture();
  r("state.chain.subscriptionReviewRequired=true;state.chain.phase='1';state.chain.target='1000000000';state.chain.deadline=state.financialTime+86400;state.chain.totalSubscriptions='1000000000';state.accounts.investor.subscription={amount:'1000000000',approved:false,submittedAt:state.financialTime,nonce:'1'}");
  assert.equal(r("productModel().can('settle')"),false);
  r("state.accounts.investor.subscription.approved=true");
  assert.equal(r("productModel().can('settle')"),true);
  r("state.accounts.investor.subscription.approved=false;state.financialTime+=3600");
  assert.equal(r("productModel().can('settle')"),false);
  assert.match(r("productOperations()"),/id="subscription-review"/);
  assert.match(r("productOperations()"),/No cooling period/);
});


test('monthly receipts remain confirmed while stale NAV guides reconciliation and quarterly entitlements stay separate',()=>{
 const c=fixture();c(`state.chain.phase='2';state.chain.settledAt=state.financialTime;state.financialTime=productAddMonths(state.financialTime,2);state.chain.nextFeeAt=state.financialTime;state.chain.feeMonths='1';state.chain.feeBasisReady=false;state.chain.fresh=false;state.chain.nextDistributionAt=productAddMonths(state.chain.settledAt,3);state.applications[0].stationId='S';state.income=[{id:'I1',stationId:'S',period:1,amountUSDC6:'328130000',collected:true},{id:'I2',stationId:'S',period:2,amountUSDC6:'328130000',collected:true}];state.approvedReports=[];state.chain.proposedValuationValidUntil=state.financialTime+86400;state.chain.proposedValuationOutdated=true;`);
 let m=c('productModel()');assert.equal(m.operations.collected,656260000n);assert.equal(m.operations.outstanding,0n);assert.equal(m.proposalCanApprove,false);assert.equal(m.operations.next.action,'prepare-valuation');assert.equal(m.operations.next.role,'agent');
 c('state.chain.proposedValuationOutdated=false');m=c('productModel()');assert.equal(m.operations.next.action,'approve-valuation');assert.equal(m.operations.next.role,'trustee');
 c('state.income[1].collected=false');m=c('productModel()');assert.equal(m.operations.next.action,'collect-revenue');assert.equal(m.operations.collected,328130000n);assert.equal(m.operations.outstanding,328130000n);
});
