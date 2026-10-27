import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {StationMonitor} from "./monitor";
import {DeyeClient} from "../../../offchain/src/revenue/deye";
import type {Station} from "../../../offchain/src/revenue/model";

test("monitoring coalesces refreshes, throttles requests and preserves last evidence on failure/restart",async()=>{
  const before={...process.env}, original=DeyeClient.prototype.capture;
  Object.assign(process.env,{REVENUE_MONITOR_LIVE:"true",DEYE_REGION:"eu",DEYE_APP_ID:"fixture",DEYE_APP_SECRET:"fixture",DEYE_EMAIL:"fixture",DEYE_PASSWORD:"fixture",DEYE_MAPPING_VERIFIED:"false"});
  const dir=mkdtempSync(join(tmpdir(),"deye-monitor-"));
  const station={id:"station",sourceId:"123",source:"replay",observedAt:100,sourceHash:"signed-evidence"} as Station;
  let calls=0;
  try{
    DeyeClient.prototype.capture=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return {...station,source:"live",observedAt:200,sourceHash:"new-evidence"};};
    const monitor=new StationMonitor(dir,[station]);
    const a=monitor.refresh(),b=monitor.refresh();assert.equal(a,b);assert.equal(monitor.read().refreshing,true);
    await a;assert.equal(calls,1);assert.equal(monitor.read().stations[0].sourceHash,"new-evidence");
    assert.equal(station.sourceHash,"signed-evidence");
    monitor.read().stations[0].observedAt=999;assert.equal(monitor.read().stations[0].observedAt,200);
    await monitor.refresh();assert.equal(calls,1,"shared cooldown limits API traffic");
    (monitor as any).snapshot.attemptedAt=0;
    DeyeClient.prototype.capture=async()=>{throw new Error("Simulated connection outage");};
    await monitor.refresh();assert.equal(monitor.read().stations[0].observedAt,200);
    assert.equal(monitor.read().stations[0].sourceHash,"new-evidence");
    assert.match(monitor.read().error!,/outage/);
    const restarted=new StationMonitor(dir,[station]);assert.equal(restarted.read().stations[0].observedAt,200);
    assert.match(restarted.read().error!,/outage/);
    process.env.REVENUE_MONITOR_LIVE="false";await assert.rejects(()=>restarted.refresh(),/not configured/);
  }finally{
    DeyeClient.prototype.capture=original;
    for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];
    Object.assign(process.env,before);
  }
});
