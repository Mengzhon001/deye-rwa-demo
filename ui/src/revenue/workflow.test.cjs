const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
function fixture() {
  const storage = new Map();
  const c = vm.createContext({
    sessionStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v),
    },
    document: { addEventListener() {} },
    t: (en, zh) => en,
    esc: (v) => String(v ?? "").replace(/</g, "&lt;"),
    dsNum: (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—"),
    sourceLabel: (v) => v,
    date: (v) => new Date(v * 1000).toISOString(),
    feedback() {},
    state: { approvedReports: [], financialTime: 100, chain: { phase: 0 } },
    page: "agent_apply_review",
  });
  c.document ||= { addEventListener() {} };
  vm.runInContext(readFileSync(resolve(__dirname, "../../public/revenue/period-timeline.js"), "utf8"), c);
  vm.runInContext(readFileSync(resolve(__dirname, "../../public/revenue/cashflow.js"), "utf8"), c);
  vm.runInContext(
    readFileSync(
      resolve(__dirname, "../../public/revenue/workflow.js"),
      "utf8"
    ),
    c
  );
  return (code) => vm.runInContext(code, c);
}
test("assessment approval navigates to the same application valuation; supplementation stays in review", () => {
  const r = fixture();
  r(`wfAfter('review',{applicationId:'A',decision:'approved'});`);
  assert.equal(r("page"), "agent_financing");
  assert.equal(r("wfSelected"), "A");
  r(
    `page='agent_apply_review';wfAfter('review',{applicationId:'B',decision:'supplement'});`
  );
  assert.equal(r("page"), "agent_apply_review");
  assert.equal(r("wfSelected"), "B");
});
test("pool guide exposes the current-page action while retaining handoff navigation", () => {
  const r = fixture();
  r("var role='agent';page='agent_product';state.chain.fresh=true;state.applications=[{status:'pooled'}];state.activeReports={aggregate:'approved'};state.approvedReports=['approved'];");
  assert.match(r("wfPoolGuide('<button>Publish now</button>')"), /Publish now/);
  r("page='agent_pool'");
  const html = r("wfPoolGuide('<button>Publish now</button>')");
  assert.match(html, /data-wf-page="agent_product"/);
  assert.ok(!html.includes("Publish now"));
});

test("energy explanation follows the saved report, distinguishes both methods and supports older reports", () => {
  const r = fixture();
  r(
    `var report={assumptions:{baselineMethod:'recent-export-ratio',availabilityPct:98,degradationPct:.7,assumedExportRatio:.6},energyEvidence:{source:'replay',observedAt:1,timezone:'UTC',history:[{month:'2025-12',generationKWh:1000,exportKWh:500}]},baseline:{historyStart:'2025-12',historyEnd:'2025-12',recentStart:'2026-09-01',recentEnd:'2026-09-08',completeDays:8,recentExportKWh:800,recentGenerationKWh:1600,observedExportRatio:.5,solarExportRatio:.5},rows:[{month:1,generationKWh:980,exportKWh:490,dueAt:86400,calculation:{serviceStart:1,serviceEnd:3600,seasonMonth:12,sampleMonths:['2025-12'],meanGenerationKWh:1000,meanExportKWh:500,availabilityFactor:.98,degradationFactor:1,remainingFraction:1,exportRatio:.5}}]};state.stations=[{history:[{month:'2025-12',generationKWh:999999}]}];`
  );
  assert.match(r("wfEnergyRules(report)"), /1000.00/);
  assert.ok(!r("wfEnergyRules(report)").includes("999999"));
  assert.match(
    r("wfEnergyFormula(report,report.rows[0])"),
    /1000.00 × 50.00% × 98.00%/
  );
  assert.match(r("wfEnergyRow(report,report.rows[0])"), /2025-12/);
  r(
    `report.assumptions.baselineMethod='historical';report.energyEvidence.history[0].exportKWh=null;`
  );
  assert.match(r("wfEnergyRules(report)"), /Historical export observations/);
  assert.match(r("wfEnergySamples(report,report.rows[0])"), /Missing export/);
  assert.ok(!r("wfEnergyFormula(report,report.rows[0])").includes("50.00%"));
  r(`report.rows[0].calculation.excludedExportMonths=['2025-12'];report.rows[0].calculation.assumedExportFallback=true;report.baseline.energyInconsistent=true;`);
  assert.match(r("wfEnergyRules(report)"), /No comparable export samples/);
  assert.match(r("wfEnergyRow(report,report.rows[0])"), /2025-12/);
  r(`t=(en,zh)=>zh`);
  assert.match(r("wfEnergyRules(report)"), /电量预测计算依据/);
  assert.match(r("wfEnergyRules(report)"), /近期上网量超过发电量/);
  r(`delete report.energyEvidence`);
  assert.match(r("wfEnergyRules(report)"), /未保存逐期计算凭证/);
});
test("trustee approval and expiry determine next actor and action", () => {
  const r = fixture();
  r(
    `var a={id:'A',status:'offered',offer:{reportHash:'hash',validUntil:150}};`
  );
  assert.equal(r("wfNext(a)[0]"), "trustee");
  assert.equal(r("wfStage(a)"), 2);
  r(`state.approvedReports.push('hash')`);
  assert.equal(r("wfNext(a)[0]"), "owner");
  assert.equal(r("wfStage(a)"), 3);
  r(`state.financialTime=151`);
  assert.equal(r("wfNext(a)[0]"), "agent");
  assert.equal(r("wfStatus(a)"), "Quote expired");
});
test("confirmed offer clears local draft and preview; admission returns to pool queue", () => {
  const r = fixture();
  r(
    `wfSaveDraft('A',{assumptions:{tariffLocal:.3}});wfPreviews.set('A',{});wfAfter('offer',{applicationId:'A'});`
  );
  assert.equal(r(`wfDrafts.has('A')`), false);
  assert.equal(r(`wfPreviews.has('A')`), false);
  r(`wfAfter('admit',{applicationId:'A'})`);
  assert.equal(r("page"), "agent_pool");
  assert.equal(r("wfSelected"), "");
});
test("owner submission opens its own application detail", () => {
  const r = fixture();
  r(`wfAfter('apply',{}, {result:{id:'new-application'}})`);
  assert.equal(r("page"), "owner_agreement");
  assert.equal(r("wfSelected"), "new-application");
});

test("blocked admitted applications hand off through current reassessment reviews and return stale evidence to intermediary", () => {
  const r = fixture();
  r(
    `var a={id:'A',status:'pooled'};state.valuationChecks={A:{blocked:true,reassessmentCurrent:false}};`
  );
  assert.equal(r("wfNext(a)[0]"), "agent");
  assert.equal(r("wfStatus(a)"), "Reassessment required");
  r(
    `a.reassessment={trusteeApproved:false,ownerAccepted:false};state.valuationChecks.A.reassessmentCurrent=true;`
  );
  assert.equal(r("wfNext(a)[0]"), "trustee");
  r(`a.reassessment.trusteeApproved=true;`);
  assert.equal(r("wfNext(a)[0]"), "owner");
  r(`state.valuationChecks.A.reassessmentCurrent=false;`);
  assert.equal(r("wfNext(a)[0]"), "agent");
});

test("initial valuation with a data shift guides first pricing instead of claiming an old quote is blocked", () => {
  const r = fixture();
  // Also tolerate a response from the previous backend while the frontend is refreshed.
  r(
    `var a={id:'A',status:'approved'};state.valuationChecks={A:{blocked:true,reason:'old warning',audit:{materialChange:true}}};`
  );
  assert.equal(r("wfStage(a)"), 1);
  assert.equal(r("wfStatus(a)"), "Awaiting valuation");
  assert.equal(
    r("wfNext(a)[2]"),
    "Check assumptions, calculate value and prepare the offer"
  );
  assert.equal(r("wfBaselineNotice(a).kind"), "initial");
  assert.match(r("wfBaselineNotice(a).body"), /No quote has been created/);
  r(`t=(en,zh)=>zh`);
  assert.equal(r("wfBaselineNotice(a).title"), "首次估值：请选择预测基线");
  assert.ok(!r("wfBaselineNotice(a).body").includes("重新评估"));
  r(`a.status='offered';a.offer={reportHash:'old',validUntil:150};`);
  assert.equal(r("wfBaselineNotice(a).kind"), "correction");
  assert.equal(r("wfStage(a)"), 1);
  assert.equal(r("wfStatus(a)"), "报价待补全复核");
  assert.equal(r("wfNext(a)[0]"), "agent");
  assert.equal(r("wfNext(a)[2]"), "补充基线复核并重新提交报价");
  r(`state.valuationChecks.A.blocked=false`);
  assert.equal(r("wfBaselineNotice(a)"), null);
  assert.equal(r("wfStage(a)"), 2);
  assert.equal(r("wfNext(a)[0]"), "trustee");
});

test("baseline submission identifies missing fields for either method and clears after correction", () => {
  const r = fixture();
  r(
    `var a={id:'A',stationId:'S',assumptions:{baselineMethod:'historical',baselineReviewNote:'',baselineReviewSourceHash:'current'}};state.stations=[{id:'S',sourceHash:'current'}];state.valuationChecks={A:{audit:{materialChange:true,recentEligible:true}}};`
  );
  assert.equal(
    r("wfBaselineSubmissionIssues(a,a.assumptions)[0].field"),
    "wf_baselineReviewNote"
  );
  assert.match(r("wfBaselineChecklist(a,a.assumptions)"), /20 characters/);
  r(`a.assumptions.baselineReviewNote='                    ';`);
  assert.equal(r("wfBaselineSubmissionIssues(a,a.assumptions).length"), 1);
  r(
    `a.assumptions.baselineReviewNote='A reasoned choice of the historical baseline after review.';`
  );
  assert.equal(r("wfBaselineSubmissionIssues(a,a.assumptions).length"), 0);
  assert.match(
    r("wfBaselineChecklist(a,a.assumptions)"),
    /preview does not update/
  );
  r(`a.assumptions.baselineReviewSourceHash='old';`);
  assert.equal(
    r("wfBaselineSubmissionIssues(a,a.assumptions)[0].field"),
    "wf_baselineReviewed"
  );
  r(`state.valuationChecks.A.audit.materialChange=false;`);
  assert.equal(r("wfBaselineSubmissionIssues(a,a.assumptions).length"), 0);
  r(`a.assumptions.baselineMethod='recent-export-ratio';`);
  assert.equal(
    r("wfBaselineSubmissionIssues(a,a.assumptions)[0].field"),
    "wf_baselineReviewed"
  );
});
