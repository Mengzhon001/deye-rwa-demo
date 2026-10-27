import { expect } from "chai";
import { ethers } from "hardhat";
import { loadDemoContext, mintDemoUsdc } from "../scripts/demo-conductor";
import { deployDemoContracts } from "../scripts/deploy";

async function deployMarketFixture() {
  const manifest = await deployDemoContracts();
  const context = await loadDemoContext(manifest);
  const [deployer, oracle, treasury, investor] = await ethers.getSigners();

  return {
    manifest,
    context,
    deployer,
    oracle,
    treasury,
    investor
  };
}

describe("DBondMarket flow", function () {
  it("sells DBOND inventory at vault NAV and accepts reserve-bounded redemptions", async function () {
    const { manifest, context, deployer, oracle, investor } = await deployMarketFixture();

    const facilityId = ethers.keccak256(ethers.toUtf8Bytes("FAC-MKT-001"));
    await context.contracts.functionsRouter.connect(oracle).submitDeployment({
      facilityId,
      admin: deployer.address,
      serialHash: ethers.keccak256(ethers.toUtf8Bytes("SERIAL-MKT-001")),
      siteHash: ethers.keccak256(ethers.toUtf8Bytes("SITE-MKT-001")),
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes("facility-metadata-mkt-001")),
      acquisitionCostUSDC6: 100_000_000n,
      commissionedAt: 1_775_001_600n,
      activateOnMint: true
    });

    const tokenId = await context.contracts.deyeRwa.facilityTokenId(facilityId);
    await context.contracts.deyeRwa.connect(deployer).approve(await context.contracts.rwaVault.getAddress(), tokenId);
    await context.contracts.rwaVault
      .connect(deployer)
      .depositFacility(facilityId, manifest.contracts.dbondMarket);

    const inventoryBefore = await context.contracts.dbondMarket.availableInventoryDBOND();
    const shareAmount = inventoryBefore / 4n;
    const buyCost = await context.contracts.dbondMarket.previewBuyCostUSDC6(shareAmount);

    await mintDemoUsdc(context, investor.address as `0x${string}`, buyCost * 2n);
    await context.contracts.mockUsdc.connect(investor).approve(manifest.contracts.dbondMarket, buyCost);

    await expect(
      context.contracts.dbondMarket.connect(investor).buy(shareAmount, buyCost, investor.address)
    ).to.not.be.reverted;

    expect(await context.contracts.rwaVault.balanceOf(investor.address)).to.equal(shareAmount);
    expect(await context.contracts.dbondMarket.availableInventoryDBOND()).to.equal(
      inventoryBefore - shareAmount
    );

    const redeemPayout = await context.contracts.dbondMarket.previewRedeemPayoutUSDC6(shareAmount / 2n);
    await context.contracts.rwaVault.connect(investor).approve(manifest.contracts.dbondMarket, shareAmount / 2n);

    await expect(
      context.contracts.dbondMarket.connect(investor).redeem(shareAmount / 2n, redeemPayout, investor.address)
    ).to.not.be.reverted;

    expect(await context.contracts.mockUsdc.balanceOf(investor.address)).to.equal(
      buyCost * 2n - buyCost + redeemPayout
    );
  });

  it("rejects redemptions that exceed the available reserve after NAV appreciates", async function () {
    const { manifest, context, deployer, oracle, treasury, investor } = await deployMarketFixture();

    const facilityId = ethers.keccak256(ethers.toUtf8Bytes("FAC-MKT-002"));
    await context.contracts.functionsRouter.connect(oracle).submitDeployment({
      facilityId,
      admin: deployer.address,
      serialHash: ethers.keccak256(ethers.toUtf8Bytes("SERIAL-MKT-002")),
      siteHash: ethers.keccak256(ethers.toUtf8Bytes("SITE-MKT-002")),
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes("facility-metadata-mkt-002")),
      acquisitionCostUSDC6: 400_000_000n,
      commissionedAt: 1_775_001_700n,
      activateOnMint: true
    });

    const tokenId = await context.contracts.deyeRwa.facilityTokenId(facilityId);
    await context.contracts.deyeRwa.connect(deployer).approve(await context.contracts.rwaVault.getAddress(), tokenId);
    await context.contracts.rwaVault
      .connect(deployer)
      .depositFacility(facilityId, manifest.contracts.dbondMarket);

    const shareAmount = await context.contracts.dbondMarket.availableInventoryDBOND();
    const buyCost = await context.contracts.dbondMarket.previewBuyCostUSDC6(shareAmount);

    await mintDemoUsdc(context, investor.address as `0x${string}`, buyCost);
    await context.contracts.mockUsdc.connect(investor).approve(manifest.contracts.dbondMarket, buyCost);
    await context.contracts.dbondMarket.connect(investor).buy(shareAmount, buyCost, investor.address);

    const periodId = ethers.encodeBytes32String("2026-MKT-P01");
    const rewardAmount = 300_000_000n;
    const claimRoot = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "bytes32", "uint256"],
        [periodId, facilityId, rewardAmount]
      )
    );

    await context.contracts.functionsRouter
      .connect(oracle)
      .submitProductionReport(
        facilityId,
        periodId,
        rewardAmount,
        ethers.keccak256(ethers.toUtf8Bytes("production-market-p01"))
      );
    await context.contracts.functionsRouter
      .connect(oracle)
      .submitCashflowReport(
        facilityId,
        periodId,
        rewardAmount,
        ethers.keccak256(ethers.toUtf8Bytes("cashflow-market-p01"))
      );
    await context.contracts.mockUsdc.mint(treasury.address, rewardAmount);
    await context.contracts.mockUsdc
      .connect(treasury)
      .approve(manifest.contracts.energyRevenue, rewardAmount);
    await context.contracts.energyRevenue
      .connect(treasury)
      .depositRevenue(
        facilityId,
        periodId,
        rewardAmount,
        ethers.keccak256(ethers.toUtf8Bytes("settlement-market-p01"))
      );
    await context.contracts.energyRevenue
      .connect(treasury)
      .fundReward(facilityId, periodId, rewardAmount, claimRoot);
    await context.contracts.rwaVault
      .connect(investor)
      .claimReward(facilityId, periodId, rewardAmount, []);

    await context.contracts.rwaVault.connect(investor).approve(manifest.contracts.dbondMarket, shareAmount);

    await expect(
      context.contracts.dbondMarket.connect(investor).redeem(
        shareAmount,
        await context.contracts.dbondMarket.previewRedeemPayoutUSDC6(shareAmount),
        investor.address
      )
    ).to.be.revertedWith("insufficient reserve");
  });
});
