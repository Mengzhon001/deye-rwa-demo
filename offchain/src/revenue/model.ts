import { keccak256, toUtf8Bytes } from "ethers";
import { z } from "zod";
import {
  analyzeBaseline,
  historyWindow,
  BASELINE_MODEL,
  BaselineAnalysis,
} from "./baseline";

export const VERSION = "revenue-rights.v2";
export const COMBINED_MODEL = "household-export.2";
export const money = z.string().regex(/^\d+$/);
export const MonthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  generationKWh: z.number().nonnegative().nullable(),
  exportKWh: z.number().nonnegative().nullable(),
  importKWh: z.number().nonnegative().nullable().optional(),
  consumptionKWh: z.number().nonnegative().nullable().optional(),
  complete: z.boolean(),
});
export const StationSchema = z.object({
  id: z.string().min(1),
  region: z.enum(["eu", "us", "india"]),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  currency: z.string().length(3),
  timezone: z.string().min(1),
  capacityKW: z.number().positive(),
  observedAt: z.number().int().nonnegative(),
  source: z.enum(["synthetic", "live", "replay"]),
  sourceHash: z.string(),
  mappingVerified: z.boolean(),
  history: z.array(MonthSchema),
  devices: z.array(z.record(z.unknown())).default([]),
  alerts: z.array(z.record(z.unknown())).default([]),
  latest: z.record(z.unknown()).default({}),
  metadata: z.record(z.unknown()).default({}),
  telemetry: z.record(z.unknown()).optional(),
});
export type Station = z.infer<typeof StationSchema>;
export const CostSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  payer: z.enum(["revenue", "household", "third-party"]),
  annualLocal: z.number().nonnegative(),
  replacementMonth: z.number().int().min(1).max(360).optional(),
  evidence: z.string().min(1),
});
const AssumptionsBaseSchema = z
  .object({
    // Missing discriminator means a pre-existing export-only agreement. Never reprice it silently.
    revenueModel: z.enum(["export-only", "household-export"]).default("export-only"),
    gridTariffLocal: z.number().positive().default(0.30),
    gridTariffEscalationPct: z.number().min(-50).max(50).default(0),
    gridTariffSchedule: z.array(z.number().positive()).default([]),
    householdPaymentBps: z.number().int().min(1).max(9999).default(8000),
    selfUseDeliveryPct: z.number().min(0).max(100).default(90),
    baselineMethod: z
      .enum(["historical", "recent-export-ratio"])
      .default("historical"),
    baselineReviewNote: z.string().max(2000).default(""),
    baselineReviewSourceHash: z.string().default(""),
    termMonths: z.number().int().min(12).max(360).default(60),
    shareBps: z.number().int().min(1).max(10000).default(8000),
    discountBps: z.number().int().min(0).max(10000).default(1000),
    tariffLocal: z.number().nonnegative().default(0.12),
    tariffEscalationPct: z.number().min(-50).max(50).default(0),
    tariffSchedule: z.array(z.number().nonnegative()).default([]),
    fxUSDC: z.number().positive().default(1),
    inflationPct: z.number().min(-20).max(30).default(2),
    degradationPct: z.number().min(0).max(10).default(0.7),
    availabilityPct: z.number().min(0).max(100).default(98),
    assumedExportRatio: z.number().min(0).max(1).default(0.6),
    paymentDelayMonths: z.number().int().min(0).max(12).default(1),
    costs: z.array(CostSchema).default([]),
    monthlyMandatoryUSDC6: money.default("1000000"),
    poolFeeBps: z.literal(50).default(50),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.costs.map((c) => c.id)).size !== v.costs.length)
      ctx.addIssue({ code: "custom", message: "duplicate expense ID" });
    if (v.tariffSchedule.length && v.tariffSchedule.length !== v.termMonths)
      ctx.addIssue({
        code: "custom",
        message: "tariff schedule must cover entire term",
      });
    if (v.gridTariffSchedule.length && v.gridTariffSchedule.length !== v.termMonths)
      ctx.addIssue({ code: "custom", message: "grid tariff schedule must cover entire term" });
  });
export const AssumptionsSchema = z.preprocess((raw) => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const value = raw as Record<string, unknown>;
    if (value.revenueModel === "household-export" && value.shareBps === undefined)
      return { ...value, shareBps: 10000 };
  }
  return raw;
}, AssumptionsBaseSchema);
export type Assumptions = z.infer<typeof AssumptionsSchema>;

/** One source of arithmetic for forecast and explicitly simulated monthly receivables.
 * Residual solar energy is a modeled delivered-energy proxy, never a metered bill.
 * Retail rates are energy-only, excluding fixed/demand charges and storage arbitrage.
 */
export function monthlyRevenue(
  raw: unknown,
  energy: { generationKWh: number; exportKWh: number; importKWh?: number | null },
  month: number,
  fraction = 1
) {
  const a = AssumptionsSchema.parse(raw);
  if (!Number.isInteger(month) || month < 1 || month > a.termMonths ||
      !Number.isFinite(fraction) || fraction < 0 || fraction > 1 ||
      ![energy.generationKWh, energy.exportKWh].every(v => Number.isFinite(v) && v >= 0) ||
      (energy.importKWh != null && (!Number.isFinite(energy.importKWh) || energy.importKWh < 0)))
    throw new Error("Invalid monthly energy or period");
  const combined = a.revenueModel === "household-export";
  if (combined && energy.exportKWh > energy.generationKWh)
    throw new Error("上网量超过发电量，不能据此推定光伏自用量。Reconcile export energy above generation before billing.");
  const exportKWh = energy.exportKWh;
  const selfUseKWh = combined ? Math.max(0, energy.generationKWh - exportKWh) * a.selfUseDeliveryPct / 100 : 0;
  const exportTariffLocal = a.tariffSchedule[month - 1] ?? a.tariffLocal * (1 + a.tariffEscalationPct / 100) ** ((month - 1) / 12);
  const gridTariffLocal = a.gridTariffSchedule[month - 1] ?? a.gridTariffLocal * (1 + a.gridTariffEscalationPct / 100) ** ((month - 1) / 12);
  const avoidedGridCostLocal = selfUseKWh * gridTariffLocal;
  const householdPaymentLocal = avoidedGridCostLocal * a.householdPaymentBps / 10000;
  const gridPurchaseCostLocal = energy.importKWh == null ? null : energy.importKWh * gridTariffLocal;
  const exportRevenueLocal = exportKWh * exportTariffLocal;
  const grossLocal = householdPaymentLocal + exportRevenueLocal;
  const costsLocal = a.costs.filter(c => c.payer === "revenue").reduce((v, c) => v +
    (c.replacementMonth ? (c.replacementMonth === month ? c.annualLocal : 0) : c.annualLocal / 12) *
    (1 + a.inflationPct / 100) ** ((month - 1) / 12), 0) * fraction;
  const netLocal = Math.max(0, grossLocal - costsLocal);
  return {
    exportKWh, selfUseKWh, importKWh: energy.importKWh ?? null,
    exportTariffLocal, gridTariffLocal, householdPaymentLocal, exportRevenueLocal,
    avoidedGridCostLocal, householdSavingLocal: avoidedGridCostLocal - householdPaymentLocal,
    gridPurchaseCostLocal,
    allGridBillLocal: gridPurchaseCostLocal === null ? null : gridPurchaseCostLocal + avoidedGridCostLocal,
    householdBillLocal: gridPurchaseCostLocal === null ? null : gridPurchaseCostLocal + householdPaymentLocal,
    grossLocal, costsLocal, retainedRevenueLocal: netLocal * (1 - a.shareBps / 10000),
    assignedUSDC6: units(netLocal * a.shareBps / 10000 * a.fxUSDC),
    uncoveredCostsLocal: Math.max(0, costsLocal - grossLocal),
  };
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, ordered(v)])
    );
  return value;
}
export function hash(value: unknown): string {
  return keccak256(toUtf8Bytes(JSON.stringify(ordered(value))));
}
export function stationId(region: string, sourceId: string): string {
  return hash({ namespace: "deye.station.v2", region, sourceId });
}
export function units(value: number): string {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER / 1e6
  )
    throw new Error("invalid monetary amount");
  return Math.round(value * 1e6).toString();
}
export function amount(value: string): number {
  return Number(BigInt(value)) / 1e6;
}
export function addMonths(ts: number, count: number): number {
  const d = new Date(ts * 1000),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + count);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return Math.floor(d.getTime() / 1000);
}
export type ForecastRow = {
  month: number;
  dueAt: number;
  generationKWh: number;
  exportKWh: number;
  grossLocal: number;
  costsLocal: number;
  assignedUSDC6: string;
  billing?: ReturnType<typeof monthlyRevenue>;
  discountFactor?: number;
  presentValueUSDC6?: string;
  calculation?: {
    serviceStart: number;
    serviceEnd: number;
    seasonMonth: number;
    seasonalFallback: boolean;
    sampleMonths: string[];
    imputedExportMonths: string[];
    meanGenerationKWh: number;
    meanExportKWh: number;
    availabilityFactor: number;
    degradationFactor: number;
    remainingFraction: number;
    exportRatio: number | null;
    meanImportKWh?: number | null;
    exportSampleMonths?: string[];
    excludedExportMonths?: string[];
    assumedExportFallback?: boolean;
  };
};
export type Valuation = {
  version: string;
  modelVersion?: string;
  energyEvidence?: {
    version: "energy-calculation.v1";
    source: Station["source"];
    observedAt: number;
    timezone: string;
    history: Array<
      Pick<Station["history"][number], "month" | "generationKWh" | "exportKWh" | "importKWh">
    >;
  };
  baseline?: BaselineAnalysis & {
    method: Assumptions["baselineMethod"];
    reviewRequired: boolean;
    reviewRecorded: boolean;
    comparison: Array<{
      method: string;
      firstYearExportKWh: number;
      grossLocal: number;
      valueUSDC6: string;
    }>;
  };
  stationId: string;
  sourceHash: string;
  assumptions: Assumptions;
  startAt: number;
  asOf: number;
  validUntil: number;
  provisional: boolean;
  warnings: string[];
  rows: ForecastRow[];
  rightsValueUSDC6: string;
  sensitivities: Array<{ discountBps: number; valueUSDC6: string }>;
  scenarios: Array<{ name: string; valueUSDC6: string }>;
  projectedNetIRRPct: number | null;
  futureFeesUSDC6: string;
  reportHash: string;
};
export function irr(
  cashflows: Array<{ at: number; value: number }>
): number | null {
  if (
    !cashflows.some((c) => c.value < 0) ||
    !cashflows.some((c) => c.value > 0)
  )
    return null;
  const start = cashflows[0].at;
  const npv = (r: number) =>
    cashflows.reduce(
      (s, c) => s + c.value / (1 + r) ** ((c.at - start) / 31557600),
      0
    );
  let lo = -0.999,
    hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 160; i++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 50;
}
export function forecast(
  station: Station,
  raw: unknown,
  startAt: number,
  asOf = startAt
): Valuation {
  const s = StationSchema.parse(station),
    a = AssumptionsSchema.parse(raw);
  if (
    !Number.isInteger(startAt) ||
    !Number.isInteger(asOf) ||
    startAt < 0 ||
    asOf < startAt
  )
    throw new Error("invalid valuation dates");
  const history = historyWindow(s, asOf);
  const baseline = analyzeBaseline(s, asOf);
  if (a.baselineMethod === "recent-export-ratio" && baseline.energyInconsistent)
    throw new Error("近期上网量超过发电量，不能作为光伏分配比例；请核对计量口径或审核历史基线。Recent export energy exceeds generation; reconcile meters or review the historical baseline.");
  if (a.baselineMethod === "recent-export-ratio" && !baseline.recentEligible)
    throw new Error(
      "Recent baseline requires at least seven complete, non-conflicting daily generation/export observations before capture day"
    );
  const reviewRequired =
    baseline.materialChange || a.baselineMethod === "recent-export-ratio" || (a.revenueModel === "household-export" && baseline.energyInconsistent);
  const reviewRecorded =
    a.baselineReviewSourceHash === s.sourceHash &&
    a.baselineReviewNote.trim().length >= 20;
  if (new Set(s.history.map((h) => h.month)).size !== s.history.length)
    throw new Error("duplicate history month");
  if (history.length === 0)
    throw new Error("no complete historical observations before cutoff");
  const seasonal = new Map<number, typeof history>();
  for (const h of history) {
    const m = Number(h.month.slice(5));
    seasonal.set(m, [...(seasonal.get(m) || []), h]);
  }
  const qualityWarnings = Array.isArray(s.metadata.qualityWarnings)
    ? s.metadata.qualityWarnings.filter(
        (v): v is string => typeof v === "string"
      )
    : [];
  const provisional =
    a.revenueModel === "household-export" ||
    seasonal.size < 12 ||
    reviewRequired ||
    !s.mappingVerified ||
    qualityWarnings.length > 0 ||
    history.some((h) => h.exportKWh === null);
  const warnings: string[] = [];
  if (a.revenueModel === "household-export") {
    warnings.push("业主电费以估算自用光伏量计费，需审核。自用量＝max(0，发电量－合格上网量) × 交付系数；并非经核验的结算表计。Household billing uses a reviewed delivered-solar proxy, not a verified billing meter.");
    if (history.some(h => h.exportKWh !== null && h.exportKWh > h.generationKWh!))
      warnings.push("上网量超过发电量的历史样本不用于光伏上网估算；保留原始记录，使用同月有效样本，无有效样本时显式使用演示比例。Inconsistent historical export samples are excluded; missing comparable samples use the disclosed demo ratio.");
    if (history.some(h => h.importKWh == null))
      warnings.push("部分历史购电量缺失，完整家庭账单不可用；仍可比较相同自用光伏电量的支付与电网购电成本。Missing imports leave full household bills unavailable, not zero.");
  }
  warnings.push(...qualityWarnings);
  if (baseline.materialChange)
    warnings.push(
      "近期与历史上网水平显著变化；必须核对统计口径与运行方式并明确选择预测基线。Recent export regime differs materially from historical seasonality."
    );
  if (a.baselineMethod === "recent-export-ratio")
    warnings.push(
      "近期情景采用历史季节性发电量 × 近期完整日上网比例；不直接将单日收入外推五年。短期样本须审核。Recent ratio applied to historical seasonal generation; provisional scenario, not a calibrated forecast."
    );
  if (baseline.observedExportRatio !== null && baseline.observedExportRatio > 1)
    warnings.push(
      "近期上网电量超过发电量，近期比例不可用。当前历史季节性估算须审阅，不代表已核实的未来自用量。Recent solar allocation is unavailable; historical seasonal estimates require review and are not metered future self-use."
    );
  if (reviewRequired && !reviewRecorded)
    warnings.push(
      "缺少与本次数据证据绑定的基线选择说明，禁止直接批准该估值。Baseline rationale tied to current evidence is required before approval."
    );
  if (seasonal.size < 12)
    warnings.push(
      "Incomplete seasonal coverage; provisional estimate requires approval"
    );
  if (!s.mappingVerified) warnings.push("API field mapping is not verified");
  if (history.some((h) => h.exportKWh === null))
    warnings.push("Missing exports use the disclosed assumed export ratio");
  if (asOf - s.observedAt > 7 * 86400)
    warnings.push("Source observations are more than seven days old");
  warnings.push(
    "Tariffs, FX, expenses and receipts are demo assumptions; returns are not guaranteed"
  );
  const buildRows = (method: Assumptions["baselineMethod"]): ForecastRow[] => {
    const resultRows: ForecastRow[] = [];
    for (let m = 0; m < a.termMonths; m++) {
      const serviceStart = addMonths(startAt, m),
        serviceEnd = addMonths(startAt, m + 1),
        dueAt = addMonths(serviceEnd, a.paymentDelayMonths);
      // Completed service periods belong in cash/receivables, never in remaining rights.
      if (serviceEnd <= asOf) continue;
      const seasonMonth = new Date(serviceStart * 1000).getUTCMonth() + 1;
      const season = seasonal.get(seasonMonth) || history;
      const fraction = Math.min(
        1,
        (serviceEnd - asOf) / (serviceEnd - serviceStart)
      );
      const derate =
        (((1 - a.degradationPct / 100) ** (m / 12) * a.availabilityPct) / 100) *
        fraction;
      const generation =
        (season.reduce((sum, h) => sum + h.generationKWh!, 0) / season.length) *
        derate;
      const exportSamples = season.filter(h => h.exportKWh === null || h.exportKWh <= h.generationKWh!);
      const excludedExportMonths = season.filter(h => !exportSamples.includes(h)).map(h => h.month);
      const exportSampleGeneration = exportSamples.reduce((n,h) => n + h.generationKWh!,0);
      const historicalRatio = exportSampleGeneration > 0
        ? exportSamples.reduce((n,h) => n + (h.exportKWh ?? h.generationKWh! * a.assumedExportRatio),0) / exportSampleGeneration
        : a.assumedExportRatio;
      const exported = method === "recent-export-ratio"
        ? generation * baseline.solarExportRatio!
        : generation * historicalRatio;
      // Imports are a separate household payment, not pool income or a pool deduction.
      const meanImport = season.every(h => h.importKWh != null)
        ? season.reduce((n, h) => n + h.importKWh!, 0) / season.length : null;
      const billing = monthlyRevenue(a, {
        generationKWh: generation,
        exportKWh: exported,
        importKWh: meanImport === null ? null : meanImport * fraction,
      }, m + 1, fraction);
      const discountFactor = 1 / (1 + a.discountBps / 10000) ** ((dueAt - asOf) / 31557600);
      resultRows.push({
        month: m + 1,
        dueAt,
        generationKWh: generation,
        exportKWh: billing.exportKWh,
        grossLocal: billing.grossLocal,
        costsLocal: billing.costsLocal,
        assignedUSDC6: billing.assignedUSDC6,
        billing,
        discountFactor,
        presentValueUSDC6: units(amount(billing.assignedUSDC6) * discountFactor),
        calculation: {
          serviceStart,
          serviceEnd,
          meanImportKWh: meanImport,
          seasonMonth,
          seasonalFallback: !seasonal.has(seasonMonth),
          sampleMonths: season.map((h) => h.month),
          imputedExportMonths:
            method === "historical"
              ? season.filter((h) => h.exportKWh === null).map((h) => h.month)
              : [],
          meanGenerationKWh:
            season.reduce((sum, h) => sum + h.generationKWh!, 0) /
            season.length,
          meanExportKWh: (generation / derate || 0) * historicalRatio,
          exportSampleMonths: exportSamples.map(h => h.month),
          excludedExportMonths,
          assumedExportFallback: exportSampleGeneration <= 0,
          availabilityFactor: a.availabilityPct / 100,
          degradationFactor: (1 - a.degradationPct / 100) ** (m / 12),
          remainingFraction: fraction,
          exportRatio:
            method === "recent-export-ratio" ? baseline.solarExportRatio : null,
        },
      });
    }
    return resultRows;
  };
  const rows = buildRows(a.baselineMethod);
  if (rows.some(r => r.billing!.uncoveredCostsLocal > 0))
    warnings.push("部分期间收入不足以覆盖站点成本，缺口须另行安排资金，不能视为已支付。Some periods have unfunded station costs; separate funding is required.");
  const pv = (bps: number, factor = 1, cashflows = rows) =>
    cashflows.reduce(
      (sum, row) =>
        sum +
        (amount(row.assignedUSDC6) * factor) /
          (1 + bps / 10000) ** ((row.dueAt - asOf) / 31557600),
      0
    );
  const value = pv(a.discountBps);
  // Explicit estimate of future pool fees on the declining rights value. Actual accrual uses approved opening monthly NAV.
  const fees = rows.reduce(
    (sum, row, i) =>
      sum +
      ((rows
        .slice(i)
        .reduce(
          (v, r) =>
            v +
            amount(r.assignedUSDC6) /
              (1 + a.discountBps / 10000) ** ((r.dueAt - row.dueAt) / 31557600),
          0
        ) *
        a.poolFeeBps) /
        10000 /
        12 +
        amount(a.monthlyMandatoryUSDC6)) /
        (1 + a.discountBps / 10000) ** ((row.dueAt - asOf) / 31557600),
    0
  );
  const contribution = value / 0.9;
  // Whole-pool hold-to-expiry illustration: quarterly 75% distributions, retained 25%
  // redemption liquidity, initial reserve and monthly fees. No assumed early redemption.
  const projectedCash = [{ at: asOf, value: -contribution }];
  let retained = contribution * 0.1,
    quarterReceipts = 0,
    quarterCosts = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    quarterReceipts += amount(r.assignedUSDC6);
    const remaining = rows
      .slice(i)
      .reduce(
        (v, f) =>
          v +
          amount(f.assignedUSDC6) /
            (1 + a.discountBps / 10000) ** ((f.dueAt - r.dueAt) / 31557600),
        0
      );
    quarterCosts +=
      ((remaining + retained) * a.poolFeeBps) / 10000 / 12 +
      amount(a.monthlyMandatoryUSDC6);
    if (r.month % 3 === 0 || i === rows.length - 1) {
      const available = Math.max(0, retained + quarterReceipts - quarterCosts);
      const excess = Math.min(
        Math.max(0, quarterReceipts - quarterCosts),
        Math.max(0, available - amount(a.monthlyMandatoryUSDC6) * 6)
      );
      const payout = excess * 0.75;
      retained = available - payout;
      projectedCash.push({ at: r.dueAt, value: payout });
      quarterReceipts = 0;
      quarterCosts = 0;
    }
  }
  if (rows.length)
    projectedCash.push({ at: rows[rows.length - 1].dueAt, value: retained });
  const result: Omit<Valuation, "reportHash"> = {
    version: VERSION,
    modelVersion: a.revenueModel === "household-export" ? COMBINED_MODEL : BASELINE_MODEL,
    energyEvidence: {
      version: "energy-calculation.v1",
      source: s.source,
      observedAt: s.observedAt,
      timezone: s.timezone,
      history: history.map((h) => ({
        month: h.month,
        generationKWh: h.generationKWh,
        exportKWh: h.exportKWh,
        importKWh: h.importKWh ?? null,
      })),
    },
    baseline: {
      ...baseline,
      method: a.baselineMethod,
      reviewRequired,
      reviewRecorded,
      comparison: (
        [
          "historical",
          ...(baseline.recentEligible ? ["recent-export-ratio"] : []),
        ] as Assumptions["baselineMethod"][]
      ).map((method) => {
        const projected = buildRows(method);
        return {
          method,
          firstYearExportKWh: projected
            .slice(0, 12)
            .reduce((n, r) => n + r.exportKWh, 0),
          grossLocal: projected.reduce((n, r) => n + r.grossLocal, 0),
          valueUSDC6: units(pv(a.discountBps, 1, projected)),
        };
      }),
    },
    stationId: s.id,
    sourceHash: s.sourceHash,
    assumptions: a,
    startAt,
    asOf,
    validUntil: Math.min(addMonths(asOf, 1), asOf + 31 * 86400),
    provisional,
    warnings,
    rows,
    rightsValueUSDC6: units(value),
    sensitivities: [600, 1000, 1400].map((discountBps) => ({
      discountBps,
      valueUSDC6: units(pv(discountBps)),
    })),
    scenarios: [
      { name: "downside", valueUSDC6: units(pv(a.discountBps, 0.8)) },
      { name: "base", valueUSDC6: units(value) },
      { name: "upside", valueUSDC6: units(pv(a.discountBps, 1.1)) },
    ],
    projectedNetIRRPct: irr(projectedCash),
    futureFeesUSDC6: units(fees),
  };
  return { ...result, reportHash: hash(result) };
}

export function poolNav(input: {
  cash: string;
  receivables: string;
  rights: string;
  liabilities: string;
  futureFees: string;
  supply: string;
}) {
  const net =
    BigInt(input.cash) +
    BigInt(input.receivables) +
    BigInt(input.rights) -
    BigInt(input.liabilities) -
    BigInt(input.futureFees);
  const value = net > 0n ? net : 0n;
  return {
    navUSDC6: value.toString(),
    priceUSDC6:
      BigInt(input.supply) > 0n
        ? ((value * 1000000n) / BigInt(input.supply)).toString()
        : "0",
  };
}

/** Workflow gate; forecasts remain available for comparison before a reviewer resolves the discrepancy. */
export function valuationBlockReason(
  station: Station,
  report: Valuation | undefined,
  asOf: number
): string | null {
  const audit = analyzeBaseline(station, asOf);
  if (report?.assumptions.revenueModel === "household-export" && report.modelVersion !== COMBINED_MODEL)
    return "请使用修正后的光伏分配模型重新估值。Recalculate with the corrected solar allocation model.";
  if (report?.assumptions.baselineMethod === "recent-export-ratio" && audit.energyInconsistent)
    return "近期上网量超过发电量，不能按100%外售继续报价。Recent export exceeds generation; reconcile the allocation before pricing.";
  if (
    audit.materialChange ||
    report?.assumptions.baselineMethod === "recent-export-ratio"
  ) {
    if (!report || report.modelVersion !== (report.assumptions.revenueModel === "household-export" ? COMBINED_MODEL : BASELINE_MODEL))
      return "请使用当前模型重新生成报价。Recalculate the baseline with the current model.";
    if (report.sourceHash !== station.sourceHash)
      return "电站数据证据已更新，请核对新数据并重新提交报价。The baseline evidence changed; review the new data and resubmit.";
    const missing = [];
    if ((report.assumptions.baselineReviewNote || "").trim().length < 20)
      missing.push(
        "填写至少20个字符的基线选择依据 / baseline rationale of at least 20 characters"
      );
    if (report.assumptions.baselineReviewSourceHash !== station.sourceHash)
      missing.push(
        "勾选已核对本次数据口径和预测方法 / baseline evidence acknowledgment"
      );
    if (missing.length) return "报价提交前请补充：" + missing.join("；") + "。";
  }
  return null;
}
