import {expect} from 'chai';
import {writeFileSync} from 'node:fs';
import hre,{ethers,network} from 'hardhat';
import {monthlyCode,executable} from '../scripts/monthly-code';
import {deployRevenue} from '../scripts/deploy-revenue';
const cash=(n:number)=>BigInt(n)*1000000n,h=ethers.id;
describe('Monthly distribution and local storage-compatible maintenance',()=>{
 it('retains V4 balances, custody and old entitlements, then pays monthly and catches up expenses once',async()=>{
  const previous=process.env.REVENUE_DISTRIBUTION_INTERVAL_MONTHS;delete process.env.REVENUE_DISTRIBUTION_INTERVAL_MONTHS;
  try{
   const m=await deployRevenue(),[admin,agent,trustee,,treasury,owner,alice,bob]=await ethers.getSigners(),v:any=await ethers.getContractAt('RevenueShareVaultV4',m.addresses.vault),u:any=await ethers.getContractAt('MockUSDC',m.addresses.usdc),nft:any=await ethers.getContractAt('DeyeRWA',m.addresses.station);
   const sid=h('monthly-station');let seq=0;
   await nft.connect(agent).mintFacility(sid,owner.address,h('device'),h('site'),h('meta'),cash(900),1,true);await nft.connect(owner).approve(await v.getAddress(),BigInt(sid));await v.connect(agent).admit(sid,owner.address,cash(900),h('agreement'));
   async function value(rights=cash(900)){const at=(await ethers.provider.getBlock('latest'))!.timestamp;await v.connect(agent).proposeValuation(h('monthly-report'+seq++),rights,0,0,at,at+32*86400);await v.connect(trustee).approveValuation(await v.valuationNonce());}
   await value();await v.connect(agent).publish(cash(1000),(await ethers.provider.getBlock('latest'))!.timestamp+86400,h('terms'));
   for(const [investor,amount]of [[alice,600],[bob,400]] as const){await v.connect(agent).setEligible(investor.address,true);await u.mint(investor.address,cash(amount));await u.connect(investor).approve(await v.getAddress(),cash(amount));await v.connect(investor).subscribe(cash(amount),h('terms'));const sub=await v.subscriptions(investor.address);await v.connect(agent).reviewSubscription(investor.address,await v.subscriptionNonce(investor.address),sub.amount,sub.terms,true,h('review'));}
   await v.connect(agent).settle(h('settled'));await value();
   const patch=await monthlyCode({usdc:m.addresses.usdc,stationToken:m.addresses.station,feeRecipient:treasury.address});expect(executable(await ethers.provider.getCode(await v.getAddress()))).eq(executable(patch.oldCode));
   const before=[await v.totalSupply(),await v.balanceOf(alice.address),await v.balanceOf(bob.address),await u.balanceOf(await v.getAddress()),await v.settledAt(),await nft.ownerOf(BigInt(sid))];
   await network.provider.send('hardhat_setCode',[await v.getAddress(),patch.code]);const monthly:any=await ethers.getContractAt('RevenueShareVaultV5',await v.getAddress());expect(await monthly.distributionIntervalMonths()).eq(1);expect([await monthly.totalSupply(),await monthly.balanceOf(alice.address),await monthly.balanceOf(bob.address),await u.balanceOf(await v.getAddress()),await monthly.settledAt(),await nft.ownerOf(BigInt(sid))]).deep.eq(before);
   await expect(monthly.connect(agent).distribute(cash(6),cash(1),h('early'))).revertedWith('distribution unavailable');
   await u.mint(treasury.address,cash(3000));await u.connect(treasury).approve(await monthly.getAddress(),cash(3000));
   async function month(){await network.provider.send('evm_setNextBlockTimestamp',[Number(await monthly.nextFeeAt())]);await network.provider.send('evm_mine');await monthly.accrueFees();await monthly.connect(treasury).receiveRevenue(h('receipt'+seq++),cash(100),h('evidence'));await value();}
   await month();await expect(monthly.connect(agent).distribute(cash(6),cash(3),h('wrong'))).revertedWith('expense policy mismatch');await monthly.connect(agent).distribute(cash(6),cash(1),h('first'));expect(await monthly.distributionMonths()).eq(1);expect(await monthly.distributionCount()).eq(1);const first=await monthly.claimable(1,alice.address),second=await monthly.claimable(1,bob.address);expect(first).gt(0);expect(second).gt(0);await monthly.connect(alice).claim(1);await expect(monthly.connect(alice).claim(1)).revertedWith('nothing to claim');await expect(monthly.connect(agent).distribute(cash(6),cash(1),h('duplicate'))).revertedWith('distribution unavailable');
   await value();await month();await value();await month();const treasuryBefore=await u.balanceOf(treasury.address),fees=await monthly.feeLiability();await monthly.connect(agent).distribute(cash(6),cash(2),h('catchup'));expect(await monthly.distributionMonths()).eq(3);expect(await monthly.expenseLiability()).eq(0);expect(await monthly.feeLiability()).eq(0);expect(await u.balanceOf(treasury.address)-treasuryBefore).eq(cash(2)+fees);expect(await monthly.claimable(1,bob.address)).eq(second);await monthly.connect(bob).claim(1);expect(await monthly.claimable(1,bob.address)).eq(0);
   if(process.env.REVENUE_MONTHLY_PROOF_PATH)writeFileSync(process.env.REVENUE_MONTHLY_PROOF_PATH,JSON.stringify({passed:true,at:new Date().toISOString(),storageCompatible:true,checks:['storage and immutable binding','monthly declaration','two investor entitlements','duplicate claim rejection','catch-up expenses charged once','old entitlement retained']}),{mode:0o600});
  }finally{if(previous===undefined)delete process.env.REVENUE_DISTRIBUTION_INTERVAL_MONTHS;else process.env.REVENUE_DISTRIBUTION_INTERVAL_MONTHS=previous;}
 });
});
