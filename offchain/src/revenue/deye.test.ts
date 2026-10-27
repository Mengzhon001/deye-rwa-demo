import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeyeClient,
  normalizeCapture,
  fieldMapping,
  deyeConfig,
  loadDeyeCredentials,
  replayCapture,
  normalizeDashboard,
} from "./deye";
function capture() {
  return {
    version: "deye-capture.v1",
    region: "eu",
    sourceId: "123",
    capturedAt: 1700000000,
    mapping: { ...fieldMapping({}), verified: true, currency: "EUR" },
    detail: {
      name: "Station",
      regionTimezone: "Europe/Berlin",
      installedCapacity: 12,
    },
    devices: { deviceList: [{ serial: "one" }, { serial: "two" }] },
    latest: {},
    alerts: { stationAlertItems: [] },
    history: [
      {
        stationDataItems: [
          { year: 2023, month: 1, generationValue: 100, gridValue: 60 },
        ],
      },
    ],
  };
}
test("normalizes units without turning devices into additional stations", () => {
  const raw = capture(),
    station = normalizeCapture(raw);
  assert.equal(station.devices.length, 2);
  assert.equal(station.history[0].exportKWh, 60);
  assert.equal(station.history[0].importKWh, null);
  Object.assign(raw.history[0].stationDataItems[0], { purchaseValue: 4000, consumptionValue: 8000 });
  raw.mapping.energyToKWh = 0.001;
  assert.equal(normalizeCapture(raw).history[0].importKWh, 4);
  assert.equal(normalizeCapture(raw).history[0].consumptionKWh, 8);
  assert.equal(normalizeCapture(raw).history[0].exportKWh, 0.06);
  assert.equal(normalizeCapture(raw).id, station.id);
});
test("missing export stays null, incomplete mapping is explicit, currency is never guessed", () => {
  const raw: any = capture();
  delete raw.history[0].stationDataItems[0].gridValue;
  assert.equal(normalizeCapture(raw).history[0].exportKWh, null);
  raw.mapping.verified = false;
  assert.equal(normalizeCapture(raw).history[0].complete, false);
  delete raw.mapping.currency;
  assert.throws(() => normalizeCapture(raw), /currency/);
});
test("missing environment fails without exposing secrets", () => {
  assert.throws(() => deyeConfig({}), /server environment/);
});
test("private Markdown credentials support supplied spelling and escaped values; environment wins", () => {
  const dir = mkdtempSync(join(tmpdir(), "deye-config-"));
  try {
    const file = join(dir, "private.md");
    writeFileSync(
      file,
      "user email: demo\\@example.invalid\npassword: test\\_password\nappid: app\nappSecrete: secret"
    );
    const env: NodeJS.ProcessEnv = { DEYE_APP_ID: "override" };
    loadDeyeCredentials(file, env);
    assert.equal(env.DEYE_APP_ID, "override");
    assert.equal(env.DEYE_APP_SECRET, "secret");
    assert.equal(env.DEYE_PASSWORD, "test_password");
    assert.equal(env.DEYE_EMAIL, "demo@example.invalid");
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test("actual station envelope, singular alert ID, device pagination, signed readings and archived replay", async () => {
  const dir = mkdtempSync(join(tmpdir(), "deye-capture-"));
  const calls: any[] = [];
  const transport = (async (url: any, init: any) => {
    const path = new URL(url).pathname,
      body = JSON.parse(init.body);
    calls.push({ path, body });
    let result: any;
    switch (path) {
      case "/v1.0/account/token":
        result = { accessToken: "private", expiresIn: 3600 };
        break;
      case "/v1.0/station/detail":
        result = {
          station: {
            name: "API station",
            installedCapacity: 40,
            regionTimezone: "PRC",
            createdDate: Date.UTC(2023, 8, 7) / 1000,
          },
        };
        break;
      case "/v1.0/station/device":
        result = {
          total: 2,
          deviceListItems: [
            {
              deviceSn: body.page === 1 ? "INV-1" : "INV-2",
              deviceType: "INVERTER",
            },
          ],
        };
        break;
      case "/v1.0/device/latest":
        result = {
          deviceDataList: body.deviceList.map((deviceSn: string) => ({
            deviceSn,
            deviceType: "INVERTER",
            collectionTime: 1789600000,
            dataList: [{ key: "BatteryPower", value: "-3000", unit: "W" }],
          })),
        };
        break;
      case "/v1.0/station/latest":
        result = {
          generationPower: 2000,
          batteryPower: -3000,
          gridPower: null,
          batterySOC: 57,
        };
        break;
      case "/v1.0/station/alertList":
        assert.equal(body.stationId, 123);
        assert.equal(body.stationIds, undefined);
        result = { total: 0, stationAlertItems: [] };
        break;
      case "/v1.0/station/history":
        result = {
          stationDataItems: [
            {
              timeStamp:
                body.granularity === 1 ? Date.UTC(2026, 8, 17) / 1000 : null,
              year: Number(body.startAt.slice(0, 4)),
              month: Number(body.startAt.slice(5)),
              generationValue: 100,
              gridValue: 2,
            },
          ],
        };
        break;
      default:
        throw new Error("Unexpected endpoint");
    }
    return new Response(JSON.stringify({ success: true, ...result }));
  }) as typeof fetch;
  try {
    const client = new DeyeClient(
      {
        region: "eu",
        appId: "test",
        appSecret: "private",
        email: "demo@example.invalid",
        password: "private",
      },
      transport
    );
    const station = await client.capture(
      "123",
      Date.UTC(2026, 8, 17) / 1000,
      {
        ...fieldMapping({}),
        verified: true,
        currency: "CNY",
        timestampUnit: "seconds",
        verificationNote: "fixture semantics checked",
      },
      dir
    );
    assert.equal(station.name, "API station");
    assert.equal(
      calls.filter((c) => c.path === "/v1.0/account/token").length,
      1
    );
    assert.equal(station.devices.length, 2);
    assert.equal((station.devices[1].readings as any[])[0].unit, "W");
    assert.equal(station.latest.generationPowerKW, 2);
    assert.equal(station.latest.batteryPowerKW, -3);
    assert.equal(station.latest.gridPowerKW, null);
    assert.equal(station.history[0].complete, false); // registration month is partial
    assert.equal(station.history[1].complete, true);
    const windows = calls
      .filter(
        (c) =>
          c.path.endsWith("/station/history") &&
          c.body.granularity === 3 &&
          c.body.startAt !== c.body.endAt
      )
      .map((c) => [c.body.startAt, c.body.endAt]);
    assert.deepEqual(windows, [
      ["2023-09", "2024-08"],
      ["2024-09", "2025-08"],
      ["2025-09", "2026-08"],
    ]);
    const replay = replayCapture(
      join(dir, readdirSync(dir).find((f) => !f.includes("normalized"))!)
    );
    assert.equal(replay.sourceHash, station.sourceHash);
    assert.deepEqual(replay.history, station.history);
    assert.equal(replay.source, "replay");
    assert.ok(!JSON.stringify(station).includes("private"));
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test("API errors never substitute fixture data; account secrets only go to the configured auth host", async () => {
  const calls: any[] = [];
  const transport = (async (url: any, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(
      JSON.stringify(
        calls.length === 1
          ? { success: true, accessToken: "secret-token", expiresIn: 3600 }
          : { success: false, msg: "do not log upstream secrets" }
      ),
      { status: 200 }
    );
  }) as typeof fetch;
  const c = new DeyeClient(
    {
      region: "eu",
      appId: "application",
      appSecret: "secret",
      email: "demo@example.invalid",
      password: "password",
    },
    transport
  );
  await assert.rejects(() => c.listStations(), /Deye rejected/);
  assert.equal(calls[0].body.password.length, 64);
  assert.ok(!JSON.stringify(calls[1]).includes("password"));
  await assert.rejects(() => c.read("/device/control", {}), /monitoring/);
});

test("dashboard series preserve nulls, signed power, partial current periods and deduplicate date boundaries", () => {
  const mapping = { ...fieldMapping({}), timestampUnit: "seconds" as const };
  const row = {
    year: 2026,
    month: 9,
    day: 17,
    generationValue: 196.5,
    gridValue: 195.9,
    purchaseValue: 1701.1,
  };
  const raw = {
    date: "2026-09-17",
    days: { stationDataItems: [row, row, { ...row, day: 18 }] },
    intraday: {
      stationDataItems: [
        {
          timeStamp: 1789637700,
          generationPower: 537,
          batteryPower: -3000,
          consumptionPower: null,
          batterySOC: 65,
        },
      ],
    },
    currentMonth: { stationDataItems: [{ ...row, generationValue: 3449.9 }] },
    errors: { years: "unavailable" },
  };
  const value = normalizeDashboard(raw, mapping);
  assert.equal(value.days.length, 1);
  assert.equal(value.days[0].exportKWh, 195.9);
  assert.equal(value.power[0].generationKW, 0.537);
  assert.equal(value.power[0].batteryKW, -3);
  assert.equal(value.power[0].consumptionKW, null);
  assert.equal(value.currentMonth[0].generationKWh, 3449.9);
  assert.equal(value.errors.years, "unavailable");
  assert.deepEqual(value.years, []);
  assert.throws(() => normalizeDashboard(raw, fieldMapping({})), /timestamp/);
  assert.throws(
    () =>
      normalizeDashboard(
        {
          ...raw,
          days: { stationDataItems: [row, { ...row, gridValue: 100 }] },
        },
        mapping
      ),
    /Conflicting/
  );
});
