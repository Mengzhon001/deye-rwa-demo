const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");
function dashboard() {
  const storage = new Map();
  const context = vm.createContext({
    document: { addEventListener() {} },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, val) => storage.set(key, val),
    },
    lang: "zh",
    state: { applications: [] },
    t: (en, zh) => zh,
  });
  vm.runInContext(
    readFileSync(
      resolve(__dirname, "../../public/revenue/dashboard.js"),
      "utf8"
    ),
    context
  );
  return { run: (code) => vm.runInContext(code, context), context };
}
test("monitoring prefers latest observations without rewriting pricing evidence; replay is never current online status", () => {
  const {run}=dashboard();
  run(`state.stations=[{id:'signed',sourceHash:'approved-evidence'}]; state.monitoringStations=[{id:'latest',source:'live'}]`);
  assert.equal(run("dsStations()[0].id"),"latest");
  assert.equal(run("state.stations[0].sourceHash"),"approved-evidence");
  assert.equal(run(`dsConnection({source:'replay',observedAt:Date.now()/1000,metadata:{connectionStatus:'ALL_OFFLINE'}}).label`),"采集时全部离线");
  assert.equal(run(`dsConnection({source:'live',observedAt:Date.now()/1000,metadata:{connectionStatus:'PARTIAL_OFFLINE'}}).label`),"部分离线");
  assert.equal(run(`dsConnection({source:'live',observedAt:1,metadata:{connectionStatus:'NORMAL'}}).good`),false);
});
test("estimate uses export kWh, keeps zero, rejects missing/invalid values and rounds only for display", () => {
  const { run } = dashboard();
  assert.equal(run("dsCash(dsEstimate(195.91, 0.30))"), "58.77");
  assert.equal(run("dsEstimate(0, 0.30)"), 0);
  assert.equal(run("dsEstimate(100, 0)"), 0);
  for (const value of ["null", "undefined", "NaN", "Infinity", "-1", '"100"'])
    assert.equal(run(`dsEstimate(${value}, .3)`), null);
  assert.equal(run("dsEstimate(10, null)"), null);
  assert.equal(run("dsEstimate(1e308, 100)"), null);
  assert.equal(
    run(
      "dsCash(dsEstimate(dsExportSum([{exportKWh:.015},{exportKWh:.015}]).kWh, 1))"
    ),
    "0.03"
  );
});
test("missing periods stay missing; partial sums disclose coverage and never use generation", () => {
  const { run } = dashboard();
  assert.equal(
    run("dsExportSum([{generationKWh:900}, {exportKWh:null}]).kWh"),
    null
  );
  assert.equal(run("dsExportSum([{exportKWh:0}, {}, {exportKWh:10}]).kWh"), 10);
  assert.equal(
    run("dsExportSum([{exportKWh:0}, {}, {exportKWh:10}]).count"),
    2
  );
  assert.equal(
    run("dsExportSum([{exportKWh:0}, {}, {exportKWh:10}]).total"),
    3
  );
});
test("closed monthly evidence takes precedence over overlapping current-month capture", () => {
  const { run } = dashboard();
  assert.equal(
    run(
      `dsMonths({history:[{month:'2026-08',exportKWh:100,complete:true}], telemetry:{currentMonth:[{month:'2026-08',exportKWh:999},{month:'2026-09',exportKWh:50}]}}).length`
    ),
    2
  );
  assert.equal(
    run(
      `dsExportSum(dsMonths({history:[{month:'2026-08',exportKWh:100}], telemetry:{currentMonth:[{month:'2026-08',exportKWh:999},{month:'2026-09',exportKWh:50}]}})).kWh`
    ),
    150
  );
});
test("screenshot price is scoped to the Shanghai station, currency and data source", () => {
  const { run } = dashboard();
  run(
    `var station = {region:'eu',sourceId:'60994015',currency:'CNY',source:'live'};`
  );
  assert.equal(run("dsTariff(station).rate"), 0.3);
  for (const change of [
    "sourceId:'another'",
    "currency:'EUR'",
    "region:'us'",
    "source:'synthetic'",
  ])
    assert.equal(run(`dsTariff({...station, ${change}}).rate`), null);
  run(
    `localStorage.setItem(dsTariff(station).key, JSON.stringify({rate:0.42}));`
  );
  assert.equal(run("dsTariff(station).rate"), 0.42);
  assert.equal(run("dsTariff(station).source"), "custom");
  run(`localStorage.setItem(dsTariff(station).key, '{broken');`);
  assert.equal(run("dsTariff(station).rate"), 0.3);
});
