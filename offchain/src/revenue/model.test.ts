import test from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  forecast,
  hash,
  poolNav,
  units,
  AssumptionsSchema,
} from "./model";
import { syntheticStation, demoAssumptions as currentDemoAssumptions } from "./fixtures";
// Preserve explicit regression coverage for contracts priced before the combined model.
const demoAssumptions = (currency = "EUR") => ({ ...currentDemoAssumptions(currency), revenueModel: "export-only" as const, shareBps: 8000 });
import { projectPool } from "./pool";
const now = Date.UTC(2026, 8, 17) / 1000;
test("energy evidence explains exact samples, period dates and seasonal forecast without changing cashflow arithmetic", () => {
  const s = syntheticStation(now);
  s.history = [
    { month: "2023-12", generationKWh: 3887.7, exportKWh: 200, complete: true },
    { month: "2024-12", generationKWh: 3762.6, exportKWh: 300, complete: true },
    { month: "2025-12", generationKWh: 3787.7, exportKWh: 400, complete: true },
  ];
  s.telemetry = {
    days: Array.from({ length: 8 }, (_, i) => ({
      date: `2026-09-0${i + 1}`,
      generationKWh: 200,
      exportKWh: 200,
    })),
  };
  const start = Date.UTC(2026, 11, 20) / 1000;
  const a = {
    ...demoAssumptions("CNY"),
    baselineMethod: "recent-export-ratio",
  };
  const r = forecast(s, a, start);
  const c = r.rows[0].calculation!;
  assert.equal(c.serviceStart, start);
  assert.equal(c.serviceEnd, Date.UTC(2027, 0, 20) / 1000);
  assert.equal(r.rows[0].dueAt, Date.UTC(2027, 1, 20) / 1000);
  assert.equal(c.seasonMonth, 12);
  assert.deepEqual(c.sampleMonths, ["2023-12", "2024-12", "2025-12"]);
  assert.equal(c.meanGenerationKWh, (3887.7 + 3762.6 + 3787.7) / 3);
  assert.ok(Math.abs(r.rows[0].exportKWh - 3736.413333333333) < 1e-8);
  assert.equal(c.exportRatio, 1);
  assert.equal(c.degradationFactor, 1);
  assert.equal(c.remainingFraction, 1);
  assert.equal(r.rows[1].calculation!.seasonalFallback, true);
  assert.equal(r.rows[12].calculation!.degradationFactor, 0.993);
  const midway = forecast(s, a, start, start + 10 * 86400);
  assert.equal(midway.rows[0].calculation!.remainingFraction, 21 / 31);
  assert.ok(
    Math.abs(midway.rows[0].exportKWh - (r.rows[0].exportKWh * 21) / 31) < 1e-8
  );
  const snapshot = JSON.stringify(r.energyEvidence);
  s.history[0].generationKWh = 999999;
  assert.equal(
    JSON.stringify(r.energyEvidence),
    snapshot,
    "The report must retain its own historical inputs"
  );
  assert.notEqual(
    hash({ ...r, energyEvidence: { ...r.energyEvidence, history: [] } }),
    hash(r)
  );
});
test("historical trace identifies imputed exports and excludes missing generation months", () => {
  const s = syntheticStation(now);
  s.history = [
    { month: "2024-12", generationKWh: 6000, exportKWh: 1200, complete: true },
    { month: "2025-12", generationKWh: 4000, exportKWh: null, complete: true },
    { month: "2023-12", generationKWh: null, exportKWh: 99999, complete: true },
  ];
  const r = forecast(s, demoAssumptions(), Date.UTC(2026, 11, 20) / 1000),
    c = r.rows[0].calculation!;
  assert.equal(c.meanExportKWh, (1200 + 4000 * 0.6) / 2);
  assert.equal(r.rows[0].exportKWh, 1800 * 0.98);
  assert.deepEqual(c.imputedExportMonths, ["2025-12"]);
  assert.equal(c.exportRatio, null);
  assert.equal(r.energyEvidence!.history.length, 2);
});
test("deterministic forecast, hashes, seasonal profile, discount scenarios and nominal currency", () => {
  const s = syntheticStation(now),
    a = demoAssumptions(),
    f = forecast(s, a, now);
  assert.deepEqual(f, forecast(s, a, now));
  assert.equal(hash({ a: 1, b: 2 }), hash({ b: 2, a: 1 }));
  assert.equal(f.provisional, false);
  assert.equal(f.rows.length, 60);
  assert.notEqual(f.rows[0].exportKWh, f.rows[3].exportKWh);
  assert.ok(
    BigInt(f.sensitivities[0].valueUSDC6) >
      BigInt(f.sensitivities[2].valueUSDC6)
  );
  const doubled = forecast(s, { ...a, fxUSDC: a.fxUSDC * 2 }, now);
  assert.ok(
    Math.abs(
      Number(doubled.rightsValueUSDC6) - 2 * Number(f.rightsValueUSDC6)
    ) < 10
  );
  assert.ok(f.projectedNetIRRPct !== null && f.projectedNetIRRPct < 10);
  assert.equal(
    f.reportHash,
    hash(
      Object.fromEntries(Object.entries(f).filter(([k]) => k !== "reportHash"))
    )
  );
});
test("provisional history, absent exports, duplicate months and unavailable data", () => {
  const s = syntheticStation(now),
    a = demoAssumptions();
  assert.equal(
    forecast({ ...s, history: s.history.slice(-6) }, a, now).provisional,
    true
  );
  assert.equal(
    forecast(
      { ...s, history: s.history.map((h) => ({ ...h, exportKWh: null })) },
      a,
      now
    ).provisional,
    true
  );
  assert.throws(() => forecast({ ...s, history: [] }, a, now), /no complete/);
  assert.throws(
    () => forecast({ ...s, history: [...s.history, s.history[0]] }, a, now),
    /duplicate/
  );
  assert.throws(
    () => AssumptionsSchema.parse({ ...a, costs: [a.costs[0], a.costs[0]] }),
    /duplicate/
  );
});
test("verified API fields with unresolved reconciliation differences still require provisional review", () => {
  const s = syntheticStation(now);
  s.metadata.qualityWarnings = ["Monthly export differs from daily totals"];
  const report = forecast(s, demoAssumptions(), now);
  assert.equal(report.provisional, true);
  assert.ok(
    report.warnings.includes("Monthly export differs from daily totals")
  );
});
test("rights expire, completed service periods become receivables, household expenses are not deducted", () => {
  const s = syntheticStation(now),
    a = demoAssumptions();
  const f = forecast(s, a, now, addMonths(now, 60));
  assert.equal(f.rightsValueUSDC6, "0");
  assert.equal(f.rows.length, 0);
  assert.equal(f.futureFeesUSDC6, "0");
  const partial = forecast(s, a, now, addMonths(now, 1));
  assert.equal(partial.rows[0].month, 2);
  assert.equal(partial.rows.length, 59);
  const base = forecast(s, a, now);
  const household = forecast(
    s,
    {
      ...a,
      costs: [
        ...a.costs,
        {
          id: "home",
          label: "Household",
          payer: "household",
          annualLocal: 1000,
          evidence: "household bill",
        },
      ],
    },
    now
  );
  assert.equal(base.rightsValueUSDC6, household.rightsValueUSDC6);
  assert.throws(
    () => forecast(s, { ...a, tariffSchedule: [1] }, now),
    /entire term/
  );
});
test("calendar arithmetic handles leap years, cash precision is explicit", () => {
  assert.equal(
    new Date(addMonths(Date.UTC(2024, 0, 31) / 1000, 1) * 1000)
      .toISOString()
      .slice(0, 10),
    "2024-02-29"
  );
  assert.equal(units(0.000001), "1");
  assert.throws(() => units(-1));
});
test("NAV counts claims and receivables once, redemption leaves reference price consistent", () => {
  const n = (
    cash: string,
    receivables: string,
    liabilities: string,
    supply = "1000000000"
  ) =>
    poolNav({
      cash,
      receivables,
      rights: "900000000",
      liabilities,
      futureFees: "10000000",
      supply,
    });
  assert.deepEqual(n("100000000", "20000000", "0"), n("120000000", "0", "0")); // collection
  assert.deepEqual(n("100000000", "0", "20000000"), n("80000000", "0", "0")); // claim payment
  const first = poolNav({
    cash: "100000000",
    receivables: "0",
    rights: "900000000",
    liabilities: "0",
    futureFees: "0",
    supply: "1000000000",
  });
  const after = poolNav({
    cash: "50000000",
    receivables: "0",
    rights: "900000000",
    liabilities: "0",
    futureFees: "0",
    supply: "950000000",
  });
  assert.equal(first.priceUSDC6, after.priceUSDC6);
});
test("pool projections charge common expenses once and do not count a collectible receipt twice", () => {
  const first = forecast(syntheticStation(now), demoAssumptions(), now),
    second = forecast(syntheticStation(now, 2), demoAssumptions(), now);
  const input = {
    cashUSDC6: "200000000",
    purchasePriceUSDC6: "1600000000",
    monthlyCostUSDC6: "1000000",
  };
  const before = projectPool([first], {
    ...input,
    receivablesUSDC6: "30000000",
  });
  const after = projectPool([first], { ...input, cashUSDC6: "230000000" });
  assert.deepEqual(before, after);
  const combined = projectPool([first, second], {
    ...input,
    cashUSDC6: "400000000",
    purchasePriceUSDC6: "3200000000",
  });
  const separate = projectPool([first], input),
    other = projectPool([second], input);
  assert.ok(
    BigInt(combined.futureExpensesUSDC6) <
      BigInt(separate.futureExpensesUSDC6) + BigInt(other.futureExpensesUSDC6)
  );
  assert.equal(combined.cashflows[0].valueUSDC6, "-3600000000");
  assert.ok(
    combined.cashflows.slice(1).every((c) => Number(c.valueUSDC6) >= 0)
  );
});

test("regime change is detected from complete local days and recent scenario preserves generation seasonality", () => {
  const s = syntheticStation(now);
  s.timezone = "Asia/Shanghai";
  s.history = s.history.map((h) => ({
    ...h,
    generationKWh: h.month.endsWith("-07") ? 8000 : 6000,
    exportKWh: 300,
  }));
  s.telemetry = {
    days: Array.from({ length: 17 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      generationKWh: i === 16 ? 99999 : 200,
      exportKWh: i === 16 ? 99999 : 200,
    })),
  };
  const a = demoAssumptions("CNY"),
    legacy = forecast(s, a, now),
    recent = forecast(s, { ...a, baselineMethod: "recent-export-ratio" }, now);
  assert.equal(legacy.baseline!.completeDays, 16);
  assert.equal(legacy.baseline!.recentDailyExportKWh, 200);
  assert.equal(legacy.baseline!.materialChange, true);
  assert.equal(recent.provisional, true);
  assert.equal(recent.baseline!.reviewRecorded, false);
  assert.equal(recent.rows[0].exportKWh, recent.rows[0].generationKWh);
  assert.notEqual(recent.rows[0].exportKWh, recent.rows[10].exportKWh);
  assert.ok(
    BigInt(recent.rightsValueUSDC6) > 10n * BigInt(legacy.rightsValueUSDC6)
  );
  assert.equal(
    recent.baseline!.comparison[0].valueUSDC6,
    legacy.rightsValueUSDC6
  );
  assert.deepEqual(
    recent,
    forecast(s, { ...a, baselineMethod: "recent-export-ratio" }, now)
  );
});

test("baseline review rejects inconsistent solar allocation; missing, duplicate and zero days are explicit", async () => {
  const { valuationBlockReason } = await import("./model");
  const s = syntheticStation(now);
  s.timezone = "Asia/Shanghai";
  s.telemetry = {
    days: Array.from({ length: 8 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      generationKWh: 100,
      exportKWh: 110,
    })),
  };
  const a = {
    ...demoAssumptions(),
    baselineMethod: "recent-export-ratio",
    baselineReviewNote:
      "Reviewed changed export operation and field meanings against captured station data.",
    baselineReviewSourceHash: s.sourceHash,
  };
  assert.throws(() => forecast(s, a, now), /exceeds generation/);
  const invalid = forecast(s, {...a, baselineMethod:"historical"}, now);
  assert.equal(invalid.baseline!.solarExportRatio, null);
  assert.equal(invalid.baseline!.recentEligible, false);
  assert.equal(invalid.baseline!.inconsistentDates.length,8);
  s.telemetry = {days:(s.telemetry!.days as any[]).map(d=>({...d,exportKWh:90}))};
  const r = forecast(s, a, now);
  assert.equal(r.baseline!.solarExportRatio, 0.9);
  assert.equal(valuationBlockReason(s, r, now), null);
  assert.ok(valuationBlockReason({ ...s, sourceHash: "changed" }, r, now));
  assert.equal(forecast(s, a, now, addMonths(now, 60)).rightsValueUSDC6, "0");
  assert.throws(
    () =>
      forecast(
        {
          ...s,
          telemetry: { days: (s.telemetry!.days as unknown[]).slice(0, 6) },
        },
        a,
        now
      ),
    /seven complete/
  );
  assert.throws(
    () =>
      forecast(
        {
          ...s,
          telemetry: {
            days: [
              ...(s.telemetry!.days as unknown[]),
              { date: "2026-09-01", generationKWh: 100, exportKWh: 99 },
            ],
          },
        },
        a,
        now
      ),
    /non-conflicting/
  );
  const zero = forecast(
    {
      ...s,
      telemetry: {
        days: (s.telemetry!.days as any[]).map((d) => ({ ...d, exportKWh: 0 })),
      },
    },
    a,
    now
  );
  assert.equal(zero.baseline!.recentDailyExportKWh, 0);
  assert.equal(zero.rightsValueUSDC6, "0");
});

test('monthly pool forecasts pay at monthly cutoffs and keep the quarterly regression explicit',()=>{
 const report=forecast(syntheticStation(now),demoAssumptions(),now),input={cashUSDC6:'200000000',purchasePriceUSDC6:'1600000000',monthlyCostUSDC6:'1000000'};
 const monthly=projectPool([report],{...input,distributionIntervalMonths:1}),quarterly=projectPool([report],{...input,distributionIntervalMonths:3});
 assert.equal(monthly.distributionIntervalMonths,1);assert.equal(quarterly.distributionIntervalMonths,3);assert(monthly.periods.some(r=>r.month%3!==0&&BigInt(r.payoutUSDC6)>0n));assert(quarterly.periods.every(r=>r.month%3===0||r.payoutUSDC6==='0'));assert.notEqual(monthly.hash,quarterly.hash);assert.deepEqual(monthly,projectPool([report],{...input,distributionIntervalMonths:1}));assert(Number.isFinite(monthly.projectedNetIRRPct));
});
