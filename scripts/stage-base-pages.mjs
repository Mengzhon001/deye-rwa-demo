/** Stage static Pages files only. Never changes any running app or the original remote configuration. */
import{publishManuals}from'./publish-manuals.mjs';import{auditPublic}from'./revenue-remote.mjs';
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{join}from'node:path';import{root,dir}from'./revenue-base-sepolia.mjs';
const out=join(root,'ui/site-dist'),config=JSON.parse(readFileSync(join(dir,'public.json'))),old=process.env.BASE_EXISTING_PAGES_CONFIG;
if(config.chainId!==84532||!old)throw Error('Explicit Base Sepolia and original public Pages config required');
const response=await fetch(config.app+'/api/public/overview',{signal:AbortSignal.timeout(30000)});const status=await response.json();if(!response.ok||status.chainId!==84532||!status.chainAvailable)throw Error('Base Sepolia is not healthy');
let html=readFileSync(join(out,'index.html'),'utf8').replace(/<link[^>]*href="\/wallet-login.css"[^>]*>/g,'').replace(/<script[^>]*src="\/wallet-login.js"[^>]*><\/script>/g,'');
writeFileSync(join(out,'index.html'),html);
const nav=JSON.parse(readFileSync(join(root,'docs/protocol/navigation.json')));
for(const lang of['zh','en'])for(const slug of['',...nav]){const folder=join(out,'docs',lang,slug);mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'index.html'),html);}
mkdirSync(join(out,'docs'),{recursive:true});writeFileSync(join(out,'docs/index.html'),html);writeFileSync(join(out,'.nojekyll'),'');
html=html.replace(/<link[^>]*href="\/network-context.css"[^>]*>/g,'').replace(/<script[^>]*src="\/network-context.js"[^>]*><\/script>/g,'');
writeFileSync(join(out,'index.html'),html);
for(const lang of['zh','en'])for(const slug of['',...nav])writeFileSync(join(out,'docs',lang,slug,'index.html'),html);
writeFileSync(join(out,'docs/index.html'),html);
const unified=JSON.parse(readFileSync(process.env.REVENUE_UNIFIED_PUBLIC_CONFIG));
writeFileSync(join(out,'networks.json'),JSON.stringify(unified,null,2)+'\n');
const original=readFileSync(old);if(JSON.parse(original).chainId!==20261008)throw Error('Original demo config belongs to a different chain');writeFileSync(join(out,'remote.json'),original);
const publicConfig=Object.fromEntries(['app','explorer','rpc','chainId','usdc'].map(k=>[k,config[k]]));Object.assign(publicConfig,{preferredWallet:'rabby',walletEntryStatus:'verified',updatedAt:new Date().toISOString()});writeFileSync(join(out,'base-sepolia.json'),JSON.stringify(publicConfig,null,2)+'\n');
writeFileSync(join(out,'README.md'),'# Deye RWA public website\n\nThe main branch contains application source. This branch serves the public homepage, bilingual documentation, reviewed contract package and key-free operating manuals. Launch App opens one application with a network selector for the private demonstration and Base Sepolia. Each chain retains separate business state.\n');
publishManuals(root,out);auditPublic(out);
console.log('Staged Pages deep links and unified network entry; original remote.json preserved byte for byte.');
