import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,closeSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),dir=resolve(process.env.REVENUE_UNIFIED_DATA_DIR||join(root,'.data/unified-app'));
const file=join(dir,'config.json');
function save(name,value){writeFileSync(join(dir,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});}
const read=()=>JSON.parse(readFileSync(file));
function pid(name){try{return JSON.parse(readFileSync(join(dir,name))).pid;}catch{return null;}}
function running(p){if(!p)return false;try{process.kill(p,0);return true;}catch{return false;}}
function stop(){const p=pid('process.json');if(running(p))process.kill(p,'SIGTERM');}
async function start(){
 if(running(pid('process.json')))throw Error('Unified gateway already running');
 const c=read();
 for(const n of c.networks){let healthy=false;for(let i=0;i<60;i++){try{const r=await fetch(n.upstream+'/api/network',{signal:AbortSignal.timeout(5000)});if(r.ok&&(await r.json()).chainId===n.chainId){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}if(!healthy)throw Error('Backend network mismatch or unavailable: '+n.id);}
 const fd=openSync(join(dir,'gateway.log'),'a',0o600),child=spawn(process.execPath,[join(root,'infra/multinetwork/gateway.mjs'),file],{detached:true,stdio:['ignore',fd,fd]});child.unref();closeSync(fd);save('process.json',{pid:child.pid});
 for(let i=0;i<30;i++){try{const r=await fetch('http://127.0.0.1:'+c.port+'/networks.json');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Unified gateway did not start; inspect its private log');
}
function publishConfig(c){save('public.json',{version:1,app:c.publicApp,networks:c.networks.map(({id,chainId,label})=>({id,chainId,label})),updatedAt:new Date().toISOString()});}
async function init(){
 if(existsSync(file))throw Error('Existing configuration must be reused');
 mkdirSync(dir,{recursive:true,mode:0o700});
 const remote=process.env.REVENUE_UNIFIED_REMOTE_DIR,base=process.env.BASE_SEPOLIA_DATA_DIR;
 if(!remote||!base)throw Error('Set explicit existing private-demo and Base Sepolia data directories');
 const c={port:4196,origins:['http://127.0.0.1:4196'],publicReadOrigins:['https://mengzhon001.github.io'],assets:join(root,'ui/public/revenue'),site:join(root,'ui/unified-dist'),networks:[
  {id:'private',chainId:20261008,label:{zh:'私有演示链',en:'Private demo'},upstream:'http://127.0.0.1:4178',cookieName:'revenue_session_4178',envFile:join(remote,'environment.env'),composeFile:join(remote,'compose.json'),project:'deye-rwa-remote'},
  {id:'base-sepolia',chainId:84532,label:{zh:'Base Sepolia',en:'Base Sepolia'},upstream:'http://127.0.0.1:4194',cookieName:'revenue_session_4194',envFile:join(base,'environment.env'),composeFile:join(base,'compose.json'),project:'deye-base-sepolia-test'}]};
 save('config.json',c);console.log('Prepared a shared gateway; no chain or business data was changed.');
}
function applyOrigins(c){
 for(const n of c.networks){
  const compose=JSON.parse(readFileSync(n.composeFile));
  const inCompose=typeof compose.services.app.environment?.REVENUE_ALLOWED_ORIGINS==='string';
  const target=inCompose?n.composeFile:n.envFile;
  let text=readFileSync(target,'utf8');const original=text;
  const current=inCompose?compose.services.app.environment.REVENUE_ALLOWED_ORIGINS:text.match(/^REVENUE_ALLOWED_ORIGINS=(.*)$/m)?.[1];
  if(!current)throw Error('Missing existing origin allowlist');
  const origins=[...new Set([...current.split(','),...c.origins])];
  if(inCompose){compose.services.app.environment.REVENUE_ALLOWED_ORIGINS=origins.join(',');text=JSON.stringify(compose,null,2)+'\n';}
  else text=text.replace(/^REVENUE_ALLOWED_ORIGINS=.*$/m,'REVENUE_ALLOWED_ORIGINS='+origins.join(','));

  const backup=join(dir,n.id+'.environment.before.private.json');if(!existsSync(backup))writeFileSync(backup,JSON.stringify({target,contents:original}),{mode:0o600});
  writeFileSync(target,text,{mode:0o600});
  const result=spawnSync('docker-compose',['--env-file',n.envFile,'-p',n.project,'-f',n.composeFile,'up','-d','--no-build','--no-deps','--force-recreate','app'],{stdio:'inherit'});if(result.status!==0)throw Error('Could not reload backend origin configuration');
 }
}
async function tunnel(){
 if(running(pid('tunnel.json')))throw Error('The unified tunnel is already running');
 const binary=process.env.BASE_CLOUDFLARED;if(!binary)throw Error('Set BASE_CLOUDFLARED to the local cloudflared executable');
 const fd=openSync(join(dir,'tunnel.log'),'w',0o600),child=spawn(binary,['tunnel','--url','http://127.0.0.1:4196','--no-autoupdate'],{detached:true,stdio:['ignore',fd,fd]});child.unref();closeSync(fd);save('tunnel.json',{pid:child.pid});
 let app;for(let i=0;i<60;i++){app=readFileSync(join(dir,'tunnel.log'),'utf8').match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];if(app)break;await new Promise(r=>setTimeout(r,500));}if(!app)throw Error('Tunnel hostname unavailable');
 const c=read();c.publicApp=app;c.origins=[...new Set([...c.origins,app])];save('config.json',c);applyOrigins(c);stop();await new Promise(r=>setTimeout(r,500));await start();publishConfig(c);console.log(app+'/app/');
}
const command=process.argv[2]||'status';
try{
 if(command==='init')await init();
 else if(command==='start'){const c=read();applyOrigins(c);await start();}
 else if(command==='tunnel')await tunnel();
 else if(command==='stop'){stop();const p=pid('tunnel.json');if(running(p))process.kill(p,'SIGTERM');}
 else if(command==='status'){const c=read();console.log(JSON.stringify({running:running(pid('process.json')),tunnel:running(pid('tunnel.json')),app:c.publicApp||'http://127.0.0.1:'+c.port,networks:c.networks.map(n=>({id:n.id,chainId:n.chainId}))}));}
 else throw Error('Commands: init, start, tunnel, status, stop');
}catch(e){console.error(e.message);process.exitCode=1;}
