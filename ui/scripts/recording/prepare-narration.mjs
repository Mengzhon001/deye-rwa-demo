import {mkdirSync,writeFileSync,existsSync,readFileSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {story} from './story.mjs';

const output=resolve(process.argv[2]||'.data/demo-recording/delivery');
let total=0;
for(let i=0;i<story.length;i++){
  const [key,,target,text]=story[i];
  const dir=join(output,'chapters',String(i+1).padStart(2,'0')+'-'+key);
  mkdirSync(dir,{recursive:true});
  let spoken=0;
  for(const [j,sentence] of (text.match(/[^。！？]+[。！？]?/g)||[text]).entries()){
    const input=join(dir,j+'.txt'),speech=join(dir,j+'.aiff');
    if(!existsSync(input)||readFileSync(input,'utf8')!==sentence){
      for(const file of [speech,join(dir,'narration.wav')])if(existsSync(file))unlinkSync(file);
    }
    writeFileSync(input,sentence);
    if(!existsSync(speech)){
      const result=spawnSync('/usr/bin/say',['-v','Tingting','-r','185','-f',input,'-o',speech],{encoding:'utf8'});
      if(result.status!==0)throw Error('Mandarin narration failed: '+result.stderr);
    }
    const result=spawnSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_entries','format=duration','-of','json',speech],{encoding:'utf8'});
    if(result.status!==0)throw Error('Could not measure speech');
    spoken+=Number(JSON.parse(result.stdout).format.duration);
  }
  const duration=Math.max(target,spoken+1);total+=duration;
  console.log(`${i+1}/${story.length} ${key}: ${duration.toFixed(1)} seconds`);
}
console.log(`Narrated edit: ${total.toFixed(1)} seconds (${(total/60).toFixed(2)} minutes)`);
if(total<900||total>1200)throw Error('Revise pacing before recording: delivery must be 15–20 minutes');
