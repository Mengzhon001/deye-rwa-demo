import { expect } from "chai";
import { ethers } from "hardhat";

async function deployForkFixture() {
  const [admin, oracle, treasury, investor] = await ethers.getSigners();

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy(admin.address);
  await usdc.waitForDeployment();

  const DeyeRWA = await ethers.getContractFactory("DeyeRWA");
  const deyeRwa = await DeyeRWA.deploy(admin.address);
  await deyeRwa.waitForDeployment();

  const RewardDistributor = await ethers.getContractFactory("RewardDistributor");
  const rewardDistributor = await RewardDistributor.deploy(
    admin.address,
    await usdc.getAddress(),
    await deyeRwa.getAddress()
  );
  await rewardDistributor.waitForDeployment();

  const EnergyRevenue = await ethers.getContractFactory("EnergyRevenue");
  const energyRevenue = await EnergyRevenue.deploy(admin.address, treasury.address, await usdc.getAddress());
  await energyRevenue.waitForDeployment();
  await (await energyRevenue.setRewardDistributor(await rewardDistributor.getAddress())).wait();

  const RWAVault = await ethers.getContractFactory("RWAVault");
  const rwaVault = await RWAVault.deploy(
    admin.address,
    await deyeRwa.getAddress(),
    await rewardDistributor.getAddress(),
    await usdc.getAddress()
  );
  await rwaVault.waitForDeployment();

  const FunctionsRouter = await ethers.getContractFactory("FunctionsRouter");
  const functionsRouter = await FunctionsRouter.deploy(
    admin.address,
    oracle.address,
    await deyeRwa.getAddress(),
    await rewardDistributor.getAddress()
  );
  await functionsRouter.waitForDeployment();

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

  return {
    admin,
    oracle,
    treasury,
    investor,
    usdc,
    deyeRwa,
    rewardDistributor,
    energyRevenue,
    rwaVault,
    functionsRouter
  };
}

function distributionLeaf(periodId: string, facilityId: string, amount: bigint) {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(
    abiCoder.encode(["bytes32", "bytes32", "uint256"], [periodId, facilityId, amount])
  );
}

const describeForkOnly = process.env.HARDHAT_FORK === "1" ? describe : describe.skip;

describeForkOnly("Forked demo flow", function () {
  it("runs the facility, reward, and vault flow on a forked hardhat network", async function () {
    this.timeout(Number(process.env.FORK_TEST_TIMEOUT_MS ?? "180000"));

    const { admin, oracle, treasury, investor, usdc, deyeRwa, energyRevenue, rewardDistributor, rwaVault, functionsRouter } =
      await deployForkFixture();

    const facilityId = ethers.keccak256(ethers.toUtf8Bytes("FAC-FORK-001"));
    await functionsRouter.connect(oracle).submitDeployment({
      facilityId,
      admin: admin.address,
      serialHash: ethers.keccak256(ethers.toUtf8Bytes("SERIAL-FORK-001")),
      siteHash: ethers.keccak256(ethers.toUtf8Bytes("SITE-FORK-001")),
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes("facility-metadata-fork-001")),
      acquisitionCostUSDC6: 125_000_000n,
      commissionedAt: 1_775_001_600n,
      activateOnMint: true
    });

    const tokenId = await deyeRwa.facilityTokenId(facilityId);
    await deyeRwa.connect(admin).approve(await rwaVault.getAddress(), tokenId);
    await rwaVault.connect(admin).depositFacility(facilityId, admin.address);

    const periodId = ethers.encodeBytes32String("2026-FORK-P01");
    const rewardAmount = 4_000_000n;
    const claimRoot = distributionLeaf(periodId, facilityId, rewardAmount);

    await functionsRouter
      .connect(oracle)
      .submitProductionReport(
        facilityId,
        periodId,
        rewardAmount,
        ethers.keccak256(ethers.toUtf8Bytes("production-fork-p01"))
      );
    await functionsRouter
      .connect(oracle)
      .submitCashflowReport(
        facilityId,
        periodId,
        rewardAmount,
        ethers.keccak256(ethers.toUtf8Bytes("cashflow-fork-p01"))
      );

    await usdc.mint(treasury.address, rewardAmount);
    await usdc.connect(treasury).approve(await energyRevenue.getAddress(), rewardAmount);
    await energyRevenue
      .connect(treasury)
      .depositRevenue(
        facilityId,
        periodId,
        rewardAmount,
        ethers.keccak256(ethers.toUtf8Bytes("settlement-fork-p01"))
      );
    await energyRevenue.connect(treasury).fundReward(facilityId, periodId, rewardAmount, claimRoot);

    await expect(
      rewardDistributor.connect(admin).claim(facilityId, periodId, rewardAmount, [])
    ).to.be.revertedWith("not current holder");

    await rwaVault.connect(investor).claimReward(facilityId, periodId, rewardAmount, []);

    expect(await usdc.balanceOf(await rwaVault.getAddress())).to.equal(rewardAmount);
    expect(await rwaVault.totalAssetsUSDC6()).to.equal(129_000_000n);
    expect(await rwaVault.navPerShare()).to.equal(1_032_000n);

    const adminBondBalance = await rwaVault.balanceOf(admin.address);
    await rwaVault.connect(admin).transfer(investor.address, adminBondBalance / 5n);
    expect(await rwaVault.balanceOf(investor.address)).to.equal(adminBondBalance / 5n);
  });
});
