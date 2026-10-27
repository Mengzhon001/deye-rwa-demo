import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Contract,JsonRpcProvider} from 'ethers';
import {root,dir,urls,chainId,guard} from '../../scripts/revenue-guidance-local.mjs';
import {sharedRoles} from '../../scripts/revenue-guidance-roles.mjs';
import {BrowserDriver} from './recording/rabby-driver.mjs';
guard();assert.equal(process.env.REVENUE_GUIDANCE_LOCAL_QA,'true');
const provider=new JsonRpcProvider(urls.rpc),driver=new BrowserDriver('guidance-local');
try{
 assert.equal(Number(BigInt(await provider.send('eth_chainId',[]))),chainId);
 const plan=JSON.parse(readFileSync(dir+'/role-alignment.json'));
 assert(plan.completed);
 const pub=JSON.parse(readFileSync(root+'/.data/remote-demo/public.json'));
 const previous=JSON.parse(readFileSync(plan.backup+'/wallet-import.private.json'));
 const local=JSON.parse(readFileSync(dir+'/public.json'));
 const network=await fetch(urls.app+'/api/network').then(r=>r.json());
 for(const role of sharedRoles){
  assert.equal(local.accounts[role],pub.accounts[role]);
  assert(network.roleAddresses[role.startsWith('trustee')?'trustee':role].includes(pub.accounts[role]));
  const response=await fetch(urls.app+'/api/auth/challenge',{method:'POST',headers:{Origin:urls.app,'Content-Type':'application/json'},body:JSON.stringify({address:previous[role].address,requestedRole:role.startsWith('trustee')?'trustee':role})});
  assert(!response.ok,'Retired local role must not retain staff login');
 }
 for(const role of ['investor','investor2'])assert.equal(local.accounts[role],previous[role].address);
 await driver.start();const signedIn=[];
 for(const role of ['owner','agent','trustee','trustee2','investor','investor2']){
  await driver.login(role);const state=await driver.state(role);
  assert.equal(state.viewer.address.toLowerCase(),local.accounts[role].toLowerCase());
  assert.equal(state.viewer.actor,role);
  signedIn.push({role,address:state.viewer.address});
 }
 const primary=await driver.state('agent'),experience=await driver.state('investor');
 assert.equal(primary.chain.phase,'0');assert.equal(primary.applications.length,0);
 assert.equal(experience.chain.phase,'1');assert.equal(experience.chain.totalSubscriptions,'0');
 assert.equal(experience.manifest.accounts.owner,pub.accounts.owner);
 assert.equal(experience.applications[0].owner,pub.accounts.owner);
 assert(experience.applications[0].chainAdmission.admitted);
 const chainChecks=[];
 for(const state of [primary,experience]){
  const vault=new Contract(state.manifest.addresses.vault,['function hasRole(bytes32,address) view returns(bool)','function MANAGER() view returns(bytes32)','function TRUSTEE() view returns(bytes32)','function rights(uint256) view returns(bytes32 stationId,address owner,uint256 purchasePrice,bytes32 agreement)'],provider);
  const station=new Contract(state.manifest.addresses.station,['function hasRole(bytes32,address) view returns(bool)','function ISSUER_ROLE() view returns(bytes32)'],provider);
  for(const role of ['agent','trustee','trustee2']){
   const roleHash=await vault[role==='agent'?'MANAGER':'TRUSTEE']();
   assert(await vault.hasRole(roleHash,local.accounts[role]));
   assert(!await vault.hasRole(roleHash,previous[role].address));
  }
  const issuer=await station.ISSUER_ROLE();assert(await station.hasRole(issuer,local.accounts.agent));assert(!await station.hasRole(issuer,previous.agent.address));
  if(state===experience)assert.equal((await vault.rights(0)).owner,pub.accounts.owner);
  chainChecks.push({vault:state.manifest.addresses.vault,rolesMatched:true,retiredRolesAbsent:true});
 }
 const baseline=JSON.parse(readFileSync(plan.backup+'/application/store.json'));
 assert.deepEqual(primary.stations.map(s=>[s.id,s.observedAt,s.sourceHash]),baseline.stations.map(s=>[s.id,s.observedAt,s.sourceHash]));
 for(const [name,hash]of Object.entries(plan.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(root+'/.data/remote-demo/'+name)).digest('hex'),hash);
 writeFileSync(dir+'/role-alignment-check.json',JSON.stringify({passed:true,at:new Date().toISOString(),chainId,signedIn,chainChecks,oldAddressesRejected:true,sourceEvidenceUnchanged:true,remoteConfigurationUnchanged:true,investorsUnchanged:true},null,2));
 console.log('PASS six real Rabby logins, unified role addresses, chain permissions, retired-role rejection and unchanged remote configuration');
}finally{await driver.close();provider.destroy();}
