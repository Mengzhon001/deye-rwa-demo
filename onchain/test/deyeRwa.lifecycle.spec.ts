import { expect } from "chai";
import { ethers } from "hardhat";

async function deployCoreFixture() {
  const [admin, oracle, treasury, facilityAdmin, secondHolder] = await ethers.getSigners();

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

  return {
    admin,
    oracle,
    treasury,
    facilityAdmin,
    secondHolder,
    usdc,
    deyeRwa,
    rewardDistributor,
    energyRevenue,
    functionsRouter
  };
}

describe("DeyeRWA lifecycle", function () {
  it("mints one transferable facility token and rejects duplicate deployment", async function () {
    const { oracle, facilityAdmin, secondHolder, deyeRwa, functionsRouter } = await deployCoreFixture();

    const facilityId = ethers.keccak256(ethers.toUtf8Bytes("FAC-DEMO-001"));
    const deployment = {
      facilityId,
      admin: facilityAdmin.address,
      serialHash: ethers.keccak256(ethers.toUtf8Bytes("SERIAL-001")),
      siteHash: ethers.keccak256(ethers.toUtf8Bytes("SG-DEMO-SITE-001")),
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes("facility-metadata-001")),
      acquisitionCostUSDC6: 125_000_000n,
      commissionedAt: 1_775_001_600n,
      activateOnMint: true
    };

    await expect(functionsRouter.connect(oracle).submitDeployment(deployment)).to.not.be.reverted;

    const facility = await deyeRwa.getFacility(facilityId);
    expect(facility.admin).to.equal(facilityAdmin.address);
    expect(facility.status).to.equal(1n);
    expect(await deyeRwa.ownerOfFacility(facilityId)).to.equal(facilityAdmin.address);

    await expect(functionsRouter.connect(oracle).submitDeployment(deployment)).to.be.revertedWith(
      "deployment already submitted"
    );

    const tokenId = await deyeRwa.facilityTokenId(facilityId);
    await expect(
      deyeRwa.connect(facilityAdmin).transferFrom(facilityAdmin.address, secondHolder.address, tokenId)
    ).to.not.be.reverted;
    expect(await deyeRwa.ownerOfFacility(facilityId)).to.equal(secondHolder.address);
  });

  it("updates lifecycle status through the router", async function () {
    const { oracle, facilityAdmin, deyeRwa, functionsRouter } = await deployCoreFixture();

    const facilityId = ethers.keccak256(ethers.toUtf8Bytes("FAC-DEMO-STATUS"));
    await functionsRouter.connect(oracle).submitDeployment({
      facilityId,
      admin: facilityAdmin.address,
      serialHash: ethers.keccak256(ethers.toUtf8Bytes("SERIAL-STATUS")),
      siteHash: ethers.keccak256(ethers.toUtf8Bytes("SITE-STATUS")),
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes("facility-metadata-status")),
      acquisitionCostUSDC6: 90_000_000n,
      commissionedAt: 1_775_001_700n,
      activateOnMint: true
    });

    await expect(
      functionsRouter.connect(oracle).submitLifecycleEvent(
        facilityId,
        0,
        ethers.keccak256(ethers.toUtf8Bytes("broken-event"))
      )
    ).to.not.be.reverted;
    expect((await deyeRwa.getFacility(facilityId)).status).to.equal(0n);

    await expect(
      functionsRouter.connect(oracle).submitLifecycleEvent(
        facilityId,
        2,
        ethers.keccak256(ethers.toUtf8Bytes("retired-event"))
      )
    ).to.not.be.reverted;
    expect((await deyeRwa.getFacility(facilityId)).status).to.equal(2n);
  });
});
