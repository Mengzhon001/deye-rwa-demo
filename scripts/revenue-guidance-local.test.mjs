import {test} from 'node:test';import assert from 'node:assert/strict';import {compose,guard,urls,chainId,project} from './revenue-guidance-local.mjs';
import {alignRoleConfig,sharedRoles} from './revenue-guidance-roles.mjs';
import {HDNodeWallet} from 'ethers';
test('guidance-local rejects any public target or remote chain and exposes only its own loopback ports',()=>{assert.throws(()=>guard({...urls,chainId:20261008}));assert.throws(()=>guard({...urls,app:'https://example.com',chainId}));const d=compose({});assert.equal(d.name,project);assert.equal(d.services.app.image,'deye-rwa-guidance-app:local');assert.deepEqual(d.services.app.ports,['127.0.0.1:4191:4191']);assert.equal(d.services.app.environment.REVENUE_GUIDANCE_ENABLED,'true');assert.equal(d.services.app.environment.REVENUE_MONITOR_LIVE,'false');assert(!JSON.stringify(d).includes('remote-demo'));assert(!JSON.stringify(d).includes('materials_from_Deye'));assert.equal(d.services.anvil.ports,undefined);assert.equal(d.services.postgres.ports,undefined);});
test('explicit role alignment copies only validated role identities and preserves independent system and investors',()=>{
 const wallets=Object.fromEntries(sharedRoles.map(()=>HDNodeWallet.createRandom()).map((w,i)=>[sharedRoles[i],{phrase:w.mnemonic.phrase,address:w.address}]));
 const expected=Object.fromEntries(sharedRoles.map(r=>[r,wallets[r].address]));
 const local={mnemonic:'local system only',databasePassword:'local db',wallets:{investor:{address:'unchanged'},investor2:{address:'also unchanged'}}};
 const remote={wallets,systemMnemonic:'never copied',databasePassword:'never copied'};
 const result=alignRoleConfig(local,remote,expected);
 assert.equal(result.mnemonic,local.mnemonic);assert.equal(result.databasePassword,local.databasePassword);assert.equal(result.wallets.investor,local.wallets.investor);assert.equal(result.wallets.investor2,local.wallets.investor2);assert.equal(result.systemMnemonic,undefined);assert.equal(local.wallets.owner,undefined);
 for(const r of sharedRoles)assert.equal(result.wallets[r].address,expected[r]);
 assert.throws(()=>alignRoleConfig(local,remote,{...expected,owner:wallets.agent.address}),/deployed configuration/);
 assert.throws(()=>alignRoleConfig(local,{wallets:{...wallets,owner:{...wallets.owner,address:wallets.agent.address}}},expected),/key\/address mismatch/);
});
test('local checkpointing is private, mandatory before acknowledgement and shares only the local chain volume',()=>{const d=compose({}),k=d.services['state-keeper'];assert.equal(k.image,'node:22.19.0-alpine3.22');assert.equal(k.ports,undefined);assert.equal(k.env_file,undefined);assert.equal(k.environment.STATE_CHAIN_ID,'20261014');assert(k.volumes.includes('anvil-data:/data'));assert.equal(d.services.app.depends_on['state-keeper'].condition,'service_healthy');assert.equal(d.services.app.environment.REVENUE_STATE_CHECKPOINT_URL,'http://state-keeper:8765/checkpoint');assert.deepEqual(d.services.anvil.entrypoint,['sh','/state-tools/guidance-anvil.sh']);});
