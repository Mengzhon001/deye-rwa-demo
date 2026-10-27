import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {JsonRpcProvider} from 'ethers';
import {config} from './environment.mjs';
import {systemEvidence} from './system-evidence.mjs';
const stage=process.argv[2]||'recording',run=resolve(process.argv[3]||''),delivery=process.argv[4]&&resolve(process.argv[4]),c=config(stage);
const report={stage,checkedAt:new Date().toISOString(),checks:[],limitations:[]};
const check=(label,pass)=>{assert(pass,label);report.checks.push({label,passed:true});console.log('PASS',label);};
const rpc=new JsonRpcProvider(c.urls.rpc,c.chainId,{staticNetwork:true});
const network=await fetch(c.urls.app+'/api/network').then(r=>r.json());check('recording chain and role identity',network.chainId===c.chainId&&network.roleAddresses.owner[0].toLowerCase()===c.wallets.owner.address.toLowerCase());
const session=JSON.parse(readFileSync(join(run,'session-info.json'),'utf8'));
const state=JSON.parse(readFileSync(join(run,'final-state.json'),'utf8'));
check('real station recorded replay',session.mode==='replay'&&session.station.every(s=>s.source==='replay'&&s.sourceHash));
check('sixty receipted periods and closed product',state.chain.phase==='4'&&state.receipts.length===60&&state.chain.feeMonths==='60');
check('no uncollected income, unpaid distributions or closing liabilities',state.income.every(i=>i.collected)&&['unpaidDistributions','feeLiability','expenseLiability','vaultCash'].every(k=>state.chain[k]==='0'));
check('financial time did not alter station evidence',session.station.every(before=>state.stations.some(after=>after.id===before.id&&after.observedAt===before.observedAt&&after.sourceHash===before.sourceHash)));
check('credential returned to its household wallet',state.applications.every(a=>a.chainAdmission.released&&a.chainAdmission.currentOwner.toLowerCase()===a.owner.toLowerCase()));
check('two different trustees executed the snapshot case',state.cases.some(s=>s.executed));
const proofs=JSON.parse(readFileSync(join(run,'evidence.json'),'utf8'));
const transactions=proofs.flatMap(p=>p.transactions);
check('every recorded business transaction reconciles',transactions.length>400&&transactions.every(t=>t.matched&&t.status==='confirmed'));
check('transaction evidence contains no duplicate hashes',new Set(transactions.map(t=>t.hash.toLowerCase())).size===transactions.length);
check('each historical valuation retains its checked model inputs',transactions.filter(t=>['proposeValuation','approveValuation'].includes(t.method)).every(t=>t.valuationEvidence&&t.checks.some(c=>c.field==='archived aggregate report'&&c.matched)));
const events=transactions.flatMap(t=>t.events);
for(const item of state.cases){
 const approvals=events.filter(e=>e.name==='ServicingApproved'&&String(e.args.id)===String(item.id));
 check('case '+item.id+' threshold and two distinct trustee signatures',BigInt(item.support)*100n>=BigInt(item.supply)*30n&&new Set(approvals.map(e=>e.args.trustee.toLowerCase())).size===2&&approvals.some(e=>e.args.executed===true));
}
const unauthenticated=await fetch(c.urls.app+'/api/recording/operations/'+proofs[0].operationId);check('evidence is not public',unauthenticated.status===401);
let indexed=0;for(const tx of transactions){const receipt=await rpc.getTransactionReceipt(tx.hash);checkHash(receipt?.status===1&&receipt.blockNumber===tx.blockNumber,tx.hash);const response=await fetch(c.urls.explorer+'/api/v2/transactions/'+tx.hash);checkHash(response.ok,tx.hash);const data=await response.json();checkHash(data.hash.toLowerCase()===tx.hash.toLowerCase()&&data.from.hash.toLowerCase()===tx.from.toLowerCase(),tx.hash);indexed++;}
function checkHash(pass,hash){if(!pass)throw Error('Historical receipt / Blockscout mismatch '+hash);}
check('all historical receipts still exist and are indexed',indexed===transactions.length);
const system=await systemEvidence(c,run);check('deployment and all six faucets reconcile separately',system.length===16&&system.every(t=>t.matched));
for(const [kind,address]of Object.entries(session.manifest.addresses)){const r=await fetch(c.urls.explorer+'/api/v2/smart-contracts/'+address);const data=await r.json();check(kind+' verified source and ABI',r.ok&&Array.isArray(data.abi)&&data.abi.length>0&&!!data.source_code);}
if(delivery){for(const suffix of ['1440p','1080p']){const path=join(delivery,'Deye-RWA-完整演示-'+suffix+'.mp4');const probe=spawnSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_streams','-show_format','-of','json',path],{encoding:'utf8'});const data=JSON.parse(probe.stdout),video=data.streams.find(s=>s.codec_type==='video'),audio=data.streams.find(s=>s.codec_type==='audio');check(suffix+' H.264/AAC, 30 fps, 15–20 minutes',video.codec_name==='h264'&&video.r_frame_rate==='30/1'&&video.height===(suffix==='1440p'?1440:1080)&&audio.codec_name==='aac'&&Number(data.format.duration)>=900&&Number(data.format.duration)<=1200);}check('script, captions and evidence list exist',['中文字幕.srt','中文讲稿.md','交易核对清单.json','交易核对清单.html'].every(f=>existsSync(join(delivery,f))));}
report.transactions=transactions.length;report.systemTransactions=system.length;report.source=session.station;report.network={chainId:c.chainId,urls:c.urls};
writeFileSync(join(delivery||run,'validation.json'),JSON.stringify(report,null,2));
console.log('Validation completed:',transactions.length,'business transactions');
