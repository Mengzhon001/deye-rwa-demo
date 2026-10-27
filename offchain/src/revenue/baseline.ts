import type { Station } from "./model";

export const BASELINE_MODEL = "seasonal-revenue.4";
export const baselinePolicy = {
  windowDays: 30,
  minCompleteDays: 7,
  ratioThreshold: 3,
  minimumDailyDifferenceKWh: 5,
};
const dayMs = 86400000;
function localDate(seconds: number, timezone: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(seconds * 1000));
  return `${p.find((v) => v.type === "year")!.value}-${
    p.find((v) => v.type === "month")!.value
  }-${p.find((v) => v.type === "day")!.value}`;
}
const validEnergy = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
export function historyWindow(s: Station, asOf: number) {
  const cutoff = localDate(Math.min(asOf, s.observedAt), s.timezone).slice(
    0,
    7
  );
  return s.history
    .filter((h) => h.complete && h.generationKWh !== null && h.month < cutoff)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-36);
}
export function analyzeBaseline(s: Station, asOf: number) {
  const history = historyWindow(s, asOf);
  const cutoff = localDate(Math.min(asOf, s.observedAt), s.timezone);
  const end = Date.parse(cutoff),
    begin = end - baselinePolicy.windowDays * dayMs;
  const excluded: string[] = [],
    days = new Map<
      string,
      { date: string; generationKWh: number; exportKWh: number }
    >();
  let conflict = false;
  const raw = Array.isArray(s.telemetry?.days) ? s.telemetry.days : [];
  for (const row of raw) {
    if (!row || typeof row.date !== "string") continue;
    const at = Date.parse(row.date);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !Number.isFinite(at) ||
      new Date(at).toISOString().slice(0, 10) !== row.date
    )
      continue;
    if (at < begin || at >= end) {
      excluded.push(row.date);
      continue;
    }
    if (!validEnergy(row.generationKWh) || !validEnergy(row.exportKWh)) {
      excluded.push(row.date);
      continue;
    }
    const prev = days.get(row.date);
    if (
      prev &&
      (prev.generationKWh !== row.generationKWh ||
        prev.exportKWh !== row.exportKWh)
    )
      conflict = true;
    days.set(row.date, {
      date: row.date,
      generationKWh: row.generationKWh,
      exportKWh: row.exportKWh,
    });
  }
  const recent = [...days.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const generation = recent.reduce((n, r) => n + r.generationKWh, 0),
    exported = recent.reduce((n, r) => n + r.exportKWh, 0);
  const exports = history.filter((h) => h.exportKWh !== null);
  const historyDays = exports.reduce((n, h) => {
    const [y, m] = h.month.split("-").map(Number);
    return n + new Date(Date.UTC(y, m, 0)).getUTCDate();
  }, 0);
  const historicalDaily = historyDays
    ? exports.reduce((n, h) => n + h.exportKWh!, 0) / historyDays
    : null;
  // Match each observed day to the long-run daily average for its calendar month.
  const matched = recent.map((r) => {
    const group = exports.filter(
      (h) => h.month.slice(5) === r.date.slice(5, 7)
    );
    return group.length
      ? group.reduce((n, h) => {
          const [y, m] = h.month.split("-").map(Number);
          return n + h.exportKWh! / new Date(Date.UTC(y, m, 0)).getUTCDate();
        }, 0) / group.length
      : null;
  });
  const seasonalDaily =
    matched.length && matched.every((v) => v !== null)
      ? matched.reduce<number>((n, v) => n + v!, 0) / matched.length
      : historicalDaily;
  const recentDaily = recent.length ? exported / recent.length : null;
  const inconsistentDates = recent.filter(r => r.exportKWh > r.generationKWh).map(r => r.date);
  const energyInconsistent = inconsistentDates.length > 0;
  const observationsUsable =
    recent.length >= baselinePolicy.minCompleteDays &&
    generation > 0 &&
    !conflict;
  const eligible = observationsUsable && !energyInconsistent;
  const ratio =
    seasonalDaily !== null && seasonalDaily > 0 && recentDaily !== null
      ? recentDaily / seasonalDaily
      : null;
  const materialChange =
    observationsUsable &&
    seasonalDaily !== null &&
    recentDaily !== null &&
    Math.abs(recentDaily - seasonalDaily) >=
      baselinePolicy.minimumDailyDifferenceKWh &&
    (seasonalDaily === 0 ||
      ratio! >= baselinePolicy.ratioThreshold ||
      ratio! <= 1 / baselinePolicy.ratioThreshold);
  return {
    policy: baselinePolicy,
    sourceHash: s.sourceHash,
    captureDate: cutoff,
    historyStart: history[0]?.month ?? null,
    historyEnd: history.at(-1)?.month ?? null,
    historyMonths: history.length,
    excludedMonths: s.history
      .filter((h) => !history.includes(h))
      .map((h) => h.month),
    historicalDailyExportKWh: historicalDaily,
    matchedHistoricalDailyExportKWh: seasonalDaily,
    recentStart: recent[0]?.date ?? null,
    recentEnd: recent.at(-1)?.date ?? null,
    completeDays: recent.length,
    recentGenerationKWh: generation,
    recentExportKWh: exported,
    recentDailyExportKWh: recentDaily,
    observedExportRatio: generation > 0 ? exported / generation : null,
    // A grid/battery export meter cannot establish solar allocation when exports exceed generation.
    solarExportRatio: eligible ? exported / generation : null,
    energyInconsistent,
    inconsistentDates,
    ratioToHistorical: ratio,
    materialChange,
    recentEligible: eligible,
    conflictingDays: conflict,
    excludedDates: [...new Set(excluded)].sort(),
    recent,
  };
}
export type BaselineAnalysis = ReturnType<typeof analyzeBaseline>;
