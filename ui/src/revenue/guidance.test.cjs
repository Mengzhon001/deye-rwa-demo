const {test}=require('node:test');const assert=require('node:assert/strict');const {resolve,selectCurrent}=require('../../public/revenue/guidance-model');
test('expired pending valuations hand back to the intermediary; a reverted approval stays historical and cannot override the new approval task',()=>{
 const c=fixture('trustee');Object.assign(c.state.chain,{phase:'2',feeBasisReady:false});c.state.applications=[{id:'A',status:'pooled'}];c.state.activeReports={aggregate:'R'};c.product={proposalExpired:true};c.state.operations=[{id:'FAILED',actor:'trustee',action:'approve-valuation',status:'failed',body:{},steps:{approve:{status:'reverted',hash:'0x1',block:1}}}];
 let tasks=resolve(c);assert(tasks.some(t=>t.action==='prepare-valuation'&&t.role==='agent'));assert(!tasks.some(t=>t.action==='approve-valuation'));assert.equal(tasks.find(t=>t.entity==='expired-valuation').remedyAction,'prepare-valuation');assert.equal(tasks.find(t=>t.entity==='expired-valuation').nextRole,'agent');assert(!tasks.some(t=>t.operationId==='FAILED'));
 c.product.proposalExpired=false;tasks=resolve(c);assert.equal(tasks.find(t=>t.action==='approve-valuation').status,'ready');assert(!tasks.some(t=>t.operationId==='FAILED'));
 c.state.operations[0].steps.approve.status='sent';assert.equal(resolve(c).find(t=>t.operationId==='FAILED').status,'failed');
});
test('only the dedicated local intermediary receives a future monthly clock shortcut; elapsed dates hand off to NAV instead of waiting again',()=>{
 const c=fixture('agent');c.network={guidanceEnabled:true,chainId:20261014};Object.assign(c.state.chain,{phase:'2',feeMonths:'0',nextFeeAt:'1000',feeBasisReady:false});c.product={checks:{fee:[[false,'Monthly cutoff not reached'],[false,'Opening NAV needs approval']]}};
 let task=resolve(c).find(t=>t.action==='accrue-fee');assert.equal(task.status,'waiting-time');assert.deepEqual(task.clockJump,{by:'month',cutoff:1000});
 c.network.chainId=20261008;assert.equal(resolve(c).find(t=>t.action==='accrue-fee').clockJump,undefined);c.network.demoTimeAdvanceEnabled=true;assert.deepEqual(resolve(c).find(t=>t.action==='accrue-fee').clockJump,{by:'month',cutoff:1000});delete c.network.demoTimeAdvanceEnabled;c.network.chainId=20261014;c.network.guidanceEnabled=false;assert.equal(resolve(c).find(t=>t.action==='accrue-fee').clockJump,undefined);c.network.guidanceEnabled=true;c.role='investor';assert.equal(resolve(c).find(t=>t.action==='accrue-fee').clockJump,undefined);c.role='agent';c.state.financialTime=1000;c.product.checks.fee[0][0]=true;
 c.state.applications=[{id:'A',status:'pooled'}];c.state.activeReports={aggregate:'R'};c.state.approvedReports=['R'];task=resolve(c).find(t=>t.action==='accrue-fee');assert.equal(task.status,'blocked');assert.equal(task.clockJump,undefined);assert(resolve(c).some(t=>t.action==='prepare-valuation'&&t.status==='ready'));c.state.chain.feeMonths='60';assert.equal(resolve(c).find(t=>t.action==='accrue-fee').clockJump,undefined);
});
function fixture(role='investor',actor=role){return{role,actor,lang:'en',state:{manifest:{accounts:{trustee:'0xA',trustee2:'0xB'}},stations:[{id:'S'}],applications:[],activeReports:{},approvedReports:[],valuationChecks:{},eligibilityApplications:[],income:[],cases:[],trades:[],financialTime:100,chain:{phase:'1',fresh:true,deadline:1000,subscriptionReviewRequired:true},accounts:{investor:{eligible:true,usdc:'10000000',nativeBalanceWei:'100',shares:'0',subscription:{amount:'0'},redemption:{shares:'0'},claims:[]},investor2:{eligible:true,usdc:'100',subscription:{amount:'0'}}}},subscription:{canSubscribe:true}};}
test('settlement funding guidance names the exact shortfall and assigns payment to the investor without completing settlement',()=>{const c=fixture('agent');c.product={checks:{settle:[[false,'Funding incomplete']]},funding:{shortfall:8995817n}};let task=resolve(c).find(t=>t.action==='settle');assert.equal(task.status,'blocked');assert.match(task.purpose,/no separate retention payment/);assert.match(task.fundingHelp.summary,/8\.995817 USDC/);assert.match(task.fundingHelp.steps[2],/reviews? the latest|review the latest/);c.product.funding.shortfall=0n;task=resolve(c).find(t=>t.action==='settle');assert.equal(task.fundingHelp,undefined);assert.equal(task.status,'blocked');});
test('qualification and wallet funds block new subscription, pending review does not masquerade as completed eligibility',()=>{const c=fixture();c.state.accounts.investor.eligible=false;let t=resolve(c);assert(t.some(x=>x.action==='apply-eligibility'&&x.role==='investor'&&x.status==='ready'));assert(!t.some(x=>x.action==='subscribe'));c.state.eligibilityApplications=[{investor:'investor',status:'pending'}];t=resolve(c);assert(t.some(x=>x.action==='eligible'&&x.status==='waiting-role'));c.state.accounts.investor.eligible=true;c.state.accounts.investor.usdc='0';t=resolve(c);assert(t.some(x=>x.action==='faucet'));assert.equal(t.find(x=>x.action==='subscribe').status,'blocked');});
test('escrow orders await exact review and settlement; a submitted payment is not issued shares',()=>{const c=fixture();c.state.accounts.investor.subscription={amount:'5000000',approved:false};const tasks=resolve(c);assert.equal(tasks.find(x=>x.action==='review-subscription').status,'waiting-role');assert.equal(tasks.find(x=>x.action==='subscribe').status,'complete');assert(tasks.some(x=>x.action==='refund'));assert(!tasks.some(x=>x.action==='claim'));});
test('minting, owner approval and admission are separate responsibilities determined by chain custody',()=>{const c=fixture('agent');c.state.chain.phase='0';c.state.applications=[{id:'A',stationId:'S',status:'signed',chainAdmission:{minted:false}}];let t=resolve(c);assert.equal(t.find(x=>x.action==='mint-station'&&x.status!=='complete').role,'agent');c.state.applications[0].chainAdmission.minted=true;t=resolve(c);assert.equal(t.find(x=>x.action==='custody-consent'&&x.status!=='complete').role,'owner');c.state.applications[0].chainAdmission.approvedToVault=true;t=resolve(c);assert.equal(t.find(x=>x.action==='admit'&&x.status!=='complete').role,'agent');});
test('publication and operation guidance consume the same gate results as business buttons',()=>{const c=fixture('agent');c.state.chain.phase='0';c.state.applications=[{id:'A',status:'pooled',chainAdmission:{admitted:true}}];c.product={checks:{publish:[[false,'Trustee has not approved the NAV.']]}};let task=resolve(c).find(x=>x.action==='publish');assert.equal(task.status,'blocked');assert.deepEqual(task.blockers,['Trustee has not approved the NAV.']);c.product.checks.publish[0][0]=true;assert.equal(resolve(c).find(x=>x.action==='publish').status,'ready');});
test('expired and disputed quotes return to valuation; signed rights require separate reassessment consent',()=>{const c=fixture('owner');c.state.chain.phase='0';c.state.applications=[{id:'A',status:'offered',offer:{reportHash:'R',validUntil:50}}];assert(resolve(c).some(x=>x.action==='offer'&&x.status==='waiting-role'));c.state.applications[0].status='pooled';c.state.valuationChecks.A={blocked:true};c.nextApplication=()=>['owner','owner_agreement'];assert(resolve(c).some(x=>x.action==='accept-reassessment'&&x.role==='owner'));});
test('snapshot support and two independent trustees use fixed weights and never authorize repeated approval',()=>{const c=fixture('trustee','trustee');c.state.chain.phase='2';c.state.cases=[{id:1,support:'30',supply:'100',firstTrustee:'0xA',voters:{investor:{weight:'60',voted:false}}}];let task=resolve(c).find(x=>x.action==='approve-case');assert.equal(task.assignee,'trustee2');assert.equal(task.status,'waiting-role');c.actor='trustee2';task=resolve(c).find(x=>x.action==='approve-case');assert.equal(task.status,'ready');c.state.cases[0].support='29';assert.equal(resolve(c).find(x=>x.action==='approve-case').status,'blocked');});
test('exit liquidity, lock and cancellation remain independent, with no fake completion from local preferences',()=>{const c=fixture();c.state.chain.phase='2';c.state.chain.unlockedAt=500;c.state.accounts.investor.shares='100';c.exit={canTransfer:false,canRequest:false,canCancel:true};let task=resolve(c).find(x=>x.action==='request-redemption');assert.equal(task.status,'waiting-time');assert.equal(task.waitDate,500);c.state.accounts.investor.redemption.shares='50';assert.equal(resolve(c).find(x=>x.action==='cancel-redemption').status,'ready');});
test('trade tasks follow actual consent and price review fields, completed trades disappear',()=>{const c=fixture();c.state.chain.phase='2';c.state.trades=[{id:'T',seller:'investor',buyer:'investor2',buyerConsented:true,intermediaryApproved:false,reviewRequired:true,settled:false}];assert.equal(resolve(c).find(x=>x.action==='settle-trade').status,'blocked');c.state.trades[0].intermediaryApproved=true;assert.equal(resolve(c).find(x=>x.action==='settle-trade').status,'ready');c.state.trades[0].settled=true;assert(!resolve(c).some(x=>x.action==='settle-trade'));});
test('closing preserves outstanding claims and archived products expose only refunds',()=>{const c=fixture();c.state.chain.phase='4';c.state.accounts.investor.claims=[{id:1,amountUSDC6:'100'}];assert.equal(resolve(c).find(x=>x.action==='claim').status,'ready');c.state.selectedProduct={archived:true};c.state.accounts.investor.subscription.amount='10';assert.deepEqual(resolve(c).map(x=>x.action),['refund']);});

test('confirmed claims do not appear payable and unfinished intents survive refresh as recovery tasks',()=>{const c=fixture();c.state.chain.phase='2';c.state.accounts.investor.claims=[{id:1,amountUSDC6:'0',paidUSDC6:'100'}];assert.equal(resolve(c).find(t=>t.action==='claim').status,'complete');c.state.operations=[{id:'OP',actor:'investor',action:'claim',status:'running',prepared:[{step:'claim'}],body:{id:1},startedAt:50,steps:{claim:{status:'sent'}}}];let t=resolve(c).find(t=>t.operationId==='OP');assert.equal(t.status,'processing');assert.equal(t.page,'transaction_log');c.state.operations[0].status='failed';c.state.operations[0].error='Wallet declined.';assert.equal(resolve(c).find(t=>t.operationId==='OP').status,'failed');});

test('a failed unsent preflight leaves editable business inputs and signed rights never revert to offers on expiry',()=>{const c=fixture();c.state.operations=[{id:'FAILED',actor:'investor',action:'subscribe',status:'failed',error:'Insufficient USDC',steps:{}}];assert(!resolve(c).some(t=>t.operationId==='FAILED'));assert.equal(resolve(c).find(t=>t.action==='subscribe').status,'ready');c.role='agent';c.state.chain.phase='2';c.state.applications=[{id:'A',status:'pooled',offer:{reportHash:'R',validUntil:50},chainAdmission:{admitted:true}}];assert(!resolve(c).some(t=>t.action==='offer'&&t.status!=='complete'));});

test('a newly submitted order takes priority over a previously auto-located blocked settlement',()=>{
 const c=fixture('agent');c.product={checks:{settle:[[false,'Orders must be reviewed.'],[false,'Funding is insufficient.']]}};
 c.state.accounts.investor.subscription={amount:'5000000',approved:false};
 const tasks=resolve(c),settle=tasks.find(t=>t.action==='settle'),review=tasks.find(t=>t.action==='review-subscription');
 assert.equal(settle.status,'blocked');assert.equal(review.status,'ready');
 assert.equal(selectCurrent(tasks,{selected:settle.id},'agent').id,review.id);
 assert.equal(selectCurrent(tasks,{selected:settle.id,selectedExplicit:true},'agent').id,settle.id);
 c.state.accounts.investor.subscription.approved=true;
 const after=resolve(c);assert.equal(selectCurrent(after,{selected:review.id},'agent').action,'settle');
 assert.equal(after.find(t=>t.id===review.id).status,'complete');
});
test('order review guidance mirrors qualification and fundraising deadline restrictions',()=>{
 const c=fixture('agent');c.state.accounts.investor.subscription={amount:'5000000',approved:false};c.state.accounts.investor.eligible=false;
 let review=resolve(c).find(t=>t.action==='review-subscription');assert.equal(review.status,'blocked');assert(review.blockers.some(s=>s.includes('qualification')));
 c.state.accounts.investor.eligible=true;c.state.financialTime=1001;
 review=resolve(c).find(t=>t.action==='review-subscription');assert.equal(review.status,'blocked');assert(review.blockers.some(s=>s.includes('deadline')));
});
test('an expired subscription is blocked, not a boolean timestamp rendered as a 1970 waiting date',()=>{
 const c=fixture();c.state.financialTime=1001;c.subscription.canSubscribe=false;
 const task=resolve(c).find(t=>t.action==='subscribe');assert.equal(task.status,'blocked');assert.equal(task.waitDate,undefined);
});
test('an investor with cumulative escrow can locate optional additions while review and settlement remain separate tasks',()=>{
 const c=fixture();c.state.chain.subscriptionTopUpsAllowed=true;c.state.accounts.investor.subscription={amount:'1000000',approved:true};
 let tasks=resolve(c),add=tasks.find(t=>t.action==='subscribe');assert.equal(add.optional,true);assert.equal(add.status,'ready');assert.match(add.purpose,/additional amount/);
 c.subscription.canSubscribe=false;add=resolve(c).find(t=>t.action==='subscribe');assert.equal(add.status,'blocked');
 c.state.accounts.investor.subscription.approved=false;assert.equal(resolve(c).find(t=>t.action==='review-subscription').status,'waiting-role');
});


test('investor progress is a readable confirmed record rather than a blocked payout and names the concrete next handler',()=>{
 const c=fixture();c.state.chain.phase='2';c.product={operations:{collected:656260000n,next:{action:'prepare-valuation',role:'agent',title:'Prepare current NAV'}}};
 const task=resolve(c).find(t=>t.entity==='holding');assert.equal(task.status,'ready');assert.equal(task.readOnly,true);assert.equal(task.selector,'[data-investor-operations]');assert.equal(task.waitDate,undefined);assert.match(task.purpose,/656.26 USDC/);assert.match(task.purpose,/0.00 USDC/);assert.match(task.result,/intermediary/);assert.equal(task.remedyAction,'prepare-valuation');
 c.state.accounts.investor.claims=[{id:1,amountUSDC6:'100000000'}];assert(!resolve(c).some(t=>t.entity==='holding'));assert.equal(selectCurrent(resolve(c),{},'investor').action,'claim');
});

test('a financial-input change routes a trustee back to report preparation, without approving the old proposal',()=>{
 const c=fixture('trustee');c.state.chain.phase='2';c.state.applications=[{id:'A',status:'pooled'}];c.state.activeReports={aggregate:'R'};c.product={proposalOutdated:true};
 const tasks=resolve(c);assert(tasks.some(t=>t.action==='prepare-valuation'));assert(!tasks.some(t=>t.action==='approve-valuation'));assert.match(tasks.find(t=>t.entity==='expired-valuation').purpose,/Cash, receivables or expenses changed/);
});

test('a confirmed distribution hands staff to investors before NAV updates, with explicit deferral and a new handoff for each period',()=>{
 const c=fixture('agent');c.product={checks:{fee:[[false,'Opening NAV approval required']]}};Object.assign(c.state.chain,{phase:'2',distributionIntervalMonths:1,distributionMonths:1,distributionCount:1,fresh:false});c.state.applications=[{id:'A',status:'pooled'}];c.state.activeReports={aggregate:'R'};c.state.approvedReports=['R'];c.state.accounts.investor.claims=[{id:1,amountUSDC6:'50000000',paidUSDC6:'0'}];
 let tasks=resolve(c),handoff=tasks.find(t=>t.handoff),prepare=tasks.find(t=>t.action==='prepare-valuation');assert(handoff);assert.equal(handoff.readOnly,true);assert.equal(handoff.nextRole,'investor');assert.equal(selectCurrent(tasks,{selected:prepare.id,selectedExplicit:true},'agent').id,handoff.id);
 const prefs={read:{[handoff.id]:true}};assert.equal(selectCurrent(tasks,prefs,'agent').action,'prepare-valuation');
 c.state.chain.distributionCount=2;c.state.accounts.investor.claims.push({id:2,amountUSDC6:'40000000',paidUSDC6:'0'});tasks=resolve(c);assert.equal(selectCurrent(tasks,prefs,'agent').distributionId,2);
 c.role='trustee';c.actor='trustee';assert.equal(selectCurrent(resolve(c),{},'trustee').handoff,true);
});

test('a fully paid historical distribution cannot hide the current trustee approval, even with a persisted handoff selection',()=>{
 const c=fixture('trustee');Object.assign(c.state.chain,{phase:'2',distributionIntervalMonths:1,distributionMonths:3,feeMonths:4,distributionCount:1,fresh:false,feeBasisReady:false});c.state.applications=[{id:'A',status:'pooled'}];c.state.activeReports={aggregate:'FEB'};c.state.accounts.investor.claims=[{id:1,amountUSDC6:'0',paidUSDC6:'722088751'}];c.state.accounts.investor.economicShares='14769730000';
 const tasks=resolve(c);assert(!tasks.some(t=>t.handoff));assert.equal(selectCurrent(tasks,{selected:'view:trustee:distribution-1',selectedExplicit:true},'trustee').action,'approve-valuation');
 c.role='agent';c.actor='agent';assert(!resolve(c).some(t=>t.handoff));
});
test('unclaimed earlier cash remains accessible but never replaces the next monthly approval',()=>{
 const c=fixture('trustee');Object.assign(c.state.chain,{phase:'2',distributionMonths:1,feeMonths:2,distributionCount:1});c.state.applications=[{id:'A',status:'pooled'}];c.state.activeReports={aggregate:'MONTH2'};c.state.accounts.investor.claims=[{id:1,amountUSDC6:'1000000',paidUSDC6:'0'}];
 let tasks=resolve(c);assert.equal(tasks.find(t=>t.handoff).immediate,false);assert.equal(selectCurrent(tasks,{},'trustee').action,'approve-valuation');
 c.state.chain.feeMonths=1;c.state.chain.nextDistributionAt=90;c.state.financialTime=100;tasks=resolve(c);assert.equal(tasks.find(t=>t.handoff).immediate,false);
 c.role='investor';c.actor='investor';assert.equal(resolve(c).find(t=>t.action==='claim').status,'ready');
});
test('zero-entitlement declarations create no claim handoff and all unpaid periods are considered',()=>{
 const {distributionHandoff}=require('../../public/revenue/guidance-model');const c=fixture('agent');Object.assign(c.state.chain,{phase:'2',distributionMonths:2,feeMonths:2,distributionCount:2});c.state.accounts.investor.claims=[{id:1,amountUSDC6:'0',paidUSDC6:'2'},{id:2,amountUSDC6:'0',paidUSDC6:'0'}];assert.equal(distributionHandoff(c.state),null);
 c.state.accounts.investor.claims[0].amountUSDC6='3';assert.equal(distributionHandoff(c.state).distributionId,1);assert.equal(distributionHandoff(c.state).immediate,false);
});

test('monthly household payment, export funding and intermediary reconciliation have distinct actors and targets',()=>{
 const c=fixture('owner');c.state.chain.phase='2';c.state.accounts.owner={usdc:'100000000'};c.state.householdPaymentsEnabled=true;c.state.income=[{id:'B',period:1,collected:false,payment:{householdUSDC6:'80000000',householdPaid:false,exportPaid:false}}];
 let tasks=resolve(c),pay=tasks.find(t=>t.action==='pay-household-bill');assert.equal(pay.role,'owner');assert.equal(pay.page,'owner_funds');assert.equal(pay.status,'ready');assert.match(pay.selector,/data-billing-id="B"/);assert(!tasks.some(t=>t.action==='confirm-receipt'));
 c.role='agent';c.state.income[0].payment.exportPaid=true;tasks=resolve(c);const waiting=selectCurrent(tasks,{},'agent');assert(waiting.billingWaiting);assert.equal(waiting.nextRole,'owner');assert.match(waiting.selector,/data-billing-id="B"/);
 c.state.income[0].payment.householdPaid=true;tasks=resolve(c);const confirm=selectCurrent(tasks,{},'agent');assert.equal(confirm.action,'confirm-receipt');assert.equal(confirm.page,'agent_monitor');assert(!tasks.some(t=>t.action==='pay-household-bill'));
 c.state.income[0].collected=true;assert(!resolve(c).some(t=>['pay-household-bill','confirm-receipt'].includes(t.action)));
});
test('insufficient household funds lead to a blocked bill without pretending that export funding pays it',()=>{
 const c=fixture('owner');c.state.chain.phase='2';c.state.accounts.owner={usdc:'0'};c.state.income=[{id:'B',period:1,collected:false,payment:{householdUSDC6:'80000000',householdPaid:false,exportPaid:true}}];const task=resolve(c).find(t=>t.action==='pay-household-bill');assert.equal(task.status,'blocked');assert(task.blockers.some(t=>t.includes('test USDC')));assert.equal(task.role,'owner');
});
