import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

// PVGIS 5.3 seriescalc returns modeled hourly power for a 1 kWp installation.
// ERA5 weather is historical; the resulting profile is a climate baseline,
// not a forecast of weather in a future service month.
export const PVGIS_YEARS = [2019, 2020, 2021, 2022, 2023] as const;
export const PvgisConfigSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  dcCapacityKWp: z.number().positive().max(1000000),
  tiltDeg: z.number().min(0).max(90),
  aspectDeg: z.number().min(-180).max(180), // PVGIS convention: 0 = south.
  nonagingLossPct: z.number().min(0).max(50),
  // An estimate may be used in the demo, but it must not be presented as an
  // as-built parameter confirmed by the station operator.
  parameterStatus: z.enum(["provisional", "confirmed"]).default("provisional"),
  locationEvidence: z.string().trim().min(20).max(1000),
  designEvidence: z.string().trim().min(20).max(1000),
});
export type PvgisConfig = z.infer<typeof PvgisConfigSchema>;
export const PvgisProfileSchema = z.object({
  version: z.literal("pvgis-era5-profile.v1"),
  database: z.literal("PVGIS-ERA5"),
  apiVersion: z.literal("5_3"),
  sourceUrl: z.string().url(),
  rawSha256: z.string().regex(/^[a-f0-9]{64}$/),
  profileHash: z.string().regex(/^[a-f0-9]{64}$/),
  retrievedAt: z.number().int().positive(),
  years: z.array(z.number().int()).length(5),
  hourlyRows: z.number().int().positive(),
  config: PvgisConfigSchema,
  // Average calendar-month production for 1 kWp, before additional loss.
  meanMonthlyKWhPerKWp: z.array(z.number().finite().nonnegative()).length(12),
  annualKWhPerKWp: z.array(z.number().finite().nonnegative()).length(5),
}).refine(v => v.profileHash === pvgisProfileHash(v), "PVGIS profile hash does not match its design inputs");
export type PvgisProfile = z.infer<typeof PvgisProfileSchema>;

// The PVGIS response does not contain DC capacity or parameter evidence.
// Bind those inputs separately so changing a design assumption invalidates a
// quote even when the weather response itself has the same raw digest.
export function pvgisProfileHash(profile: { rawSha256: string; config: PvgisConfig }): string {
  return createHash("sha256").update(JSON.stringify({
    rawSha256: profile.rawSha256,
    config: PvgisConfigSchema.parse(profile.config),
  })).digest("hex");
}

export function pvgisUrl(config: PvgisConfig): string {
  const c = PvgisConfigSchema.parse(config);
  const url = new URL("https://re.jrc.ec.europa.eu/api/v5_3/seriescalc");
  for (const [key, value] of Object.entries({
    lat: c.latitude, lon: c.longitude, startyear: 2019, endyear: 2023,
    raddatabase: "PVGIS-ERA5", pvcalculation: 1, peakpower: 1,
    loss: 0, pvtechchoice: "crystSi", mountingplace: "free",
    angle: c.tiltDeg, aspect: c.aspectDeg, trackingtype: 0,
    components: 1, usehorizon: 1, outputformat: "json",
  })) url.searchParams.set(key, String(value));
  return url.toString();
}

function finiteNonnegative(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("PVGIS hourly P must be a finite nonnegative number in W");
  return value;
}

function matchesNumber(value: unknown, expected: number, tolerance: number): boolean {
  return typeof value === "number" && Number.isFinite(value) &&
    Math.abs(value - expected) <= tolerance;
}

export function profileFromPvgis(
  payload: unknown, rawSha256: string, retrievedAt: number,
  config: PvgisConfig
): PvgisProfile {
  const c = PvgisConfigSchema.parse(config);
  const data = payload as any;
  const input = data?.inputs;
  const fixed = input?.mounting_system?.fixed;
  if (input?.meteo_data?.radiation_db !== "PVGIS-ERA5" ||
      input?.pv_module?.peak_power !== 1 ||
      input?.pv_module?.system_loss !== 0 ||
      input?.pv_module?.technology !== "c-Si" ||
      input?.meteo_data?.use_horizon !== true ||
      fixed?.type !== "free-standing" ||
      !matchesNumber(input?.location?.latitude, c.latitude, 1e-5) ||
      !matchesNumber(input?.location?.longitude, c.longitude, 1e-5) ||
      !matchesNumber(fixed?.slope?.value, c.tiltDeg, 1e-6) ||
      !matchesNumber(fixed?.azimuth?.value, c.aspectDeg, 1e-6) ||
      data?.meta?.outputs?.hourly?.variables?.P?.units !== "W" ||
      data?.meta?.outputs?.hourly?.timestamp !== "hourly averages")
    throw new Error("PVGIS metadata does not match the reviewed station design and request");
  const rows = data?.outputs?.hourly;
  if (!Array.isArray(rows)) throw new Error("PVGIS hourly series is missing");
  const byMonth = Array.from({ length: 12 }, () => 0);
  const byYear = Array.from({ length: 5 }, () => 0);
  let expected = Date.UTC(2019, 0, 1, 0, 30);
  const end = Date.UTC(2024, 0, 1, 0, 30);
  for (const row of rows) {
    if (expected >= end) throw new Error("PVGIS returned extra hourly records");
    const stamp = new Date(expected);
    const label = `${stamp.getUTCFullYear()}${String(stamp.getUTCMonth()+1).padStart(2,"0")}${String(stamp.getUTCDate()).padStart(2,"0")}:${String(stamp.getUTCHours()).padStart(2,"0")}30`;
    if (row?.time !== label)
      throw new Error(`PVGIS hourly series has a missing, duplicate or out-of-order timestamp at ${label}`);
    const kWhPerKWp = finiteNonnegative(row.P) / 1000;
    byMonth[stamp.getUTCMonth()] += kWhPerKWp;
    byYear[stamp.getUTCFullYear()-2019] += kWhPerKWp;
    expected += 3600000;
  }
  if (expected !== end) throw new Error("PVGIS hourly series is incomplete");
  return PvgisProfileSchema.parse({
    version: "pvgis-era5-profile.v1", database: "PVGIS-ERA5",
    apiVersion: "5_3", sourceUrl: pvgisUrl(c), rawSha256,
    profileHash: pvgisProfileHash({ rawSha256, config: c }),
    retrievedAt, years: [...PVGIS_YEARS], hourlyRows: rows.length,
    config: c, meanMonthlyKWhPerKWp: byMonth.map(v => v / 5),
    annualKWhPerKWp: byYear,
  });
}

export async function fetchPvgisProfile(
  config: PvgisConfig, archiveDir: string,
  transport: typeof fetch = fetch
): Promise<PvgisProfile> {
  const url = pvgisUrl(config);
  const response = await transport(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(150000),
  });
  if (!response.ok) throw new Error(`PVGIS request failed: HTTP ${response.status}`);
  if (Number(response.headers.get("content-length") || 0) > 50_000_000)
    throw new Error("PVGIS response exceeds the configured size limit");
  const raw = await response.text();
  if (raw.length > 50_000_000) throw new Error("PVGIS response exceeds the configured size limit");
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const retrievedAt = Math.floor(Date.now()/1000);
  const profile = profileFromPvgis(JSON.parse(raw), sha256, retrievedAt, config);
  mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
  writeFileSync(join(archiveDir, `${sha256}.json.gz`), gzipSync(raw), { mode: 0o600 });
  return profile;
}

export function pvgisEnergyForPeriod(profile: PvgisProfile, start: number, end: number): number {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end)
    throw new Error("Invalid irradiation service interval");
  let result = 0;
  for (let at = start; at < end;) {
    const d = new Date(at*1000);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 1)/1000;
    const stop = Math.min(end, next);
    const days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0)).getUTCDate();
    result += profile.meanMonthlyKWhPerKWp[d.getUTCMonth()] * (stop-at)/(days*86400);
    at = stop;
  }
  return result;
}
