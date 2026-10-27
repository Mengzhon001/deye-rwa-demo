import hre from 'hardhat';
import { Transaction } from 'ethers';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {hash as contentHash} from '../../../offchain/src/revenue/model';
import type { RevenueRuntime } from './runtime';
const eventForMethod: Record<string,string> = {
  publishBill:'BillPublished',payBill:'HouseholdPaid',fundExport:'ExportFunded',confirmReceipt:'ReceiptConfirmed',
  mintFacility:'FacilityMinted', mint:'Transfer', approve:'Approval', setApprovalForAll:'ApprovalForAll',
  admit:'StationAdmitted', proposeValuation:'ValuationProposed', approveValuation:'ValuationApproved',
  setEligible:'EligibilityChanged', publish:'ProductPublished', subscribe:'Subscribed', withdrawSubscription:'Refunded', reviewSubscription:'SubscriptionReviewed',
  settle:'ProductSettled', receiveRevenue:'RevenueReceived', distribute:'DistributionDeclared', claim:'DistributionClaimed',
  requestRedemption:'RedemptionRequested', processRedemptions:'RedemptionWindowProcessed', peerTransfer:'PeerTransfer',
  consentToTrade:'TradeConsented', approvePeerTransfer:'PeerTransferApproved', openCase:'ServicingOpened',
  supportCase:'ServicingSupported', approveCase:'ServicingApproved', releaseStation:'StationReleased', invalidateValuation:'ValuationInvalidated', configureMonthlyCost:'MonthlyCostConfigured', carryMissedWindow:'RedemptionWindowCarried', closeProduct:'DistributionDeclared', cancelRedemption:'Transfer',
};
const scalar = (value: any): any => typeof value === 'bigint' ? value.toString() : Array.isArray(value) ? value.map(scalar) : value;
/** Reproduce both current evidence and immutable archives created before financial fingerprints. */
export function archivedValuationHash(archive: any) {
 return contentHash({...(archive.financialInputs?{financialInputs:archive.financialInputs}:{}),version:archive.version,reports:archive.reports.map((r:any)=>r.reportHash),poolProjection:archive.poolProjection.hash,receivables:archive.receivables,cutoff:archive.cutoff});
}
/** Read-only evidence. Prepared requests and raw signed envelopes never leave the server. */
export async function recordingEvidence(runtime: RevenueRuntime, id: string) {
 const s=runtime.repo.read(), op=s.operations.find(o=>o.id===id);
 if(!op)throw Error('Recording operation not found');
 const provider=hre.ethers.provider, chainId=Number((await provider.getNetwork()).chainId);
 if(chainId!==s.manifest!.chainId)throw Error('Evidence chain mismatch');
 const contracts=[runtime.vault,runtime.station,runtime.usdc,...(runtime.billing?[runtime.billing]:[])];
 const registry=new Map(await Promise.all(contracts.map(async c=>[(await c.getAddress()).toLowerCase(),c] as const)));
 const transactions=[];
 for(const [step,saved] of Object.entries(op.steps)) {
  const tx=await provider.getTransaction(saved.hash),receipt=await provider.getTransactionReceipt(saved.hash);
  if(!tx||!receipt){transactions.push({step,hash:saved.hash,status:'pending',matched:false});continue;}
  const contract=registry.get(tx.to?.toLowerCase()||'');
  const decoded=contract?.interface.parseTransaction({data:tx.data,value:tx.value});
  const signed=saved.raw ? Transaction.from(saved.raw) : undefined;
  const expected=op.prepared?.find(p=>p.step===step) || (signed ? {from:signed.from!,to:signed.to!,data:signed.data,value:signed.value} : undefined);
  const checks: Array<{field:string;expected:string;actual:string;matched:boolean}> = [];
  const check=(field:string,want:unknown,actual:unknown)=>checks.push({field,expected:String(want),actual:String(actual),matched:String(want).toLowerCase()===String(actual).toLowerCase()});
  check('decoded method','known',decoded?'known':'unknown');check('chainId',s.manifest!.chainId,Number(tx.chainId));check('receipt.status',1,receipt.status);
  if(expected){check('wallet',expected.from,tx.from);check('contract',expected.to,tx.to);check('callData',expected.data,tx.data);check('nativeValue',BigInt(expected.value||0),tx.value);}
  else check('persistedIntent','required','missing');
  const events=receipt.logs.flatMap(log=>{
   const c=registry.get(log.address.toLowerCase()); if(!c)return[];
   try {const parsed=c.interface.parseLog(log);if(!parsed)return[];return [{contract:log.address,name:parsed.name,logIndex:log.index,args:Object.fromEntries(parsed.fragment.inputs.map((input,i)=>[input.name||String(i),scalar(parsed.args[i])]))}];}catch{return[];}
  });
  const expectedEvent=decoded&&eventForMethod[decoded.name];
  if(expectedEvent)check('expectedEvent',expectedEvent,events.find(e=>e.name===expectedEvent&&e.contract.toLowerCase()===tx.to?.toLowerCase())?.name||'missing');
  const movements=events.filter(e=>e.name==='Transfer').map(e=>({...e,asset:e.contract.toLowerCase()===s.manifest!.addresses.station.toLowerCase()?'station-NFT':e.contract.toLowerCase()===s.manifest!.addresses.usdc.toLowerCase()?'mUSDC':'revenue-share',decimals:e.contract.toLowerCase()===s.manifest!.addresses.station.toLowerCase()?0:6}));
  const atVault=(name:string)=>events.find(e=>e.name===name&&e.contract.toLowerCase()===s.manifest!.addresses.vault.toLowerCase());
  const transferTotal=(asset:string,from:string,to:string)=>movements.filter(e=>e.asset===asset&&String(e.args.from).toLowerCase()===from.toLowerCase()&&String(e.args.to).toLowerCase()===to.toLowerCase()).reduce((sum,e)=>sum+BigInt(e.args.value||0),0n);
  const usdcPayment=(from:string,to:string,amount:unknown)=>check('USDC movement',amount,transferTotal('mUSDC',from,to));
  const vault=s.manifest!.addresses.vault,zero='0x0000000000000000000000000000000000000000';
  for(const name of ['Subscribed','Refunded','DistributionClaimed','RevenueReceived']){
    const e=atVault(name);if(!e)continue;
    if(name==='Subscribed'){check('subscriber',tx.from,e.args.investor);check('subscription.amount',op.body.amountUSDC6,e.args.amount);usdcPayment(tx.from,vault,e.args.amount);}
    if(name==='Refunded'||name==='DistributionClaimed'){const recipient=decoded?.name==='reviewSubscription'?decoded.args[0]:tx.from;check('recipient',recipient,e.args.investor);usdcPayment(vault,recipient,e.args.amount);}
    if(name==='RevenueReceived'){usdcPayment(op.action==='confirm-receipt'?s.manifest!.addresses.billing!:tx.from,vault,e.args.amount);const income=s.income.find(i=>i.id===op.body.incomeId);if(income){check('income.amount',income.amountUSDC6,e.args.amount);check('income.period',income.id,e.args.period);check('income.evidence',income.sourceHash,e.args.evidence);}}
  }
  const bill=s.income.find(i=>i.id===op.body.incomeId);
  if(bill?.payment){
    const billing=s.manifest!.addresses.billing!;
    const paid=events.find(e=>e.name==='HouseholdPaid'&&e.contract.toLowerCase()===billing.toLowerCase());
    if(paid){check('bill id',bill.id,paid.args.id);check('bill payer',bill.payment.payer,paid.args.payer);check('household amount',bill.payment.householdUSDC6,paid.args.amount);usdcPayment(bill.payment.payer,billing,bill.payment.householdUSDC6);}
    const confirmed=events.find(e=>e.name==='ReceiptConfirmed'&&e.contract.toLowerCase()===billing.toLowerCase());
    if(confirmed){check('bill id',bill.id,confirmed.args.id);check('reviewer',runtime.address('agent'),confirmed.args.reviewer);check('assigned net',bill.amountUSDC6,confirmed.args.assignedAmount);check('station costs',bill.payment.costsUSDC6,confirmed.args.costsAmount);usdcPayment(billing,vault,bill.amountUSDC6);}
  }
  const application=s.applications.find(a=>a.id===op.body.applicationId);
  const admitted=atVault('StationAdmitted');
  if(admitted&&application){check('stationId',application.stationId,admitted.args.stationId);check('agreementHash',application.agreementHash,admitted.args.agreement);check('purchasePrice',application.priceUSDC6,admitted.args.purchasePrice);}
  if(admitted&&application){
    const moved=movements.find(e=>e.asset==='station-NFT'&&String(e.args.tokenId)===BigInt(application.stationId).toString());
    check('custody from household',application.owner,moved?.args.from);
    check('custody to vault',vault,moved?.args.to);
  }
  const reviewed=atVault('SubscriptionReviewed');if(reviewed&&decoded?.name==='reviewSubscription'){
    for(const [field,index] of [['investor',0],['orderNonce',1],['amount',2],['terms',3],['approved',4],['evidence',5]] as const)check('subscription review '+field,decoded.args[index],reviewed.args[field]);
    check('review manager',runtime.address('agent'),tx.from);
  }
  const trade=atVault('PeerTransfer');if(trade){usdcPayment(trade.args.buyer,trade.args.seller,trade.args.payment);check('share movement',trade.args.shares,transferTotal('revenue-share',trade.args.seller,trade.args.buyer));}
  for(const e of events.filter(e=>e.name==='RedemptionFilled'&&e.contract.toLowerCase()===vault.toLowerCase()))usdcPayment(vault,e.args.investor,e.args.amount);
  if(decoded?.name==='processRedemptions'){
    const filled=events.filter(e=>e.name==='RedemptionFilled'&&e.contract.toLowerCase()===vault.toLowerCase()).reduce((n,e)=>n+BigInt(e.args.shares),0n);
    check('paid redemption shares burned',filled,transferTotal('revenue-share',vault,zero));
  }
  const settled=atVault('ProductSettled');if(settled){
   for(const a of s.applications.filter(a=>a.status==='pooled'))usdcPayment(vault,a.owner,a.priceUSDC6);
   const minted=movements.filter(e=>e.asset==='revenue-share'&&e.args.from===zero).reduce((sum,e)=>sum+BigInt(e.args.value),0n);check('issued shares',settled.args.supply,minted);
  }
  let valuationEvidence: Record<string,unknown>|undefined;
  const reportEvent=atVault('ValuationProposed')||atVault('ValuationApproved');
  if(reportEvent){
    const report=String(reportEvent.args.report);
    const path=join(runtime.dataDir,'valuation-evidence',`${report}.json`);
    if(/^0x[0-9a-fA-F]{64}$/.test(report)&&existsSync(path)){
      const archive=JSON.parse(readFileSync(path,'utf8'));
      const recomputed=archivedValuationHash(archive);
      check('archived aggregate report',report,recomputed);
      const {hash:projectionHash,...projectionValues}=archive.poolProjection;
      check('pool projection content',projectionHash,contentHash(projectionValues));
      if(reportEvent.name==='ValuationProposed'){check('forecast rights PV',archive.reports.reduce((n:bigint,r:any)=>n+BigInt(r.rightsValueUSDC6),0n),reportEvent.args.rightsPV);check('forecast pool expenses',archive.poolProjection.futureExpensesUSDC6,reportEvent.args.futureFees);}
      for(const r of archive.reports){const {reportHash,...values}=r;check('station report content',reportHash,contentHash(values));}
      valuationEvidence={reportHash:report,cutoff:archive.cutoff,projectionHash:archive.poolProjection.hash,stations:archive.reports.map((r:any)=>({stationId:r.stationId,sourceHash:r.sourceHash,modelVersion:r.modelVersion,assumptionsHash:contentHash(r.assumptions),reportHash:r.reportHash}))};
    }
  }
  const stateChanges: Array<{field:string;before:string;after:string}> = [];
  if(decoded && ['accrueFees','approveValuation','settle','distribute','processRedemptions','cancelRedemption','closeProduct'].includes(decoded.name)){
    const fields=['phase','nav','feeMonths','feeLiability','expenseLiability','feeBasisNAV','monthlyMandatoryCost','totalSupply','operatingReserve','redemptionCash','unpaidDistributions'];
    const values=await Promise.all(fields.map(async field=>{
      const before=String(await runtime.vault.getFunction(field).staticCall({blockTag:receipt.blockNumber-1}));
      const after=String(await runtime.vault.getFunction(field).staticCall({blockTag:receipt.blockNumber}));
      return {field,before,after};
    }));
    stateChanges.push(...values.filter(value=>value.before!==value.after));
    if(decoded.name==='accrueFees'){
      const get=(field:string)=>values.find(v=>v.field===field)!;
      check('fee month increment',BigInt(get('feeMonths').before)+1n,get('feeMonths').after);
      check('monthly management fee',BigInt(get('feeBasisNAV').before)*50n/120000n,BigInt(get('feeLiability').after)-BigInt(get('feeLiability').before));
      check('mandatory expense accrual',get('monthlyMandatoryCost').before,BigInt(get('expenseLiability').after)-BigInt(get('expenseLiability').before));
    }
  }
  let indexed=false;
  try {const r=await fetch(`${process.env.REVENUE_EXPLORER_API_URL}/api/v2/transactions/${tx.hash}`,{signal:AbortSignal.timeout(2500)});indexed=r.ok;}catch{}
  const block=await provider.getBlock(receipt.blockNumber);
  transactions.push({step,hash:tx.hash,chainId,from:tx.from,to:tx.to,method:decoded?.name||'unknown',parameters:decoded?Object.fromEntries(decoded.fragment.inputs.map((input,i)=>[input.name||String(i),scalar(decoded.args[i])])):{},blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,at:block?.timestamp,status:receipt.status===1?'confirmed':'failed',indexed,events,movements,stateChanges,valuationEvidence,checks,matched:checks.every(c=>c.matched),explorerUrl:`${process.env.REVENUE_EXPLORER_URL}/tx/${tx.hash}`});
 }
 const refs=Object.fromEntries(Object.entries(op.body).filter(([key])=>['applicationId','incomeId','distributionId','tradeId','caseId','period','investor','amountUSDC6','sharesUSDC6'].includes(key)));
 const income=s.income.find(r=>r.id===op.body.incomeId);
 if(income)Object.assign(refs,{period:income.period,stationId:income.stationId,amountUSDC6:income.amountUSDC6});
 const application=s.applications.find(a=>a.id===op.body.applicationId);
 if(application)refs.stationId=application.stationId;
 return {version:'recording-evidence.v1',operationId:id,action:op.action,actor:op.actor,status:op.status,chainId,vault:s.manifest!.addresses.vault,startedAt:op.startedAt,businessReferences:refs,transactions,matched:transactions.length>0&&transactions.every(t=>t.matched),offchain:transactions.length===0};
}
