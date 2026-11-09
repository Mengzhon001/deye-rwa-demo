/** Stage static Pages files only. Never changes any running app or the original remote configuration. */
import{publishManuals}from'./publish-manuals.mjs';import{auditPublic}from'./revenue-remote.mjs';
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{join}from'node:path';import{root,dir}from'./revenue-base-sepolia.mjs';
const out=join(root,'ui/site-dist'),config=JSON.parse(readFileSync(join(dir,'public.json'))),old=process.env.BASE_EXISTING_PAGES_CONFIG;
if(config.chainId!==84532||!old)throw Error('Explicit Base Sepolia and original public Pages config required');
const response=await fetch(config.localApp+'/api/public/overview',{signal:AbortSignal.timeout(30000)});const status=await response.json();if(!response.ok||status.chainId!==84532||!status.chainAvailable)throw Error('Original Base Sepolia backend is not healthy');
const oracleHealth=await fetch('http://127.0.0.1:4198/api/public/overview',{signal:AbortSignal.timeout(30000)});const oracleStatus=await oracleHealth.json();if(!oracleHealth.ok||oracleStatus.chainId!==84532||oracleStatus.environmentId!=='oracle-base-sepolia'||!oracleStatus.chainAvailable)throw Error('Oracle Base Sepolia backend is not healthy');
let html=readFileSync(join(out,'index.html'),'utf8').replace(/<link[^>]*href="\/wallet-login.css"[^>]*>/g,'').replace(/<script[^>]*src="\/wallet-login.js"[^>]*><\/script>/g,'');
if(!html.includes('src="/deye-rwa-demo/site-assets/')||!html.includes('href="/deye-rwa-demo/site-assets/'))throw Error('Build GitHub Pages with REVENUE_SITE_BASE=/deye-rwa-demo/ before staging');
writeFileSync(join(out,'index.html'),html);
const nav=JSON.parse(readFileSync(join(root,'docs/protocol/navigation.json')));
for(const lang of['zh','en'])for(const slug of['',...nav]){const folder=join(out,'docs',lang,slug);mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'index.html'),html);}
mkdirSync(join(out,'docs'),{recursive:true});writeFileSync(join(out,'docs/index.html'),html);writeFileSync(join(out,'.nojekyll'),'');
html=html.replace(/<link[^>]*href="\/network-context.css"[^>]*>/g,'').replace(/<script[^>]*src="\/network-context.js"[^>]*><\/script>/g,'');
writeFileSync(join(out,'index.html'),html);
for(const lang of['zh','en'])for(const slug of['',...nav])writeFileSync(join(out,'docs',lang,slug,'index.html'),html);
writeFileSync(join(out,'docs/index.html'),html);
const unified=JSON.parse(readFileSync(process.env.REVENUE_UNIFIED_PUBLIC_CONFIG));
if(unified.networks?.length!==3||unified.networks[2]?.id!=='oracle-base-sepolia'||unified.networks[2]?.chainId!==84532)throw Error('Three-environment public descriptor required');
writeFileSync(join(out,'networks.json'),JSON.stringify(unified,null,2)+'\n');
const original=readFileSync(old);if(JSON.parse(original).chainId!==20261008)throw Error('Original demo config belongs to a different chain');writeFileSync(join(out,'remote.json'),original);
const publicConfig=Object.fromEntries(['app','explorer','rpc','chainId','usdc'].map(k=>[k,config[k]]));Object.assign(publicConfig,{preferredWallet:'rabby',walletEntryStatus:'verified',updatedAt:new Date().toISOString()});writeFileSync(join(out,'base-sepolia.json'),JSON.stringify(publicConfig,null,2)+'\n');
writeFileSync(join(out,'README.md'),'# Deye RWA public website\n\nThe main branch contains application source. This branch serves the public homepage, bilingual documentation, reviewed contract package and key-free operating manuals. Launch App opens one application with three environments: the private demonstration, the original Base Sepolia product, and Local Oracle on Sepolia. The two Base Sepolia environments share Chain ID 84532 and wallet test-token balances, but have separate products and sign-in sessions.\n');
publishManuals(root,out);auditPublic(out);
console.log('Staged Pages deep links and unified network entry; original remote.json preserved byte for byte.');
