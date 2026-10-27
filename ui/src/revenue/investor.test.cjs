const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
function fixture() {
  const storage = {
    getItem() {
      return null;
    },
    setItem() {},
  };
  const c = vm.createContext({
    localStorage: storage,
    sessionStorage: storage,
    document: { addEventListener() {} },
  });
  const read = (name) =>
    readFileSync(resolve(__dirname, "../../public/revenue", name), "utf8");
  vm.runInContext(read("app.js").split("function content()")[0], c);
  vm.runInContext(read("product.js"), c);
  vm.runInContext(read("investor.js"), c);
  const account = {
    address: "0x123",
    eligible: false,
    shares: "0",
    economicShares: "0",
    usdc: "0",
    subscription: { amount: "0", coolingEnd: 0 },
    redemption: { shares: "0", requestedAt: 0 },
    claims: [],
    performance: {
      investedUSDC6: "0",
      cashDistributionsUSDC6: "0",
      projectedNetIRRPct: null,
      totalReturnPct: null,
    },
  };
  c.document ||= { addEventListener() {} };
  vm.runInContext(readFileSync(resolve(__dirname, "../../public/revenue/period-timeline.js"), "utf8"), c);
  vm.runInContext(readFileSync(resolve(__dirname, "../../public/revenue/cashflow.js"), "utf8"), c);
  vm.runInContext(
    `lang='zh';role='investor';actor='investor';state=${JSON.stringify({
      financialTime: 1000,
      applications: [
        {
          id: "A",
          status: "pooled",
          stationId: "S",
          assumptions: { shareBps: 6500, termMonths: 60 },
          priceUSDC6: "900000000",
        },
      ],
      stations: [
        {
          id: "S",
          name: "Shanghai station",
          source: "replay",
          sourceId: "123",
        },
      ],
      manifest: { addresses: { vault: "0xabc" } },
      products: [{vault:"0xabc",phase:1,title:{zh:"德业光伏收益权 · 第一期",en:"Deye Solar Revenue Rights · Series 01"}}],
      accounts: {
        investor: account,
        investor2: { ...account, address: "0x456" },
      },
      chain: {
        phase: "1",
        fresh: true,
        valuationReport: "hash",
        valuationAsOf: 900,
        valuationValidUntil: 2000,
        target: "1000000000",
        acquisitionTotal: "900000000",
        totalSubscriptions: "0",
        deadline: 2000,
        price: "1000000",
        settledAt: 0,
        unlockedAt: 0,
      },
      valuationChecks: {},
      activeReports: { aggregate: "hash" },
      approvedReports: ["hash"],
      valuations: [],
      operations: [],
      eligibilityApplications: [],
      trades: [],
      cases: [],
    })}`,
    c
  );
  return (code) => vm.runInContext(code, c);
}
test("unqualified subscription contains application route and cannot take payment", () => {
  const r = fixture(),
    html = r("investorSubscribe()");
  assert.match(html, /data-page="investor_eligibility"/);
  assert.match(html, /尚未取得投资资格/);
  assert.match(html, /type="submit" disabled/);
  assert.match(r("investorQualification()"), /data-action="apply-eligibility"/);
});
test("qualification pending, rejection, approval and revocation use persisted request plus chain truth", () => {
  const r = fixture();
  r(
    "state.eligibilityApplications=[{id:'Q',investor:'investor',status:'pending',submittedAt:900}]"
  );
  assert.match(r("investorQualification()"), /待中介审核/);
  assert.ok(
    !r("investorQualification()").includes('data-action="apply-eligibility"')
  );
  r(
    "state.eligibilityApplications[0].status='rejected';state.eligibilityApplications[0].reviewNote='需补充声明'"
  );
  assert.match(r("investorQualification()"), /需补充声明/);
  assert.match(r("investorQualification()"), /data-action="apply-eligibility"/);
  r(
    "state.eligibilityApplications[0].status='approved';state.accounts.investor.eligible=true"
  );
  assert.match(r("investorQualification()"), /返回认购/);
  assert.equal(
    r("productSubscriptionState(state.accounts.investor).canSubscribe"),
    true
  );
  r("state.accounts.investor.eligible=false");
  assert.equal(r("investorEligibility().status"), "revoked");
});
test("catalog is a filterable product list; detail shows actual assigned rights and constituent stations", () => {
  const r = fixture(),
    catalog = r("investorCatalog()"),
    detail = r("investorPoolDetails()");
  assert.match(catalog, /data-catalog-search/);
  assert.match(catalog, /共 1 个已发布产品/);
  assert.ok(!catalog.includes("底层资产清单"));
  assert.match(detail, /底层资产清单/);
  assert.match(detail, /65% \/ 60/);
  assert.match(detail, /Shanghai station/);
  assert.ok(!detail.includes("data-catalog-search"));
  r("catalogFilter='2'");
  assert.match(r("investorCatalog()"), /没有匹配的产品/);
  r("catalogFilter='all';catalogQuery='missing'");
  assert.match(r("investorCatalog()"), /没有匹配的产品/);
});
test("orders allow immediate review and pre-settlement refunds without cooling", () => {
  const r = fixture();
  r("state.chain.subscriptionReviewRequired=true;state.accounts.investor.subscription={amount:'100000000',submittedAt:1000,approved:false,nonce:'1'}");
  assert.match(r("investorOrder()"), /等待中介审核/);
  assert.match(r("investorOrder()"), /data-action="refund"/);
  r("state.financialTime=300000");
  assert.match(r("investorOrder()"), /data-action="refund"/);
  r("state.accounts.investor.subscription.approved=true");
  assert.match(r("investorOrder()"), /等待统一结算/);
  assert.match(r("investorOrder()"), /data-action="refund"/);
  r("state.chain.phase='3'");
  assert.match(r("investorOrder()"), /可领取全额退款/);
  assert.match(r("investorOrder()"), /data-action="refund"/);
  r("state.chain.phase='2';state.accounts.investor.economicShares='100000000'");
  assert.match(r("investorOrder()"), /已结算 · 份额已发行/);
  assert.match(r("investorOrder()"), /100.00 DRS/);
});
test("repeated subscriptions keep an additional-payment form and explain cumulative reapproval and full refund",()=>{
 const r=fixture();
 r("state.chain.subscriptionReviewRequired=true;state.chain.subscriptionTopUpsAllowed=true;state.accounts.investor.eligible=true;state.accounts.investor.usdc='1000000000';networkConfig={walletRequired:true,chainId:20261014,explorerUrl:'http://127.0.0.1:4008'};");
 for(const [total,approved] of [[100000000,false],[300000000,true],[600000000,false]]){
  r(`state.accounts.investor.subscription={amount:'${total}',submittedAt:1000,approved:${approved},nonce:'3',history:[{kind:'subscription',amountUSDC6:'100000000',at:1000,hash:'0x123456789abc'}]};state.chain.totalSubscriptions='${total}';`);
  assert.equal(r('productSubscriptionState(state.accounts.investor).canSubscribe'),true);
  const html=r('investorSubscribe()');assert.match(html,/data-action="subscribe"/);assert.match(html,/data-investor-add/);assert.match(html,/继续追加认购/);assert.match(html,/本次追加金额/);assert.match(html,/name="amountUSDC6"[^>]*value=""/);assert.match(html,/重新审核最新总额/);assert.match(html,/退回全部累计认购款/);assert.match(html,/认购与退款记录/);
 }
 r("state.chain.totalSubscriptions=state.chain.target");assert.equal(r('productSubscriptionState(state.accounts.investor).canSubscribe'),false);assert.match(r('investorSubscribe()'),/data-action="subscribe"/);
 r("state.chain.phase='2'");assert.doesNotMatch(r('investorSubscribe()'),/data-action="subscribe"/);
 r("state.chain.phase='1';state.chain.totalSubscriptions='600000000';state.chain.subscriptionTopUpsAllowed=false");assert.equal(r('productSubscriptionState(state.accounts.investor).canSubscribe'),false);
});
test("faucet balance is visible independently of orders and uses the connected investor", () => {
  const r = fixture();
  r(
    "networkConfig={walletRequired:true,chainId:20260922,chainName:'Deye RWA Local',nativeCurrency:{symbol:'DETH'}};state.network={explorerUrl:'http://127.0.0.1:4000'};state.manifest.addresses.usdc='0xUSDC';state.accounts['investor:0x789']={...state.accounts.investor,address:'0x789',usdc:'1000000000000',nativeBalanceWei:'5000000000000000000',faucetClaim:{usdcHash:'0xRECEIPT'}};actor='investor:0x789'"
  );
  const funds = r("investorWalletFunds()");
  assert.match(funds, /1,000,000.00 mUSDC/);
  assert.match(funds, /5 DETH/);
  assert.match(funds, /\/tx\/0xRECEIPT/);
  assert.match(funds, /0x789/);
  assert.match(r("investorPosition()"), /钱包可用资金/);
  assert.match(r("investorOrder()"), /0.00 USDC/);
  const subscription = r("investorSubscribe()");
  assert.match(subscription, /1,000,000.00 mUSDC/);
  assert.match(subscription, /20260922/);
  assert.doesNotMatch(subscription, /自动提供|Hardhat 31337|id="wallet-mode"/);
});
test("exit gates protect lock, qualification, escrow balance and cutoff independently", () => {
  const r = fixture();
  r(
    "state.chain.phase='2';state.chain.expiresAt=9999;state.chain.unlockedAt=2000;state.chain.redemptionCutoff=3000;state.accounts.investor.shares='100000000';state.accounts.investor.eligible=true;state.accounts.investor2.eligible=true"
  );
  assert.equal(r("investorExitState().canTransfer"), false);
  r("state.financialTime=2100");
  assert.equal(r("investorExitState().canTransfer"), true);
  assert.equal(r("investorExitState().canRequest"), true);
  r("state.accounts.investor.redemption.shares='10000000'");
  assert.equal(r("investorExitState().canRequest"), false);
  assert.equal(r("investorExitState().canCancel"), true);
  r("state.financialTime=3000");
  assert.equal(r("investorExitState().canCancel"), false);
  r("state.accounts.investor2.eligible=false");
  assert.equal(r("investorExitState().canTransfer"), false);
});
test("completed trades do not offer repeat payment and low deviations do not demand review", () => {
  const r = fixture();
  r(
    "state.trades=[{id:'T',seller:'investor',buyer:'investor2',shares:'1000000',payment:'1000000',until:5000,status:'settled',settled:true,buyerConsented:true,intermediaryApproved:false}]"
  );
  assert.ok(!r("investorTrades()").includes("data-action="));
  assert.ok(!r("investorTrades(true)").includes("data-action="));
  r("state.trades[0].settled=false;state.trades[0].status='consented'");
  assert.match(r("investorTrades()"), /卖方：原子结算/);
  assert.ok(!r("investorTrades(true)").includes('data-action="review-trade"'));
});
test("eligibility review binds the selected applicant and separates revocation from approval", () => {
  const r = fixture();
  r(
    "role='agent';actor='agent';investorReview='investor';state.eligibilityApplications=[{id:'Q',investor:'investor',status:'pending',submittedAt:900}]"
  );
  assert.match(r("investorReviewQueue()"), /确认审核决定/);
  r(
    "state.eligibilityApplications[0].status='approved';state.accounts.investor.eligible=true"
  );
  const html = r("investorReviewQueue()");
  assert.match(html, /<details><summary>管理已有资格/);
  assert.ok(!html.includes("确认审核决定"));
});
test("English investor pages render without Chinese process labels", () => {
  const r = fixture();
  r("lang='en'");
  for (const name of [
    "investorCatalog",
    "investorPoolDetails",
    "investorQualification",
    "investorSubscribe",
    "investorPosition",
    "investorExits",
  ]) {
    const html = r(name + "()");
    assert.ok(!html.includes("undefined"), name);
    assert.ok(!/投资|认购|待审核/.test(html), name);
  }
});

test("draft never appears in hall or detail; historical products are opt-in", () => {
  const r = fixture();
  r("state.chain.phase='0';state.products=[]");
  assert.match(r("investorCatalog()"), /暂无已发布产品/);
  assert.doesNotMatch(r("investorCatalog()"), /iv-product-card/);
  assert.match(r("investorPoolDetails()"), /产品尚未发布/);
  r("state.chain.phase='4';state.products=[{vault:'0xabc',phase:4,title:{zh:'历史产品',en:'Closed product'}}]");
  assert.doesNotMatch(r("investorCatalog()"), /iv-product-card/);
  r("catalogFilter='history'");
  assert.match(r("investorCatalog()"), /iv-product-card/);
});

test("multi-product hall shows each product's own pricing and destination, with history opt-in",()=>{
  const r=fixture();
  r(`state.productOptions=[];state.products=[
    {vault:'0xexperience',phase:1,title:{zh:'投资者体验一期',en:'Investor Experience'},kind:'experience',admittedStations:1,targetUSDC6:'12000000000',subscriptionsUSDC6:'100000000',totalSupply:'0',valuationFresh:true,projectedNetIRRPct:6.125,deadline:2000},
    {vault:'0xsecond',phase:2,title:{zh:'发行演示二期',en:'Issuance 02'},kind:'issuance',admittedStations:2,targetUSDC6:'24000000000',subscriptionsUSDC6:'24000000000',totalSupply:'24000000000',valuationFresh:false,projectedNetIRRPct:8,deadline:2000},
    {vault:'0xclosed',phase:4,title:{zh:'历史产品',en:'Closed'},kind:'issuance',admittedStations:1,targetUSDC6:'1',subscriptionsUSDC6:'0',totalSupply:'0',valuationFresh:false,deadline:1000}];catalogFilter='current'`);
  const html=r('investorCatalog()');
  assert.match(html,/共 3 个已发布产品 · 2 个匹配结果/);
  assert.match(html,/6.13%/);assert.doesNotMatch(html,/8.00%/);
  assert.match(html,/data-product-vault="0xexperience" data-product-target="subscribe"/);
  assert.match(html,/data-product-vault="0xsecond" data-product-target="position"/);
  assert.doesNotMatch(html,/data-product-vault="0xclosed"/);
  r(`catalogFilter='history'`);assert.match(r('investorCatalog()'),/data-product-vault="0xclosed"/);
});

test("removed campaigns expose only full refunds and current-product navigation", () => {
  const r=fixture();
  r(`state.selectedProduct={archived:true};state.chain.phase=3;state.accounts.investor.subscription.amount='1000000000';state.products=[{vault:'0xCurrent',phase:1}];`);
  const html=r('retiredRefundView()');
  assert.match(html,/1,000.00 USDC/);assert.match(html,/data-action="refund"/);
  assert.match(html,/data-product-vault="0xCurrent"/);
  assert(!html.includes('data-action="subscribe"'));assert(!html.includes('IRR'));
  r(`state.accounts.investor.subscription.amount='0';`);
  assert(!r('retiredRefundView()').includes('data-action="refund"'));
  r(`lang='en';state.accounts.investor.subscription.amount='1000000000';`);
  assert.match(r('retiredRefundView()'),/Claim full refund/);
});


test('holdings show confirmed pool receipts separately from personal claims and expose a concrete handoff before quarterly payout',()=>{
 const r=fixture();r(`networkConfig={guidanceEnabled:true};state.chain.phase='2';state.chain.fresh=false;state.chain.settledAt=state.financialTime-10;state.chain.nextFeeAt=state.financialTime+86400;state.chain.nextDistributionAt=state.financialTime+86400*60;state.chain.feeMonths='1';state.chain.distributionCount='0';state.accounts.investor.economicShares='100000000';state.accounts.investor.performance.investedUSDC6='100000000';state.income=[{id:'I',stationId:'S',period:1,collected:true,amountUSDC6:'328130000'}]`);
 const html=r('investorPosition()');assert.match(html,/328.13/);assert.match(html,/资产池累计已归集/);assert.match(html,/你当前可领取/);assert.match(html,/待中介更新估值/);assert.match(html,/data-guide-next-operation/);assert.match(html,/data-investor-operations/);assert(!r('holdings()').includes('钱包现金'));
 r(`state.accounts.investor.claims=[{id:1,amountUSDC6:'20000000',paidUSDC6:'0'}]`);assert.match(r('investorOperations()'),/投资者（你）/);assert.match(r('holdings()'),/data-action="claim"/);
});
