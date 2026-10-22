import {expect} from 'chai';
import {ethers,network} from 'hardhat';
import {deployRevenue} from '../scripts/deploy-revenue';
const h=ethers.id,cash=(n:number)=>BigInt(n)*1000000n;
async function fixture(){
 const [admin,agent,trustee,,treasury,owner,investor,other]=await ethers.getSigners();
 const m=await deployRevenue(),v:any=await ethers.getContractAt(m.contractName!,m.addresses.vault),u:any=await ethers.getContractAt('MockUSDC',m.addresses.usdc),n:any=await ethers.getContractAt('DeyeRWA',m.addresses.station),b:any=await ethers.getContractAt('HouseholdBilling',m.addresses.billing!);
 const station=h('bill-station');await n.connect(agent).mintFacility(station,owner.address,h('device'),h('site'),h('meta'),cash(900),1,true);await n.connect(owner).approve(await v.getAddress(),BigInt(station));await v.connect(agent).admit(station,owner.address,cash(900),h('agreement'));
 const now=(await ethers.provider.getBlock('latest'))!.timestamp;await v.connect(agent).proposeValuation(h('report'),cash(900),0,0,now,now+86400);await v.connect(trustee).approveValuation(await v.valuationNonce());await v.connect(agent).publish(cash(1000),now+80000,h('terms'));await v.connect(agent).setEligible(investor.address,true);await u.mint(investor.address,cash(1000));await u.connect(investor).approve(await v.getAddress(),cash(1000));await v.connect(investor).subscribe(cash(1000),h('terms'));const sub=await v.subscriptions(investor.address);await v.connect(agent).reviewSubscription(investor.address,await v.subscriptionNonce(investor.address),sub.amount,sub.terms,true,h('review'));await v.connect(agent).settle(h('settlement'));
 await u.mint(owner.address,cash(300));await u.mint(treasury.address,cash(100));return {v,u,b,owner,agent,other,treasury,investor};
}
describe('Household USDC bills and independent receipt reconciliation',()=>{
 it('requires the named household, holds cash outside NAV and releases net cash only on manager confirmation',async()=>{
  const{v,u,b,owner,agent,other,treasury}=await fixture(),id=h('period1'),address=await b.getAddress(),before=await u.balanceOf(await v.getAddress());
  await expect(b.connect(owner).publishBill(id,owner.address,cash(80),cash(20),cash(95),cash(5),h('evidence'))).revertedWith('manager required');
  await b.connect(agent).publishBill(id,owner.address,cash(80),cash(20),cash(95),cash(5),h('evidence'));
  await expect(b.connect(agent).confirmReceipt(id)).revertedWith('payment incomplete or confirmed');
  await expect(b.connect(other).payBill(id)).revertedWith('bill payer required');
  await u.connect(owner).approve(address,cash(80));const ownerBefore=await u.balanceOf(owner.address);
  await expect(b.connect(owner).payBill(id)).emit(b,'HouseholdPaid').withArgs(id,owner.address,cash(80));expect(ownerBefore-await u.balanceOf(owner.address)).eq(cash(80));expect(await u.balanceOf(address)).eq(cash(80));expect(await u.balanceOf(await v.getAddress())).eq(before);
  await expect(b.connect(owner).payBill(id)).revertedWith('bill not payable');await expect(b.connect(agent).confirmReceipt(id)).revertedWith('payment incomplete or confirmed');await expect(b.connect(owner).fundExport(id)).revertedWith('export treasury required');
  await u.connect(treasury).approve(address,cash(20));await b.connect(treasury).fundExport(id);await expect(b.connect(treasury).fundExport(id)).revertedWith('export not payable');
  await expect(b.connect(owner).confirmReceipt(id)).revertedWith('manager required');const costsBefore=await u.balanceOf(treasury.address);
  await expect(b.connect(agent).confirmReceipt(id)).emit(v,'RevenueReceived').withArgs(id,h('evidence'),cash(95));expect(await u.balanceOf(await v.getAddress())-before).eq(cash(95));expect(await u.balanceOf(treasury.address)-costsBefore).eq(cash(5));expect(await u.balanceOf(address)).eq(0);expect(await v.newReceipts()).eq(cash(95));
  await expect(b.connect(agent).confirmReceipt(id)).revertedWith('payment incomplete or confirmed');await expect(b.connect(agent).publishBill(id,owner.address,cash(80),cash(20),cash(95),cash(5),h('evidence'))).revertedWith('bill already published');
 });
 it('keeps bill identities separate even when the amount is identical and preserves an unassigned household portion',async()=>{
  const{u,b,owner,agent,treasury}=await fixture(),a=h('bill-a'),c=h('bill-b'),address=await b.getAddress();
  for(const id of[a,c])await b.connect(agent).publishBill(id,owner.address,cash(80),cash(20),cash(76),cash(5),h('evidence'));
  await u.connect(owner).approve(address,cash(160));await b.connect(owner).payBill(a);expect((await b.bills(c)).householdPaid).eq(false);await u.connect(treasury).approve(address,cash(20));await b.connect(treasury).fundExport(a);const before=await u.balanceOf(owner.address);await b.connect(agent).confirmReceipt(a);expect(await u.balanceOf(owner.address)-before).eq(cash(19));
 });
 it('supports an export-only period without a fictitious household payment and rejects unfunded allocations',async()=>{
  const{b,u,agent,owner,treasury}=await fixture(),id=h('export-only'),address=await b.getAddress();
  await expect(b.connect(agent).publishBill(id,owner.address,0,cash(20),cash(21),0,h('evidence'))).revertedWith('invalid allocation');
  await b.connect(agent).publishBill(id,owner.address,0,cash(20),cash(19),cash(1),h('evidence'));expect((await b.bills(id)).householdPaid).eq(true);await u.connect(treasury).approve(address,cash(20));await b.connect(treasury).fundExport(id);await b.connect(agent).confirmReceipt(id);
 });
});
