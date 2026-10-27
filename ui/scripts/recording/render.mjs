import {readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {story} from './story.mjs';
const run=resolve(process.argv[2]||''),out=resolve(process.argv[3]||join(run,'delivery'));mkdirSync(out,{recursive:true});
const finished=JSON.parse(readFileSync(join(run,'run.json'),'utf8'));if(finished.stage!=='recording'||!finished.record||finished.status!=='complete')throw Error('Only a complete, clean formal recording can be rendered for delivery');
const validation=JSON.parse(readFileSync(join(run,'validation.json'),'utf8'));if(!validation.checks.some(c=>c.label==='all historical receipts still exist and are indexed'&&c.passed)||validation.checks.some(c=>!c.passed))throw Error('Run the independent chain validator before rendering');
const finalState=JSON.parse(readFileSync(join(run,'final-state.json'),'utf8'));if(finalState.chain.phase!=='4'||finalState.receipts.length!==60)throw Error('The full lifecycle is incomplete');
const ff='/opt/homebrew/bin/ffmpeg',probe='/opt/homebrew/bin/ffprobe';
const timeline=readFileSync(join(run,'timeline.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const video=readFileSync(join(run,'main-video.txt'),'utf8').trim();
function command(bin,args){const r=spawnSync(bin,args,{encoding:'utf8',maxBuffer:8*1024*1024});if(r.status!==0)throw Error(bin+': '+r.stderr.slice(-2200));return r.stdout;}
const duration=file=>Number(JSON.parse(command(probe,['-v','error','-show_entries','format=duration','-of','json',file])).format.duration);
const q=path=>"'"+path.replaceAll("'","'\\''")+"'";
const stamp=n=>{const ms=Math.round(n*1000);return`${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
function range(key){if(key==='remaining-periods')return [range('month-10-advance')[0],range('month-60-post-distribution-approve')[1]];if(key==='final-claims'){const starts=timeline.filter(e=>e.type==='step-start'&&/final-claim/.test(e.key));const ends=timeline.filter(e=>e.type==='step-end'&&/final-claim/.test(e.key));return[starts[0].seconds,ends.at(-1).seconds];}const start=timeline.find(e=>e.type==='step-start'&&e.key===key),end=timeline.find(e=>e.type==='step-end'&&e.key===key);if(!start||!end)throw Error('Incomplete recording step '+key);return[start.seconds,end.seconds];}
function excerptKeys(key){
 if(key==='remaining-periods')return[12,24,36,48].map(n=>`month-${n}-distribution`).concat('month-60-post-distribution-approve');
 if(key==='final-claims')return ['investor','investor2'].flatMap(role=>{const keys=timeline.filter(e=>e.type==='step-start'&&e.key.startsWith(role+'-final-claim-')).map(e=>e.key);return[keys[0],keys.at(-1)];});
 return[key];
}
const evidence=JSON.parse(readFileSync(join(run,'evidence.json'),'utf8'));
function transactionNote(key){
 if(['remaining-periods','final-claims'].includes(key))return '';
 const [a,b]=range(key),marker=timeline.find(t=>t.type==='proof'&&t.seconds>=a&&t.seconds<=b),op=evidence.find(e=>e.operationId===marker?.operationId);if(!op)return '';
 const tx=op.transactions.at(-1);if(!tx)return '';
 const e=name=>tx.events.find(e=>e.name===name)?.args;
 const n=v=>(Number(v)/1e6).toLocaleString('en-US',{maximumFractionDigits:6});
 if(tx.method==='subscribe')return `本步核对：认购 ${n(tx.parameters.amount)} USDC；先授权，再托管`;
 if(e('Refunded'))return `本步核对：退款 ${n(e('Refunded').amount)} USDC；不发行份额`;
 if(e('ProductSettled')){const v=e('ProductSettled');return `结算核对：募集 ${n(v.raised)} USDC · 留存 ${n(v.reserve)} USDC · 发行 ${n(v.supply)} DRS`;}
 if(e('StationAdmitted'))return `本步核对：收益权收购价 ${n(e('StationAdmitted').purchasePrice)} USDC；协议以上链摘要对应`;
 if(e('RevenueReceived'))return `本步核对：模拟回款 ${n(e('RevenueReceived').amount)} USDC；对应本期应收款`;
 if(e('DistributionClaimed')){const v=e('DistributionClaimed');return `本步核对：领取 ${n(v.amount)} USDC · 分配编号 ${v.id}`;}
 if(e('DistributionDeclared')){const v=e('DistributionDeclared');return `本步核对：${key==='close'?'到期最终':'季度'}分配 ${n(v.amount)} USDC · 分配编号 ${v.id}`;}
 if(e('RedemptionFilled')){const v=e('RedemptionFilled');return `本步核对：赎回成交 ${n(v.shares)} DRS · 实际支付 ${n(v.amount)} USDC`;}
 if(tx.parameters.shares&&tx.parameters.payment)return `本步核对：转让 ${n(tx.parameters.shares)} DRS · 协商付款 ${n(tx.parameters.payment)} USDC`;
 if(tx.method==='requestRedemption')return `本步核对：申请赎回 ${n(tx.parameters.shares)} DRS；付款前仅托管、不销毁`;
 return '';
}
const rendererDigest=createHash('sha256').update(readFileSync(new URL(import.meta.url))).update(readFileSync(new URL('./caption.py',import.meta.url))).digest('hex');
const parts=[],subtitles=[],edits=[],script=[];let cursor=0;
for(let i=0;i<story.length;i++){
 const [key,chapter,target,text]=story[i],dir=join(out,'chapters',String(i+1).padStart(2,'0')+'-'+key);mkdirSync(dir,{recursive:true});
 const renderKey=createHash('sha256').update(JSON.stringify({version:5,rendererDigest,run,video,videoSize:statSync(video).size,videoModified:statSync(video).mtimeMs,range:range(key),key,target,text,voice:'Tingting/185'})).digest('hex');
 const cache=join(dir,'render-cache.json');
 if(!existsSync(cache)||JSON.parse(readFileSync(cache,'utf8')).key!==renderKey){for(const name of ['scene.mp4','narration.wav'])if(existsSync(join(dir,name)))unlinkSync(join(dir,name));}
 const sentences=text.match(/[^。！？]+[。！？]?/g)||[text];let local=0;const images=[],audioList=[];const captions=[];
 for(let j=0;j<sentences.length;j++){
  const sentence=sentences[j],speech=join(dir,j+'.aiff'),input=join(dir,j+'.txt');
  if(existsSync(input)&&readFileSync(input,'utf8')!==sentence&&existsSync(speech))unlinkSync(speech);
  writeFileSync(input,sentence);
  if(!existsSync(speech))command('/usr/bin/say',['-v','Tingting','-r','185','-f',input,'-o',speech]);
  const seconds=duration(speech),path=join(dir,j+'.png');images.push({text:sentence,path});audioList.push(`file ${q(speech)}`);captions.push(`file ${q(path)}\nduration ${seconds.toFixed(6)}`);
  subtitles.push({start:cursor+local,end:cursor+local+seconds,text:sentence});local+=seconds;
 }
 const seconds=Math.ceil(Math.max(target,local+1)*30)/30,audio=join(dir,'narration.wav'),part=join(dir,'scene.mp4');
 writeFileSync(join(dir,'audio.ffconcat'),audioList.join('\n'));writeFileSync(join(dir,'captions.json'),JSON.stringify(images));
 command('python3',[new URL('./caption.py',import.meta.url).pathname,join(dir,'captions.json')]);
 captions.push(`file ${q(images.at(-1).path)}\nduration ${(seconds-local).toFixed(6)}`,`file ${q(images.at(-1).path)}`);writeFileSync(join(dir,'captions.ffconcat'),captions.join('\n'));
 if(!existsSync(audio))command(ff,['-v','error','-y','-f','concat','-safe','0','-i',join(dir,'audio.ffconcat'),'-af',`apad=whole_dur=${seconds}`,'-t',String(seconds),'-ar','44100','-ac','2',audio]);
 const [start,end]=range(key),sourceLength=end-start,compression=sourceLength>seconds?sourceLength/seconds:1;
 let sourceVideo=video,seek=start,clipLength=sourceLength,speed=1/compression,hold=Math.max(0,seconds-sourceLength);
 const slices=[];const excerpts=excerptKeys(key);
 if(excerpts.length>1){
  const each=seconds/excerpts.length,clips=[];
  for(const [n,piece]of excerpts.entries()){
   const [a,b]=range(piece),length=b-a,ratio=Math.max(1,length/each),path=join(dir,'excerpt-'+n+'.mp4'),label=join(dir,'excerpt-'+n+'.png');
   const title=piece.startsWith('month-')?`演示财务时间推进 · 第 ${piece.split('-')[1]} / 60 期 · 重复运营操作节选`:`${piece.startsWith('investor2')?'投资者 B':'投资者 A'} · 领取分配编号 ${piece.split('-').at(-1)} · 重复领取操作节选`;
   writeFileSync(join(dir,'excerpt-label.json'),JSON.stringify([{text:title,path:label,banner:true}]));command('python3',[new URL('./caption.py',import.meta.url).pathname,join(dir,'excerpt-label.json')]);
   command(ff,['-v','error','-y','-ss',String(a),'-t',String(length),'-i',video,'-loop','1','-i',label,'-filter_complex',`[0:v]setpts=(PTS-STARTPTS)/${ratio},fps=30,scale=2560:1440,setsar=1,tpad=stop_mode=clone:stop_duration=${Math.max(0,each-length)}[v];[v][1:v]overlay=0:1220,format=yuv420p[out]`,'-map','[out]','-t',String(each),'-an','-c:v','libx264','-preset','veryfast','-crf','21','-threads','4',path]);
   clips.push(path);slices.push({key:piece,sourceStart:a,sourceEnd:b,outputStart:n*each,compression:ratio});
  }
  writeFileSync(join(dir,'excerpts.ffconcat'),clips.map(p=>'file '+q(p)).join('\n'));sourceVideo=join(dir,'excerpts.mp4');command(ff,['-v','error','-y','-f','concat','-safe','0','-i',join(dir,'excerpts.ffconcat'),'-c','copy',sourceVideo]);seek=0;clipLength=duration(sourceVideo);speed=1;hold=0;
 }else slices.push({key,sourceStart:start,sourceEnd:end,outputStart:0,compression});
 const badge=join(dir,'edit-label.png');writeFileSync(join(dir,'edit-label.json'),JSON.stringify([{path:badge,badge:true,text:excerpts.length>1?'重复操作节选 · 完整记录可复核':compression>1.02?`录制画面 ${compression.toFixed(1)} 倍速 · 操作顺序保留`:''}]));command('python3',[new URL('./caption.py',import.meta.url).pathname,join(dir,'edit-label.json')]);
 const metric=join(dir,'transaction-note.png');writeFileSync(join(dir,'transaction-note.json'),JSON.stringify([{path:metric,metric:true,text:transactionNote(key)}]));command('python3',[new URL('./caption.py',import.meta.url).pathname,join(dir,'transaction-note.json')]);
 // Keep the recorded task/next-actor row. Replace only its lower annotation
 // area so the original live caption cannot peek out behind the final voiceover.
 const filter=`[0:v]setpts=(PTS-STARTPTS)*${speed},fps=30,scale=2560:1440,setsar=1,tpad=stop_mode=clone:stop_duration=${hold},drawbox=x=0:y=1278:w=2560:h=162:color=0x102834:t=fill[v];[2:v]fps=30,format=rgb24[s];[v][s]overlay=0:1320:eof_action=repeat[c];[c][3:v]overlay=1910:76:eof_action=repeat[b];[b][4:v]overlay=52:1278:eof_action=repeat,format=yuv420p[out]`;
 if(!existsSync(part))command(ff,['-v','error','-y','-ss',String(seek),'-t',String(clipLength),'-i',sourceVideo,'-i',audio,'-f','concat','-safe','0','-i',join(dir,'captions.ffconcat'),'-loop','1','-i',badge,'-loop','1','-i',metric,'-filter_complex',filter,'-map','[out]','-map','1:a','-t',String(seconds),'-c:v','libx264','-preset','veryfast','-crf','21','-threads','4','-c:a','aac','-b:a','128k','-af','loudnorm=I=-16:TP=-1.5:LRA=7','-ar','48000','-movflags','+faststart',part]);
 writeFileSync(cache,JSON.stringify({key:renderKey}));
 const renderedDuration=duration(part);parts.push(part);edits.push({key,chapter,start:cursor,end:cursor+renderedDuration,sourceStart:start,sourceEnd:end,compression,hold,slices});script.push(`## ${stamp(cursor).slice(0,8)} ${chapter} · ${key}\n\n${text}\n`);cursor+=renderedDuration;console.log(`Rendered ${i+1}/${story.length}: ${key}, ${seconds.toFixed(1)}s`);
}
if(cursor<900||cursor>1200)throw Error(`The edit is ${cursor.toFixed(1)} seconds; adjust pacing to 15–20 minutes before delivery`);
writeFileSync(join(out,'edit-index.json'),JSON.stringify(edits,null,2));writeFileSync(join(out,'中文字幕.srt'),subtitles.map((s,i)=>`${i+1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.text}\n`).join('\n'));writeFileSync(join(out,'中文讲稿.md'),'# 太阳能收益权平台全流程演示\n\n'+script.join('\n'));
writeFileSync(join(out,'parts.ffconcat'),parts.map(p=>'file '+q(p)).join('\n'));
const chapters=edits.filter((e,i)=>i===0||edits[i-1].chapter!==e.chapter);writeFileSync(join(out,'chapters.ffmeta'),';FFMETADATA1\n'+chapters.map((e,i)=>`[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(e.start*1000)}\nEND=${Math.round((chapters[i+1]?.start||cursor)*1000)}\ntitle=${e.chapter}`).join('\n'));
const master=join(out,'Deye-RWA-完整演示-1440p.mp4');command(ff,['-v','error','-y','-f','concat','-safe','0','-i',join(out,'parts.ffconcat'),'-f','ffmetadata','-i',join(out,'chapters.ffmeta'),'-map_metadata','1','-map_chapters','1','-c','copy','-movflags','+faststart',master]);
const chapterDir=join(out,'分章节视频');mkdirSync(chapterDir,{recursive:true});
for(const chapter of chapters){const selected=parts.filter((_,i)=>edits[i].chapter===chapter.chapter),list=join(chapterDir,chapter.chapter.replace(' · ','-')+'.ffconcat');writeFileSync(list,selected.map(p=>'file '+q(p)).join('\n'));command(ff,['-v','error','-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',list.replace('.ffconcat','.mp4')]);}
command(ff,['-v','error','-y','-i',master,'-vf','scale=1920:1080','-r','30','-c:v','libx264','-crf','23','-preset','veryfast','-threads','4','-c:a','copy','-movflags','+faststart',join(out,'Deye-RWA-完整演示-1080p.mp4')]);
writeFileSync(join(out,'业务步骤核对.json'),JSON.stringify(evidence.map(e=>({operationId:e.operationId,action:e.action,actor:e.actor,status:e.status,offchain:e.offchain,businessReferences:e.businessReferences,transactions:e.transactions.map(t=>({hash:t.hash,matched:t.matched,url:t.explorerUrl}))})),null,2));
const mapping=timeline.filter(e=>e.type==='proof');
const rows=[];
for(const op of evidence)for(const tx of op.transactions){
 const view=timeline.find(e=>e.type==='transaction-view'&&e.hash===tx.hash&&e.phase==='summary');
 const event=view||mapping.find(e=>e.operationId===op.operationId);
 const edit=edits.find(e=>event&&event.seconds>=e.sourceStart&&event.seconds<=e.sourceEnd);
 const reference=edit||[...edits].reverse().find(e=>event&&e.sourceStart<=event.seconds);
 const slice=edit?.slices.find(s=>event&&event.seconds>=s.sourceStart&&event.seconds<=s.sourceEnd);
 const videoTime=edit&&event&&slice?stamp(edit.start+slice.outputStart+(event.seconds-slice.sourceStart)/slice.compression).slice(0,8):stamp(reference?.start||0).slice(0,8);
 const kind=edit&&view&&slice?'visible':slice&&['remaining-periods','final-claims'].includes(edit.key)?'accelerated':'chapter-reference';
 rows.push({chapter:reference?.chapter||'补充完整记录',videoTime,videoTimeKind:kind,action:op.action,operationId:op.operationId,method:tx.method,hash:tx.hash,from:tx.from,to:tx.to,block:tx.blockNumber,matched:tx.matched,url:tx.explorerUrl,businessReferences:op.businessReferences,movements:tx.movements,chainId:tx.chainId,status:tx.status,indexedAtCapture:tx.indexed,indexedAtFinalValidation:true,parameters:tx.parameters,events:tx.events,stateChanges:tx.stateChanges,checks:tx.checks});
}
const system=JSON.parse(readFileSync(join(run,'system-evidence.json'),'utf8'));
for(const tx of system){
 const edit=edits.find(e=>tx.role&&e.key==='faucet-'+tx.role);
 rows.push({chapter:tx.kind==='deployment'?'录制前的环境部署':'01 · 项目与角色',videoTime:edit?stamp(edit.start).slice(0,8):tx.kind==='deployment'?'录制前':'00:00:00',videoTimeKind:edit?'chapter-reference':tx.kind==='deployment'?'setup':'chapter-reference',action:tx.kind,operationId:null,method:tx.method,hash:tx.hash,from:tx.from,to:tx.to||tx.recipient,block:tx.blockNumber,matched:tx.matched,url:tx.url,businessReferences:{role:tx.role,recipient:tx.recipient,checks:tx.checks},movements:tx.asset?[{asset:tx.asset,amount:tx.amount,decimals:tx.decimals,recipient:tx.recipient}]:[]});
}
writeFileSync(join(out,'系统部署与测试资金.json'),JSON.stringify(system,null,2));
writeFileSync(join(out,'交易核对清单.json'),JSON.stringify(rows,null,2));const escape=x=>String(x??'未单独展示').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
writeFileSync(join(out,'交易核对清单.html'),`<!doctype html><meta charset="utf-8"><title>全流程演示交易核对清单</title><style>body{font:15px -apple-system,'PingFang SC',sans-serif;margin:36px;color:#182d39}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:10px;text-align:left;vertical-align:top}code{font-size:12px;overflow-wrap:anywhere}details{max-width:550px}a{color:#166886}</style><h1>演示交易核对清单</h1><p>全部 ${rows.length} 笔业务与系统交易均保留回执核对结果。重复期间节选展示，未单独停留的交易列在完整记录中。浏览器链接连接保留的本地录制链。</p><table><tr><th>视频位置</th><th>业务操作</th><th>交易与区块</th><th>核对明细</th></tr>${rows.map(r=>`<tr><td>${escape(r.chapter)}<br>${escape(r.videoTime)}${r.videoTimeKind==='chapter-reference'?'<br><small>章节参考，未逐笔停留</small>':r.videoTimeKind==='accelerated'?'<br><small>重复期间节选展示</small>':r.videoTimeKind==='setup'?'<br><small>录制前完成的环境准备</small>':''}</td><td>${escape(r.action)}<br>${escape(r.method)}</td><td><a href="${escape(r.url)}"><code>${escape(r.hash)}</code></a><br>Block ${r.block}</td><td>${r.matched?'核对通过':'未通过'}<details><summary>地址、业务编号和转移记录</summary><pre style="white-space:pre-wrap">${escape(JSON.stringify({from:r.from,to:r.to,business:r.businessReferences,movements:r.movements,parameters:r.parameters,events:r.events,stateChanges:r.stateChanges,checks:r.checks},null,2))}</pre></details></td></tr>`).join('')}</table>`);
console.log(`DELIVERY ${out}: ${cursor.toFixed(1)}s, ${rows.length} transactions`);
