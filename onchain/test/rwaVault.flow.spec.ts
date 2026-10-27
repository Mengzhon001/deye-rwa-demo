import { expect } from "chai";
import { ethers } from "hardhat";

async function deployBondFixture() {
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

describe("RWAVault bond flow", function () {
  it("custodies facility RWAs, mints digital bond shares, and rejects unsupported deposits", async function () {
    const { admin, oracle, deyeRwa, rwaVault, functionsRouter } = await deployBondFixture();

    const facilityId = ethers.keccak256(ethers.toUtf8Bytes("FAC-BOND-001"));
    await functionsRouter.connect(oracle).submitDeployment({
      facilityId,
      admin: admin.address,
      serialHash: ethers.keccak256(ethers.toUtf8Bytes("SERIAL-BOND-001")),
      siteHash: ethers.keccak256(ethers.toUtf8Bytes("SITE-BOND-001")),
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes("facility-metadata-bond-001")),
      acquisitionCostUSDC6: 125_000_000n,
      commissionedAt: 1_775_001_600n,
      activateOnMint: true
    });

    const tokenId = await deyeRwa.facilityTokenId(facilityId);
    await deyeRwa.connect(admin).approve(await rwaVault.getAddress(), tokenId);

    await expect(rwaVault.connect(admin).depositFacility(facilityId, admin.address)).to.not.be.reverted;

    expect(await deyeRwa.ownerOfFacility(facilityId)).to.equal(await rwaVault.getAddress());
    expect(await rwaVault.backingFacilityCount()).to.equal(1n);
    expect(await rwaVault.isBackedFacility(facilityId)).to.equal(true);
    expect(await rwaVault.balanceOf(admin.address)).to.equal(125_000_000n * 1_000_000_000_000n);
    expect(await rwaVault.totalAssetsUSDC6()).to.equal(125_000_000n);

    await expect(rwaVault.connect(admin).depositFacility(facilityId, admin.address)).to.be.revertedWith(
      "facility already backed"
    );

    const unknownFacility = ethers.keccak256(ethers.toUtf8Bytes("FAC-BOND-UNKNOWN"));
    await expect(rwaVault.connect(admin).depositFacility(unknownFacility, admin.address)).to.be.revertedWith(
      "facility not found"
    );
  });

  it("claims rewards as the current holder, accrues assets, preserves NAV on later deposit, and keeps bond shares transferable", async function () {
    const { admin, oracle, treasury, investor, usdc, deyeRwa, rewardDistributor, energyRevenue, rwaVault, functionsRouter } =
      await deployBondFixture();

    const facilityOne = ethers.keccak256(ethers.toUtf8Bytes("FAC-BOND-101"));
    const facilityTwo = ethers.keccak256(ethers.toUtf8Bytes("FAC-BOND-102"));

    await functionsRouter.connect(oracle).submitDeployment({
      facilityId: facilityOne,
      admin: admin.address,
      serialHash: ethers.keccak256(ethers.toUtf8Bytes("SERIAL-BOND-101")),
      siteHash: ethers.keccak256(ethers.toUtf8Bytes("SITE-BOND-101")),
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes("facility-metadata-bond-101")),
      acquisitionCostUSDC6: 100_000_000n,
      commissionedAt: 1_775_001_600n,
      activateOnMint: true
    });
    await functionsRouter.connect(oracle).submitDeployment({
      facilityId: facilityTwo,
      admin: admin.address,
      serialHash: ethers.keccak256(ethers.toUtf8Bytes("SERIAL-BOND-102")),
      siteHash: ethers.keccak256(ethers.toUtf8Bytes("SITE-BOND-102")),
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes("facility-metadata-bond-102")),
      acquisitionCostUSDC6: 50_000_000n,
      commissionedAt: 1_775_001_900n,
      activateOnMint: true
    });

    await deyeRwa
      .connect(admin)
      .approve(await rwaVault.getAddress(), await deyeRwa.facilityTokenId(facilityOne));
    await deyeRwa
      .connect(admin)
      .approve(await rwaVault.getAddress(), await deyeRwa.facilityTokenId(facilityTwo));

    await rwaVault.connect(admin).depositFacility(facilityOne, admin.address);
    expect(await (await rwaVault.navPerShare())).to.equal(1_000_000n);

    const periodId = ethers.encodeBytes32String("2026-BOND-P01");
    const rewardAmount = 5_000_000n;
    const claimRoot = distributionLeaf(periodId, facilityOne, rewardAmount);

    await functionsRouter
      .connect(oracle)
      .submitProductionReport(
        facilityOne,
        periodId,
        rewardAmount,
        ethers.keccak256(ethers.toUtf8Bytes("production-bond-p01"))
      );
    await functionsRouter
      .connect(oracle)
      .submitCashflowReport(
        facilityOne,
        periodId,
        rewardAmount,
        ethers.keccak256(ethers.toUtf8Bytes("cashflow-bond-p01"))
      );

    await usdc.mint(treasury.address, rewardAmount);
    await usdc.connect(treasury).approve(await energyRevenue.getAddress(), rewardAmount);
    await energyRevenue
      .connect(treasury)
      .depositRevenue(
        facilityOne,
        periodId,
        rewardAmount,
        ethers.keccak256(ethers.toUtf8Bytes("settlement-bond-p01"))
      );
    await energyRevenue.connect(treasury).fundReward(facilityOne, periodId, rewardAmount, claimRoot);

    await expect(
      rewardDistributor.connect(admin).claim(facilityOne, periodId, rewardAmount, [])
    ).to.be.revertedWith("not current holder");

    await expect(rwaVault.connect(investor).claimReward(facilityOne, periodId, rewardAmount, [])).to.not.be
      .reverted;

    expect(await usdc.balanceOf(await rwaVault.getAddress())).to.equal(rewardAmount);
    expect(await rwaVault.totalAssetsUSDC6()).to.equal(105_000_000n);
    expect(await rwaVault.navPerShare()).to.equal(1_050_000n);

    const sharesBeforeSecondDeposit = await rwaVault.totalSupply();
    await rwaVault.connect(admin).depositFacility(facilityTwo, admin.address);

    const mintedOnSecondDeposit = (await rwaVault.totalSupply()) - sharesBeforeSecondDeposit;
    expect(mintedOnSecondDeposit).to.equal((50_000_000n * sharesBeforeSecondDeposit) / 105_000_000n);
    expect(await rwaVault.navPerShare()).to.equal(1_050_000n);

    const adminBondBalance = await rwaVault.balanceOf(admin.address);
    await expect(
      rwaVault.connect(admin).transfer(investor.address, adminBondBalance / 2n)
    ).to.not.be.reverted;
    expect(await rwaVault.balanceOf(investor.address)).to.equal(adminBondBalance / 2n);
  });
});
