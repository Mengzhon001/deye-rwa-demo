import {test} from 'node:test';import assert from 'node:assert/strict';
import {archivedValuationHash} from './recording-evidence';
import {hash} from '../../../offchain/src/revenue/model';
test('valuation evidence includes the exact financial fingerprint anchored on chain',()=>{
 const inputs={version:'revenue-rights.v2',reports:[{reportHash:hash('station')}],poolProjection:{hash:hash('projection')},receivables:'0',cutoff:1802619000,financialInputs:hash('cash and fees')};
 assert.equal(archivedValuationHash(inputs),hash({financialInputs:inputs.financialInputs,version:inputs.version,reports:inputs.reports.map(r=>r.reportHash),poolProjection:inputs.poolProjection.hash,receivables:inputs.receivables,cutoff:inputs.cutoff}));
 assert.notEqual(archivedValuationHash(inputs),archivedValuationHash({...inputs,financialInputs:hash('changed cash')}));
 const {financialInputs,...legacy}=inputs;assert.equal(archivedValuationHash(legacy),hash({version:legacy.version,reports:legacy.reports.map(r=>r.reportHash),poolProjection:legacy.poolProjection.hash,receivables:legacy.receivables,cutoff:legacy.cutoff}));
});
