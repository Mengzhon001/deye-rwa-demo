import { expect } from "chai";
import { ethers, network } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployRevenue } from "../scripts/deploy-revenue";
const cash = (n: number) => BigInt(Math.round(n * 1e6));
const h = (s: string) => ethers.id(s);
async function now() {
  return (await ethers.provider.getBlock("latest"))!.timestamp;
}
async function jump(t: number) {
  await network.provider.send("evm_setNextBlockTimestamp", [t]);
  await network.provider.send("evm_mine");
}
async function setup() {
  const m = await deployRevenue(),
    [admin, agent, trustee, trustee2, treasury, owner, alice, bob, outsider] =
      await ethers.getSigners();
  const v: any = await ethers.getContractAt(
      "RevenueShareVault",
      m.addresses.vault
    ),
    u: any = await ethers.getContractAt("MockUSDC", m.addresses.usdc),
    nft: any = await ethers.getContractAt("DeyeRWA", m.addresses.station);
  const station = h("station-1");
  await nft
    .connect(agent)
    .mintFacility(
      station,
      owner.address,
      h("device"),
      h("site"),
      h("metadata"),
      cash(900),
      await now(),
      true
    );
  await nft.connect(owner).approve(await v.getAddress(), BigInt(station));
  await v
    .connect(agent)
    .admit(station, owner.address, cash(900), h("agreement"));
  for (const investor of [alice, bob]) {
    await v.connect(agent).setEligible(investor.address, true);
    await u.mint(investor.address, cash(10000));
    await u.connect(investor).approve(await v.getAddress(), cash(10000));
  }
  await u.mint(treasury.address, cash(10000));
  await u.connect(treasury).approve(await v.getAddress(), cash(10000));
  async function price(rights = cash(900), receivables = 0n, fees = 0n) {
    const at = await now();
    await v
      .connect(agent)
      .proposeValuation(
        h(`valuation-${await v.valuationNonce()}`),
        rights,
        receivables,
        fees,
        at,
        at + 31 * 86400
      );
    await v.connect(trustee).approveValuation(await v.valuationNonce());
  }
  await price();
  await v
    .connect(agent)
    .publish(cash(1000), (await now()) + 30 * 86400, h("terms"));
  async function subscribe(a = 600, b = 400) {
    await v.connect(alice).subscribe(cash(a), h("terms"));
    if (b) await v.connect(bob).subscribe(cash(b), h("terms"));
  }
  async function settle() {
    await subscribe();
    await jump((await now()) + 3 * 86400 + 1);
    await v.connect(agent).settle(h("settlement-evidence"));
    await price();
  }
  async function month() {
    await jump(Number(await v.nextFeeAt()));
    await v.accrueFees();
    await price((await now()) >= Number(await v.expiresAt()) ? 0n : cash(900));
  }
  async function revenue(n: number = 100) {
    await v
      .connect(treasury)
      .receiveRevenue(
        h(`receipt-${await now()}`),
        cash(n),
        h("observed+simulated")
      );
    await price();
  }
  return {
    v,
    u,
    nft,
    agent,
    trustee,
    trustee2,
    treasury,
    owner,
    alice,
    bob,
    outsider,
    station,
    price,
    subscribe,
    settle,
    month,
    revenue,
  };
}
describe("Revenue-share pool (separate from legacy)", function () {
  this.timeout(120000);
  it("admits one station without minting investor shares; custody remains distinct from equipment ownership", async () => {
    const { v, nft, station } = await loadFixture(setup);
    expect(await v.totalSupply()).eq(0);
    expect(await nft.ownerOf(BigInt(station))).eq(await v.getAddress());
    expect(await v.rightCount()).eq(1);
  });
  it("enforces eligibility, cooling-off, binding terms and failed fundraising refunds", async () => {
    const { v, u, alice, outsider, agent } = await loadFixture(setup);
    await expect(
      v.connect(outsider).subscribe(cash(1), h("terms"))
    ).revertedWith("subscription unavailable");
    await expect(
      v.connect(alice).subscribe(cash(1), h("different"))
    ).revertedWith("invalid subscription");
    await v.connect(alice).subscribe(cash(500), h("terms"));
    await expect(v.connect(alice).subscribe(1, h("terms"))).revertedWith(
      "one active subscription"
    );
    await v.connect(alice).withdrawSubscription();
    expect(await v.totalSubscriptions()).eq(0);
    await v.connect(alice).subscribe(cash(500), h("terms"));
    await jump((await now()) + 3 * 86400 + 1);
    await expect(v.connect(alice).withdrawSubscription()).revertedWith(
      "refund unavailable"
    );
    await v.connect(agent).failFundraising();
    await v.connect(alice).withdrawSubscription();
    expect(await v.totalSupply()).eq(0);
    expect(await u.balanceOf(alice.address)).eq(cash(10000));
  });
  it("rejects 70% funding that cannot pay all rights plus reserve, and mints only after successful settlement", async () => {
    const { v, u, alice, bob, owner, agent, price } = await loadFixture(setup);
    await v.connect(alice).subscribe(cash(700), h("terms"));
    await expect(
      v.connect(agent).settle(h("settlement-evidence"))
    ).revertedWith("insufficient confirmed funding");
    await v.connect(bob).subscribe(cash(300), h("terms"));
    await expect(
      v.connect(agent).settle(h("settlement-evidence"))
    ).revertedWith("unconfirmed order");
    await jump((await now()) + 3 * 86400 + 1);
    await v.connect(agent).settle(h("settlement-evidence"));
    expect(await u.balanceOf(owner.address)).eq(cash(900));
    expect(await v.totalSupply()).eq(cash(1000));
    expect(await v.operatingReserve()).eq(cash(100));
    expect(await v.balanceOf(alice.address)).eq(cash(700));
    await expect(
      v.connect(agent).settle(h("settlement-evidence"))
    ).revertedWith("cannot settle");
    await expect(v.connect(alice).subscribe(1, h("terms"))).revertedWith(
      "subscription unavailable"
    );
    expect(await v.fresh()).eq(false);
    await price();
    expect(await v.nav()).eq(cash(1000));
  });
  it("rejects stale prices and unauthorized roles; monthly fees require approved opening NAV", async () => {
    const { v, alice, outsider, settle, price, month } = await loadFixture(
      setup
    );
    await jump((await now()) + 32 * 86400);
    await expect(v.connect(alice).subscribe(1, h("terms"))).revertedWith(
      "subscription unavailable"
    );
    await expect(v.connect(outsider).setEligible(outsider.address, true))
      .reverted;
    // Use a fresh fixture because the first fundraising deadline has passed.
    const f = await setup();
    await f.settle();
    await f.month();
    expect(await f.v.feeLiability()).gt(0);
    await jump(Number(await f.v.nextFeeAt()));
    await f.v.accrueFees();
    await jump(Number(await f.v.nextFeeAt()));
    await expect(f.v.accrueFees()).revertedWith("monthly approval required");
  });
  it("does not distribute the initial buffer; receipts are counted once and claims preserve NAV", async () => {
    const { v, u, agent, alice, settle, month, revenue, price, treasury } =
      await loadFixture(setup);
    await settle();
    for (let i = 0; i < 3; i++) await month();
    await v.connect(agent).distribute(cash(6), cash(3), h("expenses"));
    expect(await v.claimable(1, alice.address)).eq(0);
    expect(await v.redemptionCash()).eq(0);
    await revenue(100);
    await expect(
      v.connect(treasury).receiveRevenue(h("duplicate"), cash(1), h("proof"))
    ).not.reverted;
    await expect(
      v.connect(treasury).receiveRevenue(h("duplicate"), cash(1), h("proof"))
    ).revertedWith("invalid receipt");
    await price();
    for (let i = 0; i < 3; i++) await month();
    await v.connect(agent).distribute(cash(6), cash(3), h("expenses-2"));
    await price();
    const nav = await v.nav(),
      owed = await v.claimable(2, alice.address);
    expect(owed).gt(0);
    await v.connect(alice).claim(2);
    expect(await v.nav()).eq(nav);
    await expect(v.connect(alice).claim(2)).revertedWith("nothing to claim");
  });
  it("enforces all transfer paths, buyer consent, atomic payment and price-deviation review", async () => {
    const { v, u, agent, alice, bob, outsider, settle, month, price } =
      await loadFixture(setup);
    await settle();
    await expect(v.connect(alice).transfer(bob.address, 1)).revertedWith(
      "restricted transfer"
    );
    await v.connect(alice).approve(outsider.address, 1);
    await expect(
      v.connect(outsider).transferFrom(alice.address, bob.address, 1)
    ).revertedWith("restricted transfer");
    let until = (await now()) + 86400;
    await expect(
      v.connect(alice).peerTransfer(bob.address, 1, 1, until, 1)
    ).revertedWith("transfer locked");
    for (let i = 0; i < 6; i++) await month();
    until = (await now()) + 86400;
    await expect(
      v.connect(alice).peerTransfer(bob.address, cash(10), cash(20), until, 1)
    ).revertedWith("trade not authorized");
    await v
      .connect(bob)
      .consentToTrade(alice.address, cash(10), cash(20), until, 1);
    await expect(
      v.connect(alice).peerTransfer(bob.address, cash(10), cash(20), until, 1)
    ).revertedWith("review required");
    const id = await v.transferId(
      alice.address,
      bob.address,
      cash(10),
      cash(20),
      until,
      1
    );
    await v.connect(agent).approvePeerTransfer(id);
    const before = await u.balanceOf(alice.address);
    await v
      .connect(alice)
      .peerTransfer(bob.address, cash(10), cash(20), until, 1);
    expect(await v.balanceOf(bob.address)).eq(cash(410));
    expect((await u.balanceOf(alice.address)) - before).eq(cash(20));
    await expect(
      v.connect(alice).peerTransfer(bob.address, cash(10), cash(20), until, 1)
    ).revertedWith("trade not authorized");
  });
  it("keeps escrowed shares in distribution snapshots, applies proportional gates and carries cancellable remainders", async () => {
    const { v, agent, alice, bob, settle, month, revenue, price } =
      await loadFixture(setup);
    await settle();
    for (let i = 0; i < 6; i++) await month();
    await v.connect(alice).requestRedemption(cash(120));
    await v.connect(bob).requestRedemption(cash(80));
    expect(await v.economicBalance(alice.address)).eq(cash(600));
    await revenue(1000);
    // Catch up both quarterly expense declarations at the six-month cutoff.
    await v.connect(agent).distribute(cash(6), cash(3), h("q1"));
    await price();
    await v.connect(agent).distribute(cash(6), cash(3), h("q2"));
    await price();
    const claim = await v.claimable(1, alice.address);
    expect(claim).gt(0);
    for (let i = 0; i < 3; i++) await month();
    await expect(v.connect(alice).cancelRedemption()).revertedWith(
      "cutoff passed"
    );
    const total = await v.totalSupply(),
      nav = await v.nav();
    await v.connect(agent).processRedemptions();
    const a = await v.redemptions(alice.address),
      b = await v.redemptions(bob.address);
    expect(a.shares).gt(0);
    expect(a.shares * 2n - b.shares * 3n).lte(2n);
    expect(nav - (await v.nav())).lte((nav * 5n) / 100n);
    expect(await v.claimable(1, alice.address)).eq(claim);
    await v.connect(alice).cancelRedemption();
    expect((await v.redemptions(alice.address)).shares).eq(0);
  });
  it("uses a fixed ownership snapshot and requires two distinct trustees", async () => {
    const { v, agent, trustee, trustee2, alice, bob, settle, month } =
      await loadFixture(setup);
    await settle();
    await v.connect(agent).openCase(h("missing remittance"), trustee2.address);
    await expect(v.connect(trustee).approveCase(1)).revertedWith(
      "threshold not met"
    );
    await v.connect(bob).supportCase(1);
    await expect(v.connect(bob).supportCase(1)).revertedWith("invalid vote");
    await v.connect(trustee).approveCase(1);
    await expect(v.connect(trustee).approveCase(1)).revertedWith(
      "distinct trustee required"
    );
    await v.connect(trustee2).approveCase(1);
    expect(await v.collectionRecipient()).eq(trustee2.address);
    expect((await v.cases(1)).executed).eq(true);
  });
  it("rolls an unfunded redemption window without burning requests, and allows cancellation before the new cutoff", async () => {
    const { v, agent, alice, settle, month } = await loadFixture(setup);
    await settle();
    for (let i = 0; i < 6; i++) await month();
    await v.connect(alice).requestRedemption(cash(100));
    for (let i = 0; i < 3; i++) await month();
    const supply = await v.totalSupply();
    await v.connect(agent).processRedemptions();
    expect(await v.totalSupply()).eq(supply);
    expect((await v.redemptions(alice.address)).shares).eq(cash(100));
    await v.connect(alice).cancelRedemption();
    expect(await v.balanceOf(alice.address)).eq(cash(600));
  });
  it("preserves snapshot votes after a peer sale and rolls back both legs if token delivery fails", async () => {
    const { v, u, agent, alice, bob, trustee2, settle, month } =
      await loadFixture(setup);
    await settle();
    for (let i = 0; i < 6; i++) await month();
    await v.connect(agent).openCase(h("receipt diversion"), trustee2.address);
    const until = (await now()) + 86400;
    await v
      .connect(alice)
      .consentToTrade(bob.address, cash(400), cash(400), until, 2);
    await v
      .connect(bob)
      .peerTransfer(alice.address, cash(400), cash(400), until, 2);
    expect(await v.balanceOf(bob.address)).eq(0);
    await v.connect(bob).supportCase(1);
    expect((await v.cases(1)).support).eq(cash(400));
    await v
      .connect(alice)
      .consentToTrade(bob.address, cash(10), cash(10), until, 3);
    const balance = await u.balanceOf(alice.address);
    await expect(
      v.connect(bob).peerTransfer(alice.address, cash(10), cash(10), until, 3)
    ).reverted;
    expect(await u.balanceOf(alice.address)).eq(balance);
  });
  it("releases station-token custody after failed fundraising independently of investor refunds", async () => {
    const { v, nft, station, agent, owner, alice } = await loadFixture(setup);
    await v.connect(alice).subscribe(cash(100), h("terms"));
    await expect(v.connect(owner).releaseStation(0)).revertedWith(
      "rights still committed"
    );
    await v.connect(agent).failFundraising();
    await v.connect(owner).releaseStation(0);
    expect(await nft.ownerOf(BigInt(station))).eq(owner.address);
    await v.connect(alice).withdrawSubscription();
    await expect(v.connect(owner).releaseStation(0)).revertedWith(
      "release unavailable"
    );
  });
  it("ends without principal repayment after final receivable and expense reconciliation", async () => {
    const { v, u, agent, alice, bob, settle, month, price } = await loadFixture(
      setup
    );
    await settle();
    for (let i = 1; i <= 60; i++) {
      await month();
      if (i === 60) await price(0n);
      if (i % 3 === 0) {
        await v.connect(agent).distribute(cash(6), cash(3), h(`quarter-${i}`));
        await price(i === 60 ? 0n : cash(900));
      }
    }
    const cashBefore = await v.nav();
    expect(cashBefore).lt(cash(100));
    await v.connect(agent).closeProduct();
    expect(await v.phase()).eq(4);
    const finalId = await v.distributionCount();
    expect(
      (await v.claimable(finalId, alice.address)) +
        (await v.claimable(finalId, bob.address))
    ).eq(cashBefore);
    await v.connect(alice).claim(finalId);
    await v.connect(bob).claim(finalId);
    expect(await u.balanceOf(await v.getAddress())).eq(0);
  });
});
