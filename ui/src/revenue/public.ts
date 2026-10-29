import hre from "hardhat";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { keccak256 } from "ethers";
import type { RevenueRuntime } from "./runtime";
import type { RevenueManifest } from "../../../onchain/scripts/deploy-revenue";

export function publishedProducts(
  manifest: RevenueManifest,
  chain: Record<string, any>,
  filter = "all"
) {
  const phase = Number(chain.phase);
  if (![1, 2, 3, 4].includes(phase)) return [];
  if (filter === "current" && phase > 2) return [];
  if (filter === "history" && phase < 3) return [];
  if (/^[1-4]$/.test(filter) && phase !== Number(filter)) return [];
  return [
    {
      id: manifest.scenarioId,
      vault: manifest.addresses.vault,
      phase,
      title: {
        zh: "德业光伏收益权 · 第一期",
        en: "Deye Solar Revenue Rights · Series 01",
      },
      sharesIssued: phase === 2 || phase === 4,
      valuationFresh: Boolean(chain.fresh),
      targetUSDC6: String(chain.target),
      subscriptionsUSDC6: String(chain.totalSubscriptions),
      totalSupply: String(chain.totalSupply),
      deadline: Number(chain.deadline),
    },
  ];
}

export async function publicOverview(
  runtime: RevenueRuntime,
  explorerUrl: string
) {
  const s = runtime.repo.read(),
    manifest = s.manifest!;
  const base = {
    capturedAt: new Date().toISOString(),
    scenarioId: manifest.scenarioId,
    chainId: manifest.chainId,
    explorerUrl,
    contracts: manifest.addresses,
    telemetryStations: s.stations.length,
    dataModes: [...new Set(s.stations.map((s) => s.source))],
    observedAt: s.stations.length
      ? Math.max(...s.stations.map((s) => s.observedAt))
      : null,
  };
  try {
    const [phase, admitted, supply] = await Promise.all([
      runtime.vault.phase(),
      runtime.vault.rightCount(),
      runtime.vault.totalSupply(),
    ]);
    return {
      ...base,
      chainAvailable: true,
      phase: Number(phase),
      admittedStations: Number(admitted),
      publishedProducts: Number(phase) === 0 ? 0 : 1,
      currentProducts: [1, 2].includes(Number(phase)) ? 1 : 0,
      totalSupply: String(supply),
    };
  } catch {
    return {
      ...base,
      chainAvailable: false,
      phase: null,
      admittedStations: null,
      publishedProducts: null,
      currentProducts: null,
      totalSupply: null,
    };
  }
}

export async function deploymentSources(
  runtime: RevenueRuntime,
  root: string,
  explorerUrl: string
) {
  const manifest = runtime.repo.read().manifest!;
  const file = join(root, "ui/site-dist/contracts/manifest.json");
  if (!existsSync(file))
    throw new Error("Contract source package has not been built");
  const bundle = JSON.parse(readFileSync(file, "utf8"));
  const provider = hre.ethers.provider;
  const contracts = await Promise.all(
    Object.entries(manifest.addresses).map(async ([key, address]) => {
      if(key==="usdc" && manifest.paymentToken) return {name:"Circle test USDC (external)",address,explorer:`${explorerUrl}/address/${address}?tab=contract`,status:"external",sourceMatch:null,source:"https://developers.circle.com/stablecoins/usdc-contract-addresses",constructorArguments:[],verificationScope:"External Circle proxy; not part of the RWA source bundle"};
      const name = {
        usdc: "MockUSDC",
        station: "DeyeRWA",
        billing: "HouseholdBilling",
        vault: manifest.contractName || "RevenueShareVault",
      }[key]!;
      const artifact = bundle.contracts.find((c: any) => c.name === name);
      const result: any = {
        name,
        address,
        explorer: `${explorerUrl}/address/${address}?tab=contract`,
        source: artifact?.source,
        deploymentTransaction:manifest.deploymentTransactions?.[key],
        constructorArguments:
          key === "billing" ? [manifest.addresses.usdc,manifest.addresses.vault,manifest.accounts.agent,manifest.accounts.treasury] : key === "vault"
            ? [
                manifest.accounts.admin,
                manifest.accounts.agent,
                manifest.accounts.trustee,
                manifest.accounts.trustee2,
                manifest.accounts.treasury,
                manifest.addresses.usdc,
                manifest.addresses.station,
              ]
            : [manifest.accounts.admin],
      };
      try {
        const actual = (await provider.getCode(address)).slice(2).toLowerCase();
        let expected = String(artifact.runtimeBytecode).toLowerCase(),
          masked = actual;
        for (const ranges of Object.values(
          artifact.immutableReferences
        ) as any[])
          for (const { start, length } of ranges) {
            expected =
              expected.slice(0, start * 2) +
              "0".repeat(length * 2) +
              expected.slice((start + length) * 2);
            masked =
              masked.slice(0, start * 2) +
              "0".repeat(length * 2) +
              masked.slice((start + length) * 2);
          }
        let immutableMatch = true;
        if (key === "vault") {
          const values = await Promise.all([
            runtime.vault.usdc(),
            runtime.vault.stationToken(),
            runtime.vault.feeRecipient(),
          ]);
          immutableMatch = values.every(
            (v, i) =>
              v.toLowerCase() ===
              [
                manifest.addresses.usdc,
                manifest.addresses.station,
                manifest.accounts.treasury,
              ][i].toLowerCase()
          );
        }
        if(key==="billing"&&runtime.billing){const values=await Promise.all([runtime.billing.usdc(),runtime.billing.vault(),runtime.billing.manager(),runtime.billing.exportTreasury()]);immutableMatch=values.every((v,i)=>v.toLowerCase()===[manifest.addresses.usdc,manifest.addresses.vault,manifest.accounts.agent,manifest.accounts.treasury][i].toLowerCase());if(manifest.billingDeployment)result.deploymentTransaction=manifest.billingDeployment.transaction;}
        if(key==="vault"&&manifest.localMaintenance){result.localMaintenance=manifest.localMaintenance;result.verificationScope="Current runtime source match; original creation transaction predates local maintenance";}
        result.sourceMatch = !!actual && expected === masked && immutableMatch;
        result.runtimeHash = keccak256(`0x${actual}`);
        result.status = result.sourceMatch ? "matched" : "mismatch";
        // The existing manifest records the final deployment block (the issuer-role grant).
        for (
          let n = manifest.deployedBlock;
          n >= Math.max(0, manifest.deployedBlock - 8) && !result.deploymentTransaction;
          n--
        ) {
          const b = await provider.getBlock(n, true);
          if (!b) continue;
          for (const tx of b.prefetchedTransactions)
            if (tx.to === null) {
              const receipt = await provider.getTransactionReceipt(tx.hash);
              if (
                receipt?.contractAddress?.toLowerCase() ===
                address.toLowerCase()
              )
                result.deploymentTransaction = tx.hash;
            }
          if (result.deploymentTransaction) break;
        }
      } catch {
        result.status = "unavailable";
        result.sourceMatch = null;
      }
      return result;
    })
  );
  return {
    scenarioId: manifest.scenarioId,
    chainId: manifest.chainId,
    deployedBlock: manifest.deployedBlock,
    bundleHash: bundle.bundleHash,
    compiler: bundle.compiler,
    contracts,
  };
}
