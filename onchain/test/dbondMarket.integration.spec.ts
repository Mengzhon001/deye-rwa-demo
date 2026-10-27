import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ethers } from "hardhat";
import {
  buyBond,
  claimViaVault,
  deployFacilityToBondInventory,
  loadDemoContext,
  mintDemoUsdc,
  redeemBond,
  submitPeriod
} from "../scripts/demo-conductor";
import { deployDemoContracts } from "../scripts/deploy";

function readJsonFixture<T>(relativePath: string): T {
  return JSON.parse(
    readFileSync(resolve(__dirname, "../../offchain/examples", relativePath), "utf8")
  ) as T;
}

describe("DBondMarket integration", function () {
  it("covers deploy to vault inventory, reward accrual, investor buy, and investor redeem", async function () {
    const [, , , , investor] = await ethers.getSigners();
    const facilityRecord = readJsonFixture<Record<string, unknown>>("facility-record.sample.json");
    const periodPayload = readJsonFixture<{
      facilityId: `0x${string}`;
      rewardFunding: { amountUSDC6: string };
    } & Record<string, unknown>>("period-payload.sample.json");

    const manifest = await deployDemoContracts();
    const context = await loadDemoContext(manifest);

    const deployment = await deployFacilityToBondInventory(context, facilityRecord, {
      adminAddress: manifest.accounts.deployer
    });
    expect(deployment.vaultDeposit.receiver).to.equal(manifest.contracts.dbondMarket);
    expect(await context.contracts.deyeRwa.ownerOfFacility(periodPayload.facilityId)).to.equal(
      manifest.contracts.rwaVault
    );

    await submitPeriod(context, periodPayload);
    await claimViaVault(context, periodPayload);

    const buyAmount = 10n * 10n ** 18n;
    const buyCost = await context.contracts.dbondMarket.previewBuyCostUSDC6(buyAmount);
    await mintDemoUsdc(context, investor.address as `0x${string}`, buyCost);
    const buy = await buyBond(context, investor.address as `0x${string}`, buyAmount);
    expect(await context.contracts.rwaVault.balanceOf(investor.address)).to.equal(buyAmount);

    const redeem = await redeemBond(context, investor.address as `0x${string}`, 5n * 10n ** 18n);
    expect(BigInt(redeem.payoutUSDC6)).to.be.gt(0n);
    expect(await context.contracts.dbondMarket.availableInventoryDBOND()).to.be.gt(0n);
  });
});
