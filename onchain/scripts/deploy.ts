import { writeFileSync } from "node:fs";
import hre from "hardhat";

const { network, ethers } = hre;
type ContractHandle = Awaited<ReturnType<typeof ethers.getContractAt>> & Record<string, any>;

function withSigner(contract: ContractHandle, signer: any): ContractHandle {
  return contract.connect(signer) as ContractHandle;
}

export type DemoDeploymentManifest = {
  network: string;
  chainId: number;
  accounts: {
    deployer: `0x${string}`;
    oracle: `0x${string}`;
    treasury: `0x${string}`;
  };
  contracts: {
    mockUsdc: `0x${string}`;
    functionsRouter: `0x${string}`;
    deyeRwa: `0x${string}`;
    energyRevenue: `0x${string}`;
    rewardDistributor: `0x${string}`;
    rwaVault: `0x${string}`;
    dbondMarket: `0x${string}`;
  };
};

export async function deployDemoContracts(): Promise<DemoDeploymentManifest> {
  const [deployer, oracle, treasury] = await ethers.getSigners();

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy(deployer.address);
  await usdc.waitForDeployment();
  await (
    await usdc.grantRole(await usdc.MINTER_ROLE(), treasury.address)
  ).wait();

  const DeyeRWA = await ethers.getContractFactory("DeyeRWA");
  const deyeRwa = await DeyeRWA.deploy(deployer.address);
  await deyeRwa.waitForDeployment();

  const RewardDistributor = await ethers.getContractFactory("RewardDistributor");
  const rewardDistributor = await RewardDistributor.deploy(
    deployer.address,
    await usdc.getAddress(),
    await deyeRwa.getAddress()
  );
  await rewardDistributor.waitForDeployment();

  const EnergyRevenue = await ethers.getContractFactory("EnergyRevenue");
  const energyRevenue = await EnergyRevenue.deploy(
    deployer.address,
    treasury.address,
    await usdc.getAddress()
  );
  await energyRevenue.waitForDeployment();

  await (await energyRevenue.setRewardDistributor(await rewardDistributor.getAddress())).wait();

  const FunctionsRouter = await ethers.getContractFactory("FunctionsRouter");
  const functionsRouter = await FunctionsRouter.deploy(
    deployer.address,
    oracle.address,
    await deyeRwa.getAddress(),
    await rewardDistributor.getAddress()
  );
  await functionsRouter.waitForDeployment();

  const RWAVault = await ethers.getContractFactory("RWAVault");
  const rwaVault = await RWAVault.deploy(
    deployer.address,
    await deyeRwa.getAddress(),
    await rewardDistributor.getAddress(),
    await usdc.getAddress()
  );
  await rwaVault.waitForDeployment();

  const DBondMarket = await ethers.getContractFactory("DBondMarket");
  const dbondMarket = await DBondMarket.deploy(
    deployer.address,
    await rwaVault.getAddress(),
    await usdc.getAddress()
  );
  await dbondMarket.waitForDeployment();
  const dbondMarketHandle = dbondMarket as ContractHandle;
  const usdcHandle = usdc as ContractHandle;

  await (
    await deyeRwa.grantRole(await deyeRwa.ISSUER_ROLE(), await functionsRouter.getAddress())
  ).wait();
  await (
    await deyeRwa.grantRole(await deyeRwa.STATUS_ADMIN_ROLE(), await functionsRouter.getAddress())
  ).wait();
  await (
    await rewardDistributor.grantRole(
      await rewardDistributor.ROUTER_ROLE(),
      await functionsRouter.getAddress()
    )
  ).wait();
  await (
    await rewardDistributor.grantRole(
      await rewardDistributor.ENERGY_REVENUE_ROLE(),
      await energyRevenue.getAddress()
    )
  ).wait();

  const initialReserveUSDC6 = 250_000_000n;
  await (await usdc.mint(deployer.address, initialReserveUSDC6)).wait();
  await (await withSigner(usdcHandle, deployer).approve(await dbondMarket.getAddress(), initialReserveUSDC6)).wait();
  await (await withSigner(dbondMarketHandle, deployer).seedReserve(initialReserveUSDC6)).wait();

  const networkInfo = await ethers.provider.getNetwork();

  return {
    network: network.name,
    chainId: Number(networkInfo.chainId),
    accounts: {
      deployer: deployer.address as `0x${string}`,
      oracle: oracle.address as `0x${string}`,
      treasury: treasury.address as `0x${string}`
    },
    contracts: {
      mockUsdc: await usdc.getAddress() as `0x${string}`,
      functionsRouter: await functionsRouter.getAddress() as `0x${string}`,
      deyeRwa: await deyeRwa.getAddress() as `0x${string}`,
      energyRevenue: await energyRevenue.getAddress() as `0x${string}`,
      rewardDistributor: await rewardDistributor.getAddress() as `0x${string}`,
      rwaVault: await rwaVault.getAddress() as `0x${string}`,
      dbondMarket: await dbondMarket.getAddress() as `0x${string}`
    }
  };
}

function parseOutPath() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  if (outIndex === -1) {
    return undefined;
  }

  return args[outIndex + 1];
}

async function main() {
  const manifest = await deployDemoContracts();
  const output = `${JSON.stringify(manifest, null, 2)}\n`;
  const outPath = parseOutPath();

  if (outPath) {
    writeFileSync(outPath, output, "utf8");
  }

  process.stdout.write(output);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
