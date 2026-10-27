"use strict";
const productAmount = (v) => BigInt(v || "0");
function productExactUSDC6(value) {
  const amount = productAmount(value), sign = amount < 0n ? "-" : "", absolute = amount < 0n ? -amount : amount;
  const fraction = String(absolute % 1000000n).padStart(6, "0").replace(/0+$/, "");
  return sign + String(absolute / 1000000n) + (fraction ? "." + fraction : "");
}
const productDate = (v) =>
  Number(v) > 0 ? date(Number(v)) : t("After settlement", "结算后确定");
function productAddMonths(ts, count) {
  const d = new Date(Number(ts) * 1000),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + count);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime() / 1000;
}
function distributionText(qEn,qZh,mEn,mZh,interval=Number(state.chain.distributionIntervalMonths||3)){return t(interval===1?mEn:qEn,interval===1?mZh:qZh);}
function productModel() {
  const c = state.chain,
    now = state.financialTime,
    phase = Number(c.phase);
  const pooled = state.applications.filter((a) => a.status === "pooled");
  const blocked = pooled.some((a) => state.valuationChecks?.[a.id]?.blocked);
  const aggregate = state.activeReports.aggregate;
  const proposalMatches=!c.proposedValuationReport||c.proposedValuationReport===aggregate;
  const proposalReports=state.valuations.filter(r=>Object.entries(state.activeReports).some(([key,hash])=>key!=='aggregate'&&hash===r.reportHash));
  const proposalValidUntil=Number(c.proposedValuationValidUntil|| (proposalReports.length?Math.min(...proposalReports.map(r=>r.validUntil)):0));
  const proposalOutdated=!!c.proposedValuationOutdated&&!state.approvedReports.includes(aggregate);
  const proposalExpired=!!aggregate&&proposalValidUntil>0&&proposalValidUntil<=now;
  const proposalCanApprove=!!aggregate&&proposalMatches&&!proposalExpired&&!proposalOutdated&&!state.approvedReports.includes(aggregate);
  const approved =
    !!aggregate &&
    state.approvedReports.includes(aggregate) &&
    c.valuationReport === aggregate &&
    c.fresh &&
    !blocked;
  const purchase = productAmount(c.acquisitionTotal);
  const minimum = (purchase * 10n + 8n) / 9n;
  const target = phase === 0 ? minimum : productAmount(c.target);
  const subscribed = productAmount(c.totalSubscriptions);
  const threshold = (target * 7000n + 9999n) / 10000n;
  const needed = minimum > threshold ? minimum : threshold;
  const shortfall = needed > subscribed ? needed - subscribed : 0n;
  const funding = {purchase,minimum,needed,subscribed,shortfall,capacity:target > subscribed ? target-subscribed : 0n};
  let completedServiceMonths=0;
  if(phase===2&&Number(c.settledAt)>0)for(let period=1;period<=60&&productAddMonths(c.settledAt,period)<=now;period++)completedServiceMonths=period;
  const unbookedPeriods=pooled.flatMap(a=>Array.from({length:completedServiceMonths},(_,i)=>i+1).filter(period=>!(state.income||[]).some(r=>r.stationId===a.stationId&&Number(r.period)===period)).map(period=>({applicationId:a.id,stationId:a.stationId,period})));
  const orders = Object.entries(state.accounts || {}).filter(
    ([, a]) => productAmount(a.subscription?.amount) > 0n
  );
  const coolingEnd = Math.max(
    0,
    ...orders.map(([, a]) => a.subscription.coolingEnd)
  );
  const readyOrders =
    orders.length > 0 &&
    orders.every(([, a]) => a.eligible && (c.subscriptionReviewRequired ? a.subscription.approved : a.subscription.coolingEnd <= now));
  const fundingOpen = phase === 1 && now < Number(c.deadline);
  const interval=Number(c.distributionIntervalMonths||3);
  const distributionCostMonths=interval===1?Math.max(0,Number(c.feeMonths)-Number(c.distributionMonths)):3;
  const monthly = productAmount(c.monthlyMandatoryCost);
  const fees = productAmount(c.feeLiability),
    expenses = productAmount(c.expenseLiability);
  const cash = productAmount(c.vaultCash),
    unpaid = productAmount(c.unpaidDistributions);
  const feesCurrent = Number(c.feeMonths) === 60 || Number(c.nextFeeAt) > now;
  const distributionDue =
    phase === 2 &&
    Number(c.distributionMonths) < 60 &&
    now >= Number(c.nextDistributionAt);
  const costsFunded = cash >= unpaid + fees + monthly * BigInt(distributionCostMonths);
  const redemptionDate = Number(c.redemptionDate);
  const inWindow =
    phase === 2 && now >= redemptionDate && now <= redemptionDate + 7 * 86400;
  const matureRequests = Object.values(state.accounts || {}).some(
    (a) =>
      a.eligible &&
      productAmount(a.redemption?.shares) > 0n &&
      now >= a.redemption.requestedAt + 30 * 86400
  );
  const checks = {
    valuation:[[unbookedPeriods.length===0,t("Every completed service month has a recorded receivable, including zero-revenue months","已结束服务月份均已登记应收款，零收益月份也须登记")]],
    publish: [
      [phase === 0, t("Product is awaiting publication", "产品处于待发行阶段")],
      [
        pooled.length > 0,
        t("Signed rights admitted to custody", "已签收益权已完成入池"),
      ],
      [
        approved,
        t(
          "Current pool valuation approved by trustee",
          "受托人已批准有效资产池估值"
        ),
      ],
    ],
    settle: [
      [
        fundingOpen,
        t(
          "Fundraising is open and within deadline",
          "处于募集期且尚未超过截止时间"
        ),
      ],
      [approved, t("Approved valuation remains current", "已批准估值仍有效")],
      [
        target > 0n && subscribed >= threshold,
        t("70% fundraising threshold met", "达到70%募集门槛"),
      ],
      [
        (subscribed * 9000n) / 10000n >= purchase && subscribed > 0n,
        t(
          subscribed < minimum ? `At least 10% cash retained automatically; investors must subscribe another ${productExactUSDC6(minimum-subscribed)} USDC to cover household purchases` : "Rights purchase fully funded after automatic retention of at least 10% cash",
          subscribed < minimum ? `至少10%现金由合约自动留存；投资者还需认购 ${productExactUSDC6(minimum-subscribed)} USDC 才能覆盖业主购买款` : "自动留存至少10%现金后，已足额覆盖业主购买款"
        ),
      ],
      [
        readyOrders,
        t(
          c.subscriptionReviewRequired ? "All subscription orders approved by intermediary and investors eligible" : "Legacy orders meet their original waiting conditions",
          c.subscriptionReviewRequired ? "全部认购订单已由中介审核通过，投资者资格有效" : "旧版订单已满足原合约等待条件"
        ),
      ],
    ],
    fee: [
      [
        phase === 2 && Number(c.feeMonths) < 60,
        t("Active product with unaccrued months", "存续中且仍有待计提月份"),
      ],
      [
        Number(c.nextFeeAt) > 0 && now >= Number(c.nextFeeAt),
        t("Monthly cutoff reached", "已到本月计费截止日"),
      ],
      [
        !!c.feeBasisReady,
        t("Opening NAV approved for this period", "本期计费基准净值已批准"),
      ],
    ],
    distribute: [
      [
        distributionDue,
        distributionText("Quarterly distribution date reached", "已到季度分配日", "Monthly distribution date reached", "已到月度分配日"),
      ],
      [
        approved && feesCurrent,
        t("Monthly fees accrued and valuation current", "月费已计提且估值有效"),
      ],
      [
        distributionCostMonths>0 && expenses >= monthly * BigInt(distributionCostMonths) && costsFunded,
        distributionText("Quarterly expenses accrued and cash funded", "季度必需费用已计提且现金足够支付", "Due monthly expenses accrued and cash funded", "到期月度费用已计提且现金足够支付"),
      ],
    ],
    redeem: [
      [
        inWindow && now >= Number(c.unlockedAt),
        t(
          "Unlocked and within the seven-day dealing window",
          "已解锁且处于七天赎回处理窗口"
        ),
      ],
      [
        phase === 2 &&
          inWindow &&
          approved &&
          Math.floor(Number(c.valuationAsOf) / 86400) ===
            Math.floor(now / 86400),
        t("Dealing-date NAV approved", "已批准交易日净值"),
      ],
      [
        matureRequests && productAmount(c.price) > 0n,
        t(
          "Eligible requests meet 30-day notice",
          "存在已满30天通知期的合资格赎回申请"
        ),
      ],
    ],
    carry: [[phase === 2 && now > Number(c.redemptionDate) + 7 * 86400,
      t("Seven-day dealing window has elapsed", "七天赎回处理窗口已结束")]],
    close: [
      [
        phase === 2 && Number(c.expiresAt) > 0 && now >= Number(c.expiresAt),
        t("Five-year rights term has ended", "五年收益权已到期"),
      ],
      [
        Number(c.feeMonths) === 60 &&
          Number(c.distributionMonths) === 60 &&
          fees === 0n &&
          expenses === 0n,
        distributionText("All monthly and quarterly expenses reconciled", "全部月费、季度费用已完成对账支付", "All monthly expenses and distributions reconciled", "全部月费及月度分配已完成对账支付"),
      ],
      [
        approved &&
          productAmount(c.rightsPV) === 0n &&
          productAmount(c.receivables) === 0n &&
          productAmount(c.futureFees) === 0n,
        t(
          "Final valuation has no remaining rights or receivables",
          "最终估值已批准，剩余收益权及应收款已清零"
        ),
      ],
    ],
  };
  // Confirmed collections stay visible even while NAV is awaiting a new approval.
  const income=state.income||[];
  const collected=income.filter(r=>r.collected).reduce((sum,r)=>sum+productAmount(r.amountUSDC6),0n);
  const outstanding=income.filter(r=>!r.collected).reduce((sum,r)=>sum+productAmount(r.amountUSDC6),0n);
  const pendingProposal=!!aggregate&&!state.approvedReports.includes(aggregate)&&proposalMatches&&!proposalExpired&&!proposalOutdated;
  const valuationNext=()=>pendingProposal
    ? {action:'approve-valuation',role:'trustee',page:'trustee_events',title:t('Approve the current pool valuation','审批当前资产池估值')}
    : {action:'prepare-valuation',role:'agent',page:'agent_pool',title:t('Prepare an updated pool valuation','编制更新后的资产池估值')};
  let next;
  if(phase===2){
    if(unbookedPeriods.length){const missing=unbookedPeriods[0];next={action:'book-revenue',role:'agent',page:'agent_monitor',...missing,title:t(`Record service month ${missing.period}`,`登记第 ${missing.period} 期账单`)};}
    else if(income.some(r=>!r.collected)){
      const missing=income.find(r=>!r.collected),payment=missing.payment;
      const action=payment?(!payment.exportPaid?'fund-export':!payment.householdPaid?'pay-household-bill':'confirm-receipt'):(state.householdPaymentsEnabled?'publish-household-bill':'collect-revenue');
      next={action,role:action==='pay-household-bill'?'owner':'agent',page:action==='pay-household-bill'?'owner_funds':'agent_monitor',entity:missing.id,period:missing.period,title:action==='pay-household-bill'?t(`Pay service month ${missing.period} electricity bill`,`缴纳第 ${missing.period} 期电费`):action==='confirm-receipt'?t(`Confirm service month ${missing.period} receipt`,`确认第 ${missing.period} 期收款`):action==='fund-export'?t(`Record month ${missing.period} grid export receipt`,`登记第 ${missing.period} 期售电回款`):t(`Publish service month ${missing.period} bill`,`发布第 ${missing.period} 期缴费账单`)};
    }
    else if(!feesCurrent){next=!c.feeBasisReady?valuationNext():{action:'accrue-fee',role:'agent',page:'agent_product',title:t(`Accrue month ${Number(c.feeMonths)+1} expenses`,`计提第 ${Number(c.feeMonths)+1} 期费用`)};}
    else if(!approved)next=valuationNext();
    else if(distributionDue)next={action:'distribute',role:'agent',page:'agent_product',title:distributionText('Declare this quarter’s distribution','宣告本季度分配','Declare this month’s distribution','宣告本月分配')};
    else next={action:'accrue-fee',role:'agent',page:'agent_product',waitDate:Number(c.nextFeeAt),title:t('Continue at the next monthly cutoff','在下一月度截止日继续运营')};
  }
  const operations={collected,outstanding,recorded:income.length,collectedCount:income.filter(r=>r.collected).length,completedServiceMonths,feeMonths:Number(c.feeMonths||0),distributionCount:Number(c.distributionCount||0),distributionMonths:Number(c.distributionMonths||0),nextDistributionAt:Number(c.nextDistributionAt||0),next};
  return {
    c,
    now,
    phase,
    pooled,
    approved,
    proposalExpired,
    proposalOutdated,
    operations,
    interval,
    distributionCostMonths,
    proposalValidUntil,
    proposalCanApprove,
    blocked,
    purchase,
    minimum,
    target,
    subscribed,
    threshold,
    needed,
    funding,
    completedServiceMonths,
    unbookedPeriods,
    orders,
    coolingEnd,
    monthly,
    checks,
    can: (action) => checks[action].every(([ok]) => ok),
  };
}
function productProjectionData() {
  const p = state.poolProjection,
    m = productModel();
  const reports = Object.entries(state.activeReports)
    .filter(([id]) => id !== "aggregate")
    .map(([, h]) => h);
  if (
    !p ||
    Number(p.distributionIntervalMonths||3)!==m.interval||
    !reports.length ||
    p.sourceReports.length !== reports.length ||
    !p.sourceReports.every((h) => reports.includes(h))
  )
    return null;
  const initial = productAmount(p.initialInvestmentUSDC6);
  if (initial <= 0n || !p.cashflows?.length) return null;
  const flows = p.cashflows.slice(1);
  const terminal = flows.at(-1);
  const distributions = flows.slice(0, -1);
  const total = flows.reduce((sum, f) => sum + productAmount(f.valueUSDC6), 0n);
  const start =
    state.valuations.find((r) => r.reportHash === p.sourceReports[0])
      ?.startAt || p.asOf;
  const annual = Array.from({ length: 5 }, (_, i) => ({
    year: i + 1,
    amount: distributions
      .filter(
        (f) =>
          f.at > productAddMonths(start, i * 12) &&
          f.at <= productAddMonths(start, (i + 1) * 12)
      )
      .reduce((sum, f) => sum + productAmount(f.valueUSDC6), 0n),
  }));
  const stale =
    m.blocked ||
    (m.phase !== 0 && !m.approved) ||
    state.valuations.some(
      (r) => reports.includes(r.reportHash) && r.validUntil < m.now
    );
  return {
    ...m,
    p,
    initial,
    flows,
    terminal,
    total,
    annual,
    stale,
    multiple: Number(total) / Number(initial),
    returnPct: (Number(total) / Number(initial) - 1) * 100,
  };
}
function productReturnPanel(compact = false) {
  const phase = Number(state.chain.phase);
  if (phase >= 3)
    return `<section class="op-return op-empty"><h3>${
      phase === 3
        ? t("Fundraising ended", "本次募集已终止")
        : t("Product closed", "产品已清算结束")
    }</h3><p>${
      phase === 3
        ? t(
            "No investor shares were issued. Investors can claim their escrow refunds on the subscription page.",
            "未发行投资者份额，投资者可在认购页面领取托管退款。"
          )
        : t(
            "Forward return estimates no longer apply. View confirmed cash distributions and final claims in My holdings.",
            "未来收益测算已不适用，请在我的持仓查看已确认分配和最终可领取现金。"
          )
    }</p></section>`;
  const d = productProjectionData();
  if (!d)
    return `<section class="op-return op-empty"><h3>${t(
      "Expected investor return",
      "投资者预期收益"
    )}</h3><p>${t(
      "Admit station rights and prepare the pool valuation to calculate investor net IRR, distributions and final cash. No rate is available yet.",
      "完成收益权入池并编制资产池估值后，将显示投资者净年化收益率、分配计划和到期现金；当前尚未生成收益测算。"
    )}</p></section>`;
  const { p } = d;
  const issuance = d.phase < 2;
  const rate =
    !d.stale && Number.isFinite(p.projectedNetIRRPct)
      ? `${p.projectedNetIRRPct.toFixed(2)}%`
      : "—";
  const status = d.stale
    ? t("Valuation update required", "估值待更新")
    : d.approved
    ? t("Approved model estimate", "已审批模型测算")
    : t("Draft · awaiting approval", "试算 · 待受托审批");
  const basis = issuance
    ? t(
        "Subscription illustration · hold to expiry",
        "首次认购测算 · 持有至到期"
      )
    : t(
        "Forward pool illustration · not holder lifetime return",
        "资金池剩余期限测算 · 非持有人累计回报"
      );
  const annualRows = d.annual.filter(
    (r) =>
      productAddMonths(
        state.valuations.find((v) => v.reportHash === p.sourceReports[0])
          ?.startAt || p.asOf,
        r.year * 12
      ) > p.asOf
  );
  return `<section class="op-return"><div class="op-return-top"><div><span class="op-eyebrow">${basis}</span><h2>${t(
    "Expected annualized net return",
    "预计年化收益率（净 IRR）"
  )}</h2><div class="op-rate">${rate}<span>${t(
    "per year",
    "年化"
  )}</span></div><p>${t(
    "Calculated from the timing of projected investor cashflows, after pool fees and mandatory expenses.",
    "按投资者预计投入与回款时间计算，已扣除资金池费用和必需支出。"
  )}</p></div><div class="op-return-side"><span class="op-tag">${status}</span><div><small>${t(
    "Estimated total cash / invested amount",
    "预计累计回款 / 投入金额"
  )}</small><strong>${
    d.stale ? "—" : d.multiple.toFixed(2) + "×"
  }</strong></div><div><small>${t(
    "Estimated total return over holding period",
    "预计持有期累计收益率"
  )}</small><strong>${
    d.stale ? "—" : d.returnPct.toFixed(2) + "%"
  }</strong></div></div></div>
    <div class="op-return-facts"><div><small>${
      issuance
        ? t("Modeled subscription total", "测算认购总额")
        : t("Modeled opening asset value", "测算期初资产价值")
    }</small><b>${money(
    p.initialInvestmentUSDC6
  )} <em>USDC</em></b></div><div><small>${t(
    "Total projected cash returned",
    "预计累计现金回款"
  )}</small><b>${money(String(d.total))} <em>USDC</em></b></div><div><small>${t(
    "Future pool expense PV",
    "未来资金池费用现值"
  )}</small><b>${money(p.futureExpensesUSDC6)} <em>USDC</em></b></div></div>
    <div class="op-return-body"><p class="op-disclosure">${distributionText("This is a variable revenue-share estimate, not a fixed coupon. It includes quarterly distributions, retained cash and final liquidation cash; no original-principal repayment is assumed. Actual returns depend on collections, expenses and exit price.", "这是浮动收益权的模型预期，并非固定票息。测算包括季度分配、留存现金及到期清算，不假设偿还原始本金；实际收益取决于回款、费用和退出价格。", "This variable revenue-share estimate includes monthly distributions, retained cash and final liquidation, without guaranteed interest or principal repayment. Actual returns depend on collections, costs and exit price.", "这是浮动收益权的模型预期，包含月度分配、留存现金和到期清算，不保证利息或返还本金。实际收益取决于回款、费用和退出价格。")}</p>
    ${
      d.stale
        ? `<p class="op-alert">${t(
            "The stored calculation is shown below for reference. Refresh and approve the valuation before using it for an investment decision or dealing.",
            "下方保留旧测算供核对，请更新并审批估值后再用于投资判断或交易。"
          )}</p>`
        : ""
    }
    ${
      p.unfundedExpenses
        ? `<p class="op-alert">${t(
            "The projection contains periods with insufficient cash to pay expenses. Review funding and costs before publication.",
            "预测中存在现金不足以支付费用的期间，请在发行前复核筹资和成本安排。"
          )}</p>`
        : ""
    }
    ${cfInvestorTimeline(d)}
    <details class="op-projection-details" ${
      compact ? "" : "open"
    }><summary>${t(
    "Distribution schedule and calculation basis",
    "查看年度回款安排与收益测算依据"
  )}</summary>
      <div class="op-projection-grid"><div>${table(
        [
          t("Period", "期间"),
          distributionText("Quarterly cash distributions", "预计季度分配合计", "Monthly cash distributions", "预计月度分配合计"),
          t("Per 100 USDC modeled input", "每投入100 USDC等比例测算"),
        ],
        annualRows
          .map((r) => [
            t("Year ", "第") + r.year + t("", "年"),
            money(String(r.amount)) + " USDC",
            ((Number(r.amount) / Number(d.initial)) * 100).toFixed(2) + " USDC",
          ])
          .concat([
            [
              t("Final liquidation cash", "到期清算现金"),
              money(d.terminal?.valueUSDC6 || "0") + " USDC",
              (
                (Number(d.terminal?.valueUSDC6 || 0) / Number(d.initial)) *
                100
              ).toFixed(2) + " USDC",
            ],
          ])
      )}</div>
      <div class="op-projection-notes"><h4>${t(
        "What this estimate includes",
        "这项收益预期包含什么"
      )}</h4><ul><li>${t(
    "0.5% annual pool fee, accrued monthly on approved opening NAV; mandatory expenses deducted once.",
    "0.5%资金池年费，按月基于期初批准净值计提；必需费用仅扣除一次。"
  )}</li><li>${t(
    "10% initial cash retention. After costs and six-month expense protection, 75% of surplus receipts are distributed and 25% held for exits.",
    "初始留存10%现金；扣除费用并保护六个月必需支出后，剩余回款75%分配、25%留作赎回流动性。"
  )}</li><li>${t(
    "Assumes one investment at the valuation cutoff, held to expiry without early exits. Actual subscription timing can change returns. Final cash is counted only once.",
    "假设估值时点一次性投入并持有至到期；实际认购时间会影响回报。剩余现金仅在清算中计入一次。"
  )}</li><li>${t(
    "Generation/export history is observed; tariffs, FX, expenses and collection timing are modeled assumptions. Discount rate is not investor yield.",
    "历史发电及上网量来自观测；电价、汇率、费用与收款时间采用模型假设。估值折现率不等于投资收益率。"
  )}</li></ul><p>${t("Valuation cutoff (UTC)", "估值时点（UTC）")}: ${date(
    p.asOf
  )}<br>${t(
    "Final projected receipt (UTC)",
    "预计最终回款（UTC）"
  )}: ${productDate(d.terminal?.at)}</p></div></div>
    </details></div></section>`;
}
function productDistributionHandoff(){
 if(!['agent','trustee'].includes(role))return '';
 const pending=window.RevenueGuideModel.distributionHandoff(state);if(!pending)return '';
 const {distributionId,recipients,immediate}=pending;
 return `<section class="card" data-distribution-handoff><h3>${immediate?t('Distribution declared · investor claim','分配已宣告 · 投资者领取'):t('Earlier distribution · unclaimed cash','历史分配 · 尚有待领取金额')} #${distributionId}</h3><p>${immediate?t('This distribution has confirmed unpaid cash. The corresponding investor may claim it without another NAV approval.','这笔分配已有链上确认的待领取金额，对应投资者可以领取，无需为这笔现金再次审批净值。'):t('These entitlements belong to an earlier declaration. They remain claimable independently of the current monthly valuation and distribution workflow.','这些金额属于此前已宣告的分配，投资者仍可单独领取。它们不代表本月已经完成审批或分配，请继续处理本期任务。')}</p>${table([t('Investor','投资者'),t('Claimable (USDC)','可领取（USDC）'),t('Received (USDC)','已领取（USDC）')],recipients.map(r=>[esc(investorLabel(r.actor)),money(r.amountUSDC6),money(r.paidUSDC6)]))}<button type="button" class="btn ${immediate?'btn-primary':'btn-outline'}" data-guide-investor-handoff>${t('Switch to investor · view / claim','切换到投资者 · 查看或领取')} →</button></section>`;
}

function productChecks(checks) {
  return `<ul class="op-checks">${checks
    .map(
      ([ok, label]) =>
        `<li class="${ok ? "met" : "pending"}"><span>${
          ok ? "✓" : "○"
        }</span>${label}</li>`
    )
    .join("")}</ul>`;
}
function productAction(
  action,
  label,
  enabled,
  checks,
  description,
  extra = "",
  completed = false
) {
  return `<article class="op-action"><header><h3>${label}</h3><span class="op-status ${
    enabled ? "ready" : ""
  }">${
    completed
      ? t("Completed", "已完成")
      : enabled
      ? t("Ready", "可操作")
      : t("Conditions pending", "条件未满足")
  }</span></header><p>${description}</p>${extra}${
    completed
      ? `<p class="op-inline-stat">${t(
          "This milestone is complete and cannot be repeated.",
          "此步骤已完成，无需重复操作。"
        )}</p>`
      : productChecks(checks)
  }<form data-action="${action}" data-payload="{}"><button class="btn btn-primary" type="submit" ${
    enabled ? "" : 'disabled data-operation-unavailable="true"'
  }>${label}</button></form></article>`;
}
const productNav = (label, targetRole, targetPage) =>
  `<button class="btn btn-outline" data-wf-handoff="${targetRole}" data-wf-page="${targetPage}">${label} →</button>`;

function productSettlementHelp(m, {investor = false, canSubscribe = false} = {}) {
  if (![0,1].includes(m.phase)) return "";
  const f=m.funding, exact=v=>productExactUSDC6(v)+" USDC";
  const gap=m.phase===1&&f.shortfall>0n;
  return `<section class="op-section" id="settlement-funding-help" data-settlement-funding><h2>${t("Settlement funding and automatic cash retention","结算资金与自动现金留存")}</h2><p>${t("The current product contract requires at least 10% of subscriptions to remain as pool cash after paying households. This is the demo's agreed liquidity policy, not a universal requirement for revenue-right products. The cash supports expenses and the interval before operating receipts arrive. It remains a pool asset, rather than an extra fee.","当前产品合约要求支付业主购买款后，至少留存认购款的10%作为池内现金。这是本演示约定的流动性规则，并不是收益权产品必须采用的统一比例。现金用于费用支出和回款到账前的周转，仍属于资产池资产，不是额外收费。")}</p><p>${t("There is no separate retention payment or button. On successful settlement, the contract pays the agreed household purchase prices and keeps the remaining cash automatically. Retention may exceed 10% when subscriptions exceed the minimum purchase-funding requirement.","不需要另行转账，也没有单独的留存按钮。成功结算时，合约自动支付约定的业主购买款，其余现金留在池内。认购额高于最低购权资金要求时，实际留存可能超过10%。")}</p><div class="iv-facts"><div><small>${t("Agreed household purchase prices","约定业主购买款")}</small><b>${exact(f.purchase)}</b></div><div><small>${t("Purchase funding = prices ÷ 90%, rounded up to 0.000001 USDC","购权资金要求＝购买款÷90%，向上取整至0.000001 USDC")}</small><b>${exact(f.minimum)}</b></div><div><small>${t("Settlement minimum also includes the 70% fundraising threshold","结算最低额还须满足70%募集门槛")}</small><b>${exact(f.needed)}</b></div></div>${m.phase===1?`<p>${t("Confirmed subscriptions","已确认认购")}: <strong>${exact(f.subscribed)}</strong>。${gap?t(`Another ${exact(f.shortfall)} is needed (approximately ${money(String(f.shortfall))} USDC). Use the exact amount below; the overview rounds to two decimals.`,`还需 ${exact(f.shortfall)}（约 ${money(String(f.shortfall))} USDC）。上方概览仅保留两位小数，操作时请使用这里的准确金额。`):t("Funding is sufficient. Review every current order and any other unmet settlement conditions before settling.","资金已足够，请核对所有最新订单审批及其他结算条件后执行结算。")}</p>`:""}${gap?`<ol><li>${t("An eligible investor opens Investor → Subscribe. The existing investor may add funds, or another eligible investor may subscribe.","由合资格投资者进入「投资者 → 认购」。原投资者可以追加，也可以由其他合资格投资者认购。")}</li><li>${t(`Enter ${exact(f.shortfall)}, review the amount and confirm the required wallet transactions. This pays only the additional amount, not the existing escrow again.`,`填入待补金额 ${exact(f.shortfall)}，核对后在钱包确认所需交易。只支付新增金额，不会再次支付已有托管款。`)}</li><li>${t("The intermediary reviews the updated cumulative order again, then completes fundraising settlement. The contract pays households, issues shares and retains cash in that transaction.","中介机构重新审核更新后的累计订单，再点击「完成募集结算」。合约在该交易中支付业主购买款、发行份额并留存现金。")}</li></ol>${investor?`<button type="button" class="btn btn-outline" data-investor-funding-fill ${!canSubscribe||f.shortfall>f.capacity?'disabled':''}>${t("Fill the exact shortfall","填入准确待补金额")} ${exact(f.shortfall)}</button><p>${t("You may choose a smaller amount and wait for other investors. Filling the amount does not send a wallet request or submit a payment.","也可以自行填写较小金额，并等待其他投资者认购。填入金额不会请求钱包签名或提交付款。")}</p>`:productNav(t("Switch investor wallet and open subscriptions","切换投资者钱包并打开认购页面"),"investor","subscribe")+`<p>${t("The investor must sign in with their own wallet. The intermediary cannot pay on their behalf. Adding funds invalidates the prior order approval.","投资者须使用自己的钱包登录，中介不能代替其付款。追加后原订单审批会失效，需要重新审核。")}</p>`}`:""}</section>`;
}
function productSubscriptionState(account) {
  const m = productModel(),
    a = account || {};
  const amount = productAmount(a.subscription?.amount);
  const checks = [
    [m.c.subscriptionReviewRequired !== false, t("Current contract supports immediate intermediary review", "请使用支持即时审核的新版产品认购")],
    [
      m.phase === 1 && m.now < Number(m.c.deadline),
      t("Product published and fundraising open", "产品已发布且处于有效募集期"),
    ],
    [
      m.approved,
      t("Current pool valuation approved", "资产池估值有效且已批准"),
    ],
    [
      !!a.eligible,
      a.eligible
        ? t("Your investor eligibility is approved", "当前投资者资格已通过")
        : t(
            "Investor qualification required — apply from Investor qualification",
            "尚未取得投资资格，请先到「投资资格」提交申请"
          ),
    ],
    [
      (amount === 0n || m.c.subscriptionTopUpsAllowed === true) && m.subscribed < m.target,
      t(
        m.c.subscriptionTopUpsAllowed ? "Allocation remains available; repeated subscriptions are allowed" : "Allocation available and no existing active order",
        m.c.subscriptionTopUpsAllowed ? "仍有认购额度，允许多次追加认购" : "仍有认购额度且无已有有效订单"
      ),
    ],
  ];
  return {
    checks,
    canSubscribe: checks.every(([ok]) => ok),
    canRefund:
      amount > 0n &&
      (m.phase === 3 || (m.phase === 1 && (m.c.subscriptionReviewRequired || m.now < a.subscription.coolingEnd))),
    amount: amount.toString(),
    remaining:
      m.phase === 1 && m.target > m.subscribed
        ? (m.target - m.subscribed).toString()
        : "",
  };
}
function productPublishEntry(m) {
  if (role !== "agent" || page !== "agent_product" || !m.can("publish"))
    return "";
  return `<div class="op-publish-entry"><form data-action="publish" data-payload="{}"><button class="btn btn-primary" type="submit">${t(
    "Publish & open fundraising",
    "发布产品，开始募集"
  )} →</button></form><p>${t("Target", "募集目标")} ${money(
    String(m.target)
  )} USDC · ${t("30-day fundraising", "募集期30天")}</p></div>`;
}
function productOperations() {
  const m = productModel(),
    { c } = m;
  const missing = m.needed > m.subscribed ? m.needed - m.subscribed : 0n;
  const progress =
    m.target > 0n
      ? Math.min(100, (Number(m.subscribed) / Number(m.target)) * 100)
      : 0;
  const period = t(
    "All dates below use the financial clock in UTC",
    "下列日期均以UTC财务时钟为准"
  );
  return `<div class="op-workspace"><header class="op-page-head"><div><span class="op-eyebrow">DEYE · SOLAR REVENUE RIGHTS</span><h1>${t(
    "Product issuance & operations",
    "产品发行与运营"
  )}</h1><p>${t(
    "Review investor economics, publish terms and follow each operational milestone.",
    "核对投资者收益预期，发布发行条款，并按节点完成资金与存续管理。"
  )}</p></div><span class="op-phase">${t(
    ...phaseNames[m.phase]
  )}</span></header>${wfPoolGuide(
    productPublishEntry(m) ||
      (m.phase === 1
        ? `<button class="btn btn-primary" data-operation-focus="op-issuance">${t(
            "Review orders & settlement",
            "审核认购与结算条件"
          )} →</button>`
        : "")
  )}${productReturnPanel(true)}
    <section class="op-section" id="op-issuance"><header><div><span class="op-section-no">01</span><h2>${t(
      "Issuance & settlement",
      "发行与结算"
    )}</h2></div><p>${t(
    "Publishing opens escrow subscriptions. Successful settlement pays households and issues investor tokens.",
    "发布后开放托管认购；成功结算时才支付业主购买款并向投资者发行份额。"
  )}</p></header>
    <div class="op-funding"><div class="op-funding-heading"><strong>${t(
      "Fundraising progress",
      "募集进度"
    )}</strong><span>${money(String(m.subscribed))} / ${money(
    String(m.target)
  )} USDC · ${progress.toFixed(
    1
  )}%</span></div><div class="progress-bar"><div class="fill" style="width:${progress}%"></div></div><div class="op-terms"><div><small>${t(
    "Rights purchase price",
    "业主购买款合计"
  )}</small><b>${money(String(m.purchase))} USDC</b></div><div><small>${t(
    "Initial retained cash at target",
    "达标时初始留存现金"
  )}</small><b>${money(
    String(m.target - m.purchase > 0n ? m.target - m.purchase : 0n)
  )} USDC</b></div><div><small>${t(
    "Issuance price",
    "份额发行价格"
  )}</small><b>1.00 USDC / DRS</b></div><div><small>${t(
    "Fundraising deadline",
    "募集截止时间"
  )}</small><b>${
    Number(c.deadline)
      ? productDate(c.deadline)
      : t("30 days after publication", "发布后30天")
  }</b></div></div><p>${t(
    "Minimum funding to settle",
    "满足结算所需最低募集额"
  )}: <strong>${money(String(m.needed))} USDC</strong> · ${t(
    "Still needed",
    "尚缺资金"
  )}: ${money(String(missing))} USDC. ${t(
    "Cash retention is automatic at settlement. See the exact funding shortfall and next steps below.",
    "现金在结算时自动留存。准确待补金额和后续操作见下方说明。"
  )}</p></div>
    ${productSettlementHelp(m)}
    <div class="op-action-grid">${productAction(
      "publish",
      t("Publish issuance terms", "发布发行条款"),
      m.can("publish"),
      m.checks.publish,
      t(
        "Freeze the fundraising target and 1 USDC issue price, then open subscriptions for 30 days. No investor tokens are minted yet.",
        "确定募集目标及每份1 USDC的发行价格，开放30天认购期；此时不会铸造投资者份额。"
      ),
      "",
      m.phase !== 0
    )}${productAction(
    "settle",
    t("Complete fundraising settlement", "完成募集结算"),
    m.can("settle"),
    m.checks.settle,
    t(
      "Pay all signed household purchase amounts, retain the disclosed cash and issue tokens in proportion to confirmed subscriptions. Primary issuance then closes.",
      "支付全部已签业主购买款、留存披露现金，并按已确认认购金额发行份额；完成后关闭首次发行。"
    ),
    `<p class="op-inline-stat">${m.c.subscriptionReviewRequired ? t("No cooling period. Review each order below; settle when all funding conditions are met.", "无冷静期。请先在下方审核每笔认购，资金条件满足后即可结算发行。") : t("Legacy contract: original order conditions still apply.", "旧版合约仍按原订单条款处理，可退款后改用新版产品。")}</p>`,
    m.phase === 2 || m.phase === 4
  )}</div>
    <div class="op-link-row">${productNav(
      t("Investor eligibility", "检查投资者资格"),
      "agent",
      "agent_kyc_review"
    )}${productNav(
    t("View investor subscription page", "查看投资者认购页面"),
    "investor",
    "subscribe"
  )}${productNav(
    t("Pool valuation & approval", "资产池估值与审批"),
    "agent",
    "agent_pool"
  )}</div>
    <section class="op-section" id="subscription-review"><h2>${t("Subscription review", "认购订单审核")}</h2><p>${t("Review the wallet, cumulative escrow and accepted terms. Every addition changes the review version and clears previous approval. Review the latest total; rejection refunds all cumulative funds. Approval does not mint shares: settle the pool once all funding conditions are met.", "请核对投资者钱包、累计托管金额与发行条款。每次追加会更新审核版本并清除原审批，须按最新累计金额重新审核。不通过时退回全部累计款。审核通过不会单独发行份额，满足资金条件后统一结算。")}</p>${
    m.orders.length ? table([
      t("Investor", "投资者"), t("Cumulative escrow / settled", "累计托管 / 已结算金额"), t("Submitted", "下单时间"), t("Status and action", "状态与操作")
    ],m.orders.map(([key,a])=>[
      investorLabel(key), money(a.subscription.amount)+" USDC", productDate(a.subscription.submittedAt || a.subscription.coolingEnd),
      [2,4].includes(m.phase) ? t("Settled", "已结算") : m.phase === 3 ? t("Refund available", "可领取退款") : !m.c.subscriptionReviewRequired ? t("Legacy order · refund and use current product", "旧版订单 · 请退款后认购新产品") : a.subscription.approved ? tag(t("Approved · awaiting pool settlement", "已审核通过 · 待统一结算"),"normal") :
      form("review-subscription",t("Confirm review", "提交审核决定"),select("approved",t("Decision", "审核决定"),[["true",t("Approve", "审核通过")],["false",t("Reject and refund", "不通过并全额退款")]],"true")+input("reviewNote",t("Review note", "审核说明"),t("Wallet, payment and issuance terms checked", "已核对投资者钱包、托管金额及发行条款"),"text","required minlength=4 maxlength=1000"),{investor:key,amountUSDC6:a.subscription.amount,terms:a.subscription.terms,orderNonce:a.subscription.nonce},m.phase!==1 || !a.eligible || state.financialTime >= Number(m.c.deadline))
    ])) : `<p>${t("No active orders. Investor subscriptions appear here for immediate review.", "暂无有效订单。投资者完成认购后，订单将在这里显示，可立即审核。")}</p>`
  }<p>${t(
    "If fundraising cannot complete, terminate it to open full escrow refunds. Investors claim their refunds from the subscription page; this action does not send refunds automatically and creates no shares.",
    "无法完成募集时，可终止本次募集并开放托管资金全额退款。投资者须到认购页自行领取退款；终止操作不会自动转账，也不会发行份额。"
  )}</p>${productAction(
    "fail",
    t("Terminate fundraising", "终止本次募集"),
    m.phase === 1,
    [[m.phase === 1, t("Product is fundraising", "当前处于募集阶段")]],
    t(
      "The product moves to failed status. This issuance cannot be reopened; use a new demo scenario for another issuance.",
      "产品转为募集失败状态，本次发行不可重新开放；演示另一轮发行需使用新的场景。"
    )
  )}</section></section>
    <section class="op-section"><header><div><span class="op-section-no">02</span><h2>${t(
      "Monthly cash & valuation",
      "月度回款与估值"
    )}</h2></div><p>${t(
    "Record collections, accrue expenses, then prepare and approve the current NAV.",
    "记录回款、计提费用，再编制并审批当前净值；每月按顺序完成。"
  )}</p></header><div class="op-terms"><div><small>${t(
    "Next fee cutoff",
    "下次计费截止日"
  )}</small><b>${productDate(c.nextFeeAt)}</b></div><div><small>${t(
    "Accrued fee liability",
    "已计提待付管理费"
  )}</small><b>${money(c.feeLiability)} USDC</b></div><div><small>${t(
    "Mandatory cost / month",
    "每月必需成本"
  )}</small><b>${money(c.monthlyMandatoryCost)} USDC</b></div><div><small>${t(
    "NAV status",
    "估值状态"
  )}</small><b>${
    m.approved
      ? t("Current & approved", "有效且已批准")
      : t("Prepare / approve update", "待更新或审批")
  }</b></div></div>
    <div class="op-action-grid"><article class="op-action"><header><h3>${t(
      "Record station revenue",
      "登记电站应收与实际回款"
    )}</h3></header><p>${t(
    "Reconcile each completed service month, including zero revenue. Record the receivable and then the confirmed simulated collection. Generation is not a cash receipt.",
    "逐月核对已完成服务期，零收益月份也须登记。先记应收款，再登记已确认的模拟收款；发电量本身不是现金回款。"
  )}</p>${productNav(
    t("Open monitoring & evidence", "前往监控与证据"),
    "agent",
    "agent_monitor"
  )}</article>${productAction(
    "accrue-fee",
    t("Accrue monthly expenses", "计提本月费用"),
    m.can("fee"),
    m.checks.fee,
    distributionText("Accrue 0.5% / 12 against approved opening NAV plus the mandatory monthly cost. This records liabilities; cash payment occurs at quarterly distribution.", "按已批准期初净值的0.5%÷12计提管理费，同时计提月度必需成本。本步骤记录应付费用，季度分配时才实际支付。", "Accrue 0.5% / 12 against approved opening NAV plus mandatory monthly costs. These liabilities are paid at the monthly distribution.", "按已批准期初净值的0.5%÷12计提管理费和月度必需成本，月度分配时再实际支付这些费用。")
  )}<article class="op-action"><header><h3>${t(
    "Update and approve NAV",
    "更新并审批资产池净值"
  )}</h3></header><p>${t(
    "After monthly reconciliation and fee accrual, prepare a new valuation in Pool management and have the trustee approve it. It enables current pricing and the next period's fee basis.",
    "完成月度对账及费用计提后，在资产池管理编制新估值，再由受托人批准，更新交易价格和下一期计费依据。"
  )}</p>${productNav(
    t("Prepare valuation", "前往编制估值"),
    "agent",
    "agent_pool"
  )}${productNav(
    t("Trustee review", "前往受托审批"),
    "trustee",
    "trustee_events"
  )}</article></div></section>
    <section class="op-section"><header><div><span class="op-section-no">03</span><h2>${distributionText("Quarterly distributions & exits", "季度分配与退出", "Monthly distributions & scheduled exits", "月度分配与窗口退出")}</h2></div><p>${period}</p></header><div class="op-action-grid">${productAction(
    "distribute",
    distributionText("Declare quarterly distribution", "宣告季度现金分配", "Declare monthly distribution", "宣告月度现金分配"),
    m.can("distribute"),
    m.checks.distribute,
    distributionText("Pay fees and quarterly costs; protect six months of mandatory costs. Allocate 75% of the remaining eligible receipts to holder claims and 25% to redemption liquidity. Holders claim payouts separately.", "支付管理费及季度成本，保护六个月必需支出；剩余合资格回款75%形成持有人可领取分配、25%留作赎回流动性。投资者需另行领取。", "Pay accrued fees and monthly costs, including any unpaid catch-up periods; protect six months of mandatory costs. Allocate 75% of surplus receipts to holder claims and 25% to redemption liquidity. Investors then claim separately.", "支付已计提管理费及尚未结清的月度成本，保护六个月必需支出。剩余回款的75%形成持有人可领取分配，25%留作赎回流动性。宣告后，请切换投资者领取。"),
    `<p class="op-inline-stat">${t(
      "Next distribution",
      "下次分配"
    )}: ${productDate(c.nextDistributionAt)}</p>`
  )}${productAction(
    "process-redemptions",
    t("Process redemption window", "处理季度赎回窗口"),
    m.can("redeem"),
    m.checks.redeem,
    t(
      "Use approved dealing-date NAV and fill eligible requests pro rata, capped by redemption cash and 5% of NAV. Unfilled tokens carry forward and retain distribution rights.",
      "按批准的交易日净值，对合资格申请按比例兑付，额度受赎回现金和净值5%共同限制。未成交份额顺延并继续享有分配权。"
    ),
    `<p class="op-inline-stat">${t(
      "Dealing date / cutoff",
      "交易日 / 申请截止日"
    )}: ${productDate(c.redemptionDate)} / ${productDate(
      c.redemptionCutoff
    )}<br>${t("Redemption cash", "赎回现金")}: ${money(
      c.redemptionCash
    )} USDC</p>`
  )}</div>
    <details class="op-secondary"><summary>${t(
      "Missed windows & product closure",
      "错过窗口与到期清算"
    )}</summary><div class="op-action-grid">${productAction(
    "carry-window",
    t("Carry missed window forward", "顺延已错过的窗口"),
    m.can("carry"),
    m.checks.carry,
    t(
      "Move to the next quarterly window without paying or burning requested tokens. Existing requests remain recorded.",
      "顺延至下一季度窗口，不付款、不销毁申请中的份额，并保留现有赎回请求。"
    )
  )}${productAction(
    "close",
    t("Complete final liquidation", "完成到期清算"),
    m.can("close"),
    m.checks.close,
    t(
      "Collect outstanding receivables, settle all liabilities and distribute the remaining cash proportionally. This closes the product; there is no invented original-principal repayment.",
      "收齐应收款并清偿所有负债后，将剩余现金按份额比例形成最终分配并关闭产品；不另行虚构本金偿还。"
    ),
    `<p class="op-inline-stat">${t(
      "Rights expiry",
      "收益权到期日"
    )}: ${productDate(c.expiresAt)}</p>`
  )}</div></details></section>
    <details class="op-section op-clock"><summary>${t(
      "Demo tools · financial time",
      "演示工具 · 财务时间推进"
    )}</summary><p>${period}: <b>${date(m.now)}</b>。${t(
    "All products share this test chain clock. Advancing it also changes other products' deadlines and valuation validity. This never creates new telemetry or real receipts. During servicing, accrue each month and approve its NAV before advancing further.",
    "全部测试产品共用这条链的财务时钟。推进时间也会影响其他产品的募集截止日和估值有效期。此操作不生成新的遥测或真实回款。存续期须逐月计费并审批净值后再继续推进。"
  )}</p>${form(
    "advance",
    t("Advance demo time", "推进演示时间"),
    select("by", t("Target", "推进目标"), [
      ["month", t("Next monthly fee cutoff", "下个月度计费截止日")],
      ["day", t("One day forward", "向后一天")],
    ])
  )}</details></div>`;
}
