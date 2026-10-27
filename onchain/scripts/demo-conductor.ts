import { readFileSync, writeFileSync } from "node:fs";
import { keccak256, toUtf8Bytes } from "ethers";
import hre from "hardhat";
import {
  buildDeploymentSubmissionPayload,
  buildLifecycleSubmissionPayload
} from "../../offchain/src/pipeline/relay";
import type {
  FacilityDeploymentSubmission,
  FacilityLifecycleSubmission,
  TeamBToTeamAInput
} from "../../offchain/src/types/handoff";
import type {
  FacilityDeploymentRecord,
  FacilityLifecycleEvent
} from "../../offchain/src/types/schemas";
import type { DemoDeploymentManifest } from "./deploy";
import { deployDemoContracts } from "./deploy";

const { ethers } = hre;

type DeploymentArtifact = FacilityDeploymentRecord | FacilityDeploymentSubmission;
type LifecycleArtifact = FacilityLifecycleEvent | FacilityLifecycleSubmission;
type ContractHandle = Awaited<ReturnType<typeof ethers.getContractAt>> & Record<string, any>;

type ConnectedContracts = {
  functionsRouter: ContractHandle;
  deyeRwa: ContractHandle;
  energyRevenue: ContractHandle;
  rewardDistributor: ContractHandle;
  rwaVault: ContractHandle;
  dbondMarket: ContractHandle;
  mockUsdc: ContractHandle;
};

export type DemoContext = {
  manifest: DemoDeploymentManifest;
  contracts: ConnectedContracts;
};

type ConductorOptions = {
  adminAddress?: `0x${string}`;
  receiver?: `0x${string}`;
};

function withSigner(contract: ContractHandle, signer: any): ContractHandle {
  return contract.connect(signer) as ContractHandle;
}

function readJsonFile<T>(inputPath: string): T {
  return JSON.parse(readFileSync(inputPath, "utf8")) as T;
}

function isDeploymentSubmission(value: DeploymentArtifact): value is FacilityDeploymentSubmission {
  return "admin" in value && "serialHash" in value && "siteHash" in value;
}

function isLifecycleSubmission(value: LifecycleArtifact): value is FacilityLifecycleSubmission {
  return "status" in value && "eventHash" in value;
}

function toSettlementRefBytes32(settlementRef: string): `0x${string}` {
  return keccak256(toUtf8Bytes(settlementRef)) as `0x${string}`;
}

function facilityStatusToEnum(status: FacilityLifecycleSubmission["status"]): 0 | 1 | 2 {
  switch (status) {
    case "PENDING":
      return 0;
    case "ACTIVE":
      return 1;
    case "RETIRED":
      return 2;
  }
}

export async function resolveSigner(address: string) {
  const signers = await ethers.getSigners();
  const signer = signers.find(
    (candidate: { address: string }) =>
      candidate.address.toLowerCase() === address.toLowerCase()
  );

  if (!signer) {
    throw new Error(`required local signer not available for address ${address}`);
  }

  return signer;
}

export async function loadDemoContext(
  manifestOrPath: DemoDeploymentManifest | string
): Promise<DemoContext> {
  const manifest =
    typeof manifestOrPath === "string"
      ? readJsonFile<DemoDeploymentManifest>(manifestOrPath)
      : manifestOrPath;

  return {
    manifest,
    contracts: {
      functionsRouter: await ethers.getContractAt(
        "FunctionsRouter",
        manifest.contracts.functionsRouter
      ),
      deyeRwa: await ethers.getContractAt("DeyeRWA", manifest.contracts.deyeRwa),
      energyRevenue: await ethers.getContractAt(
        "EnergyRevenue",
        manifest.contracts.energyRevenue
      ),
      rewardDistributor: await ethers.getContractAt(
        "RewardDistributor",
        manifest.contracts.rewardDistributor
      ),
      rwaVault: await ethers.getContractAt("RWAVault", manifest.contracts.rwaVault),
      dbondMarket: await ethers.getContractAt("DBondMarket", manifest.contracts.dbondMarket),
      mockUsdc: await ethers.getContractAt("MockUSDC", manifest.contracts.mockUsdc)
    }
  };
}

export async function deployFacilityOnchain(
  context: DemoContext,
  artifact: DeploymentArtifact,
  options: ConductorOptions = {}
) {
  const deployment = isDeploymentSubmission(artifact)
    ? artifact
    : buildDeploymentSubmissionPayload(artifact, options.adminAddress);
  const oracle = await resolveSigner(context.manifest.accounts.oracle);

  const submission = await withSigner(context.contracts.functionsRouter, oracle).submitDeployment({
    facilityId: deployment.facilityId,
    admin: deployment.admin,
    serialHash: deployment.serialHash,
    siteHash: deployment.siteHash,
    metadataHash: deployment.metadataHash,
    acquisitionCostUSDC6: BigInt(deployment.acquisitionCostUSDC6),
    commissionedAt: BigInt(deployment.commissionedAt),
    activateOnMint: deployment.activateOnMint
  });
  await submission.wait();

  const owner = await context.contracts.deyeRwa.ownerOfFacility(deployment.facilityId);

  return {
    facilityId: deployment.facilityId,
    owner,
    txHash: submission.hash as `0x${string}`
  };
}

export async function submitPeriod(
  context: DemoContext,
  payload: TeamBToTeamAInput
) {
  const oracle = await resolveSigner(context.manifest.accounts.oracle);
  const treasury = await resolveSigner(context.manifest.accounts.treasury);
  const amount = BigInt(payload.rewardFunding.amountUSDC6);

  const productionTx = await withSigner(context.contracts.functionsRouter, oracle)
    .submitProductionReport(
      payload.facilityId,
      payload.periodId,
      amount,
      payload.productionReport.reportHash
    );
  await productionTx.wait();

  const cashflowTx = await withSigner(context.contracts.functionsRouter, oracle)
    .submitCashflowReport(
      payload.facilityId,
      payload.periodId,
      BigInt(payload.cashflowReport.amountUSDC6),
      payload.cashflowReport.reportHash
    );
  await cashflowTx.wait();

  await (
    await withSigner(context.contracts.mockUsdc, treasury)
      .mint(context.manifest.accounts.treasury, amount)
  ).wait();
  await (
    await withSigner(context.contracts.mockUsdc, treasury)
      .approve(context.manifest.contracts.energyRevenue, amount)
  ).wait();

  const depositTx = await withSigner(context.contracts.energyRevenue, treasury)
    .depositRevenue(
      payload.facilityId,
      payload.periodId,
      amount,
      toSettlementRefBytes32(payload.cashflowReport.settlementRef)
    );
  await depositTx.wait();

  const fundTx = await withSigner(context.contracts.energyRevenue, treasury)
    .fundReward(
      payload.facilityId,
      payload.periodId,
      amount,
      payload.rewardFunding.claimRoot
    );
  await fundTx.wait();

  return {
    facilityId: payload.facilityId,
    periodId: payload.periodId,
    productionReportTxHash: productionTx.hash as `0x${string}`,
    cashflowReportTxHash: cashflowTx.hash as `0x${string}`,
    revenueDepositTxHash: depositTx.hash as `0x${string}`,
    rewardOpenTxHash: fundTx.hash as `0x${string}`
  };
}

export async function submitLifecycle(
  context: DemoContext,
  artifact: LifecycleArtifact
) {
  const lifecycle = isLifecycleSubmission(artifact)
    ? artifact
    : buildLifecycleSubmissionPayload(artifact);
  const oracle = await resolveSigner(context.manifest.accounts.oracle);

  const submission = await withSigner(context.contracts.functionsRouter, oracle)
    .submitLifecycleEvent(
      lifecycle.facilityId,
      facilityStatusToEnum(lifecycle.status),
      lifecycle.eventHash
    );
  await submission.wait();

  const facility = await context.contracts.deyeRwa.getFacility(lifecycle.facilityId);

  return {
    facilityId: lifecycle.facilityId,
    status: lifecycle.status,
    onchainStatus: Number(facility.status),
    txHash: submission.hash as `0x${string}`
  };
}

export async function depositToVault(
  context: DemoContext,
  facilityId: `0x${string}`,
  receiver?: `0x${string}`
) {
  const currentOwner = await context.contracts.deyeRwa.ownerOfFacility(facilityId);
  const ownerSigner = await resolveSigner(currentOwner);
  const tokenId = await context.contracts.deyeRwa.facilityTokenId(facilityId);
  const shareReceiver = receiver ?? (currentOwner as `0x${string}`);

  await (
    await withSigner(context.contracts.deyeRwa, ownerSigner)
      .approve(context.manifest.contracts.rwaVault, tokenId)
  ).wait();

  const depositTx = await withSigner(context.contracts.rwaVault, ownerSigner)
    .depositFacility(facilityId, shareReceiver);
  await depositTx.wait();

  return {
    facilityId,
    receiver: shareReceiver,
    txHash: depositTx.hash as `0x${string}`,
    navPerShare: (await context.contracts.rwaVault.navPerShare()).toString()
  };
}

export async function deployFacilityToBondInventory(
  context: DemoContext,
  artifact: DeploymentArtifact,
  options: ConductorOptions = {}
) {
  const deployment = await deployFacilityOnchain(context, artifact, options);
  const vaultDeposit = await depositToVault(
    context,
    deployment.facilityId,
    context.manifest.contracts.dbondMarket
  );

  return {
    deployment,
    vaultDeposit
  };
}

export async function mintDemoUsdc(
  context: DemoContext,
  receiver: `0x${string}`,
  amountUSDC6: bigint
) {
  const treasury = await resolveSigner(context.manifest.accounts.treasury);
  const tx = await withSigner(context.contracts.mockUsdc, treasury).mint(receiver, amountUSDC6);
  await tx.wait();

  return {
    receiver,
    amountUSDC6: amountUSDC6.toString(),
    txHash: tx.hash as `0x${string}`
  };
}

export async function seedMarketReserve(
  context: DemoContext,
  amountUSDC6: bigint
) {
  const deployer = await resolveSigner(context.manifest.accounts.deployer);
  await (await withSigner(context.contracts.mockUsdc, deployer).mint(context.manifest.accounts.deployer, amountUSDC6)).wait();
  await (
    await withSigner(context.contracts.mockUsdc, deployer).approve(
      context.manifest.contracts.dbondMarket,
      amountUSDC6
    )
  ).wait();
  const tx = await withSigner(context.contracts.dbondMarket, deployer).seedReserve(amountUSDC6);
  await tx.wait();

  return {
    amountUSDC6: amountUSDC6.toString(),
    txHash: tx.hash as `0x${string}`
  };
}

export async function buyBond(
  context: DemoContext,
  buyer: `0x${string}`,
  shareAmount: bigint
) {
  const buyerSigner = await resolveSigner(buyer);
  const paymentUSDC6 = await context.contracts.dbondMarket.previewBuyCostUSDC6(shareAmount);
  await (
    await withSigner(context.contracts.mockUsdc, buyerSigner).approve(
      context.manifest.contracts.dbondMarket,
      paymentUSDC6
    )
  ).wait();
  const tx = await withSigner(context.contracts.dbondMarket, buyerSigner).buy(
    shareAmount,
    paymentUSDC6,
    buyer
  );
  await tx.wait();

  return {
    buyer,
    shareAmount: shareAmount.toString(),
    paymentUSDC6: paymentUSDC6.toString(),
    txHash: tx.hash as `0x${string}`
  };
}

export async function redeemBond(
  context: DemoContext,
  seller: `0x${string}`,
  shareAmount: bigint
) {
  const sellerSigner = await resolveSigner(seller);
  const payoutUSDC6 = await context.contracts.dbondMarket.previewRedeemPayoutUSDC6(shareAmount);
  await (
    await withSigner(context.contracts.rwaVault, sellerSigner).approve(
      context.manifest.contracts.dbondMarket,
      shareAmount
    )
  ).wait();
  const tx = await withSigner(context.contracts.dbondMarket, sellerSigner).redeem(
    shareAmount,
    payoutUSDC6,
    seller
  );
  await tx.wait();

  return {
    seller,
    shareAmount: shareAmount.toString(),
    payoutUSDC6: payoutUSDC6.toString(),
    txHash: tx.hash as `0x${string}`
  };
}

export async function claimDirect(
  context: DemoContext,
  payload: TeamBToTeamAInput
) {
  const currentOwner = await context.contracts.deyeRwa.ownerOfFacility(payload.facilityId);
  const holderSigner = await resolveSigner(currentOwner);
  const amount = BigInt(payload.rewardFunding.amountUSDC6);

  const claimTx = await withSigner(context.contracts.rewardDistributor, holderSigner)
    .claim(payload.facilityId, payload.periodId, amount, []);
  await claimTx.wait();

  return {
    facilityId: payload.facilityId,
    periodId: payload.periodId,
    claimant: currentOwner,
    txHash: claimTx.hash as `0x${string}`
  };
}

export async function claimViaVault(
  context: DemoContext,
  payload: TeamBToTeamAInput
) {
  const operator = await resolveSigner(context.manifest.accounts.deployer);
  const amount = BigInt(payload.rewardFunding.amountUSDC6);

  const claimTx = await withSigner(context.contracts.rwaVault, operator)
    .claimReward(payload.facilityId, payload.periodId, amount, []);
  await claimTx.wait();

  return {
    facilityId: payload.facilityId,
    periodId: payload.periodId,
    txHash: claimTx.hash as `0x${string}`,
    totalAssetsUSDC6: (await context.contracts.rwaVault.totalAssetsUSDC6()).toString(),
    navPerShare: (await context.contracts.rwaVault.navPerShare()).toString()
  };
}

export async function runDemo(
  context: DemoContext,
  deploymentArtifact: DeploymentArtifact,
  periodPayload: TeamBToTeamAInput,
  branch: "direct" | "vault",
  options: ConductorOptions = {}
) {
  const deployment = await deployFacilityOnchain(context, deploymentArtifact, options);

  let vaultDeposit:
    | Awaited<ReturnType<typeof depositToVault>>
    | undefined;
  if (branch === "vault") {
    vaultDeposit = await depositToVault(
      context,
      periodPayload.facilityId,
      options.receiver
    );
  }

  const period = await submitPeriod(context, periodPayload);
  const claim =
    branch === "vault"
      ? await claimViaVault(context, periodPayload)
      : await claimDirect(context, periodPayload);

  return {
    branch,
    deployment,
    vaultDeposit,
    period,
    claim
  };
}

type ParsedCliArgs = {
  command: string;
  manifestPath?: string;
  deploymentPath?: string;
  periodPath?: string;
  lifecyclePath?: string;
  adminAddress?: `0x${string}`;
  receiver?: `0x${string}`;
  branch?: "direct" | "vault";
  outPath?: string;
};

function parseCliArgs(argv: string[]): ParsedCliArgs {
  const [command = "help", ...rest] = argv;
  const parsed: ParsedCliArgs = { command };

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    const nextValue = rest[index + 1];
    if (value === "--manifest") {
      parsed.manifestPath = nextValue;
      index += 1;
      continue;
    }
    if (value === "--deployment") {
      parsed.deploymentPath = nextValue;
      index += 1;
      continue;
    }
    if (value === "--period") {
      parsed.periodPath = nextValue;
      index += 1;
      continue;
    }
    if (value === "--lifecycle") {
      parsed.lifecyclePath = nextValue;
      index += 1;
      continue;
    }
    if (value === "--admin") {
      parsed.adminAddress = nextValue as `0x${string}`;
      index += 1;
      continue;
    }
    if (value === "--receiver") {
      parsed.receiver = nextValue as `0x${string}`;
      index += 1;
      continue;
    }
    if (value === "--branch") {
      parsed.branch = nextValue as "direct" | "vault";
      index += 1;
      continue;
    }
    if (value === "--out") {
      parsed.outPath = nextValue;
      index += 1;
    }
  }

  return parsed;
}

function requireArg(value: string | undefined, label: string) {
  if (!value) {
    throw new Error(`missing required argument: ${label}`);
  }

  return value;
}

function writeOutput(outPath: string | undefined, payload: unknown) {
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  if (outPath) {
    writeFileSync(outPath, text, "utf8");
    return;
  }

  process.stdout.write(text);
}

function showUsage() {
  process.stderr.write(
    [
      "Usage:",
      "  npm run demo:conduct -- deploy-facility-onchain --manifest <manifest.json> --deployment <facility-record-or-payload.json> [--admin 0x...] [--out file]",
      "  npm run demo:conduct -- submit-period --manifest <manifest.json> --period <period-payload.json> [--out file]",
      "  npm run demo:conduct -- submit-lifecycle --manifest <manifest.json> --lifecycle <lifecycle-event-or-payload.json> [--out file]",
      "  npm run demo:conduct -- deposit-to-vault --manifest <manifest.json> --period <period-payload.json> [--receiver 0x...] [--out file]",
      "  npm run demo:conduct -- claim-direct --manifest <manifest.json> --period <period-payload.json> [--out file]",
      "  npm run demo:conduct -- claim-via-vault --manifest <manifest.json> --period <period-payload.json> [--out file]",
      "  npm run demo:conduct -- run-demo --branch direct|vault --manifest <manifest.json> --deployment <facility-record-or-payload.json> --period <period-payload.json> [--admin 0x...] [--receiver 0x...] [--out file]"
    ].join("\n")
  );
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.command === "help") {
    showUsage();
    return;
  }

  switch (args.command) {
    case "deploy-facility-onchain": {
      const context = await loadDemoContext(requireArg(args.manifestPath, "--manifest"));
      writeOutput(
        args.outPath,
        await deployFacilityOnchain(
          context,
          readJsonFile<DeploymentArtifact>(
            requireArg(args.deploymentPath, "--deployment")
          ),
          { adminAddress: args.adminAddress }
        )
      );
      return;
    }
    case "submit-period": {
      const context = await loadDemoContext(requireArg(args.manifestPath, "--manifest"));
      writeOutput(
        args.outPath,
        await submitPeriod(
          context,
          readJsonFile<TeamBToTeamAInput>(requireArg(args.periodPath, "--period"))
        )
      );
      return;
    }
    case "submit-lifecycle": {
      const context = await loadDemoContext(requireArg(args.manifestPath, "--manifest"));
      writeOutput(
        args.outPath,
        await submitLifecycle(
          context,
          readJsonFile<LifecycleArtifact>(
            requireArg(args.lifecyclePath, "--lifecycle")
          )
        )
      );
      return;
    }
    case "deposit-to-vault": {
      const context = await loadDemoContext(requireArg(args.manifestPath, "--manifest"));
      const payload = readJsonFile<TeamBToTeamAInput>(
        requireArg(args.periodPath, "--period")
      );
      writeOutput(
        args.outPath,
        await depositToVault(context, payload.facilityId, args.receiver)
      );
      return;
    }
    case "claim-direct": {
      const context = await loadDemoContext(requireArg(args.manifestPath, "--manifest"));
      writeOutput(
        args.outPath,
        await claimDirect(
          context,
          readJsonFile<TeamBToTeamAInput>(requireArg(args.periodPath, "--period"))
        )
      );
      return;
    }
    case "claim-via-vault": {
      const context = await loadDemoContext(requireArg(args.manifestPath, "--manifest"));
      writeOutput(
        args.outPath,
        await claimViaVault(
          context,
          readJsonFile<TeamBToTeamAInput>(requireArg(args.periodPath, "--period"))
        )
      );
      return;
    }
    case "run-demo": {
      const manifest = args.manifestPath
        ? readJsonFile<DemoDeploymentManifest>(args.manifestPath)
        : await deployDemoContracts();
      const context = await loadDemoContext(manifest);
      writeOutput(
        args.outPath,
        {
          manifest,
          result: await runDemo(
            context,
            readJsonFile<DeploymentArtifact>(
              requireArg(args.deploymentPath, "--deployment")
            ),
            readJsonFile<TeamBToTeamAInput>(requireArg(args.periodPath, "--period")),
            args.branch ?? "direct",
            {
              adminAddress: args.adminAddress,
              receiver: args.receiver
            }
          )
        }
      );
      return;
    }
    default:
      showUsage();
      throw new Error(`unknown command: ${args.command}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
