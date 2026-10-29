function workflowStorageKey(k) { return globalThis.RevenueNetworks?.storageKey(k) || k; }
"use strict";
let wfSelected = sessionStorage.getItem(workflowStorageKey("revenue.application")) || "";
let wfQuery = "",
  wfFilter = "all";
const wfDrafts = new Map(),
  wfPreviews = new Map(),
  wfEditing = new Set();
try {
  for (const [id, draft] of JSON.parse(
    sessionStorage.getItem(workflowStorageKey("revenue.quote-drafts")) || "[]"
  ))
    wfDrafts.set(id, draft);
} catch {}
// Reports preserve bilingual source warnings; each interface displays its own language.
function wfWarningText(value, language = typeof lang === "undefined" ? "en" : lang) {
  const text = String(value);
  if (language !== "en") return text;
  const han = [...text.matchAll(/[\u3400-\u9fff]/g)].at(-1);
  if (!han) return text;
  const start = Math.max(han.index, text.lastIndexOf("。"));
  const english = text.slice(start + 1).replace(/^[\s。；：，、！]+/, "");
  return /^[A-Z]/.test(english) ? english : text;
}
function wfSaveDraft(id, draft) {
  wfDrafts.set(id, draft);
  sessionStorage.setItem(workflowStorageKey("revenue.quote-drafts"), JSON.stringify([...wfDrafts]));
}
function wfForgetDraft(id) {
  wfDrafts.delete(id);
  sessionStorage.setItem(workflowStorageKey("revenue.quote-drafts"), JSON.stringify([...wfDrafts]));
}

const wfStages = [
  ["Application", "申请审核"],
  ["Valuation", "估值报价"],
  ["Trustee", "受托审批"],
  ["Acceptance", "业主确认"],
  ["Agreement", "协议记录"],
  ["Admission", "收益权入池"],
  ["Settlement", "募集付款"],
];
function wfApproved(a) {
  return !!a.offer && state.approvedReports.includes(a.offer.reportHash);
}
function wfExpired(a) {
  return !!a.offer && a.offer.validUntil < state.financialTime;
}
function wfQuoteNeedsCorrection(a) {
  return a.status === "offered" && !!state.valuationChecks?.[a.id]?.blocked;
}
function wfStage(a) {
  if (wfQuoteNeedsCorrection(a)) return 1;
  if (a.status === "offered" && wfExpired(a)) return 1;
  return {
    submitted: 0,
    supplement: 0,
    rejected: 0,
    approved: 1,
    offered: wfApproved(a) ? 3 : 2,
    accepted: 4,
    signed: 5,
    pooled: 6,
  }[a.status];
}
function wfStatus(a) {
  if (wfQuoteNeedsCorrection(a))
    return t("Quote needs correction", "报价待补全复核");
  if (
    state.valuationChecks?.[a.id]?.blocked &&
    ["offered", "accepted", "signed", "pooled"].includes(a.status)
  )
    return t("Reassessment required", "待重新评估");
  if (a.status === "offered")
    return wfExpired(a)
      ? t("Quote expired", "报价已过期")
      : wfApproved(a)
      ? t("Awaiting owner", "待业主确认")
      : t("Awaiting trustee", "待受托审批");
  return {
    submitted: t("Awaiting assessment", "待申请审核"),
    supplement: t("Awaiting documents", "待业主补充"),
    rejected: t("Rejected", "已拒绝"),
    approved: t("Awaiting valuation", "待估值报价"),
    accepted: t("Awaiting agreement", "待协议记录"),
    signed: t("Awaiting admission", "待入池"),
    pooled:
      Number(state.chain.phase) === 2
        ? t("Settled / active", "已结算 · 存续中")
        : t("Admitted", "已入池"),
  }[a.status];
}
function wfNext(a) {
  if (wfQuoteNeedsCorrection(a))
    return [
      "agent",
      "agent_financing",
      t(
        "Complete the baseline review and resubmit the quote",
        "补充基线复核并重新提交报价"
      ),
    ];
  if (
    state.valuationChecks?.[a.id]?.blocked &&
    ["offered", "accepted", "signed", "pooled"].includes(a.status)
  ) {
    if (
      state.valuationChecks?.[a.id]?.reassessmentCurrent &&
      !a.reassessment.trusteeApproved
    )
      return [
        "trustee",
        "trustee_events",
        t("Review the revised forecast basis", "复核重新估值方案"),
      ];
    if (
      state.valuationChecks?.[a.id]?.reassessmentCurrent &&
      !a.reassessment.ownerAccepted
    )
      return [
        "owner",
        "owner_agreement",
        t(
          "Compare revised value with the signed purchase price",
          "比较新版估值与原签约价，决定是否继续"
        ),
      ];
    return [
      "agent",
      "agent_financing",
      t(
        "Resolve the historical/recent baseline discrepancy",
        "核对近期与历史基线，重新估值"
      ),
    ];
  }
  if (wfExpired(a) && a.status === "offered")
    return [
      "agent",
      "agent_financing",
      t("Recalculate and submit a fresh quote", "重新估值并提交有效报价"),
    ];
  return {
    submitted: [
      "agent",
      "agent_apply_review",
      t(
        "Review ownership and collection responsibilities",
        "审核所有权、收款责任与申请材料"
      ),
    ],
    supplement: [
      "owner",
      "owner_apply",
      t(
        "Provide the requested supplementary information",
        "按审核意见补充材料"
      ),
    ],
    rejected: [
      "agent",
      "agent_apply_review",
      t(
        "Application closed; review the rejection reason",
        "申请已结束，可查看拒绝原因"
      ),
    ],
    approved: [
      "agent",
      "agent_financing",
      t(
        "Check assumptions, calculate value and prepare the offer",
        "核对假设、计算收益权价值并编制报价"
      ),
    ],
    offered: wfApproved(a)
      ? [
          "owner",
          "owner_agreement",
          t("Review and accept the approved offer", "查看并接受已批准报价"),
        ]
      : [
          "trustee",
          "trustee_events",
          t(
            "Review cashflows, data quality and purchase price",
            "审核现金流、数据质量与购买价格"
          ),
        ],
    accepted: [
      "owner",
      "owner_agreement",
      t("Record the signed revenue-right agreement", "记录已签署的收益权协议"),
    ],
    signed: [
      "agent",
      "agent_pool",
      t("Admit the signed rights to the pool", "将已签收益权纳入资产池"),
    ],
    pooled: [
      "agent",
      "agent_pool",
      Number(state.chain.phase) === 2
        ? t("Monitor collections and monthly NAV", "跟进回款与月度净值")
        : t(
            "Prepare pool valuation, obtain approval, then fundraise",
            "编制资产池估值，经受托人批准后募集"
          ),
    ],
  }[a.status];
}
const wfBadge = (a) =>
  `<span class="wf-badge ${
    a.status === "rejected" ? "red" : a.status === "pooled" ? "green" : "blue"
  }">${wfStatus(a)}</span>`;
const wfPanel = (title, body, sub = "") =>
  `<section class="wf-panel"><header><h3>${title}</h3>${
    sub ? `<p>${sub}</p>` : ""
  }</header>${body}</section>`;
const wfKv = (entries) =>
  `<dl class="wf-kv">${entries
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join("")}</dl>`;
function wfSelect(id) {
  wfSelected = id;
  sessionStorage.setItem(workflowStorageKey("revenue.application"), id);
}
function wfList(mode) {
  const items = state.applications;
  const relevant =
    page === "agent_financing"
      ? items.filter(
          (a) =>
            ["approved", "offered", "accepted"].includes(a.status) ||
            (["signed", "pooled"].includes(a.status) &&
              state.valuationChecks?.[a.id]?.blocked)
        )
      : page === "agent_pool"
      ? items.filter((a) => ["signed", "pooled"].includes(a.status))
      : items;
  const filtered = relevant.filter(
    (a) =>
      (wfFilter === "all" || a.status === wfFilter) &&
      `${stationName(a.stationId)} ${a.id} ${a.owner}`
        .toLowerCase()
        .includes(wfQuery.toLowerCase())
  );
  const pending = relevant.filter(
    (a) =>
      wfNext(a)[0] === mode &&
      a.status !== "rejected" &&
      (a.status !== "pooled" || state.valuationChecks?.[a.id]?.blocked)
  ).length;
  return `<div class="wf-workspace"><div class="wf-summary"><div><span>${t(
    "Applications in this queue",
    "当前队列申请"
  )}</span><strong>${relevant.length}</strong></div><div><span>${t(
    "Your next actions",
    "待本角色处理"
  )}</span><strong>${pending}</strong></div><div><span>${t(
    "Awaiting trustee",
    "待受托审批"
  )}</span><strong>${
    relevant.filter(
      (a) =>
        a.status === "offered" &&
        !wfApproved(a) &&
        !wfExpired(a) &&
        !wfQuoteNeedsCorrection(a)
    ).length
  }</strong></div><div><span>${t("Admitted to pool", "已入池")}</span><strong>${
    items.filter((a) => a.status === "pooled").length
  }</strong></div></div>
  ${wfPanel(
    t("Application workspace", "申请工作台"),
    `<div class="wf-list-tools"><form data-wf-search><input name="query" placeholder="${t(
      "Station, application ID or owner",
      "搜索电站、申请编号或业主"
    )}" aria-label="${t("Search applications", "搜索申请")}" value="${esc(
      wfQuery
    )}"><select name="status" aria-label="${t("Filter status", "筛选状态")}">${[
      ["all", t("All statuses", "全部状态")],
      ...Object.keys(statuses).map((k) => [k, t(...statuses[k])]),
    ]
      .map(
        ([k, v]) =>
          `<option value="${k}" ${
            wfFilter === k ? "selected" : ""
          }>${v}</option>`
      )
      .join("")}</select><button class="btn btn-outline btn-sm">${t(
      "Filter",
      "查询"
    )}</button></form></div>${
      filtered.length
        ? table(
            [
              t("Station / application", "电站 / 申请编号"),
              t("Status", "当前状态"),
              t("Progress", "流程进度"),
              t("Purchase price", "购买报价"),
              t("Next handler", "下一处理人"),
              t("Action", "操作"),
            ],
            filtered.map((a) => [
              `<b>${esc(
                stationName(a.stationId)
              )}</b><small class="wf-muted">${esc(a.id.slice(0, 12))}…</small>`,
              wfBadge(a),
              `<span class="wf-progress"><i style="width:${
                ((a.status === "pooled" && Number(state.chain.phase) === 2
                  ? 7
                  : wfStage(a)) /
                  7) *
                100
              }%"></i></span><small>${wfStage(a) + 1}/7 · ${t(
                ...wfStages[wfStage(a)]
              )}</small>`,
              a.priceUSDC6 ? `${money(a.priceUSDC6)} <small>USDC</small>` : "—",
              t(...names[wfNext(a)[0]]),
              `<button class="btn btn-outline btn-sm" data-wf-open="${esc(
                a.id
              )}">${t("Open application", "查看并处理")} →</button>`,
            ])
          )
        : `<div class="wf-empty"><h3>${t(
            "No applications in this queue",
            "当前队列暂无申请"
          )}</h3><p>${t(
            "Submitted applications appear here. You can adjust the filter or go to the previous step.",
            "申请提交后将显示在此处。可调整筛选条件或前往上一流程。"
          )}</p><button class="btn btn-outline" data-page="${
            mode === "owner" ? "owner_apply" : "agent_apply_review"
          }">${t("Go to applications", "前往申请入口")}</button></div>`
    }`,
    t(
      "One application per row. Open a record to review evidence, calculate its value and take the next action.",
      "每行一笔申请。进入详情查看材料、计算估值并完成下一步处理。"
    )
  )}</div>`;
}
function wfStepper(a) {
  const stage = wfStage(a);
  return `<ol class="wf-stepper">${wfStages
    .map(
      ([en, zh], i) =>
        `<li class="${
          i < stage ? "done" : i === stage ? "current" : ""
        }"><span>${i < stage ? "✓" : i + 1}</span><b>${t(en, zh)}</b></li>`
    )
    .join("")}</ol>`;
}
function wfRoute(a) {
  const [nextRole, nextPage, text] = wfNext(a);
  return `<div class="wf-next"><div><small>${t(
    "NEXT ACTION",
    "下一步"
  )}</small><strong>${text}</strong><p>${t("Handled by", "处理角色")}：${t(
    ...names[nextRole]
  )}${
    a.status === "pooled"
      ? t(
          " · The household is paid only after successful fundraising settlement.",
          " · 业主款项仅在募集成功结算后支付。"
        )
      : ""
  }</p></div>${
    a.status !== "rejected"
      ? `<button class="btn btn-primary" data-wf-handoff="${nextRole}" data-wf-page="${nextPage}" data-wf-id="${
          a.id
        }">${
          wfQuoteNeedsCorrection(a)
            ? t("Open quote correction", "去补充报价")
            : nextRole === role
            ? t("Continue", "继续处理")
            : t("Demo: switch to ", "演示：切换至") + t(...names[nextRole])
        } →</button>`
      : ""
  }</div>`;
}
function wfReport(report, price, currency) {
  if (!report)
    return `<div class="wf-empty"><h3>${t(
      "No valuation yet",
      "尚未生成估值"
    )}</h3><p>${t(
      "The intermediary first verifies the inputs, then calculates the 60-month cashflows below.",
      "由中介核对参数后，计算未来 60 个月现金流并生成报价。"
    )}</p></div>`;
  const gross = report.rows.reduce((n, r) => n + r.grossLocal, 0),
    costs = report.rows.reduce((n, r) => n + r.costsLocal, 0);
  const assigned = report.rows.reduce(
    (n, r) => n + Number(r.assignedUSDC6) / 1e6,
    0
  );
  return `<p class="wf-help">${t("Forecast baseline", "预测基线")}: <b>${
    report.assumptions.baselineMethod === "recent-export-ratio"
      ? t(
          "Seasonal generation × recent export ratio",
          "季节性发电量 × 近期上网比例"
        )
      : t("Historical seasonal export", "长期历史季节性上网量")
  }</b> · ${esc(
    report.modelVersion || "seasonal-revenue.2"
  )}</p><div class="wf-result-head"><span class="wf-badge ${
    report.provisional ? "amber" : "green"
  }">${
    report.provisional
      ? t("Provisional · approval required", "暂定估值 · 须明确审批")
      : t("Model estimate", "模型估值")
  }</span><span>${t("Valid until (UTC)", "有效期至 (UTC)")} ${date(
    report.validUntil
  )}</span></div><div class="wf-value-cards">${metric(
    t("Discounted rights value", "收益权折现价值"),
    money(report.rightsValueUSDC6),
    "demo USDC"
  )}${metric(
    t("Agreed purchase price", "协议购买价格"),
    money(price || report.rightsValueUSDC6),
    "demo USDC"
  )}${metric(t("Upfront deductions", "预扣费用"), "0.00", "demo USDC")}</div>
    ${cfOwnerTimeline(report, price, currency)}
    ${wfEnergyRules(report)}
    <div class="wf-calculation"><div><span>01</span><b>${t(
      "Forecast project receipts",
      report.assumptions.revenueModel === "household-export" ? "预测项目收入（业主电费＋售电）" : "预测售电收入（旧协议）"
    )}</b><strong>${dsCash(gross)} <small>${esc(
    currency
  )}</small></strong><small>${t(
    "Local currency · total forecast term",
    "电站本币 · 预测期合计"
  )}</small></div><div><span>02</span><b>${t(
    "Deduct assigned costs",
    "扣除约定费用"
  )}</b><strong>${dsCash(costs)} <small>${esc(
    currency
  )}</small></strong><small>${t(
    "Revenue-paid costs only",
    "仅收益承担的费用"
  )}</small></div><div><span>03</span><b>${t(
    "Assign share & convert FX",
    "分配收益权并换汇"
  )}</b><strong>${dsCash(assigned)}</strong><small>USDC · ${t(
    "before discounting",
    "折现前"
  )}</small></div><div><span>04</span><b>${t(
    "Discount to present value",
    "折现至当前价值"
  )}</b><strong>${money(report.rightsValueUSDC6)}</strong><small>USDC · ${
    report.assumptions.discountBps / 100
  }% ${t("annual rate", "年折现率")}</small></div></div>
    <p class="wf-help">${t(
      "Each month: max(0, household payment + export revenue − deductible costs) × assigned share × FX; discount each expected receipt to the valuation date. Equipment residual value is excluded. Pool fees and investor cash reserves are modeled separately.",
      "逐月计算：max(0，业主电费＋售电收入 − 可扣费用) × 收益权比例 × 汇率，再按预计收款时间折现。设备残值不计入，资产池费用及投资者现金储备另行计算。"
    )}</p>
    <div class="wf-two">${table(
      [
        t("Discount rate", "年折现率"),
        t("Rights value · USDC", "收益权价值 · USDC"),
      ],
      report.sensitivities.map((v) => [
        v.discountBps / 100 + "%",
        money(v.valueUSDC6),
      ])
    )}${table(
    [t("Scenario", "情景"), t("Rights value · USDC", "收益权价值 · USDC")],
    report.scenarios.map((v) => [
      {
        base: t("Base", "基准"),
        downside: t("Downside", "下行"),
        upside: t("Upside", "上行"),
      }[v.name],
      money(v.valueUSDC6),
    ])
  )}</div>
    <p class="wf-help">${t(
      "Scenarios scale the assigned cashflows to 80%, 100% and 110%; they are not calibrated probabilities.",
      "情景分别按分配现金流的 80%、100%、110% 测算，不代表经校准的发生概率。"
    )}</p>
    ${
      report.warnings?.length
        ? `<details class="wf-disclosure" ${
            report.provisional ? "open" : ""
          }><summary>${t(
            "Data quality & assumptions",
            "数据质量与假设提示"
          )}</summary><ul>${report.warnings
            .map((w) => `<li>${esc(wfWarningText(w))}</li>`)
            .join("")}</ul></details>`
        : ""
    }
    <details class="wf-disclosure"><summary>${t(
      "Monthly cashflow calculation · 60 months",
      "查看逐月现金流计算 · 60 个月"
    )}</summary><p class="wf-help">${t(
    "Energy is forecast for each service period; the receipt date includes the configured payment delay. Open Calculation details to inspect that period's historical samples and factors. Display values are rounded; calculations use full precision.",
    "电量对应每一期服务期间；预计收款日另含设定的回款延迟。展开各期「计算明细」可核对历史样本与调整系数。显示值经过四舍五入，计算使用未舍入数据。"
  )}</p>${table(
    [
      t("Period", "期数"),
      t("Energy service period (UTC)", "电量预测期间 (UTC)"),
      t("Export kWh", "上网电量 kWh"),
      t("Calculation basis", "电量计算依据"),
      t("Self-use kWh", "计费自用量 kWh"),
      t("Household payment", "业主电费"),
      t("Export revenue", "售电收入"),
      t("Gross receipts", "项目总收入"),
      t("Costs", "可扣费用"),
      t("Assigned USDC", "分配现金流 USDC"),
      t("Receipt date (UTC)", "预计收款日 (UTC)"),
    ],
    report.rows.map((r) => [
      r.month,
      r.calculation
        ? `${wfEnergyDate(r.calculation.serviceStart)} → ${wfEnergyDate(
            r.calculation.serviceEnd
          )}`
        : "—",
      dsNum(r.exportKWh, 2),
      wfEnergyRow(report, r),
      dsNum(r.billing?.selfUseKWh),
      dsCash(r.billing?.householdPaymentLocal),
      dsCash(r.billing?.exportRevenueLocal ?? r.grossLocal),
      dsCash(r.grossLocal),
      dsCash(r.costsLocal),
      money(r.assignedUSDC6),
      date(r.dueAt),
    ])
  )}</details>
    <details class="wf-disclosure"><summary>${t(
      "Valuation evidence",
      "估值凭证"
    )}</summary>${wfKv([
    [t("Source hash", "数据证据哈希"), esc(report.sourceHash)],
    [t("Report hash", "估值报告哈希"), esc(report.reportHash)],
    [
      t("Model version", "模型版本"),
      esc(report.modelVersion || report.version),
    ],
  ])}</details>`;
}
const wfEnergyDate = (seconds) =>
  new Date(seconds * 1000).toISOString().slice(0, 10);
function wfEnergyFormula(report, row) {
  const c = row.calculation,
    a = report.assumptions;
  if (!c) return "";
  const recent = a.baselineMethod === "recent-export-ratio";
  const expression = `${dsNum(recent ? c.meanGenerationKWh : c.meanExportKWh, 2)}${
    recent ? ` × ${dsNum(c.exportRatio * 100, 2)}%` : ""
  } × ${dsNum(c.availabilityFactor * 100, 2)}% × (1 − ${dsNum(
    a.degradationPct,
    2
  )}%)<sup>${row.month - 1}/12</sup> × ${dsNum(
    c.remainingFraction * 100,
    2
  )}%`;
  return `${expression} ≈ <strong>${dsNum(row.exportKWh, 2)} kWh</strong>`;
}
function wfEnergySamples(report, row) {
  const c = row.calculation,
    recent = report.assumptions.baselineMethod === "recent-export-ratio";
  return `<ul class="wf-energy-samples">${(report.energyEvidence?.history || [])
    .filter((h) => c.sampleMonths.includes(h.month))
    .map(
      (h) =>
        `<li><span>${esc(h.month)}</span><b>${dsNum(
          recent
            ? h.generationKWh
            : h.exportKWh ??
                h.generationKWh * report.assumptions.assumedExportRatio,
          2
        )} kWh</b>${
          !recent && c.excludedExportMonths?.includes(h.month)
            ? `<small>${t("Excluded from export allocation · exports exceed generation", "不参与上网分配 · 上网量超过发电量")}</small>`
            : !recent && h.exportKWh === null
            ? `<small>${t(
                "Missing export · generation × assumed ratio",
                "上网量缺测 · 发电量 × 假设比例"
              )}</small>`
            : ""
        }</li>`
    )
    .join("")}</ul>`;
}
function wfEnergyRow(report, row) {
  const c = row.calculation;
  if (!c || !report.energyEvidence)
    return `<span class="wf-muted">${t(
      "Not recorded in this report",
      "本报告未记录逐期凭证"
    )}</span>`;
  return `<details class="wf-energy-row"><summary>${t(
    "Calculation details",
    "计算明细"
  )}</summary><div><p>${
    c.seasonalFallback
      ? t(
          "No same-month history: use the average of all available complete months.",
          "缺少同月历史：使用全部可用完整月份均值。"
        )
      : t("Historical samples for calendar month", "历史样本对应月份") +
        `: ${c.seasonMonth}`
  }</p>${c.excludedExportMonths?.length ? `<p>${t("Export samples excluded because exports exceed generation", "以下月份上网量超过发电量，不参与上网比例计算")}: ${esc(c.excludedExportMonths.join(", "))}</p>` : ""}${c.assumedExportFallback ? `<p>${t("No comparable export samples; use the explicitly reviewed assumed export ratio", "没有合格上网样本，使用审核后的演示假设上网比例")}: ${dsNum(report.assumptions.assumedExportRatio * 100,2)}%</p>` : ""}${wfEnergySamples(
    report,
    row
  )}<p class="wf-energy-equation">${wfEnergyFormula(report, row)}</p><p>${t(
    "Forecast generation",
    "预测发电量"
  )}: ${dsNum(row.generationKWh, 2)} kWh · ${t(
    "Degradation factor",
    "衰减系数"
  )}: ${dsNum(c.degradationFactor, 6)} · ${t(
    "Remaining-period fraction",
    "剩余期间比例"
  )}: ${dsNum(c.remainingFraction * 100, 2)}%</p></div></details>`;
}
function wfEnergyRules(report) {
  const a = report.assumptions,
    b = report.baseline,
    e = report.energyEvidence;
  const recent = a.baselineMethod === "recent-export-ratio";
  const formula = recent
    ? t(
        "Forecast export = historical same-month mean generation × recent export ratio × availability × degradation factor × remaining-period fraction",
        "每期预测上网量 = 历史同月平均发电量 × 近期上网比例 × 可用率 × 衰减系数 × 剩余期间比例"
      )
    : t(
        "Forecast export = historical same-month mean generation × comparable export-to-generation ratio × availability × degradation factor × remaining-period fraction",
        "每期预测上网量 = 历史同月平均发电量 × 合格样本上网比例 × 可用率 × 衰减系数 × 剩余期间比例"
      );
  if (!e)
    return `<section class="wf-energy-rules"><h3>${t(
      "How energy is forecast",
      "电量预测计算依据"
    )}</h3><p>${formula}</p><p class="wf-help">${t(
      "This archived report does not include a calculation-evidence snapshot. Recalculate a preview to see the historical samples and per-period details; the recorded quote is preserved.",
      "此份历史报告未保存逐期计算凭证。重新试算可查看历史样本及逐期明细，已记录报价保持不变。"
    )}</p></section>`;
  const first = report.rows.find((r) => r.calculation);
  return `<section class="wf-energy-rules" aria-label="${t(
    "Energy forecast methodology",
    "电量预测计算规则"
  )}"><div class="wf-energy-heading"><div><h3>${t(
    "How energy is forecast",
    "电量预测计算依据"
  )}</h3><p>${t(
    "Calculated from this report's saved evidence and assumptions",
    "按本份报告保存的数据证据和假设计算"
  )}</p></div><span class="wf-badge blue">${t(
    "Model forecast",
    "模型预测"
  )}</span></div>
    ${b?.energyInconsistent ? `<p class="wf-help">${t("Recent exports exceed generation, so the recent solar allocation is unavailable. This report uses a reviewed historical seasonal estimate, not verified future self-use.", "近期上网量超过发电量，近期光伏分配比例不可用。本报告采用经审核的历史季节性暂定估算，不能理解为已核实的未来自用电量。")}</p>` : ""}
    <div class="wf-energy-steps"><div><span>01</span><h4>${t(
      "Historical seasonal baseline",
      "历史季节性基线"
    )}</h4><p>${esc(b?.historyStart || e.history[0]?.month || "—")} → ${esc(
    b?.historyEnd || e.history.at(-1)?.month || "—"
  )} · ${e.history.length} ${t("complete months", "个完整月")}</p><p>${t(
    "Average all observed years for the matching calendar month, using up to 36 complete months. Missing calendar months fall back to the full sample average.",
    "最多取36个完整月，对历年相同月份求平均，保留季节差异；缺少同月样本时，回退到全部样本均值。"
  )}</p></div>
    <div><span>02</span><h4>${
      recent
        ? t("Recent export behavior", "近期上网行为")
        : t("Historical export observations", "历史上网观测")
    }</h4><p>${
    recent
      ? `${esc(b?.recentStart || "—")} → ${esc(b?.recentEnd || "—")} · ${
          b?.completeDays ?? 0
        } ${t("complete days", "个完整日")}`
      : t(
          "Use comparable exports from matching historical months; inconsistent samples are excluded and any assumed-ratio fallback is disclosed.",
          "使用历史同月的合格上网样本。超过发电量的上网样本不参与分配；无有效样本时明确使用演示假设比例。"
        )
  }</p><p>${
    recent
      ? `${dsNum(b?.recentExportKWh, 2)} ÷ ${dsNum(
          b?.recentGenerationKWh,
          2
        )} = ${dsNum(b?.observedExportRatio * 100, 2)}% → ${t(
          "modeled",
          "建模取值"
        )} ${dsNum(b?.solarExportRatio * 100, 2)}%`
      : t(
          "Where export is missing, generation is multiplied by the disclosed assumed export ratio:",
          "上网量缺测时，按发电量乘以已披露的假设上网比例补估："
        ) + ` ${dsNum(a.assumedExportRatio * 100, 2)}%`
  }</p><p>${
    recent
      ? t(
          "Up to 30 days, at least 7 complete days; capture day excluded. Exports above generation invalidate the recent ratio; comparable historical samples require separate review.",
          "取采集日前最多30天、至少7个完整日，排除采集当天。上网量超过发电量时，近期比例不可用，须核对口径或审核历史估算。"
        )
      : t(
          "Imputed months are labeled in each period's calculation details; missing export is not treated as zero.",
          "补估月份在各期计算明细中单独标注，缺测上网量不按零值处理。"
        )
  }</p></div>
    <div><span>03</span><h4>${t(
      "Operating adjustments",
      "运行修正假设"
    )}</h4><p>${t("Availability", "可用率")}: <b>${dsNum(
    a.availabilityPct,
    2
  )}%</b> · ${t("Annual degradation", "年衰减率")}: <b>${dsNum(
    a.degradationPct,
    2
  )}%</b></p><p>${t(
    "In period n, degradation factor = (1 − annual degradation) ^ ((n − 1) / 12).",
    "第n期衰减系数 = (1 − 年衰减率)^((n − 1) / 12)。"
  )}</p><p>${t(
    "The remaining-period fraction is 100% initially; later valuations prorate an ongoing period by time remaining and exclude completed periods.",
    "首次估值的剩余期间比例为100%；存续期估值对当期按剩余时长折算，已结束期间不再计入未来收益权。"
  )}</p></div></div>
    <div class="wf-energy-equation">${formula}</div>
    ${
      first
        ? `<details class="wf-energy-example" open><summary>${t(
            "Worked example · period",
            "计算示例 · 第"
          )} ${first.month}${t("", "期")}</summary><p>${t(
            "Energy service period (UTC)",
            "电量预测期间 (UTC)"
          )}: ${wfEnergyDate(first.calculation.serviceStart)} → ${wfEnergyDate(
            first.calculation.serviceEnd
          )} · ${t("Receipt date (UTC)", "预计收款日 (UTC)")}: ${wfEnergyDate(
            first.dueAt
          )}</p><p>${
            first.calculation.seasonalFallback
              ? t(
                  "All-history average (same-month samples unavailable)",
                  "全部历史均值（缺少同月样本）"
                )
              : t("Same-month samples", "同月历史样本")
          }: ${
            recent ? t("generation", "发电量") : t("export", "上网量")
          }</p>${first.calculation.excludedExportMonths?.length ? `<p>${t("Export samples excluded because exports exceed generation", "以下月份上网量超过发电量，不参与上网比例计算")}: ${esc(first.calculation.excludedExportMonths.join(", "))}</p>` : ""}${first.calculation.assumedExportFallback ? `<p>${t("No comparable export samples; use the explicitly reviewed assumed export ratio", "没有合格上网样本，使用审核后的演示假设上网比例")}: ${dsNum(report.assumptions.assumedExportRatio * 100,2)}%</p>` : ""}${wfEnergySamples(report, first)}<p>${t(
            "Sample mean",
            "样本均值"
          )}: <b>${dsNum(
            recent
              ? first.calculation.meanGenerationKWh
              : first.calculation.meanExportKWh,
            2
          )} kWh</b></p><div class="wf-energy-equation">${wfEnergyFormula(
            report,
            first
          )}</div></details>`
        : `<p>${t(
            "No remaining forecast periods; rights have expired.",
            "已无剩余预测期间，收益权已到期。"
          )}</p>`
    }
    <p class="wf-energy-footnote">${t(
      "Forecasts are model outputs, not future readings supplied by the API. Availability and degradation are configurable assumptions. No weather, irradiance or future household-demand forecast is included. The model selects seasonality using each period's starting UTC month; periods crossing calendar months are not split by day. The assigned rights percentage affects cash allocation, not electricity output. Displayed numbers are rounded; calculation uses full precision.",
      "预测值由模型生成，并非API提供的未来读数。可用率与衰减率为可配置假设，尚未纳入天气、辐照度及未来自用需求预测。模型按每期起始时间的UTC月份选择季节样本，跨月期间尚未逐日拆分。收益权比例只影响现金分配，不改变物理电量。显示数字经过四舍五入，实际计算使用未舍入数据。"
    )}</p>
    <p class="wf-energy-source">${t(
      "Evidence source",
      "证据来源"
    )}: ${sourceLabel(e.source)} · ${t(
    "Captured at (UTC)",
    "采集时间 (UTC)"
  )}: ${date(e.observedAt)} · ${t("Station timezone", "电站时区")}: ${esc(
    e.timezone
  )}</p></section>`;
}
const wfNumber = (name, label, value, min = 0, max = "", step = "any") =>
  `<label>${label}<input type="number" name="${name}" value="${esc(
    value
  )}" required min="${min}" ${
    max !== "" ? `max="${max}"` : ""
  } step="${step}"></label>`;
function wfAssumptionFields(a) {
  const v = wfDrafts.get(a.id)?.assumptions || a.assumptions;
  const s = state.stations.find((s) => s.id === a.stationId),
    cur = esc(s.currency);
  return `${v.revenueModel !== "household-export" ? `<div class="cf-legacy">${t("This is an export-only offer. Switch to the new model explicitly before recalculating an unsigned offer.", "当前为旧版仅售电收入报价。未签约报价可明确切换新模型，再重新试算和审批。")} <button type="button" class="btn btn-outline btn-sm" data-wf-upgrade-model="${a.id}">${t("Use household + export model", "改用业主电费＋售电模型")}</button></div>` : `<p class="wf-help">${t("Combined cashflow: household electricity payment plus eligible exports. Billing discount and assigned revenue share are separate terms.", "合计现金流包括业主电费与合格售电收入。电费折扣与收益权归集比例是两个独立条款。")}</p>`}<div class="wf-section-label">${t(
    "Revenue and rights",
    "收入与收益权"
  )}</div><div class="wf-fields">${wfNumber(
    "wf_tariffLocal",
    t("Export tariff", "上网电价") + ` (${cur}/kWh)`,
    v.tariffLocal
  )}${v.revenueModel === "household-export" ? wfNumber("wf_gridTariffLocal", t("Grid purchase tariff", "电网购电价") + ` (${cur}/kWh)`, v.gridTariffLocal, 0.000001) + wfNumber("wf_householdPaymentPct", t("Household pays % of grid price", "业主支付电网价的百分比 (%)"), (v.householdPaymentBps ?? 8000) / 100, 0.01, 99.99) + wfNumber("wf_selfUseDeliveryPct", t("Residual solar delivery factor (%)", "非上网光伏交付系数 (%)"), v.selfUseDeliveryPct ?? 90, 0, 100) : ""}${wfNumber(
    "wf_share",
    t("Assigned share (%)", "出售收益权比例 (%)"),
    v.shareBps / 100,
    0.01,
    100
  )}${wfNumber(
    "wf_discount",
    t("Annual discount rate (%)", "年折现率 (%)"),
    v.discountBps / 100,
    0,
    100
  )}${wfNumber("wf_fxUSDC", `USDC / ${cur}`, v.fxUSDC, 0.000001)}<label>${t(
    "Rights term",
    "收益权期限"
  )}<input value="${t(
    "60 months from settlement",
    "结算起 60 个月"
  )}" disabled></label>${wfNumber(
    "wf_paymentDelayMonths",
    t("Receipt delay (months)", "收款延迟（月）"),
    v.paymentDelayMonths,
    0,
    12,
    1
  )}</div>
    <p class="wf-help">${t(
      "These are valuation inputs and must be verified by the intermediary. The dashboard’s exploratory tariff does not override this agreement.",
      "此处为正式报价输入，须由中介核实；电站看板的探索性电价不会覆盖协议参数。"
    )}</p>
    ${
      dsTariff(s).rate !== null
        ? `<button type="button" class="wf-link" data-wf-use-tariff="${
            a.id
          }">${t(
            "Copy dashboard scenario tariff",
            "引用看板情景电价"
          )} (${dsNum(dsTariff(s).rate, 4)} ${cur}/kWh) →</button>`
        : ""
    }
    <details class="wf-disclosure"><summary>${t(
      "Operating assumptions & tariff schedule",
      "运行假设与电价计划"
    )}</summary><div class="wf-fields">${wfNumber(
    "wf_degradationPct",
    t("Annual degradation (%)", "年衰减率 (%)"),
    v.degradationPct,
    0,
    10
  )}${wfNumber(
    "wf_availabilityPct",
    t("Availability (%)", "可用率 (%)"),
    v.availabilityPct,
    0,
    100
  )}${wfNumber(
    "wf_inflationPct",
    t("Cost inflation (%)", "费用年增长 (%)"),
    v.inflationPct,
    -20,
    30
  )}${wfNumber(
    "wf_tariffEscalationPct",
    t("Tariff annual growth (%)", "电价年增长 (%)"),
    v.tariffEscalationPct,
    -50,
    50
  )}${wfNumber(
    "wf_exportRatio",
    t("Fallback export ratio (%)", "缺测时假设上网比例 (%)"),
    v.assumedExportRatio * 100,
    0,
    100
  )}</div><label class="wf-wide">${t(
    "Optional monthly tariff schedule: 60 comma-separated rates; blank uses the tariff above",
    "可选月度电价计划：60 个逗号分隔的价格；留空使用上方电价"
  )}<textarea name="wf_schedule">${esc(
    v.tariffSchedule.join(", ")
  )}</textarea></label>${v.revenueModel === "household-export" ? `<div class="wf-fields">${wfNumber("wf_gridTariffEscalationPct", t("Grid purchase tariff annual growth (%)", "电网购电价年增长 (%)"), v.gridTariffEscalationPct ?? 0, -50, 50)}</div><label class="wf-wide">${t("Monthly grid-purchase rates; 60 comma-separated positive values, or leave blank", "月度购电价计划：60个逗号分隔的正数，可留空")}<textarea name="wf_gridSchedule">${esc((v.gridTariffSchedule || []).join(", "))}</textarea></label><p class="wf-help">${t("Self-use = max(0, generation − eligible exports) × delivery factor. The default 90% factor is a demo assumption for losses/storage changes, not an API measurement. Grid price means the variable energy charge only. Review the seasonal proxy before approval.", "自用量 = max(0，发电量－合格上网量) × 交付系数。默认90%为损耗及储能变化的演示假设，不是API计量值。购电价仅指电量电价，不含固定或需量收费，审批前须核实该季节性估算。")}</p>` : ""}</details>
    <div class="wf-section-label">${t(
      "Deductible expense schedule",
      "可扣费用计划"
    )}</div><div class="wf-costs">${v.costs
    .map(
      (c, i) =>
        `<div class="wf-cost-row"><label>${t(
          "Cost",
          "费用名称"
        )}<input name="wf_cost_${i}_label" value="${esc(
          c.label
        )}" required></label><label>${t(
          "Paid by",
          "承担方"
        )}<select name="wf_cost_${i}_payer">${[
          ["revenue", t("Revenue", "收益承担")],
          ["household", t("Household", "业主自付")],
          ["third-party", t("Third party", "第三方承担")],
        ]
          .map(
            ([k, l]) =>
              `<option value="${k}" ${
                c.payer === k ? "selected" : ""
              }>${l}</option>`
          )
          .join("")}</select></label>${wfNumber(
          `wf_cost_${i}_annualLocal`,
          t("Amount", "金额") + ` (${cur})`,
          c.annualLocal
        )}<label>${t(
          "Timing",
          "计费安排"
        )}<select name="wf_cost_${i}_timing"><option value="annual" ${
          !c.replacementMonth ? "selected" : ""
        }>${t(
          "Annual, spread monthly",
          "每年，逐月分摊"
        )}</option><option value="once" ${
          c.replacementMonth ? "selected" : ""
        }>${t(
          "One-off replacement",
          "单次更换"
        )}</option></select></label>${wfNumber(
          `wf_cost_${i}_month`,
          t("One-off month", "单次发生月份"),
          c.replacementMonth || 1,
          1,
          60,
          1
        )}<label>${t(
          "Basis / evidence",
          "依据 / 凭证说明"
        )}<input name="wf_cost_${i}_evidence" value="${esc(
          c.evidence
        )}" required></label><button type="button" class="wf-link" data-wf-remove-cost="${i}" data-wf-id="${
          a.id
        }">${t("Remove", "移除")}</button></div>`
    )
    .join("")}</div><button type="button" class="wf-link" data-wf-add-cost="${
    a.id
  }">＋ ${t("Add expense", "添加费用")}</button><p class="wf-help">${t(
    "Only revenue-paid expenses are deducted; do not add household expenses or pool fees a second time.",
    "仅扣除「收益承担」的费用，业主自付费用及资产池费用不重复扣除。"
  )}</p>`;
}
function wfEditor(a) {
  const draft = wfDrafts.get(a.id);
  return wfPanel(
    t("Valuation inputs", "估值参数"),
    `<form data-action="offer" data-wf-editor="${a.id}" data-payload="${esc(
      JSON.stringify({ applicationId: a.id })
    )}">${wfBaselineFields(a)}${wfAssumptionFields(
      a
    )}<div class="wf-section-label">${t(
      "Offer to the household",
      "向业主报价"
    )}</div><div class="wf-fields">${input(
      "priceUSDC6",
      t(
        "Agreed price · USDC (blank = model value)",
        "协议报价 · USDC（留空采用模型估值）"
      ),
      draft?.priceUSDC6 || ""
    )}</div><p class="wf-help">${t(
      "Calculate first to inspect the result. Submitting prepares a quote for the trustee; no household payment occurs here.",
      "可先试算检查结果。提交后进入受托人审批，此步骤不向业主付款。"
    )}</p><div class="wf-actions"><button type="submit" class="btn btn-outline" data-wf-preview>${t(
      "Calculate preview",
      "试算收益权价值"
    )}</button><button type="submit" class="btn btn-primary">${t(
      "Generate offer & submit for approval",
      "生成报价并提交审批"
    )}</button></div></form>`
  );
}
function wfReadDraft(f, a) {
  const values = new FormData(f),
    base = wfDrafts.get(a.id)?.assumptions || a.assumptions;
  const v = structuredClone(base);
  v.baselineMethod = String(values.get("wf_baselineMethod") || "historical");
  v.baselineReviewNote = String(values.get("wf_baselineReviewNote") || "");
  v.baselineReviewSourceHash = values.has("wf_baselineReviewed")
    ? state.stations.find((s) => s.id === a.stationId).sourceHash
    : "";
  if (f.dataset.action === "prepare-reassessment")
    return {
      assumptions: {
        ...a.assumptions,
        baselineMethod: v.baselineMethod,
        baselineReviewNote: v.baselineReviewNote,
        baselineReviewSourceHash: v.baselineReviewSourceHash,
      },
    };
  for (const key of [
    "tariffLocal",
    "fxUSDC",
    "paymentDelayMonths",
    "degradationPct",
    "availabilityPct",
    "inflationPct",
    "tariffEscalationPct",
  ])
    v[key] = Number(values.get("wf_" + key));
  if (v.revenueModel === "household-export") {
    v.gridTariffLocal = Number(values.get("wf_gridTariffLocal"));
    v.gridTariffEscalationPct = Number(values.get("wf_gridTariffEscalationPct"));
    v.householdPaymentBps = Math.round(Number(values.get("wf_householdPaymentPct")) * 100);
    v.selfUseDeliveryPct = Number(values.get("wf_selfUseDeliveryPct"));
    const gridSchedule = String(values.get("wf_gridSchedule") || "").trim();
    v.gridTariffSchedule = gridSchedule ? gridSchedule.split(/[,，\s]+/).map(Number) : [];
  }
  v.shareBps = Math.round(Number(values.get("wf_share")) * 100);
  v.discountBps = Math.round(Number(values.get("wf_discount")) * 100);
  v.assumedExportRatio = Number(values.get("wf_exportRatio")) / 100;
  const schedule = String(values.get("wf_schedule") || "").trim();
  v.tariffSchedule = schedule ? schedule.split(/[,，\s]+/).map(Number) : [];
  v.costs = base.costs.map((c, i) => ({
    ...c,
    label: String(values.get(`wf_cost_${i}_label`)),
    payer: String(values.get(`wf_cost_${i}_payer`)),
    annualLocal: Number(values.get(`wf_cost_${i}_annualLocal`)),
    evidence: String(values.get(`wf_cost_${i}_evidence`)),
    replacementMonth:
      values.get(`wf_cost_${i}_timing`) === "once"
        ? Number(values.get(`wf_cost_${i}_month`))
        : undefined,
  }));
  const raw = String(values.get("priceUSDC6") || "").trim();
  return { assumptions: v, ...(raw ? { priceUSDC6: toUnits(raw) } : {}) };
}
function wfDetail(a, mode) {
  const s = state.stations.find((s) => s.id === a.stationId),
    editable =
      mode === "agent" &&
      page === "agent_financing" &&
      (a.status === "approved" ||
        (a.status === "offered" &&
          (wfEditing.has(a.id) || wfQuoteNeedsCorrection(a))));
  const report = wfPreviews.get(a.id) || a.reassessment?.report || a.offer;
  let action = "";
  if (mode === "agent" && a.status === "submitted")
    action = form(
      "review",
      t("Save assessment & continue", "保存审核并继续"),
      select("decision", t("Assessment decision", "审核结论"), [
        ["approved", t("Approve → valuation", "通过 → 进入估值报价")],
        ["supplement", t("Request documents", "要求业主补充")],
        ["rejected", t("Reject application", "拒绝申请")],
      ]) + note("notes", t("Review notes / reason", "审核意见 / 原因")),
      { applicationId: a.id }
    );
  if (mode === "owner" && a.status === "supplement")
    action = form(
      "supplement",
      t("Submit supplementary information", "提交补充材料"),
      note("notes", t("Supplement", "补充说明")),
      { applicationId: a.id }
    );
  if (
    mode === "trustee" &&
    a.status === "offered" &&
    !wfExpired(a) &&
    !wfApproved(a)
  )
    action = form(
      "approve-offer",
      t("Approve offer → owner confirmation", "批准报价 → 交业主确认"),
      approvalCheck(),
      { applicationId: a.id }
    );
  if (
    mode === "owner" &&
    a.status === "offered" &&
    wfApproved(a) &&
    !wfExpired(a)
  )
    action = button(
      "accept",
      t("Accept the approved purchase price", "接受已批准购买报价"),
      { applicationId: a.id }
    );
  if (mode === "owner" && a.status === "accepted")
    action =
      `<p class="wf-help">${t(
        "Review the frozen economic terms, then sign the agreement record with the connected owner wallet. The signature and agreement hash are retained as demo evidence.",
        "请核对已冻结的经济条款，再由已连接的业主钱包签署协议记录。签名与协议哈希将作为演示凭证保存。"
      )}</p>` +
      button("sign", t("Sign agreement with wallet", "使用钱包签署协议"), {
        applicationId: a.id,
      });
  if (
    mode === "agent" &&
    a.status === "signed" &&
    !a.chainAdmission?.minted
  )
    action = button("mint-station", t("Mint station credential", "铸造电站凭证"), {
      applicationId: a.id,
    });
  if (
    mode === "owner" &&
    a.status === "signed" &&
    a.chainAdmission?.minted &&
    !a.chainAdmission?.approvedToVault
  )
    action = button(
      "custody-consent",
      t("Authorize custody of the station credential", "授权电站凭证托管"),
      { applicationId: a.id }
    );
  if (
    mode === "agent" &&
    a.status === "signed" &&
    a.chainAdmission?.minted &&
    a.chainAdmission?.approvedToVault &&
    !a.chainAdmission?.admitted
  )
    action = button("admit", t("Admit revenue rights to pool", "将收益权纳入资产池"), {
      applicationId: a.id,
    });
  if (
    state.valuationChecks?.[a.id]?.blocked &&
    ["offered", "accepted", "signed", "pooled"].includes(a.status)
  )
    action = "";
  if (mode === "owner" && a.chainAdmission?.admitted && [3, 4].includes(Number(state.chain.phase))) {
    action = a.chainAdmission.released
      ? `<p class="wf-help">${t("Custody ended. The station credential has returned to the owner wallet.", "托管已结束，电站凭证已返还业主钱包。")} <code>${esc(a.chainAdmission.currentOwner)}</code></p>`
      : `<p class="wf-help">${t("The product has closed or fundraising failed. The owner may now release the station credential from custody. Equipment ownership remains unchanged.", "产品已关闭或募集失败。业主现在可以将电站凭证从资产池取回，设备所有权始终属于业主。")}</p>` + button("release-station", t("Return station credential to owner", "将电站凭证返还业主"), {index: a.chainAdmission.rightIndex});
  }
  const events = state.operations.filter(
    (o) =>
      o.status === "confirmed" &&
      (o.body?.applicationId === a.id ||
        (o.action === "apply" && o.body?.stationId === a.stationId))
  );
  const labels = {
    apply: t("Application submitted", "业主提交申请"),
    review: t("Assessment recorded", "中介记录审核"),
    supplement: t("Supplement submitted", "业主补充材料"),
    offer: t("Offer prepared", "中介编制报价"),
    "approve-offer": t("Offer approved", "受托人批准报价"),
    accept: t("Offer accepted", "业主接受报价"),
    sign: t("Agreement recorded", "业主记录协议"),
    "mint-station": t("Station credential minted", "电站凭证已铸造"),
    "custody-consent": t("Owner authorized custody", "业主已授权托管"),
    admit: t("Rights admitted", "中介执行入池"),
  };
  return `<div class="wf-workspace"><button class="wf-back" data-wf-back>← ${t(
    "Back to queue",
    "返回申请列表"
  )}</button><div class="wf-detail-title"><div><small>${t(
    "APPLICATION",
    "申请编号"
  )} ${esc(a.id.slice(0, 14))}…</small><h2>${esc(s.name)}</h2></div>${wfBadge(
    a
  )}</div>${wfStepper(a)}${wfRoute(a)}${
    mode === "agent" && a.status === "offered" && !editable
      ? `<button class="wf-link" data-wf-edit="${a.id}">${t(
          "Revise valuation / purchase price",
          "调整估值参数或购买报价"
        )} →</button>`
      : ""
  }
    ${wfBaselineComparison(a)}${wfReassessment(a, mode)}
    <div class="wf-two wf-info">${wfPanel(
      t("Station & evidence", "电站与数据证据"),
      wfKv([
        [t("Station ID", "电站编号"), esc(s.sourceId)],
        [t("Capacity", "装机容量"), dsNum(s.capacityKW) + " kWp"],
        [
          t("History", "历史数据"),
          `${s.history.filter((h) => h.complete).length} / ${
            s.history.length
          } ${t("complete / recorded months", "完整 / 已记录月份")}`,
        ],
        [t("Source", "数据来源"), sourceLabel(s.source)],
        [t("Captured at", "采集时间"), esc(dsLocal(s.observedAt, s))],
      ]) +
        `<button class="wf-link" data-wf-station="${s.id}">${t(
          "Inspect station dashboard",
          "查看电站运行看板"
        )} →</button>`
    )}${wfPanel(
    t("Application information", "申请信息"),
    wfKv([
      [t("Owner wallet", "业主钱包"), esc(a.owner)],
      [
        t("Equipment title", "设备所有权"),
        t("Retained by owner", "始终归业主"),
      ],
      [
        t("Collection responsibility", "收款责任"),
        t("Owner remits assigned eligible cash", "业主归集并划转约定收益"),
      ],
      [t("Latest notes", "最新说明"), esc(a.notes) || "—"],
    ])
  )}</div>
    ${
      action
        ? wfPanel(
            t("Process this application", "处理本申请"),
            `<div class="wf-action-body">${action}</div>`
          )
        : ""
    }
    ${editable ? wfEditor(a) : ""}
    <div class="wf-report-section">${wfPanel(
      wfPreviews.has(a.id)
        ? t("Calculation preview · not submitted", "试算结果 · 尚未提交")
        : a.reassessment
        ? t(
            "Reassessment result · original price preserved",
            "重新估值结果 · 原签约价保留"
          )
        : t("Offer valuation", "报价与估值结果"),
      wfReport(
        report,
        wfPreviews.has(a.id) && !["signed", "pooled"].includes(a.status)
          ? wfDrafts.get(a.id)?.priceUSDC6
          : a.priceUSDC6,
        s.currency
      )
    )}</div>
    ${
      !editable && a.offer
        ? wfPanel(
            t("Recorded valuation assumptions", "报价参数记录"),
            wfKv([
              [t("Revenue model", "收入模型"), a.assumptions.revenueModel === "household-export" ? t("Household payments + exports", "业主电费＋售电收入") : t("Export-only · legacy", "仅售电收入 · 旧协议")],
              ...(a.assumptions.revenueModel === "household-export" ? [
                [t("Grid purchase tariff", "电网购电价"), `${a.assumptions.gridTariffLocal} ${esc(s.currency)}/kWh`],
                [t("Household payment / delivery factor", "业主支付比例 / 光伏交付系数"), `${a.assumptions.householdPaymentBps / 100}% / ${a.assumptions.selfUseDeliveryPct}%`],
              ] : []),
              [
                t("Tariff", "上网电价"),
                `${a.assumptions.tariffLocal} ${esc(s.currency)}/kWh`,
              ],
              [
                t("Share / term", "比例 / 期限"),
                `${a.assumptions.shareBps / 100}% / 60 ${t("months", "个月")}`,
              ],
              [
                t("Discount / FX", "折现率 / 汇率"),
                `${a.assumptions.discountBps / 100}% / ${
                  a.assumptions.fxUSDC
                } USDC/${esc(s.currency)}`,
              ],
              [
                t("Fee schedule", "可扣费用计划"),
                a.assumptions.costs
                  .map(
                    (c) =>
                      `${esc(c.label)}: ${c.annualLocal} ${esc(s.currency)} · ${
                        {
                          revenue: t("Revenue", "收益承担"),
                          household: t("Household", "业主自付"),
                          "third-party": t("Third party", "第三方承担"),
                        }[c.payer]
                      } · ${
                        c.replacementMonth
                          ? t("month ", "第 ") +
                            c.replacementMonth +
                            t("", " 月")
                          : t("annual", "每年")
                      }`
                  )
                  .join("<br>"),
              ],
            ])
          )
        : ""
    }
    ${wfPanel(
      t("Processing history", "处理记录"),
      `<ol class="wf-history">${
        events
          .map(
            (o) =>
              `<li><span>${esc(
                labels[o.action] || o.action
              )}</span><small>${esc(
                t(...(names[o.actor] || [o.actor, o.actor]))
              )} · ${date(o.startedAt) + " UTC"}</small>${
                o.body?.notes ? `<p>${esc(o.body.notes)}</p>` : ""
              }</li>`
          )
          .join("") ||
        `<li>${t("No confirmed actions yet", "暂无已确认操作")}</li>`
      }</ol>${
        a.agreementHash
          ? `<p class="wf-help">${t(
              "Agreement hash",
              "协议凭证哈希"
            )} <code>${esc(a.agreementHash)}</code></p>`
          : ""
      }`
    )}
  </div>`;
}
function renderApplications(mode) {
  const a = state.applications.find((a) => a.id === wfSelected);
  return a ? wfDetail(a, mode) : wfList(mode);
}
function wfAfter(action, payload, result) {
  if (action === "apply-eligibility") page = "investor_eligibility";
  if (action === "eligible") {
    investorReview = payload.investor;
    page = "agent_kyc_review";
  }
  if (["subscribe", "refund"].includes(action)) page = "subscribe";
  if (action === "apply") {
    wfSelect(result?.result?.id || "");
    page = "owner_agreement";
  } else if (
    [
      "review",
      "reopen-offer",
      "prepare-reassessment",
      "approve-reassessment",
      "accept-reassessment",
      "supplement",
      "offer",
      "approve-offer",
      "accept",
      "sign",
      "mint-station",
      "custody-consent",
      "admit",
    ].includes(action)
  ) {
    wfSelect(payload.applicationId);
    if (action === "review" && payload.decision === "approved")
      page = "agent_financing";
    if (action === "reopen-offer") {
      page = "agent_financing";
      wfForgetDraft(payload.applicationId);
    }
    if (action === "prepare-reassessment") {
      wfPreviews.delete(payload.applicationId);
      wfForgetDraft(payload.applicationId);
    }
    if (action === "offer") {
      wfPreviews.delete(payload.applicationId);
      wfForgetDraft(payload.applicationId);
      wfEditing.delete(payload.applicationId);
    }
    if (["accept", "sign", "custody-consent"].includes(action))
      page = "owner_agreement";
    if (action === "mint-station") page = "agent_pool";
    if (action === "admit") {
      page = "agent_pool";
      wfSelect("");
    }
  }
  if (action === "prepare-valuation")
    feedback(
      t(
        "Valuation prepared. The trustee must now approve it.",
        "估值已编制，下一步由受托人审批。"
      )
    );
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.hasAttribute("data-wf-return")) {
      page =
        role === "owner"
          ? "owner_agreement"
          : role === "agent"
          ? "agent_apply_review"
          : "trustee_events";
      render();
    }
    if (b.dataset.wfEdit) {
      wfEditing.add(b.dataset.wfEdit);
      wfSelect(b.dataset.wfEdit);
      page = "agent_financing";
      render();
    }
    if (b.hasAttribute("data-wf-open")) {
      wfSelect(b.dataset.wfOpen);
      render();
      document.querySelector("#main").scrollTop = 0;
    }
    if (b.hasAttribute("data-wf-back")) {
      wfSelect("");
      render();
    }
    if (b.dataset.wfHandoff) {
      const { wfHandoff: r, wfPage: p, wfId: id } = b.dataset;
      if (await setRole(r, r, {page:p,applicationId:id}) === false) return;
      page = p;
      const a = state.applications.find((a) => a.id === id);
      wfSelect(
        a?.status === "pooled" && !state.valuationChecks?.[a.id]?.blocked
          ? ""
          : id || ""
      );
      render();
      document.querySelector("#main").scrollTop = 0;
      if (a && r === role && p === page)
        document
          .querySelector(".wf-action-body, form[data-wf-editor]")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (b.dataset.wfStation) {
      stationSelection = b.dataset.wfStation;
      localStorage.setItem("revenue.station", stationSelection);
      page =
        role === "owner"
          ? "owner_station_detail"
          : role === "agent"
          ? "agent_monitor"
          : "station_transparent";
      render();
    }
    if (b.dataset.wfUpgradeModel) {
      const a = state.applications.find(a => a.id === b.dataset.wfUpgradeModel);
      if (["signed", "pooled"].includes(a.status)) throw new Error(t("Signed terms cannot be changed", "已签约条款不能直接更改"));
      const d = wfReadDraft(b.closest("form"), a), station = state.stations.find(s => s.id === a.stationId);
      Object.assign(d.assumptions, { revenueModel: "household-export", shareBps: 10000, gridTariffLocal: { CNY: 0.60, EUR: 0.30, USD: 0.25 }[station.currency] || 0.30, gridTariffEscalationPct: 0, gridTariffSchedule: [], householdPaymentBps: 8000, selfUseDeliveryPct: 90 });
      wfSaveDraft(a.id, d); wfPreviews.delete(a.id); render();
    }
    if (
      b.dataset.wfAddCost ||
      b.hasAttribute("data-wf-remove-cost") ||
      b.dataset.wfUseTariff
    ) {
      const id = b.dataset.wfAddCost || b.dataset.wfId || b.dataset.wfUseTariff,
        a = state.applications.find((a) => a.id === id),
        f = b.closest("form"),
        d = wfReadDraft(f, a);
      if (b.dataset.wfAddCost)
        d.assumptions.costs.push({
          id: crypto.randomUUID(),
          label: t("New expense", "新增费用"),
          payer: "revenue",
          annualLocal: 0,
          evidence: t("Pending verification", "待核实"),
        });
      if (b.hasAttribute("data-wf-remove-cost"))
        d.assumptions.costs.splice(Number(b.dataset.wfRemoveCost), 1);
      if (b.dataset.wfUseTariff)
        d.assumptions.tariffLocal = dsTariff(
          state.stations.find((s) => s.id === a.stationId)
        ).rate;
      wfSaveDraft(id, d);
      wfPreviews.delete(id);
      render();
    }
  } catch (error) {
    feedback(error.message, true);
  }
});
document.addEventListener("submit", (e) => {
  if (!e.target.hasAttribute("data-wf-search")) return;
  e.preventDefault();
  const data = new FormData(e.target);
  wfQuery = String(data.get("query") || "");
  wfFilter = String(data.get("status") || "all");
  render();
});

document.addEventListener("input", (e) => {
  const f = e.target.closest("form[data-wf-editor]");
  if (!f) return;
  try {
    const a = state.applications.find((a) => a.id === f.dataset.wfEditor);
    const draft = wfReadDraft(f, a);
    wfSaveDraft(a.id, draft);
    e.target.removeAttribute("aria-invalid");
    const checklist = f.querySelector(".wf-baseline-checklist");
    if (checklist)
      checklist.innerHTML = wfBaselineChecklist(a, draft.assumptions);
    if (wfPreviews.has(a.id)) {
      wfPreviews.delete(a.id);
      const section = document.querySelector(".wf-report-section");
      if (section)
        section.innerHTML =
          '<p class="wf-next">' +
          t(
            "Inputs changed. Calculate again to refresh the preview.",
            "参数已修改，请重新试算以更新结果。"
          ) +
          "</p>";
    }
  } catch {
    /* Validation messages are shown on submission. */
  }
});
function wfPoolGuide(currentAction = "") {
  const phase = Number(state.chain.phase),
    hash = state.activeReports.aggregate;
  if (phase === 3 || phase === 4)
    return `<div class="wf-next"><div><strong>${
      phase === 3
        ? t("Fundraising ended · refunds available", "募集已终止 · 可领取退款")
        : t(
            "Product closed · final cash available",
            "产品已清算 · 可领取最终分配"
          )
    }</strong><p>${
      phase === 3
        ? t(
            "Investors claim their escrow refunds from Subscribe. This issuance is closed.",
            "投资者可在认购页面领取托管退款，本次发行已结束。"
          )
        : t(
            "Investors can review and claim final distributions in My holdings.",
            "投资者可在我的持仓查看并领取最终现金分配。"
          )
    }</p></div></div>`;
  const blocked = state.applications.find(
    (a) => a.status === "pooled" && state.valuationChecks?.[a.id]?.blocked
  );
  if (blocked)
    return `<div class="wf-baseline-alert"><strong>${t(
      "Pool paused for baseline reassessment",
      "资产池须重新评估上网基线"
    )}</strong><p>${t(
      "Issuance and settlement are blocked until the revised estimate is reviewed. Existing agreements are preserved.",
      "重新评估及复核完成前禁止发行与结算，原协议记录保留。"
    )}</p><button class="btn btn-primary" data-wf-handoff="agent" data-wf-page="agent_financing" data-wf-id="${
      blocked.id
    }">${t("Review this application", "处理该申请")} →</button></div>`;
  if(phase===2&&typeof productModel==='function'){
    const m=productModel(),next=m.operations.next;
    if(next){
      const handling=t(...names[next.role]);
      const explanation=next.action==='prepare-valuation'?t('Reconcile collected cash, outstanding receivables and expenses in a new report. The trustee then reviews that report before the intermediary continues.','请把已收现金、待收应收款及费用纳入新报告，再由受托人审批后继续运营。'):next.action==='approve-valuation'?t('The current report awaits independent trustee approval. The intermediary continues the monthly fees after approval.','当前报告等待受托人独立审批。审批完成后，由中介继续处理月度费用。'):next.waitDate>m.now?t('The next monthly cutoff has not arrived. Inspect the scheduled date in product operations. The local guide offers a separately confirmed demo time option.','下一月度截止日尚未到达。请在产品运营查看计划日期，本地引导提供需要单独确认的演示时间选项。'):t('Open the assigned operation below. Its completion determines the following monthly or quarterly task.','请打开下方指定操作，完成后系统会根据实际状态更新下一项月度或季度任务。');
      return `<div class="wf-next"><div><small>${t('CURRENT OPERATING STEP','当前运营步骤')}</small><strong>${handling} · ${esc(next.title)}</strong><p>${explanation}</p></div>${role===next.role&&page===next.page?'':`<button class="btn btn-primary" data-wf-handoff="${next.role}" data-wf-page="${next.page}">${t('Open handling workspace','打开处理工作台')} →</button>`}</div>`;
    }
  }
  const pooled = state.applications.some((a) => a.status === "pooled");
  let nextRole = "agent",
    nextPage = "agent_pool",
    heading,
    text;
  if (!pooled) {
    heading = t("Admit signed station rights first", "先完成已签收益权入池");
    text = t(
      "Open a signed application in the queue below. After admission, prepare a pool valuation.",
      "在申请队列中打开已签协议，完成入池后再编制资产池估值。"
    );
  } else if (phase === 0 && !hash) {
    heading = t("1. Prepare the pool valuation", "1. 编制资产池估值");
    text = t(
      "Use Prepare updated valuation below, then hand the proposal to the trustee.",
      "点击下方「编制更新估值」，生成方案后交受托人审批。"
    );
  } else if (hash && Number(state.chain.proposedValuationValidUntil)>0 && Number(state.chain.proposedValuationValidUntil)<=state.financialTime) {
    heading=t("Prepare a current valuation","重新编制当前估值");
    text=t("The earlier report expired. The intermediary must prepare a new report at the current financial cutoff before trustee approval.","原报告已过期。请由中介按当前财务时点编制新报告，再交受托人审批。");
  } else if (hash && !state.approvedReports.includes(hash)) {
    nextRole = "trustee";
    nextPage = "trustee_events";
    heading = t("2. Trustee approval required", "2. 等待受托人批准资产池估值");
    text = t(
      "The proposal is prepared. The trustee reviews the pool assumptions before issuance or settlement.",
      "估值方案已生成，受托人核对资产池假设并批准后才能发行或结算。"
    );
  } else if (!state.chain.fresh) {
    heading = t("Refresh the current pool valuation", "更新当前资产池估值");
    text = t(
      "The recorded valuation is no longer current. Reconcile completed periods, prepare an updated valuation and obtain trustee approval before dealing.",
      "已记录估值当前失效。完成已到期月份对账，编制更新估值并取得受托人批准后再继续交易。"
    );
  } else if (phase === 0) {
    nextPage = "agent_product";
    heading = t("3. Publish the product", "3. 发布产品开始募集");
    text = t(
      "The pool valuation is approved. Review expected investor net IRR, cash distributions and funding requirements, then publish the issuance terms.",
      "资产池估值已批准。请核对投资者预计净年化收益、现金分配及募集资金要求，再发布发行条款。"
    );
  } else if (phase === 1) {
    nextPage = "agent_product";
    const paid = BigInt(state.chain.totalSubscriptions || "0");
    if (
      paid * 10000n < BigInt(state.chain.target || "0") * 7000n ||
      paid * 9000n < BigInt(state.chain.acquisitionTotal || "0") * 10000n
    ) {
      nextRole = "investor";
      nextPage = "subscribe";
    }
    heading = t(
      "4. Subscribe, cool off and settle",
      "4. 投资者认购、订单审核与结算"
    );
    text = t(
      "Investors subscribe from Subscribe. Settlement requires intermediary approval of all orders, the 70% threshold and enough funding for purchases plus reserve. Owners are paid at settlement.",
      "投资者在「认购」页面下单后，中介可立即审核。全部订单审核通过、达到70%募集门槛且足额覆盖购买款和储备资金后即可结算，业主款项在结算时到账。"
    );
  } else {
    heading = t("Monthly servicing and cash collections", "月度估值与回款管理");
    text = t(
      "Maintain approved NAV, record collected receipts and handle quarterly distributions and exits.",
      "持续更新已审批净值，登记实际归集回款，并处理季度分配与退出。"
    );
  }
  return `<div class="wf-next"><div><small>${t(
    "POOL WORKFLOW",
    "资产池流程"
  )}</small><strong>${heading}</strong><p>${text}</p></div>${
    role === nextRole && page === nextPage
      ? currentAction
      : `<button class="btn btn-primary" data-wf-handoff="${nextRole}" data-wf-page="${nextPage}">${
          role !== nextRole
            ? t("Demo: switch to ", "演示：切换至") + t(...names[nextRole])
            : t("Continue", "继续处理")
        } →</button>`
  }</div>`;
}

function wfBaselineSubmissionIssues(a, assumptions) {
  if (
    !state.valuationChecks?.[a.id]?.audit?.materialChange &&
    assumptions.baselineMethod !== "recent-export-ratio"
  )
    return [];
  const station = state.stations.find((s) => s.id === a.stationId);
  const issues = [];
  if ((assumptions.baselineReviewNote || "").trim().length < 20)
    issues.push({
      field: "wf_baselineReviewNote",
      message: t(
        "Explain the selected baseline in at least 20 characters before submitting. Preview remains available.",
        "提交报价前，请填写至少20个字符的基线选择依据；尚未填写时仍可试算。"
      ),
    });
  if (assumptions.baselineReviewSourceHash !== station.sourceHash)
    issues.push({
      field: "wf_baselineReviewed",
      message: t(
        "Acknowledge the data scope and forecast method for the current evidence before submitting.",
        "提交报价前，请勾选已核对本次数据口径和所选预测方法。"
      ),
    });
  return issues;
}
function wfBaselineChecklist(a, assumptions) {
  const issues = wfBaselineSubmissionIssues(a, assumptions);
  return issues.length
    ? `<strong>${t(
        "Required before submitting",
        "报价提交前待补充"
      )}</strong><ul>${issues
        .map((i) => `<li>${esc(i.message)}</li>`)
        .join("")}</ul>`
    : `<strong>${t(
        "Baseline review fields complete",
        "基线复核字段已齐全"
      )}</strong><p>${t(
        "Submit the quote to send these inputs to the trustee. A preview does not update the submitted quote.",
        "点击提交报价，将本次参数交受托人审批；仅试算不会更新已提交报价。"
      )}</p>`;
}
function wfValidateQuoteSubmission(f, a, assumptions) {
  const issue = wfBaselineSubmissionIssues(a, assumptions)[0];
  if (!issue) return true;
  const field = f.elements.namedItem(issue.field);
  field.setAttribute("aria-invalid", "true");
  field.focus();
  feedback(issue.message, true);
  return false;
}
function wfBaselineFields(a) {
  const s = state.stations.find((s) => s.id === a.stationId),
    audit = state.valuationChecks?.[a.id]?.audit;
  const v =
    wfDrafts.get(a.id)?.assumptions ||
    a.reassessment?.report.assumptions ||
    a.assumptions;
  const selected =
    v.baselineMethod ||
    (audit?.materialChange && audit.recentEligible
      ? "recent-export-ratio"
      : "historical");
  return `<div class="wf-baseline-input"><h4>${t(
    "Forecast baseline",
    "预测基线选择"
  )}</h4><label>${t(
    "Method",
    "计算方法"
  )}<select name="wf_baselineMethod"><option value="historical" ${
    selected === "historical" ? "selected" : ""
  }>${t(
    "Historical seasonal export",
    "长期历史季节性上网量"
  )}</option><option value="recent-export-ratio" ${
    selected === "recent-export-ratio" ? "selected" : ""
  } ${audit?.recentEligible ? "" : "disabled"}>${t(
    "Seasonal generation × recent export ratio (provisional)",
    "季节性发电量 × 近期上网比例（暂定情景）"
  )}</option></select></label><p>${t(
    "Recent means up to 30 days before the capture day, with at least 7 valid complete days. Missing days and today's partial energy are excluded. Exports above generation invalidate the ratio; grid-charged resale is not inferred.",
    "近期样本取采集日前最多30天，至少须有7个完整日；缺测日和采集当天不计入。上网量超过发电量时，该比例不可用，须核对口径或审核历史估算，不推定电网充电再售电收入。"
  )}</p><label>${t(
    "Basis for choosing this baseline (20+ characters when review required)",
    "基线选择依据（需复核时至少20个字符）"
  )}<textarea name="wf_baselineReviewNote" placeholder="${t(
    "Explain verified meter meaning, operating changes and why this baseline is representative",
    "说明已核对的统计口径、运行方式变化，以及选择此基线的理由"
  )}">${esc(
    v.baselineReviewNote || ""
  )}</textarea></label><label class="checkline"><input type="checkbox" name="wf_baselineReviewed" ${
    v.baselineReviewSourceHash === s.sourceHash ? "checked" : ""
  }>${t(
    "I reviewed the data scope and the selected method against this evidence snapshot",
    "我已结合本次证据核对数据口径和所选预测方法"
  )}</label><div class="wf-baseline-checklist" aria-live="polite">${wfBaselineChecklist(
    a,
    v
  )}</div></div>`;
}
function wfBaselineComparison(a) {
  const check = state.valuationChecks?.[a.id],
    b = check?.audit,
    preview = wfPreviews.get(a.id) || check?.comparison;
  if (!b) return "";
  const notice = wfBaselineNotice(a);
  const currency = state.stations.find((s) => s.id === a.stationId).currency;
  return wfPanel(
    t("Observed data → forecast baseline", "实际数据 → 预测基线核对"),
    `
    ${
      notice
        ? `<div class="wf-baseline-alert ${
            notice.kind === "initial" ? "wf-baseline-guide" : ""
          }"><strong>${notice.title}</strong><p>${esc(notice.body)}</p></div>`
        : ""
    }
    <div class="wf-value-cards">${metric(
      t("Historical export / day", "历史日均上网"),
      dsNum(b.historicalDailyExportKWh, 2),
      "kWh"
    )}${metric(
      t("Recent export / complete day", "近期完整日日均上网"),
      dsNum(b.recentDailyExportKWh, 2),
      "kWh"
    )}${metric(
      t("Compared with seasonal history", "相对同季节历史"),
      b.ratioToHistorical === null ? "—" : dsNum(b.ratioToHistorical, 1) + "×",
      b.materialChange
        ? t("Material change", "存在显著变化")
        : t("No material shift detected", "未检测到显著突变")
    )}</div>
    ${wfKv([
      [
        t("Historical window", "历史窗口"),
        `${b.historyStart || "—"} → ${b.historyEnd || "—"} · ${
          b.historyMonths
        } ${t("complete months", "完整月")}`,
      ],
      [
        t("Recent window", "近期窗口"),
        `${b.recentStart || "—"} → ${b.recentEnd || "—"} · ${
          b.completeDays
        } ${t("complete days", "完整日")}`,
      ],
      [
        t("Excluded partial / unavailable days", "排除的未完整或缺测日"),
        esc(b.excludedDates.join(", ") || "—"),
      ],
      [
        t("Observed / modeled export ratio", "观测 / 建模上网比例"),
        `${dsNum(
          b.observedExportRatio === null ? null : b.observedExportRatio * 100,
          2
        )}% / ${dsNum(
          b.solarExportRatio === null ? null : b.solarExportRatio * 100,
          2
        )}%`,
      ],
    ])}
    <p class="wf-help">${t(
      "Both rows below use the SAME tariff, costs, FX and discount rate. The recent scenario changes the export behavior but retains historical generation seasonality, degradation and downtime. It is not a daily-income × 1,800 shortcut.",
      "下表两种基线使用同一电价、费用、汇率和折现率。近期情景更新上网行为，保留历史发电季节性、衰减和停机假设，不是把单日收益直接乘以1800。"
    )}</p>
    ${
      preview?.baseline
        ? table(
            [
              t("Baseline", "预测基线"),
              t("First year export · kWh", "首年上网 · kWh"),
              t("60-month gross receipts", "60个月售电毛收入") +
                ` (${currency})`,
              t("Rights PV · USDC", "收益权现值 · USDC"),
            ],
            preview.baseline.comparison.map((c) => [
              c.method === "historical"
                ? t("Historical seasonal export", "长期历史季节性上网")
                : t(
                    "Recent export behavior · provisional",
                    "近期上网行为 · 暂定"
                  ),
              dsNum(c.firstYearExportKWh, 2),
              dsCash(c.grossLocal),
              money(c.valueUSDC6),
            ])
          )
        : ""
    }
    <p class="wf-help">${t("Comparison tariff", "对比使用电价")}: ${
      preview?.assumptions.tariffLocal ?? a.assumptions.tariffLocal
    } ${currency}/kWh · ${t(
      "Change detection: ≥3× or ≤⅓×, with ≥5 kWh/day absolute change. This is a demo review trigger, not a probability model.",
      "突变条件：≥3倍或≤1/3，且日均差异≥5kWh。这是演示复核阈值，不是概率模型。"
    )}</p>
    ${
      a.offer && !a.offer.modelVersion
        ? `<p class="wf-help">${t(
            "The quote below is an archived result from the previous model; the comparison above is a new calculation and does not replace the signed purchase price.",
            "下方原报价来自旧版模型；上方是新版重新测算，不代表已经修改签约购买价。"
          )}</p>`
        : ""
    }`
  );
}
function wfBaselineNotice(a) {
  const check = state.valuationChecks?.[a.id];
  if (!a.offer) {
    if (!check?.audit?.materialChange) return null;
    return {
      kind: "initial",
      title: t(
        "First valuation · choose the forecast baseline",
        "首次估值：请选择预测基线"
      ),
      body:
        a.status === "approved"
          ? t(
              "No quote has been created yet. Recent export differs significantly from historical levels. In the valuation inputs below, choose the baseline and tariff, calculate a preview, then record your rationale and data-scope acknowledgment before submitting the quote for trustee approval.",
              "当前申请尚未生成报价。近期上网量与历史水平差异较大，请在下方估值参数中选择预测基线和电价，先试算，再填写选择依据并确认数据口径，最后生成报价提交受托人审批。"
            )
          : t(
              "No quote has been created yet. Recent export differs significantly from historical levels; the intermediary will select and explain the forecast baseline during initial valuation after the application review.",
              "当前申请尚未生成报价。近期上网量与历史水平差异较大，申请审核通过后，由中介在首次估值时选择预测基线并说明依据。"
            ),
    };
  }
  if (wfQuoteNeedsCorrection(a))
    return {
      kind: "correction",
      title: t(
        "Quote needs baseline review",
        "报价待补全：请由中介完成基线复核"
      ),
      body:
        check.reason +
        " " +
        t(
          "Open quote correction, confirm the intended forecast method, complete the missing fields and resubmit. Preview alone does not replace this quote. The trustee can review the new submission afterwards.",
          "点击「去补充报价」，确认要采用的预测方法，补齐提示字段后重新提交。仅点击试算不会替换本报价；重新提交后受托人即可审批。"
        ),
    };
  return check?.blocked
    ? {
        kind: "reassessment",
        title: t(
          "Reassessment required before proceeding",
          "需要重新评估，当前报价不能继续用于发行或结算"
        ),
        body: check.reason,
      }
    : null;
}
function wfReassessment(a, mode) {
  if (!["signed", "pooled"].includes(a.status)) return "";
  const r = a.reassessment;
  let controls = "";
  if (mode === "agent")
    controls = `<form data-action="prepare-reassessment" data-wf-editor="${
      a.id
    }" data-payload="${esc(
      JSON.stringify({ applicationId: a.id })
    )}">${wfBaselineFields(a)}<p class="wf-help">${t(
      "Only the forecast baseline changes. Tariff, expenses, assigned share and the agreed price remain fixed. The owner must explicitly acknowledge proceeding at the original price, and a trustee must review the new valuation.",
      "仅重评预测基线，电价、费用、分成与已签购买价保持不变。业主须明确确认是否仍按原价继续，受托人须复核新版估值。"
    )}</p><div class="wf-actions"><button class="btn btn-outline" type="submit" data-wf-preview>${t(
      "Preview revised value",
      "试算重新估值"
    )}</button><button class="btn btn-primary" type="submit">${t(
      "Submit reassessment for review",
      "提交重新评估方案"
    )}</button></div></form>`;
  if (
    r &&
    state.valuationChecks?.[a.id]?.reassessmentCurrent &&
    mode === "trustee" &&
    !r.trusteeApproved
  )
    controls = form(
      "approve-reassessment",
      t("Approve reassessment", "批准重新评估方案"),
      approvalCheck(),
      { applicationId: a.id }
    );
  if (
    r &&
    state.valuationChecks?.[a.id]?.reassessmentCurrent &&
    mode === "owner" &&
    !r.ownerAccepted
  )
    controls = form(
      "accept-reassessment",
      t(
        "Acknowledge revised estimate and continue at original price",
        "确认新版估值并同意按原签约价继续"
      ),
      `<p>${t("Revised rights value", "新版收益权估值")}: ${money(
        r.report.rightsValueUSDC6
      )} USDC; ${t("signed purchase price", "原签约购买价")}: ${money(
        a.priceUSDC6
      )} USDC.</p>` + approvalCheck(),
      { applicationId: a.id }
    );
  return wfPanel(
    t("Reassess signed rights", "已签收益权重新评估"),
    `<p class="wf-help">${t("Signed purchase price", "已签购买价")}: <b>${money(
      a.priceUSDC6
    )} demo USDC</b>. ${t(
      "Revaluation never changes this price automatically. To negotiate a new purchase price after on-chain admission, a replacement agreement and pool are required; do not acknowledge continuation at the old price if you disagree.",
      "重新估值不会自动改价。已上链入池后如需协商新购买价，须重新签约建池；如不同意原价，不应确认继续。"
    )}</p>${
      r
        ? `<div class="wf-result-head"><span>${t(
            "Reassessed value",
            "重新估值"
          )}: ${money(r.report.rightsValueUSDC6)} USDC</span><span>${t(
            "Trustee",
            "受托人"
          )}: ${r.trusteeApproved ? "✓" : "—"} · ${t("Owner", "业主")}: ${
            r.ownerAccepted ? "✓" : "—"
          }</span></div>`
        : ""
    }${
      r
        ? `<p class="wf-help">${t(
            "Recorded review rationale",
            "已记录的基线选择依据"
          )}: ${esc(r.report.assumptions.baselineReviewNote)}</p>`
        : ""
    }${controls}${
      a.status === "signed" && mode === "agent"
        ? form(
            "reopen-offer",
            t("Archive old agreement and re-quote", "保留旧协议并重新报价"),
            note("notes", t("Reason for re-quoting", "重新报价原因")),
            { applicationId: a.id }
          )
        : ""
    }`
  );
}
