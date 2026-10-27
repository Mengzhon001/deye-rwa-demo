import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethers } from "hardhat";
import {
  deployFacilityOnchain,
  loadDemoContext,
  runDemo,
  submitLifecycle
} from "../scripts/demo-conductor";
import { deployDemoContracts } from "../scripts/deploy";

function readJsonFixture<T>(relativePath: string): T {
  return JSON.parse(
    readFileSync(resolve(__dirname, "../../offchain/examples", relativePath), "utf8")
  ) as T;
}

describe("Full demo orchestration", function () {
  it("runs the direct-claim workflow from off-chain deployment artifact to on-chain reward claim", async function () {
    const [, , , facilityAdmin] = await ethers.getSigners();
    const facilityRecord = readJsonFixture<Record<string, unknown>>("facility-record.sample.json");
    const periodPayload = readJsonFixture<{
      facilityId: `0x${string}`;
      rewardFunding: { amountUSDC6: string };
    } & Record<string, unknown>>("period-payload.sample.json");

    const manifest = await deployDemoContracts();
    const context = await loadDemoContext(manifest);

    const result = await runDemo(
      context,
      facilityRecord,
      periodPayload,
      "direct",
      { adminAddress: facilityAdmin.address as `0x${string}` }
    );

    expect(result.deployment.owner).to.equal(facilityAdmin.address);
    expect(
      await context.contracts.mockUsdc.balanceOf(facilityAdmin.address)
    ).to.equal(BigInt(periodPayload.rewardFunding.amountUSDC6));
  });

  it("runs the vault branch and accrues reward value into digital bond NAV", async function () {
    const [, , , , investor] = await ethers.getSigners();
    const facilityRecord = readJsonFixture<Record<string, unknown>>("facility-record.sample.json");
    const periodPayload = readJsonFixture<{
      facilityId: `0x${string}`;
      rewardFunding: { amountUSDC6: string };
    } & Record<string, unknown>>("period-payload.sample.json");

    const manifest = await deployDemoContracts();
    const context = await loadDemoContext(manifest);

    const result = await runDemo(
      context,
      facilityRecord,
      periodPayload,
      "vault",
      {
        adminAddress: manifest.accounts.deployer,
        receiver: investor.address as `0x${string}`
      }
    );

    expect(
      await context.contracts.deyeRwa.ownerOfFacility(periodPayload.facilityId)
    ).to.equal(manifest.contracts.rwaVault);
    expect(
      await context.contracts.mockUsdc.balanceOf(manifest.contracts.rwaVault)
    ).to.equal(BigInt(periodPayload.rewardFunding.amountUSDC6));
    expect(await context.contracts.rwaVault.balanceOf(investor.address)).to.be.gt(0n);
    expect(result.vaultDeposit).to.not.equal(undefined);
    expect(await context.contracts.rwaVault.totalAssetsUSDC6()).to.equal(
      125_000_000n + BigInt(periodPayload.rewardFunding.amountUSDC6)
    );
  });

  it("submits broken and retired lifecycle events after deployment", async function () {
    const [, , , facilityAdmin] = await ethers.getSigners();
    const facilityRecord = readJsonFixture<Record<string, unknown>>("facility-record.sample.json");
    const brokenEvent = readJsonFixture<Record<string, unknown>>("lifecycle-broken.sample.json");
    const retiredEvent = readJsonFixture<Record<string, unknown>>("lifecycle-retired.sample.json");
    const facilityId = (facilityRecord.assetId ?? brokenEvent.assetId) as `0x${string}`;

    const manifest = await deployDemoContracts();
    const context = await loadDemoContext(manifest);

    await deployFacilityOnchain(context, facilityRecord, {
      adminAddress: facilityAdmin.address as `0x${string}`
    });

    const brokenResult = await submitLifecycle(context, brokenEvent);
    expect(brokenResult.status).to.equal("PENDING");
    expect((await context.contracts.deyeRwa.getFacility(facilityId)).status).to.equal(0n);

    const retiredResult = await submitLifecycle(context, retiredEvent);
    expect(retiredResult.status).to.equal("RETIRED");
    expect((await context.contracts.deyeRwa.getFacility(facilityId)).status).to.equal(2n);
  });
});
