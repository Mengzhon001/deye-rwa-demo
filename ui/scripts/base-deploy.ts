import {existsSync,readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {join,resolve} from "node:path";
import {RevenueRuntime} from "../src/revenue/runtime";
import {verifyRevenue} from "../../onchain/scripts/deploy-revenue";
import {BASE_SEPOLIA} from "../../onchain/scripts/revenue-network";
import hre from "hardhat";
async function main(){
 if(Number((await hre.ethers.provider.getNetwork()).chainId)!==BASE_SEPOLIA)throw Error("Deployment only permits Base Sepolia");
 const dir=resolve(process.env.REVENUE_DATA_DIR!);mkdirSync(dir,{recursive:true,mode:0o700});
 if(existsSync(join(dir,"store.json"))&&!JSON.parse(readFileSync(join(dir,"store.json"),"utf8")).manifest)throw Error("Resolve incomplete store before deploying");
 const runtime=new RevenueRuntime(dir);if(!process.argv.includes("--verify-only"))await runtime.start({allowDeployment:true});
 const m=runtime.repo.read().manifest!;const verified=await verifyRevenue(m);
 writeFileSync(join(dir,"verification.json"),JSON.stringify({at:new Date().toISOString(),verified},null,2),{mode:0o600});
 console.log(JSON.stringify({chainId:m.chainId,addresses:m.addresses,transactions:m.deploymentTransactions,verified},null,2));
}
main().catch(e=>{console.error(e.shortMessage||e.message);process.exitCode=1;});
