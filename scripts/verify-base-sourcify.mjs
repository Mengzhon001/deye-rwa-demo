import {readFileSync,writeFileSync} from 'node:fs';import{resolve,dirname,join}from'node:path';import{dir,root}from'./revenue-base-sepolia.mjs';
const m=JSON.parse(readFileSync(join(dir,'application/deployment.json')));if(m.chainId!==84532)throw Error('Wrong chain');
const results=[];
for(const[key,name,path]of[['station','DeyeRWA','core'],['vault','RevenueShareVaultV5','revenue'],['billing','HouseholdBilling','revenue']]){
 const source=`contracts/${path}/${name}.sol`,artifact=join(root,'onchain/artifacts',source,name+'.dbg.json'),debug=JSON.parse(readFileSync(artifact)),build=JSON.parse(readFileSync(resolve(dirname(artifact),debug.buildInfo)));
 const existing=await fetch(`https://sourcify.dev/server/v2/contract/84532/${m.addresses[key]}`);const prior=existing.ok?await existing.json():null;
 if(prior?.match==='exact_match'){results.push({key,address:m.addresses[key],verified:true,result:prior});console.log(key,'exact_match');continue;}
 const r=await fetch(`https://sourcify.dev/server/v2/verify/84532/${m.addresses[key]}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stdJsonInput:build.input,compilerVersion:build.solcLongVersion.split('.Emscripten')[0],contractIdentifier:source+':'+name,creationTransactionHash:m.deploymentTransactions[key]}),signal:AbortSignal.timeout(60000)});
 const data=await r.json();let result=data;
 if(data.verificationId)for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,2000));result=await(await fetch('https://sourcify.dev/server/v2/verify/'+data.verificationId)).json();if(result.isJobCompleted)break;}
 const verified=result.contract?.match==='exact_match';results.push({key,address:m.addresses[key],verified,status:r.status,data,result});console.log(key,verified?'exact_match':JSON.stringify(result).slice(0,500));
}
writeFileSync(join(dir,'validation/sourcify-verification.json'),JSON.stringify(results,null,2));

if(results.some(r=>!r.verified))process.exitCode=1;
