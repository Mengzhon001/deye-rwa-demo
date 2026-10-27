import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Station, StationSchema, hash, stationId } from "./model";

type Region = "eu" | "us" | "india";
export type DeyeConfig = {
  region: Region;
  appId: string;
  appSecret: string;
  email: string;
  password: string;
  companyId?: string;
};
const hosts: Record<Region, string> = {
  eu: "https://eu1-developer.deyecloud.com",
  us: "https://us1-developer.deyecloud.com",
  india: "https://india-developer.deyecloud.com",
};
export function deyeConfig(env: NodeJS.ProcessEnv = process.env): DeyeConfig {
  const region = env.DEYE_REGION as Region;
  if (
    !hosts[region] ||
    ![
      env.DEYE_APP_ID,
      env.DEYE_APP_SECRET,
      env.DEYE_EMAIL,
      env.DEYE_PASSWORD,
    ].every(Boolean)
  )
    throw new Error(
      "Deye live mode requires region, AppId, AppSecret and account credentials in server environment"
    );
  return {
    region,
    appId: env.DEYE_APP_ID!,
    appSecret: env.DEYE_APP_SECRET!,
    email: env.DEYE_EMAIL!,
    password: env.DEYE_PASSWORD!,
    companyId: env.DEYE_COMPANY_ID,
  };
}
export type FieldMapping = {
  verified: boolean;
  generationField: string;
  exportField: string;
  powerToKW: number;
  energyToKWh: number;
  capacityToKW: number;
  currency?: string;
  timestampUnit?: "seconds" | "milliseconds";
  verificationNote?: string;
  qualityWarnings?: string[];
};
export function fieldMapping(
  env: NodeJS.ProcessEnv = process.env
): FieldMapping {
  const verified = env.DEYE_MAPPING_VERIFIED === "true";
  if (verified && !env.DEYE_MAPPING_NOTE)
    throw new Error(
      "Verified mapping requires DEYE_MAPPING_NOTE describing field semantics and the completeness check"
    );
  return {
    verified,
    generationField: env.DEYE_GENERATION_FIELD || "generationValue",
    exportField: env.DEYE_EXPORT_FIELD || "gridValue",
    powerToKW: Number(env.DEYE_POWER_TO_KW || "0.001"),
    energyToKWh: Number(env.DEYE_ENERGY_TO_KWH || "1"),
    capacityToKW: Number(env.DEYE_CAPACITY_TO_KW || "1"),
    currency: env.DEYE_CURRENCY,
    timestampUnit: env.DEYE_TIMESTAMP_UNIT as
      | "seconds"
      | "milliseconds"
      | undefined,
    verificationNote: env.DEYE_MAPPING_NOTE,
    qualityWarnings: env.DEYE_QUALITY_WARNINGS
      ? [env.DEYE_QUALITY_WARNINGS]
      : [],
  };
}
type Json = Record<string, any>;
/** Read the user-supplied private credential note without logging its contents. Environment values win. */
export function loadDeyeCredentials(
  file: string,
  env: NodeJS.ProcessEnv = process.env
) {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(
      /^\s*(user\s+email|email|password|appid|appsecrete?)\s*[:：=]\s*(.*?)\s*$/i
    );
    if (!match) continue;
    const key = match[1].toLowerCase().replace(/\s+/g, "");
    values[key] = match[2].replace(/^`(.*)`$/, "$1").replace(/\\([_@])/g, "$1");
  }
  for (const [name, value] of Object.entries({
    DEYE_EMAIL: values.useremail ?? values.email,
    DEYE_PASSWORD: values.password,
    DEYE_APP_ID: values.appid,
    DEYE_APP_SECRET: values.appsecrete ?? values.appsecret,
  })) {
    if (!env[name] && value) env[name] = value;
  }
}
export class DeyeClient {
  private token = "";
  private expires = 0;
  private authenticating?: Promise<void>;
  constructor(
    private config: DeyeConfig,
    private transport: typeof fetch = fetch
  ) {}
  private async post(
    path: string,
    body: unknown,
    token?: string
  ): Promise<Json> {
    const response = await this.transport(hosts[this.config.region] + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Deye request failed (HTTP ${response.status}); no fallback data substituted`
      );
    const data = (await response.json()) as Json;
    if (data.success !== true)
      throw new Error(
        "Deye rejected the request; verify account permissions, region and configuration"
      );
    return data;
  }
  private async authenticate() {
    const c = this.config;
    const data = await this.post(
      `/v1.0/account/token?appId=${encodeURIComponent(c.appId)}`,
      {
        appSecret: c.appSecret,
        email: c.email,
        password: createHash("sha256").update(c.password).digest("hex"),
        ...(c.companyId ? { companyId: c.companyId } : {}),
      }
    );
    if (typeof data.accessToken !== "string")
      throw new Error("Deye token response was invalid");
    this.token = data.accessToken;
    this.expires = Date.now() + Number(data.expiresIn || 3600) * 1000 - 60000;
  }
  async read(path: string, body: unknown): Promise<Json> {
    const allowed = [
      "/station/list",
      "/station/detail",
      "/station/device",
      "/station/latest",
      "/station/history",
      "/station/alertList",
      "/device/latest",
      "/device/history",
      "/device/measurePoints",
    ];
    if (!allowed.includes(path))
      throw new Error("Only approved monitoring endpoints are supported");
    if (!this.token || Date.now() >= this.expires) {
      // A capture starts several read requests together; obtain one token for all of them.
      this.authenticating ??= this.authenticate().finally(() => {
        this.authenticating = undefined;
      });
      await this.authenticating;
    }
    return this.post(`/v1.0${path}`, body, this.token);
  }
  async listStations(): Promise<Json[]> {
    const rows: Json[] = [];
    for (let page = 1; page <= 100; page++) {
      const r = await this.read("/station/list", { page, size: 100 });
      const items = r.stationList;
      if (!Array.isArray(items))
        throw new Error(
          "Unexpected station list schema; mapping requires verification"
        );
      rows.push(...items);
      if (items.length < 100 || rows.length >= Number(r.total)) return rows;
    }
    throw new Error("Station pagination exceeded configured bound");
  }
  async capture(
    sourceId: string,
    now: number,
    mapping: FieldMapping,
    archiveDir: string
  ): Promise<Station> {
    if (!/^\d+$/.test(sourceId) || !Number.isSafeInteger(Number(sourceId)))
      throw new Error("Invalid station identifier");
    const id = Number(sourceId);
    const [detail, firstDevices, latest, firstAlerts] = await Promise.all([
      this.read("/station/detail", { stationId: id }),
      this.read("/station/device", { stationIds: [id], page: 1, size: 100 }),
      this.read("/station/latest", { stationId: id }),
      this.read("/station/alertList", {
        stationId: id,
        page: 1,
        size: 100,
        startTimestamp: now - 30 * 86400,
        endTimestamp: now,
      }),
    ]);
    if (!Array.isArray(firstDevices.deviceListItems))
      throw new Error("Unexpected station device schema");
    const devices = {
      ...firstDevices,
      deviceListItems: [...firstDevices.deviceListItems],
    };
    for (
      let page = 2;
      devices.deviceListItems.length < Number(firstDevices.total);
      page++
    ) {
      if (page > 100)
        throw new Error("Device pagination exceeded configured bound");
      const next = await this.read("/station/device", {
        stationIds: [id],
        page,
        size: 100,
      });
      if (!Array.isArray(next.deviceListItems) || !next.deviceListItems.length)
        throw new Error("Incomplete station device pagination");
      devices.deviceListItems.push(...next.deviceListItems);
    }
    const inverterRows = devices.deviceListItems.filter(
      (d: Json) => d.deviceType === "INVERTER"
    );
    const deviceReadings: Json[] = [];
    for (let offset = 0; offset < inverterRows.length; offset += 10) {
      deviceReadings.push(
        await this.read("/device/latest", {
          deviceList: inverterRows
            .slice(offset, offset + 10)
            .map((d: Json) => d.deviceSn),
          deviceType: "INVERTER",
        })
      );
    }
    const alerts = {
      ...firstAlerts,
      stationAlertItems: [...(firstAlerts.stationAlertItems || [])],
    };
    if (!Array.isArray(firstAlerts.stationAlertItems))
      throw new Error(
        "Unexpected alerts schema; mapping requires verification"
      );
    let page = 1,
      items = firstAlerts.stationAlertItems;
    while (
      items.length === 100 &&
      alerts.stationAlertItems.length < Number(firstAlerts.total || Infinity)
    ) {
      if (++page > 100)
        throw new Error("Alert pagination exceeded configured bound");
      const next = await this.read("/station/alertList", {
        stationId: id,
        page,
        size: 100,
        startTimestamp: now - 30 * 86400,
        endTimestamp: now,
      });
      if (!Array.isArray(next.stationAlertItems))
        throw new Error("Unexpected alerts schema");
      items = next.stationAlertItems;
      alerts.stationAlertItems.push(...items);
    }
    // Monthly endpoint permits at most twelve months per request. Request three complete calendar years in bounded chunks.
    const metadata =
      detail.station ??
      detail.stationDetail ??
      detail.stationDetailItem ??
      detail;
    if (!metadata.regionTimezone)
      throw new Error("Station timezone required for historical query windows");
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: metadata.regionTimezone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date(now * 1000));
    const year = Number(parts.find((p) => p.type === "year")!.value),
      month = Number(parts.find((p) => p.type === "month")!.value);
    const history: Json[] = [];
    const end = new Date(Date.UTC(year, month - 1, 1));
    for (let offset = 36; offset > 0; offset -= 12) {
      const first = new Date(end),
        last = new Date(end);
      first.setUTCMonth(first.getUTCMonth() - offset);
      last.setUTCMonth(last.getUTCMonth() - offset + 11);
      history.push(
        await this.read("/station/history", {
          stationId: id,
          granularity: 3,
          startAt: first.toISOString().slice(0, 7),
          endAt: last.toISOString().slice(0, 7),
        })
      );
    }
    const evidence = {
      version: "deye-capture.v1",
      region: this.config.region,
      sourceId,
      capturedAt: now,
      detail,
      devices,
      deviceReadings,
      latest,
      alerts,
      history,
      dashboard: await this.captureDashboard(id, now, metadata, mapping),
      mapping,
    };
    mkdirSync(archiveDir, { recursive: true });
    const archiveId = `${stationId(this.config.region, sourceId)}-${now}`;
    writeFileSync(
      join(archiveDir, `${archiveId}.json`),
      JSON.stringify(evidence, null, 2),
      { mode: 0o600 }
    );
    const station = normalizeCapture(evidence);
    writeFileSync(
      join(archiveDir, `${archiveId}.normalized.json`),
      JSON.stringify(station, null, 2),
      { mode: 0o600 }
    );
    return station;
  }
  private async captureDashboard(
    id: number,
    now: number,
    metadata: Json,
    mapping: FieldMapping
  ): Promise<Json> {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: metadata.regionTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(now * 1000));
    const value = (key: string) => parts.find((p) => p.type === key)!.value;
    const date = `${value("year")}-${value("month")}-${value("day")}`;
    const next = new Date(date + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    const result: Json = { date, errors: {} };
    const query = async (key: string, body: Json) => {
      try {
        result[key] = await this.read("/station/history", {
          stationId: id,
          ...body,
        });
      } catch {
        result.errors[key] =
          "Deye telemetry query failed; this series is unavailable";
      }
    };
    // Actual API requires endAt even for intraday granularity, despite the documentation's abbreviated example.
    await query("intraday", { granularity: 1, startAt: date, endAt: date });
    const endAt = next.toISOString().slice(0, 10);
    await query("days", {
      granularity: 2,
      startAt: date.slice(0, 7) + "-01",
      endAt: value("day") === "31" ? date : endAt,
    });
    if (value("day") === "31" && result.days) {
      await query("lastDay", { granularity: 2, startAt: date, endAt });
      if (result.lastDay)
        result.days.stationDataItems.push(...result.lastDay.stationDataItems);
    }
    await query("currentMonth", {
      granularity: 3,
      startAt: date.slice(0, 7),
      endAt: date.slice(0, 7),
    });
    const start =
      typeof metadata.startOperatingTime === "number" && mapping.timestampUnit
        ? new Date(
            metadata.startOperatingTime *
              (mapping.timestampUnit === "seconds" ? 1000 : 1)
          ).getUTCFullYear()
        : Number(value("year")) - 3;
    await query("years", {
      granularity: 4,
      startAt: String(Math.max(Number(value("year")) - 40, start)),
      endAt: value("year"),
    });
    return result;
  }
}
function scalar(value: unknown, factor = 1): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value * factor
    : null;
}
function signedScalar(value: unknown, factor = 1): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value * factor
    : null;
}
export function normalizeCapture(raw: Json): Station {
  if (raw.version !== "deye-capture.v1" || !hosts[raw.region as Region])
    throw new Error("Unsupported capture format");
  const m = raw.mapping as FieldMapping;
  if (
    !m ||
    ![m.energyToKWh, m.capacityToKW, m.powerToKW].every(
      (v) => Number.isFinite(v) && v > 0
    )
  )
    throw new Error("Explicit unit mapping required");
  const detail =
    raw.detail.station ??
    raw.detail.stationDetail ??
    raw.detail.stationDetailItem ??
    raw.detail;
  const cap = scalar(detail.installedCapacity, m.capacityToKW);
  if (!cap || !detail.regionTimezone || !detail.name)
    throw new Error("Station metadata mapping requires verification");
  try {
    new Intl.DateTimeFormat("en", { timeZone: detail.regionTimezone }).format();
  } catch {
    throw new Error("Invalid station timezone");
  }
  const localMonth = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: detail.regionTimezone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(date);
    return (
      parts.find((p) => p.type === "year")!.value +
      "-" +
      parts.find((p) => p.type === "month")!.value
    );
  };
  const currentMonth = localMonth(new Date(raw.capturedAt * 1000));
  // Do not certify the partial month in which monitoring was first registered.
  const createdMonth =
    typeof detail.createdDate === "number" && m.timestampUnit
      ? localMonth(
          new Date(
            detail.createdDate * (m.timestampUnit === "seconds" ? 1000 : 1)
          )
        )
      : undefined;
  const observations = new Map<string, any>();
  for (const response of raw.history) {
    if (!Array.isArray(response.stationDataItems))
      throw new Error("Unexpected history schema");
    for (const item of response.stationDataItems) {
      let month =
        typeof item.year === "number" && item.month >= 1 && item.month <= 12
          ? `${item.year}-${String(item.month).padStart(2, "0")}`
          : String(item.timeStamp || item.dateTime || "").slice(0, 7);
      if (typeof item.timeStamp === "number" && m.timestampUnit) {
        const d = new Date(
          item.timeStamp * (m.timestampUnit === "seconds" ? 1000 : 1)
        );
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: detail.regionTimezone,
          year: "numeric",
          month: "2-digit",
        }).formatToParts(d);
        month =
          parts.find((p) => p.type === "year")!.value +
          "-" +
          parts.find((p) => p.type === "month")!.value;
      }
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        throw new Error("Unrecognized historical month; do not infer dates");
      if (observations.has(month))
        throw new Error("Duplicate historical month");
      const generation = scalar(item[m.generationField], m.energyToKWh),
        exported = scalar(item[m.exportField], m.energyToKWh);
      // API aggregation presence does not prove full coverage; verified mapping is an explicit operator assertion.
      observations.set(month, {
        month,
        generationKWh: generation,
        exportKWh: exported,
        importKWh: scalar(item.purchaseValue, m.energyToKWh),
        consumptionKWh: scalar(item.consumptionValue, m.energyToKWh),
        complete:
          m.verified &&
          generation !== null &&
          month < currentMonth &&
          (!createdMonth || month > createdMonth),
      });
    }
  }
  const deviceRows =
    raw.devices.deviceList ?? raw.devices.deviceListItems ?? [];
  const alertRows = raw.alerts.stationAlertItems ?? [];
  const currency = m.currency ?? detail.currency;
  if (!currency)
    throw new Error(
      "Explicit station currency required; set DEYE_CURRENCY after verifying tariff currency"
    );
  return StationSchema.parse({
    id: stationId(raw.region, raw.sourceId),
    region: raw.region,
    sourceId: raw.sourceId,
    name: detail.name,
    currency,
    timezone: detail.regionTimezone,
    capacityKW: cap,
    observedAt: raw.capturedAt,
    source: "live",
    sourceHash: hash(raw),
    mappingVerified: m.verified,
    history: [...observations.values()].sort((a, b) =>
      a.month.localeCompare(b.month)
    ),
    devices: deviceRows.map((device: Json) => {
      const reading = (raw.deviceReadings || [])
        .flatMap((r: Json) => r.deviceDataList || [])
        .find(
          (r: Json) =>
            r.deviceSn === device.deviceSn && r.deviceType === device.deviceType
        );
      return reading
        ? {
            ...device,
            readings: reading.dataList,
            readingTime: reading.collectionTime,
          }
        : device;
    }),
    alerts: alertRows,
    metadata: {
      ...detail,
      mappingVerificationNote: m.verificationNote ?? null,
      qualityWarnings: m.qualityWarnings ?? [],
      modelingCurrencySource: detail.currency
        ? "API"
        : "Configured demo assumption",
    },
    latest: {
      generationPowerKW: scalar(raw.latest.generationPower, m.powerToKW),
      consumptionPowerKW: scalar(raw.latest.consumptionPower, m.powerToKW),
      gridPowerKW: signedScalar(raw.latest.gridPower, m.powerToKW),
      wirePowerKW: signedScalar(raw.latest.wirePower, m.powerToKW),
      batteryPowerKW: signedScalar(raw.latest.batteryPower, m.powerToKW),
      batterySOC: scalar(raw.latest.batterySOC),
      lastUpdateTime: raw.latest.lastUpdateTime ?? null,
      raw: raw.latest,
    },
    ...(raw.dashboard
      ? { telemetry: normalizeDashboard(raw.dashboard, m) }
      : {}),
  });
}
export function normalizeDashboard(raw: Json, m: FieldMapping): Json {
  const energy = (r: Json) => ({
    generationKWh: scalar(r[m.generationField], m.energyToKWh),
    exportKWh: scalar(r[m.exportField], m.energyToKWh),
    importKWh: scalar(r.purchaseValue, m.energyToKWh),
    consumptionKWh: scalar(r.consumptionValue, m.energyToKWh),
    chargeKWh: scalar(r.chargeValue, m.energyToKWh),
    dischargeKWh: scalar(r.dischargeValue, m.energyToKWh),
  });
  const rows = (key: string): Json[] => raw[key]?.stationDataItems ?? [];
  const dayMap = new Map<string, Json>();
  for (const r of rows("days")) {
    const date = `${r.year}-${String(r.month).padStart(2, "0")}-${String(
      r.day
    ).padStart(2, "0")}`;
    if (date > raw.date || !date.startsWith(raw.date.slice(0, 7))) continue;
    const normalized = { date, ...energy(r) };
    if (dayMap.has(date) && hash(dayMap.get(date)) !== hash(normalized))
      throw new Error("Conflicting daily telemetry records");
    dayMap.set(date, normalized);
  }
  const power = rows("intraday")
    .map((r) => {
      const timestamp =
        typeof r.timeStamp === "number" && m.timestampUnit
          ? r.timeStamp / (m.timestampUnit === "milliseconds" ? 1000 : 1)
          : typeof r.timeStamp === "string" &&
            /(?:Z|[+-]\d\d:\d\d)$/.test(r.timeStamp)
          ? Date.parse(r.timeStamp) / 1000
          : null;
      if (timestamp === null || !Number.isFinite(timestamp))
        throw new Error("Intraday timestamp needs explicit units/timezone");
      return {
        timestamp,
        generationKW: scalar(r.generationPower, m.powerToKW),
        consumptionKW: scalar(r.consumptionPower, m.powerToKW),
        batteryKW: signedScalar(r.batteryPower, m.powerToKW),
        soc: scalar(r.batterySOC),
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);
  return {
    date: raw.date,
    errors: raw.errors || {},
    power,
    days: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    currentMonth: rows("currentMonth").map((r) => ({
      month: `${r.year}-${String(r.month).padStart(2, "0")}`,
      ...energy(r),
    })),
    years: rows("years")
      .map((r) => ({ year: r.year, ...energy(r) }))
      .sort((a, b) => a.year - b.year),
  };
}
export function replayCapture(path: string): Station {
  const station = normalizeCapture(JSON.parse(readFileSync(path, "utf8")));
  return { ...station, source: "replay" };
}
