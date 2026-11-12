import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  fetchPvgisProfile, profileFromPvgis, pvgisEnergyForPeriod, pvgisProfileHash,
  PvgisConfig, PvgisProfileSchema,
} from "./pvgis";
import { forecast, valuationBlockReason } from "./model";
import { syntheticStation, demoAssumptions } from "./fixtures";

const config: PvgisConfig = {
  latitude: 31.23, longitude: 121.47, dcCapacityKWp: 10,
  tiltDeg: 25, aspectDeg: 0, nonagingLossPct: 10,
  parameterStatus: "provisional",
  locationEvidence: "Site installation drawing with verified GPS coordinates",
  designEvidence: "Reviewed DC module schedule, tilt and azimuth drawing",
};
function payload() {
  const rows = [];
  for (let at = Date.UTC(2019,0,1,0,30); at < Date.UTC(2024,0,1,0,30); at += 3600000) {
    const d = new Date(at);
    rows.push({time:`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}:${String(d.getUTCHours()).padStart(2,"0")}30`, P:100});
  }
  return {inputs:{location:{latitude:config.latitude,longitude:config.longitude},
    meteo_data:{radiation_db:"PVGIS-ERA5",use_horizon:true},
    mounting_system:{fixed:{type:"free-standing",slope:{value:config.tiltDeg},azimuth:{value:config.aspectDeg}}},
    pv_module:{peak_power:1,system_loss:0,technology:"c-Si"}},
    meta:{outputs:{hourly:{variables:{P:{units:"W"}},timestamp:"hourly averages"}}},
    outputs:{hourly:rows}};
}
test("PVGIS hourly records are complete, parameter-matched and archived with the raw hash", async () => {
  const data = payload(), raw = JSON.stringify(data);
  const dir = mkdtempSync(join(tmpdir(),"deye-pvgis-"));
  try {
    const profile = await fetchPvgisProfile(config,dir,async url => {
      assert.match(String(url),/raddatabase=PVGIS-ERA5/);
      assert.match(String(url),/peakpower=1/);
      assert.match(String(url),/loss=0/);
      return new Response(raw,{status:200,headers:{"content-type":"application/json"}});
    });
    assert.equal(profile.rawSha256,createHash("sha256").update(raw).digest("hex"));
    assert.equal(profile.profileHash,pvgisProfileHash(profile));
    assert.equal(profile.hourlyRows,43824); // leap day in 2020
    assert.ok(Math.abs(profile.annualKWhPerKWp[0]-876)<1e-6);
    assert.ok(Math.abs(profile.annualKWhPerKWp[1]-878.4)<1e-6);
    assert.deepEqual(readdirSync(dir),[`${profile.rawSha256}.json.gz`]);
    assert.equal(gunzipSync(readFileSync(join(dir,`${profile.rawSha256}.json.gz`))).toString(),raw);
    const missing = payload(); missing.outputs.hourly.splice(24,1);
    assert.throws(()=>profileFromPvgis(missing,"a".repeat(64),1,config),/missing, duplicate/);
    const mismatched = payload(); mismatched.inputs.mounting_system.fixed.slope.value = 30;
    assert.throws(()=>profileFromPvgis(mismatched,"a".repeat(64),1,config),/metadata does not match/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("irradiance valuation scales specific yield once and binds the reviewed profile", () => {
  const now = Date.UTC(2026,8,17)/1000;
  const station = syntheticStation(now);
  const profile = PvgisProfileSchema.parse({
    version:"pvgis-era5-profile.v1",database:"PVGIS-ERA5",apiVersion:"5_3",
    sourceUrl:"https://re.jrc.ec.europa.eu/api/v5_3/seriescalc?test=1",
    rawSha256:"a".repeat(64),retrievedAt:now,years:[2019,2020,2021,2022,2023],
    profileHash:pvgisProfileHash({rawSha256:"a".repeat(64),config}),
    hourlyRows:43824,config,
    meanMonthlyKWhPerKWp:[100,110,120,130,140,150,160,170,180,190,200,210],
    annualKWhPerKWp:[1860,1860,1860,1860,1860],
  });
  station.irradianceProfile = profile;
  const assumptions = {...demoAssumptions("EUR"),baselineMethod:"pvgis-irradiance" as const,
    irradianceProfileHash:profile.profileHash,availabilityPct:100,degradationPct:0,
    baselineReviewSourceHash:station.sourceHash,
    baselineReviewNote:"Reviewed PVGIS location and DC design against station evidence"};
  const start = Date.UTC(2026,11,20)/1000;
  const result = forecast(station,assumptions,start);
  const periodKWhPerKWp = 210*12/31+100*19/31;
  assert.ok(Math.abs(pvgisEnergyForPeriod(profile,start,Date.UTC(2027,0,20)/1000)-periodKWhPerKWp)<1e-9);
  assert.ok(Math.abs(result.rows[0].generationKWh-periodKWhPerKWp*10*.9)<1e-8);
  assert.equal(result.modelVersion,"pvgis-era5-irradiance.1");
  assert.match(result.warnings.join(" "),/provisional demo estimates/);
  assert.equal(result.energyEvidence?.irradiance?.rawSha256,profile.rawSha256);
  assert.deepEqual(result.baseline?.comparison.map(v=>v.method),["historical","pvgis-irradiance"]);
  assert.equal(valuationBlockReason(station,result,start),null);
  const changed = structuredClone(station);
  changed.irradianceProfile!.rawSha256="b".repeat(64);
  assert.match(valuationBlockReason(changed,result,start)!,/PVGIS/);
  assert.throws(()=>forecast(station,{...assumptions,irradianceProfileHash:"b".repeat(64)},start),/matching PVGIS/);
  const changedCapacity = structuredClone(station);
  changedCapacity.irradianceProfile!.config.dcCapacityKWp = 12;
  assert.match(valuationBlockReason(changedCapacity,result,start)!,/PVGIS/);
});
