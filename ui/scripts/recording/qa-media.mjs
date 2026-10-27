import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';

const run=resolve(process.argv[2]||''),out=resolve(process.argv[3]||''),dir=join(out,'visual-qa');mkdirSync(dir,{recursive:true});
const edits=JSON.parse(readFileSync(join(out,'edit-index.json'),'utf8'));
const timeline=readFileSync(join(run,'timeline.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const ff='/opt/homebrew/bin/ffmpeg',video=join(out,'Deye-RWA-完整演示-1440p.mp4');
const call=(args)=>{const r=spawnSync(ff,args,{encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr);return r.stderr;};
const shots=[];
for(const edit of edits){
 const events=timeline.filter(t=>t.seconds>=edit.sourceStart&&t.seconds<=edit.sourceEnd);
 const selections=[['business',null],['wallet',events.find(t=>t.type==='scene'&&t.mode==='wallet')],['receipt',events.find(t=>t.type==='transaction-view'&&t.phase==='summary')],['event',events.find(t=>t.type==='transaction-view'&&t.phase==='events')]];
 for(const [kind,event]of selections){
  if(kind!=='business'&&!event)continue;
  const slice=event&&edit.slices.find(s=>event.seconds>=s.sourceStart&&event.seconds<s.sourceEnd);
  if(event&&!slice)continue;
  const at=event?Math.min(edit.end-.25,edit.start+slice.outputStart+(event.seconds-slice.sourceStart+1)/slice.compression):edit.start+Math.min(3,(edit.end-edit.start)/2);
  const name=edit.key+'-'+kind+'.png';
  call(['-v','error','-y','-ss',String(at),'-i',video,'-frames:v','1',join(dir,name)]);
  shots.push({key:edit.key,chapter:edit.chapter,kind,seconds:at,file:name});
 }
}
const time=s=>{const [h,m,seconds]=s.replace(',','.').split(':').map(Number);return h*3600+m*60+seconds;};
const subs=readFileSync(join(out,'中文字幕.srt'),'utf8').trim().split('\n\n').map(block=>{const lines=block.split('\n');const [a,b]=lines[1].split(' --> ');return {start:time(a),end:time(b),text:lines.slice(2).join(' ')};});
assert(subs.length>100&&subs.every((s,i)=>s.start>=0&&s.end>s.start&&s.end<=edits.at(-1).end+.05&&(!i||s.start>=subs[i-1].end-.01)),'Caption ordering or duration mismatch');
const audio=call(['-hide_banner','-i',video,'-vn','-af','volumedetect','-f','null','-']);
const levels={mean:audio.match(/mean_volume: ([\d.-]+) dB/)?.[1],max:audio.match(/max_volume: ([\d.-]+) dB/)?.[1]};
assert(Number(levels.mean)>-35&&Number(levels.max)<0,'Narration missing or clipping');
for(const name of ['Deye-RWA-完整演示-1440p.mp4','Deye-RWA-完整演示-1080p.mp4'])call(['-v','error','-i',join(out,name),'-f','null','-']);
writeFileSync(join(dir,'frames.json'),JSON.stringify(shots,null,2));
writeFileSync(join(out,'media-qa.json'),JSON.stringify({checkedAt:new Date().toISOString(),frames:shots.length,subtitles:subs.length,captionTiming:true,audioLevelsDb:levels,completeDecodingBothVersions:true},null,2));
console.log('Media checks passed:',shots.length,'review frames,',subs.length,'timed captions, both files decode completely.');
