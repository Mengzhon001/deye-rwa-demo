import { expect } from "chai";
import { ethers } from "hardhat";

async function deployCoreFixture() {
  const [admin, oracle, treasury, facilityAdmin, newHolder] = await ethers.getSigners();

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

  const facilityId = ethers.keccak256(ethers.toUtf8Bytes("FAC-REWARD-001"));
  await functionsRouter.connect(oracle).submitDeployment({
    facilityId,
    admin: facilityAdmin.address,
    serialHash: ethers.keccak256(ethers.toUtf8Bytes("SERIAL-REWARD-001")),
    siteHash: ethers.keccak256(ethers.toUtf8Bytes("SITE-REWARD-001")),
    metadataHash: ethers.keccak256(ethers.toUtf8Bytes("facility-metadata-reward")),
    acquisitionCostUSDC6: 125_000_000n,
    commissionedAt: 1_775_001_600n,
    activateOnMint: true
  });

  return {
    admin,
    oracle,
    treasury,
    facilityAdmin,
    newHolder,
    usdc,
    deyeRwa,
    rewardDistributor,
    energyRevenue,
    functionsRouter,
    facilityId
  };
}

function distributionLeaf(periodId: string, facilityId: string, amount: bigint) {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(
    abiCoder.encode(["bytes32", "bytes32", "uint256"], [periodId, facilityId, amount])
  );
}

describe("RewardDistributor flow", function () {
  it("keeps rewards closed until both reports exist and their values match", async function () {
    const { oracle, treasury, usdc, energyRevenue, functionsRouter, facilityId } =
      await deployCoreFixture();

    const periodId = ethers.encodeBytes32String("2026-DEMO-P01");
    const amount = 1_000_000n;
    const productionHash = ethers.keccak256(ethers.toUtf8Bytes("production-p01"));
    const cashflowHash = ethers.keccak256(ethers.toUtf8Bytes("cashflow-p01"));
    const settlementRef = ethers.keccak256(ethers.toUtf8Bytes("settlement-p01"));
    const claimRoot = distributionLeaf(periodId, facilityId, amount);

    await functionsRouter.connect(oracle).submitProductionReport(facilityId, periodId, amount, productionHash);

    await usdc.mint(treasury.address, amount);
    await usdc.connect(treasury).approve(await energyRevenue.getAddress(), amount);
    await energyRevenue.connect(treasury).depositRevenue(facilityId, periodId, amount, settlementRef);

    await expect(
      energyRevenue.connect(treasury).fundReward(facilityId, periodId, amount, claimRoot)
    ).to.be.revertedWith("cashflow missing");

    const periodIdMismatch = ethers.encodeBytes32String("2026-DEMO-P02");
    const mismatchAmount = 2_000_000n;
    await functionsRouter
      .connect(oracle)
      .submitProductionReport(
        facilityId,
        periodIdMismatch,
        mismatchAmount,
        ethers.keccak256(ethers.toUtf8Bytes("production-p02"))
      );
    await functionsRouter
      .connect(oracle)
      .submitCashflowReport(
        facilityId,
        periodIdMismatch,
        1_500_000n,
        ethers.keccak256(ethers.toUtf8Bytes("cashflow-p02"))
      );
    await usdc.mint(treasury.address, mismatchAmount);
    await usdc.connect(treasury).approve(await energyRevenue.getAddress(), mismatchAmount);
    await energyRevenue
      .connect(treasury)
      .depositRevenue(
        facilityId,
        periodIdMismatch,
        mismatchAmount,
        ethers.keccak256(ethers.toUtf8Bytes("settlement-p02"))
      );

    await expect(
      energyRevenue
        .connect(treasury)
        .fundReward(facilityId, periodIdMismatch, mismatchAmount, distributionLeaf(periodIdMismatch, facilityId, mismatchAmount))
    ).to.be.revertedWith("cashflow mismatch");

    await functionsRouter.connect(oracle).submitCashflowReport(facilityId, periodId, amount, cashflowHash);

    await expect(
      energyRevenue.connect(treasury).fundReward(facilityId, periodId, amount, claimRoot)
    ).to.not.be.reverted;
  });

  it("lets the current token holder claim after matching reports and funding", async function () {
    const { oracle, treasury, facilityAdmin, newHolder, usdc, deyeRwa, rewardDistributor, energyRevenue, functionsRouter, facilityId } =
      await deployCoreFixture();

    const periodId = ethers.encodeBytes32String("2026-DEMO-P03");
    const amount = 3_000_000n;
    const claimRoot = distributionLeaf(periodId, facilityId, amount);

    await functionsRouter
      .connect(oracle)
      .submitProductionReport(
        facilityId,
        periodId,
        amount,
        ethers.keccak256(ethers.toUtf8Bytes("production-p03"))
      );
    await functionsRouter
      .connect(oracle)
      .submitCashflowReport(
        facilityId,
        periodId,
        amount,
        ethers.keccak256(ethers.toUtf8Bytes("cashflow-p03"))
      );

    await usdc.mint(treasury.address, amount);
    await usdc.connect(treasury).approve(await energyRevenue.getAddress(), amount);
    await energyRevenue
      .connect(treasury)
      .depositRevenue(
        facilityId,
        periodId,
        amount,
        ethers.keccak256(ethers.toUtf8Bytes("settlement-p03"))
      );
    await energyRevenue.connect(treasury).fundReward(facilityId, periodId, amount, claimRoot);

    const tokenId = await deyeRwa.facilityTokenId(facilityId);
    await deyeRwa
      .connect(facilityAdmin)
      .transferFrom(facilityAdmin.address, newHolder.address, tokenId);

    await expect(
      rewardDistributor.connect(facilityAdmin).claim(facilityId, periodId, amount, [])
    ).to.be.revertedWith("not current holder");

    await expect(rewardDistributor.connect(newHolder).claim(facilityId, periodId, amount, [])).to.not
      .be.reverted;
    expect(await usdc.balanceOf(newHolder.address)).to.equal(amount);

    await expect(
      rewardDistributor.connect(newHolder).claim(facilityId, periodId, amount, [])
    ).to.be.revertedWith("already claimed");
  });
});
