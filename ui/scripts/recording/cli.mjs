import {prepare,docker,health,config} from './environment.mjs';
const [command='health',stage='rehearsal']=process.argv.slice(2);
if(command==='prepare')prepare(stage);
else if(command==='up'){prepare(stage);docker(stage,['up','-d','--build']);}
else if(command==='down')docker(stage,['down']);
else if(command==='logs')docker(stage,['logs','--tail','80','app']);
else if(command==='health')await health(stage);
else if(command==='fresh'){
 const {renameSync,mkdirSync,existsSync,readFileSync,writeFileSync,readdirSync}=await import('node:fs');
 const {join}=await import('node:path');const {base}=await import('./environment.mjs');
 const c=config(stage);if(existsSync(join(c.dir,'compose.yml')))docker(stage,['down']);
 const archive=join(base,'archives',stage+'-'+new Date().toISOString().replaceAll(':','-'));
 mkdirSync(join(base,'archives'),{recursive:true});renameSync(c.dir,archive);
 const compose=join(archive,'compose.yml');if(existsSync(compose))writeFileSync(compose,readFileSync(compose,'utf8').replaceAll(c.dir,archive),{mode:0o600});
 const runs=join(archive,'runs');if(existsSync(runs))for(const name of readdirSync(runs)){const video=join(runs,name,'main-video.txt');if(existsSync(video))writeFileSync(video,readFileSync(video,'utf8').replaceAll(c.dir,archive));}
 prepare(stage);console.log('Previous profiles, footage and Compose configuration archived at '+archive+'. Its Docker volumes are preserved.');
}
else if(command==='open'){const {spawnSync}=await import('node:child_process');spawnSync('open',[config(stage).urls.app]);}
else if(['wallets','rehearse','record','setup'].includes(command)){const {spawnSync}=await import('node:child_process');const {root}=await import('./environment.mjs');const script=command==='wallets'?'setup-wallets.mjs':command==='setup'?'setup.mjs':'scenario.mjs';const result=spawnSync(process.execPath,[new URL(script,import.meta.url).pathname,stage,...(['record','rehearse'].includes(command)?['full',...(command==='record'?['--record']:['--checks'])]:[])],{stdio:'inherit',env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:root+'/.data/playwright-browsers'}});process.exitCode=result.status??1;}
else throw Error('Commands: setup, prepare, fresh, up, down, logs, health, open, wallets, rehearse, record');
