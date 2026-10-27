import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,copyFileSync,mkdirSync,readdirSync,statSync,unlinkSync,createReadStream} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {root,config} from './environment.mjs';

const run=resolve(process.argv[2]||''),out=resolve(process.argv[3]||'');
const validation=JSON.parse(readFileSync(join(out,'validation.json'),'utf8'));
assert(validation.stage==='recording'&&validation.checks.every(c=>c.passed),'A validated formal recording is required');
const take=JSON.parse(readFileSync(join(run,'run.json'),'utf8'));
assert(take.record&&take.status==='complete'&&take.stage==='recording');
const required=['Deye-RWA-完整演示-1080p.mp4','Deye-RWA-完整演示-1440p.mp4','中文字幕.srt','中文讲稿.md','交易核对清单.html','交易核对清单.json','业务步骤核对.json','系统部署与测试资金.json','edit-index.json','validation.json','media-qa.json','visual-review.json','explorer-reopen-qa.json','persistence.json','交付说明.md','测试记录.md'];
for(const name of required)assert(existsSync(join(out,name)),'Missing '+name);
copyFileSync(join(root,'docs/revenue/demo-recording/README.zh.md'),join(out,'录制工具使用说明.md'));
copyFileSync(join(run,'deployments.json'),join(out,'合约部署信息.json'));
const session=JSON.parse(readFileSync(join(run,'session-info.json'),'utf8'));
writeFileSync(join(out,'电站证据索引.json'),JSON.stringify({mode:session.mode,station:session.station},null,2));
const captions=readFileSync(join(out,'中文字幕.srt'),'utf8');
assert(captions.includes('00:00:00,000 -->'));
const rows=JSON.parse(readFileSync(join(out,'交易核对清单.json'),'utf8'));
assert(rows.length===validation.transactions+validation.systemTransactions&&rows.every(t=>t.matched));
assert(new Set(rows.map(t=>t.hash.toLowerCase())).size===rows.length);

// An explicit allowlist keeps browser profiles, keys, raw API evidence and
// private environment files out of all delivery archives.
const revisionNames=['audio-revision.json','voice-qa.json','配音更新说明.md'].filter(n=>existsSync(join(out,n)));
const publicNames=[...required,'录制工具使用说明.md','合约部署信息.json','电站证据索引.json',...revisionNames];
const wallet=config('recording');
const secrets=[wallet.mnemonic,wallet.password,...Object.values(wallet.wallets).flatMap(w=>[w.mnemonic,w.phrase,w.privateKey,w.password])].filter(s=>typeof s==='string'&&s.length>8);
for(const name of publicNames.filter(n=>!n.endsWith('.mp4'))){
 const text=readFileSync(join(out,name),'utf8');
 assert(!secrets.some(s=>text.includes(s)),'Secret material found in a delivery file; details withheld');
}
const toolsDir=join(out,'tools','ui','scripts','recording');mkdirSync(toolsDir,{recursive:true});
const toolNames=readdirSync(new URL('.',import.meta.url)).filter(n=>/\.(mjs|py|html|json)$/.test(n)||n==='narration-requirements.txt');
for(const name of toolNames){const source=new URL(name,import.meta.url);assert(!secrets.some(s=>readFileSync(source,'utf8').includes(s)),'Secret material found in tool source; details withheld');copyFileSync(source,join(toolsDir,name));}
writeFileSync(join(out,'tools','README.zh.md'),'# 录制工具源码\n\n这些工具需要在本项目根目录中运行。请将 ui/scripts/recording 保持在项目的相同位置，并按随附的录制工具使用说明安装依赖和准备环境。此目录不是脱离应用与智能合约的独立业务系统。钱包由本机准备命令生成，包中不包含钱包、环境文件或原始电站接口文件。\n');
const zip=(name,files)=>{if(existsSync(join(out,name)))unlinkSync(join(out,name));const r=spawnSync('/usr/bin/zip',['-q','-0',join(out,name),...files],{cwd:out,encoding:'utf8'});assert(r.status===0,r.stderr);};
zip('Deye-RWA-演示视频与核对资料.zip',publicNames.filter(n=>!n.includes('1440p')));
const toolFiles=toolNames.map(n=>'tools/ui/scripts/recording/'+n).concat('tools/README.zh.md','录制工具使用说明.md');
zip('Deye-RWA-录制工具源码.zip',toolFiles);
const all=[...publicNames,'Deye-RWA-演示视频与核对资料.zip','Deye-RWA-录制工具源码.zip'];
const records=[];for(const name of all){const path=join(out,name),hash=createHash('sha256');for await(const data of createReadStream(path))hash.update(data);records.push({file:name,bytes:statSync(path).size,sha256:hash.digest('hex')});}
writeFileSync(join(out,'交付文件校验.json'),JSON.stringify({createdAt:new Date().toISOString(),files:records},null,2));
console.log('Packaged '+records.length+' explicitly selected delivery files; private profiles and evidence excluded.');
