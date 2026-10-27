#!/usr/bin/env node
// Explicit, loopback-only maintenance. Reads existing demo identities; never modifies remote files/services.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync,cpSync,renameSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {Wallet,HDNodeWallet,JsonRpcProvider,getAddress} from 'ethers';
import {root,dir,urls,chainId,project,guard,archive,init} from './revenue-guidance-local.mjs';
export const sharedRoles=['owner','agent','trustee','trustee2'];
export function alignRoleConfig(local,source,expected){
 const wallets={...local.wallets};
 for(const role of sharedRoles){
  const wallet=source.wallets?.[role];
  assert(wallet?.phrase&&wallet?.address,'Missing source demo role');
  const address=HDNodeWallet.fromPhrase(wallet.phrase).address;
  assert.equal(address,getAddress(wallet.address),'Source key/address mismatch');
  assert.equal(address,getAddress(expected[role]),'Source role differs from deployed configuration');
  wallets[role]={phrase:wallet.phrase,address};
 }
 assert.equal(new Set(sharedRoles.map(r=>wallets[r].address.toLowerCase())).size,4,'Roles must remain distinct');
 return {...local,wallets,roleIdentitySource:'shared-demo-roles.v1'};
}
const save=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2),{mode:0o600});
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
function recreateApp(){
 const p=spawnSync('docker-compose',['-p',project,'--env-file',join(dir,'environment.env'),'-f',join(dir,'compose.json'),'up','-d','--no-deps','--force-recreate','--wait','--wait-timeout','180','app'],{cwd:root,stdio:'inherit'});
 if(p.status!==0)throw Error('Local app recreation failed');
}
async function main(){
 guard();const provider=new JsonRpcProvider(urls.rpc);
 try{
  assert.equal(Number(BigInt(await provider.send('eth_chainId',[]))),chainId);
  const sourceDir=join(root,'.data/remote-demo'),sourceFiles=['private.json','public.json','environment.env','compose.json'];
  const sourceHashes=Object.fromEntries(sourceFiles.map(f=>[f,hash(join(sourceDir,f))]));
  const localFile=join(dir,'private.json'),file=join(dir,'role-alignment.json');
  const source=JSON.parse(readFileSync(join(sourceDir,'private.json'))),pub=JSON.parse(readFileSync(join(sourceDir,'public.json')));
  const desired=alignRoleConfig(JSON.parse(readFileSync(localFile)),source,pub.accounts);
  let plan=existsSync(file)?JSON.parse(readFileSync(file)):null;
  if(plan?.completed){
   const net=await fetch(urls.app+'/api/network').then(r=>r.json());
   for(const r of sharedRoles)assert(net.roleAddresses[r.startsWith('trustee')?'trustee':r].includes(desired.wallets[r].address));
   console.log('Role addresses are already aligned; no reset performed.');return;
  }
  async function request(path,body,secret,vault){
   const headers={Origin:urls.app,'Content-Type':'application/json',...(secret?{Cookie:secret}:{}),...(vault?{'X-Revenue-Product':vault}:{})};
   const r=await fetch(urls.app+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
   const value=await r.json();if(!r.ok)throw Error(path+': '+(value.error||r.status));
   return {value,cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  async function login(key){const w=new Wallet(key),c=(await request('/api/auth/challenge',{address:w.address,requestedRole:'agent'})).value;return(await request('/api/auth/verify',{nonce:c.nonce,signature:await w.signMessage(c.message)})).cookie;}
  if(!plan){
   const oldKeys=JSON.parse(readFileSync(join(dir,'wallet-import.private.json'))),cookie=await login(oldKeys.agent.privateKey);
   const primary=(await request('/api/state',undefined,cookie)).value;
   const rows=(await request('/api/products?status=all',undefined,cookie)).value.products;
   const vaults=[...new Set([...rows.map(p=>p.vault),primary.manifest.addresses.vault])];
   const scenes=[];
   for(const vault of vaults){
    const s=(await request('/api/state',undefined,cookie,vault)).value;
    assert.equal(s.chain.totalSupply,'0','Issued products require a separate migration');
    assert.equal(s.chain.totalSubscriptions,'0','Outstanding subscriptions must not be reset');
    assert(!s.operations.some(o=>o.status!=='confirmed'&&Object.values(o.steps).some(t=>t.status==='sent')),'Resolve pending transactions first');
    if(vault===primary.manifest.addresses.vault)assert.equal(s.applications.length,0,'Do not replace a nonempty issuance scene');
    scenes.push({expectedVault:vault,idempotencyKey:randomUUID(),confirmation:'RESET_DEMO',primary:vault===primary.manifest.addresses.vault});
   }
   const backup=await archive();
   for(const name of ['private.json','wallet-import.private.json','environment.env','compose.json','experience-product.json'])if(existsSync(join(dir,name)))cpSync(join(dir,name),join(backup,name));
   plan={version:1,chainId,backup,sourceHashes,scenes,startedAt:new Date().toISOString()};save(file,plan);
  }
  // Keep the independent system mnemonic, investors, database and chain unchanged.
  save(localFile,desired);init();
  if(!plan.configured){
   for(const role of sharedRoles){const profile=join(dir,'profiles/rabby',role);if(existsSync(profile)){
    const target=join(plan.backup,'previous-role-profiles');mkdirSync(target,{recursive:true,mode:0o700});renameSync(profile,join(target,role));
   }}
   recreateApp();plan.configured=true;save(file,plan);
  }
  const previous=JSON.parse(readFileSync(join(plan.backup,'wallet-import.private.json')));
  for(const scene of plan.scenes.sort((a,b)=>Number(a.primary)-Number(b.primary))){
   if(scene.result)continue;
   let cookie;try{cookie=await login(previous.agent.privateKey);}catch{cookie=await login(HDNodeWallet.fromPhrase(desired.wallets.agent.phrase).privateKey);}
   // If interrupted after the response, the primary may have changed already. Resolve via persisted idempotency key.
   const selected=scene.primary?undefined:(await request('/api/products/create',{idempotencyKey:'guidance-experience-current',kind:'experience',demoAcknowledged:true},cookie)).value.vault;
   const result=(await request('/api/demo/reset',scene,cookie,selected)).value.result;
   scene.result=result;save(file,plan);console.log('Replaced only local '+(scene.primary?'empty issuance':'unsubscribed experience')+' scene: '+result.vault);
  }
  for(const name of sourceFiles)assert.equal(hash(join(sourceDir,name)),sourceHashes[name],'Remote configuration must stay unchanged');
  plan.completed=true;plan.completedAt=new Date().toISOString();save(file,plan);
  console.log('Local identities aligned; chain history, replay evidence and investor identities retained. Run guidance:provision to publish the refreshed experience product.');
 }finally{provider.destroy();}
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname)main().catch(e=>{console.error(e.shortMessage||e.message);process.exitCode=1;});
