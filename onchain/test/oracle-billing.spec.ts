import {expect} from "chai";
import {ethers} from "hardhat";

const fields = [
  {name:"purpose",type:"uint8"},{name:"observationMonth",type:"uint32"},
  {name:"servicePeriod",type:"uint16"},{name:"revision",type:"uint32"},
  {name:"issuedAt",type:"uint64"},{name:"validUntil",type:"uint64"},
  {name:"observationEndUtc",type:"uint64"},{name:"signerEpoch",type:"uint64"},
  {name:"vault",type:"address"},{name:"billing",type:"address"},
  {name:"paymentToken",type:"address"},{name:"payer",type:"address"},
  {name:"stationKey",type:"bytes32"},{name:"billId",type:"bytes32"},
  {name:"sourceKind",type:"bytes32"},
  {name:"sourceDigest",type:"bytes32"},{name:"inputDigest",type:"bytes32"},
  {name:"paramsHash",type:"bytes32"},{name:"householdAmount",type:"uint256"},
  {name:"exportAmount",type:"uint256"},{name:"costsAmount",type:"uint256"},
  {name:"assignedAmount",type:"uint256"},
];

describe("self-hosted Oracle report and enforced household billing", function () {
  async function setup() {
    const [admin, trusteeA, trusteeB, reporter, manager, treasury, owner, other] = await ethers.getSigners();
    const token = await ethers.deployContract("MockUSDC", [admin.address]);
    const vault = await ethers.deployContract("MockOracleVault", [await token.getAddress()]);
    const registry = await ethers.deployContract("OracleReportRegistry", [admin.address,trusteeA.address,trusteeB.address,reporter.address,await vault.getAddress(),await token.getAddress()]);
    const billing = await ethers.deployContract("HouseholdBillingV2", [await token.getAddress(),await vault.getAddress(),manager.address,treasury.address,await registry.getAddress()]);
    await registry.connect(admin).bindBilling(await billing.getAddress());
    const chainId = Number((await ethers.provider.getNetwork()).chainId);
    const domain = {name:"Deye Oracle Report",version:"1",chainId,verifyingContract:await registry.getAddress()};
    const stationKey = ethers.id("station-one"), paramsHash=ethers.id("approved-terms"), billId=ethers.id("station-one-period-one");
    await registry.connect(trusteeA).approvePolicy(stationKey,paramsHash,202608);
    await registry.connect(trusteeB).approvePolicy(stationKey,paramsHash,202608);
    const now=(await ethers.provider.getBlock("latest"))!.timestamp;
    await vault.setState(2,0,now-10);
    const report = {
      purpose:1,observationMonth:202608,servicePeriod:1,revision:1,
      issuedAt:now,validUntil:now+3600,observationEndUtc:now-60,signerEpoch:1,
      vault:await vault.getAddress(),billing:await billing.getAddress(),paymentToken:await token.getAddress(),payer:owner.address,
      stationKey,billId,sourceKind:ethers.id("deye-api-direct"),sourceDigest:ethers.id("deye-source"),inputDigest:ethers.id("normalized-input"),paramsHash,
      householdAmount:100_000_000n,exportAmount:20_000_000n,costsAmount:5_000_000n,assignedAmount:115_000_000n,
    };
    const sign=(r:any,s=reporter)=>s.signTypedData(domain,{Report:fields},r);
    return {admin,trusteeA,trusteeB,reporter,manager,treasury,owner,other,token,vault,registry,billing,report,sign};
  }
  it("only publishes a bill after registration and transfers actual owner and export funds", async function () {
    const x=await setup(), r=x.report, sig=await x.sign(r);
    const reportId=await x.registry.digest(r);
    await expect(x.billing.connect(x.manager).publishBill(r.billId,reportId)).to.be.reverted;
    await expect(x.registry.registerReport(r,sig)).to.emit(x.registry,"ReportRegistered").withArgs(reportId,r.stationKey,r.observationMonth,r.servicePeriod,1,x.reporter.address);
    await expect(x.billing.connect(x.manager).publishBill(r.billId,reportId)).to.emit(x.registry,"ReportConsumed");
    await x.token.mint(x.owner.address,r.householdAmount);
    await x.token.mint(x.treasury.address,r.exportAmount);
    await x.token.connect(x.owner).approve(await x.billing.getAddress(),r.householdAmount);
    await x.token.connect(x.treasury).approve(await x.billing.getAddress(),r.exportAmount);
    await expect(x.billing.connect(x.owner).payBill(r.billId)).to.emit(x.billing,"HouseholdPaid");
    await expect(x.billing.connect(x.treasury).fundExport(r.billId)).to.emit(x.billing,"ExportFunded");
    await expect(x.billing.connect(x.manager).confirmReceipt(r.billId)).to.emit(x.vault,"RevenueReceived").withArgs(r.billId,reportId,r.assignedAmount);
    expect(await x.token.balanceOf(await x.vault.getAddress())).to.equal(r.assignedAmount);
    expect(await x.token.balanceOf(x.treasury.address)).to.equal(r.costsAmount);
    await expect(x.billing.connect(x.manager).confirmReceipt(r.billId)).to.be.reverted;
  });
  it("keeps historical validation reports out of billing", async function () {
    const x=await setup();const r={...x.report,purpose:0,servicePeriod:0};const id=await x.registry.digest(r);
    await x.registry.registerReport(r,await x.sign(r));
    await expect(x.billing.connect(x.manager).publishBill(r.billId,id)).to.be.revertedWith("report unavailable");
  });
  it("rejects unapproved parameters, wrong signer, replay and rotated signer", async function () {
    const x=await setup();const bad={...x.report,paramsHash:ethers.id("changed-terms")};
    await expect(x.registry.registerReport(bad,await x.sign(bad))).to.be.revertedWith("unapproved period or parameters");
    await expect(x.registry.registerReport(x.report,await x.sign(x.report,x.other))).to.be.revertedWith("invalid reporter signature");
    const sig=await x.sign(x.report);await x.registry.registerReport(x.report,sig);
    await expect(x.registry.registerReport(x.report,sig)).to.be.revertedWith("report already registered");
    await x.registry.connect(x.admin).rotateReporter(x.other.address);
    await expect(x.billing.connect(x.manager).publishBill(x.report.billId,await x.registry.digest(x.report))).to.be.revertedWith("report unavailable");
  });
  it("rejects replay data, a wrong month, an expired report and a wrong product", async function () {
    const x=await setup();
    for(const [change,reason] of [
      [{sourceKind:ethers.id("recording-replay")},"missing report field"],
      [{observationMonth:202607},"unapproved period or parameters"],
      [{validUntil:x.report.issuedAt},"stale report"],
      [{vault:x.owner.address},"wrong product"],
    ] as const){const r={...x.report,...change};await expect(x.registry.registerReport(r,await x.sign(r))).to.be.revertedWith(reason);}
  });
  it("requires both trustees to revoke before a higher revision can replace a report", async function () {
    const x=await setup();const id=await x.registry.digest(x.report);
    await x.registry.registerReport(x.report,await x.sign(x.report));
    const revision={...x.report,revision:2};
    await expect(x.registry.registerReport(revision,await x.sign(revision))).to.be.revertedWith("previous revision still active");
    await x.registry.connect(x.trusteeA).approveRevocation(id);
    await expect(x.registry.registerReport(revision,await x.sign(revision))).to.be.revertedWith("previous revision still active");
    await x.registry.connect(x.trusteeB).approveRevocation(id);
    await x.registry.registerReport(revision,await x.sign(revision));
    await expect(x.billing.connect(x.manager).publishBill(x.report.billId,id)).to.be.revertedWith("report unavailable");
    await x.billing.connect(x.manager).publishBill(x.report.billId,await x.registry.digest(revision));
  });
});
