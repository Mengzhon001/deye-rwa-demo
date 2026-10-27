import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('ui/public/revenue/workflow.js','utf8');
const definition=source.slice(source.indexOf('function wfWarningText('),source.indexOf('function wfSaveDraft('));
const context={lang:'en'};vm.createContext(context);vm.runInContext(definition,context);
const samples=[
 ['业主电费以估算自用光伏量计费，需审核。自用量＝max(0，发电量－合格上网量) × 交付系数；并非经核验的结算表计。Household billing uses a reviewed delivered-solar proxy, not a verified billing meter.','Household billing uses a reviewed delivered-solar proxy, not a verified billing meter.'],
 ['数据核验提示：2025-10 发电 1548.3 kWh。Monthly/daily reconciliation differences require provisional valuation review.','Monthly/daily reconciliation differences require provisional valuation review.'],
 ['Source observations are more than seven days old','Source observations are more than seven days old'],
];
for(const[original,english]of samples){assert.equal(context.wfWarningText(original,'en'),english);assert.equal(context.wfWarningText(original,'zh'),original);}
assert.equal(context.wfWarningText('仅有中文的原始证据','en'),'仅有中文的原始证据');
console.log('PASS warning language selection preserves Chinese and displays supplied English translations');
