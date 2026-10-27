import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { forecast, hash, units } from '../../offchain/src/revenue/model';
import { syntheticStation, demoAssumptions } from '../../offchain/src/revenue/fixtures';
import { projectPool } from '../../offchain/src/revenue/pool';
// Deliberately fictional teaching fixture, built with the same valuation and pool engines.
const start = Date.UTC(2026, 0, 1) / 1000;
const station = syntheticStation(start);
station.currency = 'CNY';
station.timezone = 'UTC';
station.name = 'Documentation arithmetic example';
const seasonal = [1000,1100,1200,1300,1400,1500,1500,1400,1300,1200,1100,1000];
station.history = station.history.map(h => {
  const generationKWh = seasonal[Number(h.month.slice(5)) - 1];
  return {...h, generationKWh, exportKWh:generationKWh * 0.4, importKWh:200};
});
station.sourceHash = hash(station.history);
const assumptions = {...demoAssumptions('CNY'), degradationPct:0, availabilityPct:100, inflationPct:0,
  costs:[{id:'example-cost',label:'Illustrative station expenses',payer:'revenue',annualLocal:1200,evidence:'Public teaching assumption'}]};
const report = forecast(station, assumptions, start);
const reserve = units(Number(report.rightsValueUSDC6) / 1e6 / 9);
const projection = projectPool([report],{cashUSDC6:reserve,purchasePriceUSDC6:report.rightsValueUSDC6,monthlyCostUSDC6:'1000000',distributionIntervalMonths:1});
writeFileSync(resolve(__dirname,'../site/src/cashflow-example.generated.json'), JSON.stringify({currency:'CNY', report, projection}));
