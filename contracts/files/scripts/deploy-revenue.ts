import hre from "hardhat";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AbiCoder, getAddress } from "ethers";
export type RevenueManifest = {
  version: "revenue-rights.v2";
  chainId: number;
  network: string;
  deployedBlock: number;
  deployedBlockHash: string;
  addresses: { usdc: string; station: string; vault: string };
  accounts: Record<string, string>;
  scenarioId: string;
  contractName?: "RevenueShareVaultV3";
};
function configured(name: string, fallback: string) {
  const value = process.env[`REVENUE_${name.toUpperCase()}_ADDRESS`];
  return getAddress(value || fallback);
}
export async function deployRevenue(): Promise<RevenueManifest> {
  const signers = await hre.ethers.getSigners();
  if (signers.length < 8) throw new Error("Revenue deployment requires eight funded accounts");
  const [deployer, managerSigner, trusteeSigner, trustee2Signer, treasurySigner] =
    signers;
  const accounts = {
    admin: configured("admin", deployer.address),
    agent: configured("agent", managerSigner.address),
    trustee: configured("trustee", trusteeSigner.address),
    trustee2: configured("trustee2", trustee2Signer.address),
    treasury: configured("treasury", treasurySigner.address),
    owner: configured("owner", signers[5].address),
    investor: configured("investor", signers[6].address),
    investor2: configured("investor2", signers[7].address),
  };
  if (accounts.admin !== getAddress(deployer.address))
    throw new Error("Configured revenue admin must be the deployment signer");
  if (
    new Set([accounts.agent, accounts.trustee, accounts.trustee2]).size !== 3
  )
    throw new Error("Intermediary and both trustees require distinct addresses");
  const usdc = await (
    await hre.ethers.getContractFactory("MockUSDC")
  ).deploy(accounts.admin);
  await usdc.waitForDeployment();
  const station = await (
    await hre.ethers.getContractFactory("DeyeRWA")
  ).deploy(accounts.admin);
  await station.waitForDeployment();
  const vault = await (
    await hre.ethers.getContractFactory("RevenueShareVaultV3")
  ).deploy(
    accounts.admin,
    accounts.agent,
    accounts.trustee,
    accounts.trustee2,
    accounts.treasury,
    await usdc.getAddress(),
    await station.getAddress()
  );
  await vault.waitForDeployment();
  await (await station.grantRole(await station.ISSUER_ROLE(), accounts.agent)).wait();
  const block = (await hre.ethers.provider.getBlock("latest"))!;
  return {
    version: "revenue-rights.v2",
    contractName: "RevenueShareVaultV3",
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    network: hre.network.name,
    deployedBlock: block.number,
    deployedBlockHash: block.hash!,
    scenarioId: hre.ethers.id(
      `${Number((await hre.ethers.provider.getNetwork()).chainId)}:${await vault.getAddress()}`
    ),
    addresses: {
      usdc: await usdc.getAddress(),
      station: await station.getAddress(),
      vault: await vault.getAddress(),
    },
    accounts,
  };
}
export async function verifyRevenue(manifest: RevenueManifest) {
  const items = [
    {
      address: manifest.addresses.usdc,
      source: "contracts/mocks/MockUSDC.sol",
      name: "MockUSDC",
      types: ["address"],
      args: [manifest.accounts.admin],
    },
    {
      address: manifest.addresses.station,
      source: "contracts/core/DeyeRWA.sol",
      name: "DeyeRWA",
      types: ["address"],
      args: [manifest.accounts.admin],
    },
    {
      address: manifest.addresses.vault,
      source: `contracts/revenue/${manifest.contractName || "RevenueShareVault"}.sol`,
      name: manifest.contractName || "RevenueShareVault",
      types: Array(7).fill("address"),
      args: [
        manifest.accounts.admin,
        manifest.accounts.agent,
        manifest.accounts.trustee,
        manifest.accounts.trustee2,
        manifest.accounts.treasury,
        manifest.addresses.usdc,
        manifest.addresses.station,
      ],
    },
  ];
  const results: Array<{ address: string; verified: boolean; message: string }> = [];
  const api = process.env.REVENUE_EXPLORER_API_URL?.replace(/\/$/u, "");
  for (const item of items) {
    try {
      if (!api) {
        await hre.run("verify:verify", {
          address: item.address,
          constructorArguments: item.args,
        });
      } else {
        const existing = await fetch(
          `${api}/api/v2/smart-contracts/${item.address}`,
          { signal: AbortSignal.timeout(5_000) }
        );
        if (existing.ok) {
          const contract = await existing.json();
          if (contract.is_verified === true) {
            results.push({
              address: item.address,
              verified: true,
              message: "already verified",
            });
            continue;
          }
        }
        const artifact = resolve(
          __dirname,
          `../artifacts/${item.source}/${item.name}.dbg.json`
        );
        const debug = JSON.parse(readFileSync(artifact, "utf8"));
        const buildInfo = JSON.parse(
          readFileSync(resolve(dirname(artifact), debug.buildInfo), "utf8")
        );
        const form = new FormData();
        form.append(
          "compiler_version",
          `v${String(buildInfo.solcLongVersion).split(".Emscripten")[0]}`
        );
        form.append("contract_name", `${item.source}:${item.name}`);
        form.append("autodetect_constructor_args", "false");
        form.append(
          "constructor_args",
          AbiCoder.defaultAbiCoder().encode(item.types, item.args).slice(2)
        );
        form.append(
          "files[0]",
          new Blob([JSON.stringify(buildInfo.input)], {
            type: "application/json",
          }),
          "standard-input.json"
        );
        const response = await fetch(
          `${api}/api/v2/smart-contracts/${item.address}/verification/via/standard-input`,
          { method: "POST", body: form, signal: AbortSignal.timeout(30_000) }
        );
        const text = await response.text();
        if (!response.ok)
          throw new Error(`Blockscout verification ${response.status}: ${text}`);
        let verified = false;
        for (let attempt = 0; attempt < 20 && !verified; attempt++) {
          const check = await fetch(
            `${api}/api/v2/smart-contracts/${item.address}`,
            { signal: AbortSignal.timeout(5_000) }
          );
          if (check.ok) {
            const contract = await check.json();
            verified = contract.is_verified === true;
          }
          if (!verified)
            await new Promise((done) => setTimeout(done, 500));
        }
        if (!verified) throw new Error(`Blockscout did not verify: ${text}`);
      }
      results.push({ address: item.address, verified: true, message: "verified" });
    } catch (error) {
      const message = String((error as Error).message || error);
      if (/already verified|already been verified/iu.test(message))
        results.push({
          address: item.address,
          verified: true,
          message: "already verified",
        });
      else
        results.push({
          address: item.address,
          verified: false,
          message: message.slice(0, 240),
        });
    }
  }
  return results;
}
if (require.main === module)
  deployRevenue()
    .then((m) => {
      const output = JSON.stringify(m, null, 2);
      const out = process.argv[process.argv.indexOf("--out") + 1];
      if (process.argv.includes("--out")) writeFileSync(out, output);
      process.stdout.write(output + "\n");
    })
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
