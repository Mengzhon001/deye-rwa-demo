import {readFileSync,existsSync,mkdirSync,writeFileSync,createWriteStream} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {base} from './environment.mjs';
const versions=JSON.parse(readFileSync(new URL('./versions.json',import.meta.url),'utf8'));
const dir=join(base,'tools');mkdirSync(dir,{recursive:true});
const zip=join(dir,versions.metamask.asset),extension=join(dir,'metamask-'+versions.metamask.version);
if(!existsSync(zip)){
 const url=`https://github.com/MetaMask/metamask-extension/releases/download/v${versions.metamask.version}/${versions.metamask.asset}`;
 const response=await fetch(url);if(!response.ok)throw Error('Official MetaMask download failed');
 writeFileSync(zip,Buffer.from(await response.arrayBuffer()),{mode:0o600});
}
if(createHash('sha256').update(readFileSync(zip)).digest('hex')!==versions.metamask.sha256)throw Error('Official extension checksum mismatch');
if(!existsSync(join(extension,'manifest.json'))){mkdirSync(extension,{recursive:true});if(spawnSync('/usr/bin/unzip',['-q',zip,'-d',extension],{stdio:'inherit'}).status)throw Error('Unzip failed');}
for(const tool of ['ffmpeg','ffprobe']){const result=spawnSync('/opt/homebrew/bin/'+tool,['-version'],{encoding:'utf8'});if(result.status||!result.stdout.includes(versions.ffmpeg))throw Error(`Install the pinned ${tool} ${versions.ffmpeg} version before recording`);}
const voices=spawnSync('/usr/bin/say',['-v','?'],{encoding:'utf8'});if(!voices.stdout.includes('Tingting'))throw Error('Install the macOS Mandarin Tingting voice before recording');
console.log('Verified official MetaMask archive, FFmpeg, FFprobe and Tingting. Wallet setup is performed separately without capture.');
