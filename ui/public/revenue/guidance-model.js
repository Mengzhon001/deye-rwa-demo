/* Pure state-derived tasks. Preferences never determine business completion. */
(function(root){
'use strict';
const version='guidance.v1';
const text=(en,zh,lang)=>lang==='en'?en:zh;
const n=x=>Number(x||0), b=x=>BigInt(x||0);
// Claimability comes from confirmed chain state, never from past payments or browser preferences.
function distributionHandoff(state){
 const c=state.chain||{}, pending=new Map();
 for(const [actor,account] of Object.entries(state.accounts||{}))for(const claim of account.claims||[]){
  if(b(claim.amountUSDC6)<=0n)continue;
  const id=n(claim.id);if(!pending.has(id))pending.set(id,[]);
  pending.get(id).push({actor,address:account.address,amountUSDC6:claim.amountUSDC6,paidUSDC6:claim.paidUSDC6||'0'});
 }
 if(!pending.size)return null;
 const distributionId=Math.max(...pending.keys()),recipients=pending.get(distributionId);
 const report=state.activeReports?.aggregate;
 const pendingApproval=!!report&&!(state.approvedReports||[]).includes(report);
 const nextPeriodDue=n(c.nextDistributionAt)>0&&n(state.financialTime)>=n(c.nextDistributionAt);
 const immediate=distributionId===n(c.distributionCount)&&n(c.feeMonths)<=n(c.distributionMonths)&&!nextPeriodDue&&!pendingApproval;
 return {distributionId,recipients,immediate};
}
const content={
 'source':['Connect station evidence','接入电站证据','Use recorded or observed station evidence. A forecast is a separate estimate, not a meter reading.','请选择已采集的电站证据。预测电量属于单独的模型估计，不是电表读数。','The station can be selected by the household.','业主可以选择该电站提交申请。'],
 'apply':['Submit the rights application','提交收益权申请','Select your station and explain equipment ownership and who collects electricity payments. You sell defined revenue rights, while the equipment remains yours.','请选择自己的电站，并说明设备所有权和电费收款责任。出售的是约定的收益权，设备仍然属于你。','The intermediary receives your application.','中介机构收到申请并开始审核。'],
 'supplement':['Supply the requested documents','补充申请资料','Read the review note and supply the missing ownership or collection information. Do not create another application for the same pending request.','请根据审核意见补充缺失的所有权或收款资料，不要为同一待处理申请重复提交。','The application returns to intermediary review.','申请返回中介审核队列。'],
 'review':['Review the household application','审核业主申请','Check the station identity, ownership explanation, evidence dates and collection responsibilities before approving or requesting documents.','请先核对电站标识、所有权说明、证据采集日期和收款责任，再决定批准或要求补充资料。','An approved application can receive a valuation.','批准后的申请进入估值报价阶段。'],
 'offer':['Explain and prepare the quote','编制并解释估值报价','Check forecast generation, self-use and exports. Household discounted bills plus export income form cashflow; costs, FX and dated discounting determine the offer.','请核对预测发电、自用和售电量。业主折扣电费与售电收入形成现金流，再按成本、汇率和各期日期折现形成报价。','The saved quote goes to the trustee; a preview alone is not a submitted offer.','保存后的报价交受托人审批。试算预览本身不等于提交报价。'],
 'prepare-reassessment':['Correct the valuation basis','处理重新估值','Explain the evidence discrepancy and prepare a revised report. A signed purchase price is preserved until the separate review and owner consent are complete.','请说明证据差异并编制新版报告。独立复核和业主确认完成前，原签约购买价继续保留。','The revised basis requires independent consent.','新版估值依据进入独立审批和确认。'],
 'approve-offer':['Independently review the offer','独立审核估值报价','Compare the source evidence, monthly cashflows, assumptions and purchase price. If history is provisional, read its warning before explicitly accepting it.','请对照来源证据、逐月现金流、假设和购买价格。历史数据属于暂定基线时，应先阅读提示，再明确决定是否接受。','The household can review and accept the approved offer.','业主可以查看并接受获批报价。'],
 'approve-reassessment':['Review the revised valuation','审批新版估值依据','Review why the data changed and whether the revised basis is reasonable. This does not silently rewrite the original signed contract.','请复核数据变化原因及新版估值依据，不得把这项审批当成自动修改原已签协议。','The other required consent still applies.','系统继续检查其他必要的确认。'],
 'accept-reassessment':['Review the revised basis','确认新版估值依据','Compare the new estimate with your signed price and decide whether to consent. Estimated future cashflow is not guaranteed cash.','请比较新估值与原签约价，并自行决定是否同意。未来预测现金流并不是保证到账的现金。','The revised basis can be used after every required approval.','全部必要审批完成后，新版依据才能用于后续操作。'],
 'accept':['Review your electricity saving and price','核对电费优惠与报价','Open the monthly timeline. Compare the grid reference bill with the discounted self-use payment and check the agreed purchase price before accepting.','请打开逐期时间轴，比较电网参考费用与折扣自用电费，并在接受前核对约定购买价。','Acceptance freezes the agreed economic terms.','接受后，约定的经济条款被冻结。'],
 'sign':['Sign the rights agreement','签署收益权协议','Check the station, price, percentage, duration, product and chain in the wallet message. A message signature records consent and does not transfer tokens.','请核对钱包消息中的电站、价格、比例、期限、产品和链。消息签名记录同意，本身不转移代币。','The intermediary can mint the station credential.','中介可以开始铸造电站凭证。'],
 'mint-station':['Mint the station credential','铸造电站凭证','Mint the unique station NFT to the owner. It identifies the station rights and does not transfer legal ownership of the solar equipment.','请将唯一的电站 NFT 铸造给业主。凭证用于标识电站收益权，不转移光伏设备的法律所有权。','The owner can authorize pool custody.','业主可以授权资产池托管。'],
 'custody-consent':['Authorize credential custody','授权凭证托管','Check the pool contract receiving your station credential. Authorization permits admission; it does not yet issue investor shares or pay your purchase price.','请核对接收电站凭证的资产池地址。授权允许入池，此时不会发行投资者份额，也不会支付购买款。','The intermediary may admit the signed rights.','中介可以将已签收益权纳入资产池。'],
 'admit':['Admit the signed revenue rights','将已签收益权入池','Verify the signed agreement, owner authorization and price. Admission anchors the agreement digest and establishes credential custody.','请核对已签协议、业主授权和价格。入池记录协议摘要并建立凭证托管关系。','Prepare the asset-pool valuation next.','下一步编制资产池估值。'],
 'prepare-valuation':['Prepare the current pool valuation','编制当前资产池估值','Reconcile cash, receivables, liabilities and remaining rights once. Use the current cutoff and send the report to the trustee.','请按当前时点对账现金、应收款、负债和剩余收益权，每笔金额只计入一次，然后把报告交受托人。','A trustee must approve before pricing is usable.','受托人批准后，价格才可用于交易。'],
 'approve-valuation':['Approve the pool valuation','批准资产池估值','Review remaining rights, collected cash, receivables and pool fees against the report digest. Confirm the cutoff and validity period.','请对照报告摘要核对剩余收益权、已收现金、应收款和池费用，并确认估值时点和有效期。','The approved NAV enables the applicable next operation.','获批净值解锁满足其他条件的后续操作。'],
 'publish':['Publish fundraising terms','发布募集条款','Explain projected net IRR, variable distributions, rights expiry and funding requirements. The discount rate is not the promised investor yield.','请说明预计净年化收益、浮动分配、收益权到期和资金要求。估值折现率不是承诺给投资者的收益率。','The product appears in the hall; shares mint only after settlement.','产品进入大厅，份额仍须在成功结算后发行。'],
 'apply-eligibility':['Apply for investor eligibility','申请投资资格','Read the risk declarations and submit them with your current wallet. Eligibility applies to this product and does not guarantee returns.','请阅读风险声明后，用当前钱包提交申请。资格仅适用于该产品，不保证投资回报。','The intermediary reviews your declarations.','中介审核你的声明。'],
 'eligible':['Review investor eligibility','审核投资者资格','Review the selected applicant and declarations before confirming the on-chain qualification for the correct wallet.','请先核对所选申请人与声明，再为正确的钱包确认链上资格。','The approved investor can subscribe if other conditions are met.','获批投资者在其他条件满足时可以认购。'],
 'faucet':['Prepare demo funds','准备测试资金','Claim demo ETH for gas and the selected product’s test USDC. Available wallet funds are different from an escrow order balance.','请领取支付 Gas 的测试 ETH 和当前产品的测试 USDC。钱包可用资金与认购托管订单余额是两回事。','Your balance updates from confirmed funding receipts.','资金领取确认后，钱包余额更新。'],
 'subscribe':['Authorize USDC and subscribe','授权 USDC 并认购','Review the monthly cashflow timeline and enter your amount. USDC approval grants spending permission; the following subscription transaction actually moves money into escrow.','请查看逐期现金流并填写金额。USDC 授权允许合约使用额度，后续认购交易才实际把款项转入托管。','The order awaits intermediary review; shares have not yet been issued.','订单等待中介审核，此时尚未发行份额。'],
 'review-subscription':['Review the exact subscription order','审核准确的认购订单','Check the wallet, escrow amount and issuance terms. Review must match this order’s nonce; it does not itself mint investor shares.','请核对钱包、托管金额和发行条款。审核须绑定本次订单编号，本身不会铸造份额。','Settlement can proceed when all orders and funding satisfy the rules.','全部订单与资金条件满足后，才能结算。'],
 'refund':['Claim your escrow refund','领取认购退款','Confirm the original order and refund amount. This product has not issued shares for the refunded payment.','请核对原订单与退款金额。退回的认购款不会对应已发行份额。','The refunded money returns to your wallet.','退款回到你的钱包。'],
 'settle':['Settle purchases and issue shares','结算购买款并发行份额','Check every order approval, the 70% threshold and full purchase funding after retaining 10% cash. No waiting period replaces these requirements.','请核对每笔订单批准、70% 募集门槛，以及留存 10% 现金后是否足额覆盖购买款。无冷静期不等于免除资金条件。','Owners receive purchase proceeds and investors receive DRS shares.','业主收到购买款，投资者取得 DRS 份额。'],
 'accrue-fee':['Accrue this month’s pool fee','计提本月池费用','Use the preceding approved month-end NAV as the fee basis. Accrual records a liability and is not another cash payment.','请以上一个已批准月末净值为计费基准。计提记录负债，并不是再次支付现金。','The liability is paid under the quarterly distribution rules.','费用负债按季度分配规则支付。'],
 'book-revenue':['Record the monthly electricity bill','记录月度电费账单','Select a historical electricity period, then check household bills, export income, agreed costs and FX. This creates a receivable rather than collected cash.','请选择已有的历史电量期间，再核对业主电费、售电收入、约定成本和汇率。记账形成应收款，不代表现金已到账。','Ask the household to pay the bill, record the separate export receipt and reconcile both sources.','请业主缴费，单独登记售电回款，再核对两笔资金来源。'],
 'publish-household-bill':['Publish the household payment bill','发布业主缴费账单','Publish an unpaid legacy receivable as an immutable wallet bill. No payment is taken by publication.','请将尚未收款的旧应收记录发布为金额固定的业主钱包账单。发布本身不会扣款。','The household can pay using its own wallet.','业主随后可使用自己的钱包缴费。'],
 'pay-household-bill':['Pay this month’s electricity bill','支付本期电费','Check the bill period, discounted amount, USDC contract and billing contract. Approve the exact amount and confirm payment with the household wallet. This transfers test USDC; it is not just a message signature.','请核对期数、优惠电费金额、USDC 合约和账单合约。使用业主钱包授权准确金额并确认缴费。这会实际转移测试 USDC，不只是消息签名。','The intermediary reconciles your confirmed payment with the separate grid export receipt. Do not pay twice.','中介随后核对您的链上付款和单独的售电回款。无需重复缴费。'],
 'fund-export':['Record the simulated grid export receipt','登记模拟电网售电回款','Only the grid-export portion is funded by the demo system account. It cannot replace the household payment.','系统账户只提供明确标记的模拟售电回款，不能替代业主支付优惠电费。','Reconcile both payment sources before confirming receipt.','两笔来源齐全后，中介再核对确认收款。'],
 'confirm-receipt':['Reconcile and confirm monthly receipt','核对并确认月度收款','Verify the household payment and separate export receipt. Your wallet confirmation releases net assigned USDC into the vault, pays agreed station costs once and records the evidence.','请核对业主付款和独立的售电回款。使用中介钱包确认后，净受让 USDC 进入资产池，约定站点费用支付一次，并记录凭证。','Only confirmed net cash becomes available to pool operations.','只有确认后的净回款才成为资产池运营现金。'],
 'collect-revenue':['Collect the simulated receipt','归集模拟回款','Match the receivable to the system-account payment. Collection turns a receivable into cash and does not create revenue twice.','请把应收款与系统账户付款对应起来。归集只是把应收款转成现金，不会再次形成收入。','Confirmed vault cash can support fees and distributions.','确认后的资产池现金可支持费用支付与分配。'],
 'distribute':['Declare the quarterly distribution','宣告季度分配','Pay agreed costs and restore the protected reserve. Allocate 75% of the remaining receipts to snapshot-based distributions and 25% to exit liquidity.','请结清约定费用并恢复保护储备。剩余回款的 75% 用于快照分配，25% 留作退出流动性。','Investors claim their declared entitlements separately.','投资者分别领取已经宣告的分配权。'],
 'claim':['Claim confirmed cash distributions','领取已确认现金分配','Inspect the distribution number and your snapshot entitlement. Cash received and remaining share value are shown separately, not as a guaranteed coupon.','请核对分配编号与自己的快照领取权。已收现金和剩余份额价值分别展示，并不是保证票息。','The confirmed amount reaches your wallet exactly once.','确认金额只会支付一次并进入你的钱包。'],
 'propose-trade':['Propose a peer transfer','提出协商转让','After the lock, choose an eligible buyer and agree shares and total USDC price. NAV is a reference; a deviation above 10% needs review.','解锁后，请选择合资格买方并约定份额和 USDC 总价。净值是参考，偏离超过 10% 须复核。','The buyer must consent to these exact terms.','买方必须同意准确的转让条款。'],
 'consent-trade':['Consent as the buyer','买方确认转让条款','Check the seller, shares and price before authorizing USDC and consenting. Buyer consent alone does not complete the exchange.','请核对卖方、份额和价格，再授权 USDC 并确认。同意条款本身并不完成交换。','The seller can settle once any required review is complete.','必要复核完成后，卖方可以执行结算。'],
 'review-trade':['Review the price deviation','复核转让价格偏离','Compare the agreed total price with reference NAV and record your decision. Approval does not guarantee that price or future returns.','请比较协商总价与参考净值，并记录复核决定。批准不保证该价格或未来收益。','The approved trade can be atomically settled.','获批交易可以执行原子结算。'],
 'settle-trade':['Settle the atomic exchange','结算原子交换','Check the buyer’s consent and review. Shares and USDC exchange in the same transaction; a failed leg must roll back the whole exchange.','请核对买方同意与复核结果。份额和 USDC 在同一笔交易中交换，任一部分失败时整笔回滚。','Both ownership and payment update after confirmation.','确认后，份额归属和付款同时更新。'],
 'request-redemption':['Request a scheduled redemption','申请窗口赎回','Give 30 days’ notice and select available shares. Requested shares remain escrowed and keep distribution rights until paid and burned.','请提前 30 天通知并选择可用份额。申请份额托管后，在付款销毁前仍保留分配权。','Liquidity and the 5% NAV gate determine the filled amount.','可用现金和净值 5% 上限决定成交量。'],
 'cancel-redemption':['Cancel the unfilled request','取消未成交赎回申请','Review the remaining requested shares and the next cutoff. Cancellation returns unfilled escrowed shares, not already paid shares.','请核对剩余申请份额和下一截止时间。取消退回的是未成交托管份额，而不是已经付款的份额。','Your unfilled shares become available again.','未成交份额重新成为可用份额。'],
 'process-redemptions':['Process eligible requests proportionally','按比例处理合资格赎回','Use dealing-date approved NAV and the lower of exit cash and 5% pool NAV. Pay and burn only the filled shares; carry the rest forward.','请使用获批交易日净值，并取退出现金与池净值 5% 中的较低额度。只付款并销毁成交份额，其余顺延。','Investors receive the filled cash; remaining requests stay visible.','投资者收到成交现金，剩余申请继续显示。'],
 'carry-window':['Carry the redemption window forward','顺延赎回窗口','Move an unfunded or expired window forward without paying or burning shares. Investors can cancel before the next cutoff.','请在未付款、未销毁份额的前提下顺延无资金或已过期窗口。投资者可以在下一截止前取消。','Unfilled requests remain queued.','未成交申请继续排队。'],
 'open-case':['Open a servicing case','建立服务事件','Record missing remittance, diverted receipts or breached obligations. Ordinary forecast underperformance is not automatically a household default.','请记录未汇款、转移回款或违约义务。普通预测收益未达预期不自动构成业主违约。','Holders can support a fixed-snapshot proposal.','持有人可以支持固定快照下的提案。'],
 'support-case':['Support the snapshot proposal','支持快照处置提案','Read the evidence and recipient proposal. Your support uses fixed snapshot ownership and contributes toward the 30% initiation threshold.','请阅读证据与收款方提案。支持权重采用固定快照持仓，并计入 30% 发起门槛。','Two distinct trustees review only after the threshold is met.','达到门槛后，两名不同受托人才可审批。'],
 'approve-case':['Approve as an independent trustee','以独立受托人身份审批','Check the fixed-snapshot threshold and collection-recipient proposal. A second distinct trustee is required; physical equipment control is outside this demo.','请核对固定快照门槛和收款方提案，还须另一名不同受托人批准。本演示不控制物理设备。','Two approvals authorize the demo recipient change.','两份批准授权演示收款方变更。'],
 'close':['Close the expired rights product','关闭已到期收益权产品','Collect receivables, discharge liabilities and approve a final valuation with no remaining rights. Remaining cash is distributed without invented principal repayment.','请收回应收款、清偿负债，并批准剩余收益权为零的最终估值。剩余现金按份额分配，不虚构原始本金偿还。','Investors claim final cash and station custody can be released.','投资者领取最终现金，电站凭证可以解除托管。'],
 'release-station':['Return station credential custody','解除电站凭证托管','Check the product’s failed or closed status before returning the credential to the household. Historical transactions remain on the chain.','请核对产品已失败或关闭的状态，再将凭证退回业主。历史交易继续保存在链上。','The household regains credential custody.','业主重新持有电站凭证。'],
 'advance':['Inspect the next financial cutoff','查看下一财务截止日','This is a shared demo clock. Advance it only after reconciling the current period; it never changes station observation dates or creates live readings.','这是共享演示财务时钟。请在完成本期对账后再推进；它不会修改电站采集日期，也不会生成实时读数。','The next due period becomes actionable.','到期后的下一期间可以处理。'],
 'view':['Review the current business record','查看当前业务记录','Inspect this record’s evidence, cashflows and confirmed transactions. Navigating here does not change permissions or submit a transaction.','请查看该记录的证据、现金流和确认交易。进入页面不会改变权限，也不会提交交易。','You can identify your next actionable task.','你可以确认下一项可执行任务。']
};
function resolve(ctx){
 const s=ctx.state||{},c=s.chain||{},lang=ctx.lang||'zh',role=ctx.role,who=ctx.actor||role,now=n(s.financialTime),phase=n(c.phase),a=s.accounts?.[who]||{},tasks=[];
 const tr=(en,zh)=>text(en,zh,lang);
 const add=(action,r,page,entity='',opts={})=>{
  const copy=content[action]||content.view;
  const task={id:[action,r,entity,opts.period||''].join(':'),action,role:r,actor:opts.actor||null,page,entity,applicationId:opts.applicationId||'',status:r===role?'ready':'waiting-role',title:text(copy[0],copy[1],lang),purpose:text(copy[2],copy[3],lang),result:text(copy[4],copy[5],lang),blockers:[],selector:action==='faucet'?'#wallet-faucet':`form[data-action="${action}"]`,section:opts.section||'rights',...opts};
  if(!task.status)task.status=r===role?'ready':'waiting-role';
  if(task.checks?.length){task.blockers=task.checks.filter(x=>!x[0]).map(x=>x[1]);if(task.blockers.length&&task.status==='ready')task.status=task.waitDate>now?'waiting-time':'blocked';}
  if(task.assignee && task.assignee !== who && task.role === role)task.status="waiting-role";
  if(task.role!==role && !['complete','failed'].includes(task.status))task.status='waiting-role';
  tasks.push(task);return task;
 };
 const p=ctx.product||{},interval=n(c.distributionIntervalMonths)||3;
 const gates=(key)=>{
  const opts={checks:p.checks?.[key]||[],section:phase===0?'issuance':phase===1?'subscription':'operations'};
  if(key==='fee'&&role==='agent'&&ctx.network?.guidanceEnabled&&(n(ctx.network.chainId)===20261014||ctx.network.demoTimeAdvanceEnabled===true)&&phase===2&&n(c.feeMonths)<60&&n(c.nextFeeAt)>now)opts.clockJump={by:'month',cutoff:n(c.nextFeeAt)};
  if(key==='settle'&&phase===1){
   opts.purpose=tr('Settlement automatically pays the agreed household purchase prices, issues shares and keeps the remaining cash in the pool. The contract requires at least 10% cash retention. There is no separate retention payment or button.','成功结算时，合约自动支付约定业主购买款、发行份额，并把剩余现金留在池内。当前合约要求至少留存10%现金，不需要另行转账，也没有单独的留存按钮。');
   if(b(p.funding?.shortfall)>0n){
    const v=b(p.funding.shortfall),fraction=String(v%1000000n).padStart(6,'0').replace(/0+$/,'');const amount=String(v/1000000n)+(fraction?'.'+fraction:'');
    opts.fundingHelp={amountUSDC6:String(v),summary:tr(`The pool still needs ${amount} USDC. An eligible investor must subscribe the additional amount; the intermediary then reviews the updated order and settles.`,`当前仍缺 ${amount} USDC。由合资格投资者认购补足后，中介重新审核更新后的订单，再完成结算。`),steps:[tr('Open Investor → Subscribe using the investor’s own wallet. The existing investor may add funds; another eligible investor may also subscribe.','使用投资者自己的钱包进入「投资者 → 认购」。原投资者可以追加，也可以由其他合资格投资者认购。'),tr(`Click “Fill the exact shortfall” to enter ${amount} USDC. Check the amount before confirming the required wallet transactions.`,`点击「填入准确待补金额」，填入 ${amount} USDC。核对金额后，再在钱包确认所需交易。`),tr('Return to the intermediary, review the latest cumulative order again, and click “Complete fundraising settlement”. Cash retention happens automatically in that settlement.','返回中介机构，重新审核最新累计订单，再点击「完成募集结算」。现金留存在结算时自动完成。')]};
   }
  }
  return opts;
 };
 // Submitted commands never imply completed business state.
 if(s.selectedProduct?.archived){if(b(a.subscription?.amount)>0n)add('refund','investor','subscribe',who,{section:'subscription'});else add('view',role,'product_hall','history',{status:'complete',title:tr('This product is archived','该产品已归档'),selector:'[data-page="product_hall"]'});return tasks;}
 if(!(s.stations||[]).length)add('source','agent','agent_monitor','station');
 if(!(s.applications||[]).length&&s.stations?.length&&phase===0){
 add('view','owner','owner_station_detail','station-evidence',{informational:true,title:tr('Read station evidence and modeled prices','了解电站证据与模拟电价'),purpose:tr('Check the source, captured date, units and history. Electricity prices and future cashflows are modeled separately from the API measurements.','请核对来源、采集日期、单位和历史记录。电价与未来现金流是单独的模型假设，不是 API 测量值。'),result:tr('You can apply using the verified station while retaining equipment ownership.','你可以使用已核对的电站提交申请，设备所有权仍归自己。'),selector:'.ds-station-head'});
 add('apply','owner','owner_apply',s.stations[0].id);
 }
 for(const app of s.applications||[]){
  const id=app.id,common={applicationId:id,section:'rights'},check=s.valuationChecks?.[id];
  const approved=app.offer&&s.approvedReports?.includes(app.offer.reportHash),expired=app.status==='offered'&&app.offer&&n(app.offer.validUntil)<now;
  const history=['apply','review','offer','approve-offer','accept','sign','mint-station','custody-consent','admit'];
  const levels={submitted:1,supplement:1,rejected:1,approved:2,offered:approved?4:3,accepted:5,signed:6,pooled:9};
  let level=levels[app.status]||0;
  if(app.status==='signed')level=app.chainAdmission?.admitted?9:app.chainAdmission?.approvedToVault?8:app.chainAdmission?.minted?7:6;
  history.slice(0,level).forEach((x,i)=>add(x,['owner','agent','agent','trustee','owner','owner','agent','owner','agent'][i],['owner_apply','agent_apply_review','agent_financing','trustee_events','owner_agreement','owner_agreement','agent_pool','owner_agreement','agent_pool'][i],id,{...common,status:'complete'}));
  if(phase<=2&&check?.blocked&&['offered','accepted','signed','pooled'].includes(app.status)){
   const next=ctx.nextApplication?.(app)||['agent','agent_financing'];
   const action=next[0]==='trustee'?'approve-reassessment':next[0]==='owner'?'accept-reassessment':app.status==='offered'?'offer':'prepare-reassessment';
   add(action,next[0],next[1],id,common);continue;
  }
  if(app.status==='rejected'){add('view','owner','owner_apply',id,{...common,status:'failed',title:tr('Read the rejection reason','查看拒绝原因'),blockers:[app.notes||tr('This application was rejected.','该申请已被拒绝。')],selector:'[data-wf-return]'});continue;}
  const step=app.status==='submitted'?['review','agent','agent_apply_review']:app.status==='supplement'?['supplement','owner','owner_apply']:app.status==='approved'||expired?['offer','agent','agent_financing']:app.status==='offered'?approved?['accept','owner','owner_agreement']:['approve-offer','trustee','trustee_events']:app.status==='accepted'?['sign','owner','owner_agreement']:app.status==='signed'?history[level]&&[history[level],['owner','agent','agent','trustee','owner','owner','agent','owner','agent'][level],level===7?'owner_agreement':'agent_pool']:null;
  if(step)add(step[0],step[1],step[2],id,common);
 }
 const pooled=(s.applications||[]).some(x=>x.status==='pooled');
 const report=s.activeReports?.aggregate;
 if(pooled && phase<=2 && !(s.applications||[]).some(x=>s.valuationChecks?.[x.id]?.blocked)){
  if(!report||p.proposalExpired||p.proposalOutdated||((!c.fresh||phase===2&&!c.feeBasisReady)&&s.approvedReports?.includes(report)))add('prepare-valuation','agent','agent_pool','pool',gates('valuation'));
  else if(!s.approvedReports?.includes(report))add('approve-valuation','trustee','trustee_events','pool',{...gates('valuationApproval'),...(phase===2?{purpose:tr('Review this period’s remaining rights, receipts, receivables and expenses against the report. Approval anchors the valuation; it does not declare or pay an investor distribution.','请对照本期报告核对剩余收益权、已收回款、应收款与费用。批准会锚定估值，不会直接宣告分配或向投资者付款。'),result:tr('The intermediary continues the eligible monthly operation. After a distribution is declared, investors can claim the confirmed cash.','中介继续处理满足条件的本期运营。宣告分配后，投资者才能领取新确认的款项。')}: {})});
  if((p.proposalExpired||p.proposalOutdated)&&role==='trustee')add('view','trustee','trustee_events','expired-valuation',{section:'operations',status:'blocked',title:p.proposalOutdated?tr('Refresh the report after financial changes','收款或费用已变化，须更新报告'):tr('Replace the expired valuation before approval','估值已过期，须重新编制后审批'),purpose:p.proposalOutdated?tr('Cash, receivables or expenses changed after this report was prepared. The intermediary must reconcile the updated balances and prepare a new report before independent approval.','原报告编制后，现金、应收款或费用发生了变化。请由中介核对最新账务并重新编制，再由受托人审批。'):tr('The report expired after the demo clock moved. Its failed approval cannot be retried with the same hash. Ask the intermediary to prepare a current report, then return here to review and approve the new proposal.','演示时间推进后，原报告已过期。失败审批不能重试同一交易哈希。请由中介编制当前估值，再返回这里核对并批准新报告。'),result:tr('A current proposal can be reviewed independently.','新报告生成后，再由受托人独立审批。'),selector:'[data-pool-valuation-expired]',remedyAction:p.unbookedPeriods?.length?'book-revenue':'prepare-valuation'});
  if(phase===0)add('publish','agent','agent_product','pool',gates('publish'));
 }
 const qualified=s.eligibilityApplications||[];
 for(const request of qualified.filter(x=>x.status==='pending'))add('eligible','agent','agent_kyc_review',request.id,{actor:request.investor,section:'subscription'});
 if(role==='investor' && phase===1){
  const request=qualified.filter(x=>x.investor===who).at(-1),order=a.subscription||{},view=ctx.subscription||{};
  add('view','investor','pool_detail','economics',{title:tr('Understand this product’s cashflows','理解该产品现金流'),purpose:tr('Read the monthly timeline. Your subscription pays for finite rights and retained cash. Projected net IRR, distributions and remaining NAV are different values; none is a guaranteed coupon.','请查看逐期时间轴。认购款用于购买有限期限的收益权和留存现金。预计净年化收益、现金分配和剩余净值是不同指标，均不是保证票息。'),result:tr('You understand the cashflows and may proceed to eligibility or subscription.','了解现金流后，可以继续资格申请或认购。'),selector:'[data-period-timeline=investor] .pt-tools, .op-return-panel',section:'subscription',informational:true});
  if(!a.eligible){if(request?.status!=='pending')add('apply-eligibility','investor','investor_eligibility',who,{section:'subscription'});}
  else if(b(order.amount)===0n){
   if(b(a.usdc)===0n||b(a.nativeBalanceWei)===0n)add('faucet','investor','subscribe',who,{section:'subscription'});
   add('subscribe','investor','subscribe',who,{section:'subscription',checks:[[view.canSubscribe??(c.fresh&&now<n(c.deadline)),tr('Fundraising must be open, pricing current and eligibility active.','募集须开放、价格有效且资格生效。')],[b(a.usdc)>0n,tr('Claim test USDC before entering an affordable amount.','请先领取测试 USDC，并填写可负担的金额。')]]});
  }else{
   if(c.subscriptionTopUpsAllowed)add('subscribe','investor','subscribe',who,{optional:true,section:'subscription',title:tr('Add to the cumulative subscription','追加累计认购'),purpose:tr('Pay only the additional amount. The updated cumulative escrow needs a new intermediary review; the prior approval cannot cover the added funds.','仅支付本次新增金额。累计托管金额更新后须重新经过中介审核，原审批不会覆盖追加资金。'),checks:[[!!view.canSubscribe,tr('Fundraising, eligibility, approved pricing and remaining capacity must permit the addition.','追加认购须满足募集开放、资格有效、估值获批且仍有剩余额度。')]]});
   else add('subscribe','investor','subscribe',who,{status:'complete',section:'subscription'});
   add('review-subscription','agent','agent_product',who,{actor:who,section:'subscription',status:order.approved?'complete':'waiting-role'});
   add('refund','investor','subscribe',who,{section:'subscription',optional:true});
   add('settle','agent','agent_product','pool',gates('settle'));
  }
 }
 if(phase===1&&role!=='investor'){
  for(const [actor,account]of Object.entries(s.accounts||{}))if(actor!=='owner'&&b(account.subscription?.amount)>0n)add('review-subscription','agent','agent_product',actor,{actor,section:'subscription',status:account.subscription.approved?'complete':undefined,checks:[[!!account.eligible,tr('This investor must have an approved qualification before the order can be approved.','该投资者须先通过投资资格审核，才能批准认购订单。')],[now<n(c.deadline),tr('Order approval must be completed before the fundraising deadline.','认购订单须在募集截止前完成审核。')]]});
  add('settle','agent','agent_product','pool',gates('settle'));
 }
 if(phase===3){if(b(a.subscription?.amount)>0n)add('refund','investor','subscribe',who,{section:'subscription'});for(const app of s.applications||[])if(app.chainAdmission?.admitted&&!app.chainAdmission.released)add('release-station','owner','owner_agreement',app.id,{applicationId:app.id,section:'closing'});}
 if(phase===2||phase===4){
  if(role==='owner')add('view','owner','owner_funds','payment',{status:'ready',informational:true,title:tr('Review your purchase proceeds and ongoing bills','查看购买款和后续电费账单'),purpose:tr('Purchase proceeds are paid at successful settlement. Check that confirmed receipt separately from faucet wallet balances. Subsequent electricity bills follow your signed agreement.','购买款在成功结算时支付。请将确认的结算凭证与水龙头钱包余额分开核对，后续电费仍按签约协议归集。'),selector:'#main',section:'operations'});
  if(role==='investor'){
   for(const claim of a.claims||[])add('claim','investor','position',String(claim.id),{section:phase===4?'closing':'operations',status:b(claim.amountUSDC6)>0n?'ready':'complete',period:claim.id});
   if(!(a.claims||[]).some(x=>b(x.amountUSDC6)>0n)){
    const o=p.operations,amount=x=>(Number(x||0)/1e6).toLocaleString(lang==='en'?'en-US':'zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
    const summary=o?tr(`The pool has collected ${amount(o.collected)} USDC. Your claimable cash is ${amount((a.claims||[]).reduce((v,r)=>v+b(r.amountUSDC6),0n))} USDC. Pool receipts are not an individual payout; a distribution must be declared first.`,`资产池已归集 ${amount(o.collected)} USDC，你当前可领取 ${(amount((a.claims||[]).reduce((v,r)=>v+b(r.amountUSDC6),0n)))} USDC。资产池收到回款后，仍须宣告分配，才形成个人领取权。`):tr('Inspect confirmed monthly collections, fee accruals, NAV approval and distribution declarations separately.','请分别查看已确认月度回款、费用计提、净值审批和分配。');
    add('view','investor','position','holding',{title:tr('View collections and your distribution progress','查看回款与个人分配进度'),purpose:summary,result:o?.next?tr(`The next handling participant is ${o.next.role==='owner'?'the household':o.next.role==='trustee'?'the trustee':'the intermediary'}. Open the next-step entrance below; the handling wallet must sign in independently.`,`下一步由${o.next.role==='owner'?'业主':o.next.role==='trustee'?'受托管理人':'中介机构'}完成「${o.next.title}」。可从下方入口打开该任务，仍须对应角色的钱包独立登录。`):tr('Confirmed cash and final claims remain available for inspection.','可以继续查看已确认收款和最终领取记录。'),selector:'[data-investor-operations]',section:'operations',status:phase===4?'complete':'ready',readOnly:true,remedyAction:o?.next?.action});
   }
   const exit=ctx.exit||{},unlocked=now>=n(c.unlockedAt)&&phase===2;
   if(b(a.shares)>0n && phase===2){
    add('propose-trade','investor','bond_transfer',who,{section:'exits',optional:true,checks:[[exit.canTransfer??unlocked,tr('Unlock, current NAV and an eligible buyer are required.','须解锁、净值有效，并存在合资格买方。')]],waitDate:unlocked?0:n(c.unlockedAt)});
    add('request-redemption','investor','bond_transfer',who,{section:'exits',optional:true,checks:[[exit.canRequest??unlocked,tr('Available shares and an open notice window are required.','须有可用份额且处于通知窗口。')]],waitDate:unlocked?0:n(c.unlockedAt)});
   }
   if(b(a.redemption?.shares)>0n)add('cancel-redemption','investor','bond_transfer',who,{section:'exits',optional:true,checks:[[exit.canCancel??(now<n(c.redemptionCutoff)||phase===4),tr('Cancellation must be before the next cutoff.','取消须在下一截止前完成。')]]});
  }
  if(phase===2){
   add('accrue-fee','agent','agent_product','pool',{...gates('fee'),period:n(c.feeMonths)+1,waitDate:n(c.nextFeeAt),...(interval===1?{result:tr('Accrued liabilities are paid at the monthly distribution; investors then claim their cash.','计提负债在月度分配时支付，随后由投资者领取现金。')}: {})});
   const missing=p.unbookedPeriods|| (s.applications||[]).filter(app=>app.status==='pooled'&&n(c.feeMonths)>0&&!s.income?.some(x=>x.stationId===app.stationId&&n(x.period)===n(c.feeMonths))).map(app=>({applicationId:app.id,period:n(c.feeMonths)}));
   for(const item of missing)add('book-revenue','agent','agent_monitor',item.applicationId,{applicationId:item.applicationId,period:item.period,section:'operations'});
   for(const income of s.income||[])if(!income.collected){
    const payment=income.payment,opts={section:'operations',period:income.period};
    if(!payment){add(s.householdPaymentsEnabled?'publish-household-bill':'collect-revenue','agent','agent_monitor',income.id,opts);continue;}
    if(!payment.householdPaid){
     add('pay-household-bill','owner','owner_funds',income.id,{...opts,selector:`[data-billing-id="${income.id}"] form[data-action="pay-household-bill"]`,checks:[[b(s.accounts?.owner?.usdc)>=b(payment.householdUSDC6),tr('Receive test USDC before paying this bill.','请先领取足额测试 USDC，再缴纳本期电费。')]]});
     if(role==='agent'&&payment.exportPaid)add('view','agent','agent_monitor',income.id,{...opts,readOnly:true,billingWaiting:true,remedyAction:'pay-household-bill',selector:`[data-billing-id="${income.id}"]`,title:tr(`Await household payment for month ${income.period}`,`等待业主缴纳第 ${income.period} 期电费`),purpose:tr('The household has not paid this bill. Open its payment workspace, switch to the household wallet and pay the published amount. The intermediary cannot sign for the household.','本期业主尚未缴费。请打开业主缴费入口，切换为业主钱包并支付已发布金额，中介不能代替业主签名。'),result:tr('After the household pays, return here to reconcile and confirm receipt.','业主完成缴费后，返回中介核对并确认收款。')});
    }
    if(role==='owner'&&payment.householdPaid)add('view','owner','owner_funds',income.id,{...opts,readOnly:true,billingWaiting:true,remedyAction:payment.exportPaid?'confirm-receipt':'fund-export',selector:`[data-billing-id="${income.id}"]`,title:tr(`Month ${income.period} paid · awaiting intermediary`,`第 ${income.period} 期已付，等待中介确认`),purpose:tr('Your USDC payment has confirmed on chain. Do not pay again. The intermediary must reconcile the separate export receipt and sign confirmation into the pool.','您的 USDC 付款已在链上确认，无需再次付款。请交由中介核对单独的售电回款，并签署确认收款入池交易。'),result:tr('After intermediary confirmation, this bill is complete and net cash becomes available to the pool.','中介确认后，本期账单完成，净回款成为资产池可用现金。')});
    if(!payment.exportPaid)add('fund-export','agent','agent_monitor',income.id,{...opts,selector:`[data-billing-id="${income.id}"] form[data-action="fund-export"]`});
    if(payment.householdPaid&&payment.exportPaid)add('confirm-receipt','agent','agent_monitor',income.id,{...opts,selector:`[data-billing-id="${income.id}"] form[data-action="confirm-receipt"]`});
   }
   add('distribute','agent','agent_product','pool',{...gates('distribute'),period:Math.floor(n(c.distributionMonths)/interval)+1,title:interval===1?tr('Declare the monthly distribution','宣告月度分配'):undefined,waitDate:n(c.nextDistributionAt)});
   if(Object.values(s.accounts||{}).some(x=>b(x.redemption?.shares)>0n)){
    add('process-redemptions','agent','agent_product','pool',{...gates('redeem'),section:'exits',waitDate:n(c.redemptionDate)});
    add('carry-window','agent','agent_product','pool',{section:'exits',optional:true,...gates('carry'),waitDate:n(c.redemptionDate)+7*86400+1});
   }
   add('open-case','agent','agent_monitor','pool',{section:'servicing',optional:true});
   add('close','agent','agent_product','pool',{...gates('close'),section:'closing',waitDate:n(c.expiresAt)});
   if(role==='agent')add('advance','agent','agent_product','clock',{section:'operations',optional:true});
  }
  for(const app of s.applications||[])if(phase===4&&!app.chainAdmission?.released)add('release-station','owner','owner_agreement',app.id,{applicationId:app.id,section:'closing'});
 }
 for(const trade of s.trades||[]){
  if(trade.settled)continue;
  const buyer=trade.buyer===who,seller=trade.seller===who;
  if(!trade.buyerConsented)add('consent-trade','investor','bond_transfer',String(trade.id),{section:'exits',assignee:trade.buyer});
  if(trade.reviewRequired&&!trade.intermediaryApproved)add('review-trade','agent','agent_transfer_review',String(trade.id),{section:'exits'});
  if(trade.buyerConsented)add('settle-trade','investor','bond_transfer',String(trade.id),{section:'exits',assignee:trade.seller,checks:[[!trade.reviewRequired||trade.intermediaryApproved,tr('Required price review must be approved.','必要的价格复核须获批准。')]]});
 }
 for(const item of s.cases||[]){
  if(item.executed||item.closed)continue;
  if(role==='investor'&&!item.voters?.[who]?.voted)add('support-case','investor','position',String(item.id),{section:'servicing',checks:[[b(item.voters?.[who]?.weight)>0n,tr('Only holders with a positive fixed snapshot weight may support.','只有固定快照权重为正的持有人可以支持。')]]});
  const first=String(item.firstTrustee||'').toLowerCase(),address=String(s.manifest?.accounts?.[who]||'').toLowerCase();
  const approvedHere=first===address&&first!=='0x0000000000000000000000000000000000000000';
  const checks=[[b(item.supply)>0n&&b(item.support)*10000n>=b(item.supply)*3000n,tr('The fixed snapshot must reach the 30% initiation threshold.','固定快照须达到 30% 发起门槛。')]];
  add('approve-case','trustee','trustee_review',String(item.id),{section:'servicing',checks,assignee:approvedHere?(who==='trustee2'?'trustee':'trustee2'):null});
 }
 // Newly declared, unpaid cash is a handoff. Older claims remain accessible without taking over this month's work.
 const distribution=['agent','trustee'].includes(role)&&[2,4].includes(phase)?distributionHandoff(s):null;
 if(distribution){
  const {distributionId,recipients,immediate}=distribution;
  add('view',role,role==='agent'?'agent_product':'trustee_events',`distribution-${distributionId}`,{readOnly:true,handoff:true,immediate,optional:!immediate,distributionId,recipients,section:'operations',selector:'[data-distribution-handoff]',title:immediate?tr('Distribution declared · continue as an investor','分配已宣告，请切换投资者领取'):tr('Review unclaimed earlier distributions','查看历史待领取分配'),purpose:immediate?tr(`Distribution #${distributionId} has unpaid entitlements. Switch to an investor wallet to check and claim their amount. No further NAV approval is required for this declared cash.`,`第 ${distributionId} 次分配仍有未领取金额。请切换到对应投资者钱包核对并领取。这笔已宣告分配不需要再次审批净值。`):tr(`Distribution #${distributionId} still has unpaid entitlements. Investors may claim them independently; continue the current period's valuation and distribution work.`,`第 ${distributionId} 次分配仍有未领取金额。投资者可以单独领取，中介和受托人应继续处理本期估值及分配。`),result:tr('The investor checks and claims their own confirmed entitlement.','投资者核对并领取自己的已确认分配。'),nextRole:'investor'});
 }

 // Recover persisted intents after a refresh without inferring business completion.
 for(const op of (s.operations||[]).filter(o=>o.actor===who&&o.status!=='confirmed')){
  if(op.action==='approve-valuation'&&Object.values(op.steps||{}).some(step=>step.status==='reverted'))continue;
  if(!op.prepared?.length&&!Object.keys(op.steps||{}).length)continue;
  if((s.operations||[]).some(o=>o.actor===who&&o.action===op.action&&o.status==='confirmed'&&(o.bodyHash===op.bodyHash||JSON.stringify(o.body)===JSON.stringify(op.body))&&n(o.startedAt)>=n(op.startedAt)))continue;
  let task=tasks.find(t=>t.action===op.action&&t.status!=='complete'&&(!op.body?.applicationId||t.applicationId===op.body.applicationId));
  if(!task)task=add(op.action,role,'transaction_log',op.id,{section:'operations'});
  task.status=op.status==='failed'?'failed':'processing';task.operationId=op.id;task.page='transaction_log';task.selector=`form[data-retry-id="${op.id}"]`;
  task.blockers=[op.error||tr('An unfinished operation exists. Inspect its original intent and receipts before retrying.','存在未完成操作，请先核对原操作意图与回执，再重试。')];
 }
 // Optional explanatory tasks never displace actionable business work.
 const nextRoles={'apply':'agent','supplement':'agent','review':'agent','offer':'trustee','prepare-reassessment':'trustee','approve-offer':'owner','accept':'owner','sign':'agent','mint-station':'owner','custody-consent':'agent','admit':'agent','prepare-valuation':'trustee','approve-valuation':'agent','publish':'investor','apply-eligibility':'agent','eligible':'investor','subscribe':'agent','review-subscription':'agent','settle':'agent','book-revenue':'owner','publish-household-bill':'owner','pay-household-bill':'agent','fund-export':'owner','confirm-receipt':'agent','collect-revenue':'agent','distribute':'investor','propose-trade':'investor','consent-trade':'agent','review-trade':'investor','open-case':'investor','support-case':'trustee','approve-case':'trustee','close':'investor'};
 tasks.forEach(task=>{task.nextRole=task.handoff?'investor':nextRoles[task.action]||task.role;task.prerequisites=[tr('Use the wallet authorized for the handling role and the selected product.','必须使用当前产品中具有处理权限的角色钱包。'),...(task.checks||[]).map(c=>c[1])];});
 const priorities={'pay-household-bill':-8,'fund-export':-8,'confirm-receipt':-8,'publish-household-bill':-8,'accrue-fee':-3,'book-revenue':-2,'collect-revenue':-1};
 tasks.forEach(task=>{if(task.remedyAction)task.nextRole=tasks.find(t=>t.action===task.remedyAction)?.role||task.nextRole;});
 const statuses={processing:-1,ready:0,blocked:1,'waiting-role':2,'waiting-time':3,failed:4,complete:5};
 tasks.forEach(x=>{if(!x.title)x.title=text((content[x.action]||content.view)[0],(content[x.action]||content.view)[1],lang);if(!x.status)x.status=x.role===role?'ready':'waiting-role';});
 return tasks.sort((x,y)=>(x.optional?20:0)+(x.informational?10:0)+(x.role===role?0:6)+(statuses[x.status]??9)+(x.status==='ready'?(priorities[x.action]||0):0)-((y.optional?20:0)+(y.informational?10:0)+(y.role===role?0:6)+(statuses[y.status]??9)+(y.status==='ready'?(priorities[y.action]||0):0)));
}
function selectCurrent(list,prefs,role){
 list=list.filter(t=>!t.handoff||!prefs.read?.[t.id]||prefs.selectedExplicit&&prefs.selected===t.id);
 const recovery=list.find(t=>t.operationId&&["processing","failed"].includes(t.status));if(recovery)return recovery;
 const handoff=list.find(t=>t.handoff&&t.immediate&&!prefs.read?.[t.id]);if(handoff)return handoff;
 const billingHandoff=list.find(t=>t.billingWaiting);if(billingHandoff)return billingHandoff;
 const billingReady=list.find(t=>['pay-household-bill','fund-export','confirm-receipt','publish-household-bill'].includes(t.action)&&t.role===role&&t.status==='ready');if(billingReady)return billingReady;
 const selected=list.find(x=>x.id===prefs.selected&&(x.status!=='complete'||prefs.reviewComplete));
 const ready=list.find(x=>x.status==='ready'&&!x.informational&&!x.optional&&x.role===role);
 // An automatically located task must not pin a blocked settlement ahead of a new order review.
 if(selected&&(prefs.selectedExplicit||!ready||['ready','processing','failed'].includes(selected.status)||selected.status==='complete'&&prefs.reviewComplete))return selected;
 return list.find(x=>x.informational&&x.role===role&&!prefs.read?.[x.id])||ready||list.find(x=>x.status==='ready'&&!x.informational&&!x.optional)||list.find(x=>!['complete','failed'].includes(x.status)&&!x.informational&&!x.optional)||list.find(x=>x.status!=='complete')||list[0];
}
const api={version,resolve,content,selectCurrent,distributionHandoff};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RevenueGuideModel=api;
})(typeof window==='object'?window:globalThis);
