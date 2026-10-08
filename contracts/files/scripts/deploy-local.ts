import { ethers } from "hardhat";
async function main(){
 const [admin]=await ethers.getSigners(); if(!admin)throw new Error("Configure DEPLOYER_PRIVATE_KEY for a local test system account");
 const required=["MANAGER_ADDRESS","TRUSTEE_A_ADDRESS","TRUSTEE_B_ADDRESS","TREASURY_ADDRESS"];
 const roles=required.map(k=>{if(!process.env[k])throw new Error("Missing "+k);return ethers.getAddress(process.env[k]!);});
 if(new Set(roles.slice(0,3)).size!==3)throw new Error("Manager and trustees must be distinct");
 const usdc=await(await ethers.getContractFactory("MockUSDC")).deploy(admin.address); await usdc.waitForDeployment();
 const station=await(await ethers.getContractFactory("DeyeRWA")).deploy(admin.address); await station.waitForDeployment();
 const vault=await(await ethers.getContractFactory("RevenueShareVaultV3")).deploy(admin.address,...roles,await usdc.getAddress(),await station.getAddress()); await vault.waitForDeployment();
 await(await station.grantRole(await station.ISSUER_ROLE(),roles[0])).wait();
 console.log(JSON.stringify({chainId:Number((await ethers.provider.getNetwork()).chainId),usdc:await usdc.getAddress(),station:await station.getAddress(),vault:await vault.getAddress()},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
