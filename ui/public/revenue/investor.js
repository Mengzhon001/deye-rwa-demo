"use strict";
let investorReview = "",
  catalogFilter = "current",
  catalogQuery = "";
const investorActors = () =>
  Object.keys(state.accounts || {}).filter((who) => who !== "owner");
const investorLabel = (who) => {
  if (who === "investor") return t("Investor A", "投资者 A");
  if (who === "investor2") return t("Investor B", "投资者 B");
  const address = state.accounts?.[who]?.address || String(who).slice(9);
  return `${t("Investor", "投资者")} ${address.slice(0, 6)}…${address.slice(
    -4
  )}`;
};
const investorLink = (label, target, primary = false) =>
  `<button class="btn ${
    primary ? "btn-primary" : "btn-outline"
  }" data-page="${target}">${label} →</button>`;
const investorHead = (title, subtitle) =>
  `<header class="op-page-head"><div><span class="op-eyebrow">DEYE · INVESTOR SERVICES</span><h1>${title}</h1><p>${subtitle}</p></div></header>`;
function investorEligibility(who = actor) {
  const request = (state.eligibilityApplications || [])
    .filter((r) => r.investor === who)
    .at(-1);
  const approved = !!state.accounts[who]?.eligible;
  const status = approved
    ? "approved"
    : request?.status === "approved"
    ? "revoked"
    : request?.status || "none";
  const labels = {
    none: ["Not applied", "未申请"],
    pending: ["Awaiting review", "待中介审核"],
    approved: ["Approved", "资格已通过"],
    rejected: ["Needs resubmission", "未通过 · 可重新申请"],
    revoked: ["Eligibility inactive", "资格已失效"],
  };
  return { request, approved, status, label: t(...labels[status]) };
}
function investorEligibilityBanner() {
  const e = investorEligibility();
  return `<div class="iv-notice ${
    e.approved ? "iv-success" : ""
  }"><div><strong>${investorLabel(actor)} · ${e.label}</strong><p>${
    e.approved
      ? t(
          "Your local wallet is eligible. Continue to the subscription order when fundraising is open.",
          "当前本地钱包已获准参与，募集开放时可继续提交认购订单。"
        )
      : e.status === "pending"
      ? t(
          "Application received. The intermediary reviews it; approval will unlock subscription.",
          "申请已提交，由中介机构审核；批准后将解锁认购。"
        )
      : t(
          "Apply once for this demo wallet before subscribing. Open Investor qualification to submit the declarations.",
          "认购前须先为当前演示钱包申请资格，请进入「投资资格」提交声明。"
        )
  }</p></div>${investorLink(
    e.approved
      ? t("View qualification", "查看资格")
      : t("Open qualification", "申请 / 查看投资资格"),
    "investor_eligibility",
    !e.approved
  )}</div>`;
}
function investorQualification() {
  const e = investorEligibility(),
    r = e.request;
  return (
    investorHead(
      t("Investor qualification", "投资资格"),
      t(
        "Apply → intermediary review → on-chain eligibility → subscribe",
        "提交申请 → 中介审核 → 链上资格生效 → 返回认购"
      )
    ) +
    `<div class="iv-steps"><span class="done">01 ${t(
      "Select wallet",
      "选择账户"
    )}</span><span class="${r ? "done" : "current"}">02 ${t(
      "Submit declarations",
      "提交声明"
    )}</span><span class="${e.approved ? "done" : ""}">03 ${t(
      "Intermediary review",
      "中介审核"
    )}</span><span>04 ${t("Subscribe", "认购产品")}</span></div>` +
    card(
      investorLabel(actor),
      `<div class="iv-section-line">${tag(
        e.label,
        e.approved ? "normal" : "warning"
      )}<span class="mono">${esc(
        state.accounts[actor].address
      )}</span></div><p>${t(
        "Local demo eligibility only. This is not production identity verification or regulatory suitability certification; no identity documents are collected here.",
        "仅用于本地演示准入，不代表生产环境身份核验或监管适当性认证，此处不收集身份证件。"
      )}</p>${
        r
          ? `<div class="iv-facts"><div><small>${t(
              "Submitted at (UTC)",
              "申请时间（UTC）"
            )}</small><b>${date(r.submittedAt)}</b></div><div><small>${t(
              "Review result",
              "审核意见"
            )}</small><b>${esc(
              r.reviewNote || t("Awaiting intermediary review", "等待中介审核")
            )}</b></div></div>`
          : ""
      }${
        e.approved
          ? `<p>${t(
              "Eligibility is active on-chain. Fundraising, approved pricing and intermediary order review still apply.",
              "链上资格已生效，认购仍须满足募集期、有效估值及中介订单审核条件。"
            )}</p>${investorLink(
              t("Return to subscription", "返回认购"),
              "subscribe",
              true
            )}`
          : e.status === "pending"
          ? `<div class="iv-actions">${productNav(
              t(
                "Demo: switch to intermediary review",
                "演示：切换中介处理申请"
              ),
              "agent",
              "agent_kyc_review"
            )}${investorLink(
              t("Browse products", "浏览产品"),
              "product_hall"
            )}</div>`
          : form(
              "apply-eligibility",
              t("Submit qualification application", "提交资格申请"),
              `<label class="checkline"><input type="checkbox" name="riskAccepted" required>${t(
                "I understand variable revenue, possible loss and limited exit liquidity; no fixed coupon or principal guarantee.",
                "我已了解收益浮动、可能亏损和退出流动性限制，无固定票息或本金保证。"
              )}</label><label class="checkline"><input type="checkbox" name="demoAcknowledged" required>${t(
                "I am using the selected local demo wallet and demo USDC. This application is for the demonstration only.",
                "我使用所选本地演示钱包与演示 USDC，本申请仅用于演示。"
              )}</label>`
            )
      } `
    )
  );
}
function investorReviewQueue() {
  const rows = investorActors().map((who) => ({
    who,
    ...investorEligibility(who),
  }));
  const selected = rows.find((r) => r.who === investorReview);
  return (
    investorHead(
      t("Investor qualification review", "投资者资格审核"),
      t(
        "Review submitted declarations, record a decision and confirm the wallet's on-chain access.",
        "核对已提交声明、记录审核意见，并确认钱包链上准入状态。"
      )
    ) +
    `<div class="metric-row">${metric(
      t("Pending", "待审核"),
      rows.filter((r) => r.status === "pending").length
    )}${metric(
      t("Approved", "已通过"),
      rows.filter((r) => r.approved).length
    )}${metric(
      t("Not applied / resubmit", "未申请 / 待重提"),
      rows.filter((r) => !r.approved && r.status !== "pending").length
    )}</div>` +
    card(
      t("Application queue", "资格申请列表"),
      table(
        [
          t("Investor / wallet", "投资者 / 钱包"),
          t("Status", "状态"),
          t("Submitted (UTC)", "申请时间（UTC）"),
          t("Action", "操作"),
        ],
        rows.map((r) => [
          `<strong>${investorLabel(r.who)}</strong><p class="mono">${esc(
            state.accounts[r.who].address
          )}</p>`,
          tag(r.label, r.approved ? "normal" : "warning"),
          date(r.request?.submittedAt),
          r.request
            ? `<button class="btn btn-outline" data-investor-review="${
                r.who
              }">${
                r.status === "pending"
                  ? t("Review application", "审核申请")
                  : t("View record", "查看记录")
              } →</button>`
            : t("Investor must apply first", "等待投资者提交申请"),
        ])
      )
    ) +
    (selected
      ? card(
          t("Application details", "申请详情") +
            " · " +
            investorLabel(selected.who),
          `<p>${tag(selected.label)} ${t(
            "Declarations: revenue risks and local demonstration acknowledged.",
            "申请声明：已确认收益风险及本地演示用途。"
          )}</p><p>${esc(selected.request.reviewNote || "")}</p>${
            ["pending", "approved"].includes(selected.status)
              ? (selected.approved
                  ? `<details><summary>${t(
                      "Manage existing eligibility",
                      "管理已有资格（撤销）"
                    )}</summary>`
                  : "") +
                form(
                  "eligible",
                  selected.approved
                    ? t("Revoke eligibility", "撤销投资资格")
                    : t("Confirm review decision", "确认审核决定"),
                  select(
                    "eligible",
                    t("Decision", "审核决定"),
                    selected.status === "pending"
                      ? [
                          ["true", t("Approve", "通过")],
                          [
                            "false",
                            t(
                              "Reject and request resubmission",
                              "不通过，退回重提"
                            ),
                          ],
                        ]
                      : [["false", t("Revoke eligibility", "撤销资格")]]
                  ) +
                    `<label>${t(
                      "Review note (required)",
                      "审核意见（必填）"
                    )}<textarea name="reviewNote" required minlength="4" maxlength="1000" placeholder="${t(
                      "Record the basis for your decision",
                      "请记录审核依据或需补充内容"
                    )}"></textarea></label>`,
                  { investor: selected.who, applicationId: selected.request.id }
                ) +
                (selected.approved ? "</details>" : "")
              : ""
          }<div class="iv-actions"><button class="btn btn-outline" data-investor-return="${
            selected.who
          }">${t(
            "Demo: return to this investor",
            "演示：返回该投资者"
          )} →</button></div>`
        )
      : "")
  );
}
function investorCatalog() {
  if (state.productOptions) return multiProductCatalog();
  const m = productModel(),
    d = productProjectionData();
  const products = state.products || [];
  const product = products.find(
    (p) => p.vault === state.manifest.addresses.vault
  );
  const title = product ? product.title[lang] : "";
  const visible =
    Boolean(product) &&
    (catalogFilter === "all" ||
      (catalogFilter === "current" && product.phase <= 2) ||
      (catalogFilter === "history" && product.phase >= 3) ||
      Number(catalogFilter) === product.phase) &&
    title.toLowerCase().includes(catalogQuery.toLowerCase());
  const rate =
    d &&
    !d.stale &&
    m.approved &&
    m.phase < 3 &&
    Number.isFinite(d.p.projectedNetIRRPct)
      ? d.p.projectedNetIRRPct.toFixed(2) + "%"
      : "—";
  return (
    investorHead(
      t("Product hall", "产品大厅"),
      t(
        "Browse published revenue-right products. Fundraising precedes settlement and the issuance of investor shares.",
        "浏览已发布的收益权产品。募集中的产品尚未结算，投资者份额在结算成功后发行。"
      )
    ) +
    investorEligibilityBanner() +
    `<form data-catalog-search class="iv-search"><input name="query" aria-label="${t(
      "Search products",
      "搜索产品"
    )}" placeholder="${t("Search product name", "搜索产品名称")}" value="${esc(
      catalogQuery
    )}">${select(
      "status",
      t("Product status", "产品状态"),
      [
        ["current", t("Fundraising & active", "募集中与存续中")],
        ["history", t("Historical products", "历史产品")],
        ["1", t("Fundraising", "募集中")],
        ["2", t("Active", "存续中")],
      ],
      catalogFilter
    )}<button class="btn btn-outline">${t(
      "Search",
      "查询"
    )}</button></form><p class="iv-caption">${t(
      `${products.length} published product(s) in this scenario`,
      `当前场景共 ${products.length} 个已发布产品`
    )} · ${visible ? 1 : 0} ${t("shown", "个匹配结果")}</p>` +
    (visible
      ? `<article class="iv-product-card"><div class="iv-product-top"><div><span class="op-eyebrow">DEYE · SERIES 01</span><h2>${title}</h2><p>${
          m.pooled.length
        } ${t(
          "stations · solar electricity revenue rights",
          "座入池电站 · 光伏用电与售电收益权"
        )}</p></div>${tag(
          t(...phaseNames[m.phase]),
          m.phase === 1 ? "normal" : "info"
        )}</div>${
          !m.c.fresh
            ? `<p class="notice-bar">${t(
                "Valuation needs renewal. New subscriptions are unavailable.",
                "估值需要更新，暂不可新增认购。"
              )}</p>`
            : ""
        }<div class="iv-product-metrics"><div class="iv-yield"><small>${t(
          "Projected net annualized return",
          "预计净年化收益"
        )}</small><strong>${rate}</strong><span>${t(
          "Model estimate · variable return",
          "模型测算 · 收益浮动"
        )}</span></div><div><small>${t(
          "Fundraising target",
          "募集目标"
        )}</small><strong>${money(
          String(m.target)
        )} <em>USDC</em></strong></div><div><small>${t(
          "Rights term",
          "收益权期限"
        )}</small><strong>${t("5 years", "5 年")}</strong><span>${t(
          "From settlement",
          "自产品结算起算"
        )}</span></div><div><small>${t(
          "Distribution cycle",
          "分配周期"
        )}</small><strong>${t(m.interval===1?"Monthly":"Quarterly",m.interval===1?"每月":"每季度")}</strong><span>${t(
          "Based on collected cash",
          "取决于已归集现金"
        )}</span></div></div><div class="iv-funding"><span>${t(
          "Subscribed",
          "已认购"
        )} ${money(String(m.subscribed))} / ${money(
          String(m.target)
        )} USDC</span><span>${
          m.phase === 1
            ? t("Closes (UTC): ", "截止（UTC）：") + date(m.c.deadline)
            : t(...phaseNames[m.phase])
        }</span></div><div class="progress-bar"><div class="fill" style="width:${
          m.target > 0n
            ? Math.min(100, (Number(m.subscribed) * 100) / Number(m.target))
            : 0
        }%"></div></div><footer><p>${t(
          "Finite revenue rights. No guaranteed coupon or original-principal repayment.",
          "有限期收益权，无固定票息或原始本金偿还保证。"
        )}</p><div class="iv-actions">${investorLink(
          t("View pool details", "查看资产池详情"),
          "pool_detail"
        )}${investorLink(
          m.phase === 1
            ? t("Subscribe", "前往认购")
            : m.phase === 2 || m.phase === 4
            ? t("My holdings", "我的持仓")
            : t("View issuance status", "查看发行状态"),
          m.phase === 2 || m.phase === 4 ? "position" : "subscribe",
          true
        )}</div></footer></article>`
      : `<div class="iv-empty">${t(
          products.length
            ? "No matching products. Change the search or status filter."
            : "No published products yet. Products appear here once fundraising is published.",
          products.length
            ? "没有匹配的产品，请调整关键词或状态筛选。"
            : "暂无已发布产品。中介机构发布募集后，产品才会出现在这里。"
        )}</div>`)
  );
}
function multiProductCatalog() {
  const all = state.products || [];
  const visible = all.filter(p => (catalogFilter === "all" ||
    (catalogFilter === "current" && p.phase <= 2) || (catalogFilter === "history" && p.phase >= 3) || Number(catalogFilter) === p.phase) &&
    p.title[lang].toLowerCase().includes(catalogQuery.toLowerCase()));
  return investorHead(t("Product hall", "产品大厅"), t("Select a published product to view its own valuation, qualification, orders and holdings.", "选择已发布产品，查看该产品的估值、投资资格、认购订单与持仓。")) +
    `<form data-catalog-search class="iv-search"><input name="query" aria-label="${t("Search products", "搜索产品")}" placeholder="${t("Search product name", "搜索产品名称")}" value="${esc(catalogQuery)}">${select("status", t("Product status", "产品状态"), [["current", t("Fundraising & active", "募集中与存续中")], ["history", t("Historical products", "历史产品")], ["1", t("Fundraising", "募集中")], ["2", t("Active", "存续中")]], catalogFilter)}<button class="btn btn-outline">${t("Search", "查询")}</button></form><p class="iv-caption">${t(`${all.length} published products · ${visible.length} matching results`, `共 ${all.length} 个已发布产品 · ${visible.length} 个匹配结果`)}</p>` +
    (visible.length ? visible.map(p => {
      const rate = p.valuationFresh && Number.isFinite(p.projectedNetIRRPct) ? p.projectedNetIRRPct.toFixed(2) + "%" : "—";
      const target = Number(p.targetUSDC6), subscribed = Number(p.subscriptionsUSDC6);
      return `<article class="iv-product-card"><div class="iv-product-top"><div><span class="op-eyebrow">${p.kind === "experience" ? t("INVESTOR EXPERIENCE", "投资者体验产品") : t("REVENUE RIGHTS", "光伏收益权")}</span><h2>${esc(p.title[lang])}</h2><p>${p.admittedStations} ${t("admitted station(s)", "座入池电站")} · ${t("Independent test product", "独立测试产品")}</p></div>${tag(t(...phaseNames[p.phase]), p.phase === 1 ? "normal" : "info")}</div>
      ${p.subscriptionReviewRequired === false ? `<p class="notice-bar">${t("Earlier contract: orders remain separate under their original terms. Use the current product for immediate review.", "旧版合约，原订单及条款单独保留。即时审核请使用新版产品。")}</p>` : ""}
      ${!p.valuationFresh ? `<p class="notice-bar">${t("Valuation needs renewal. Subscription is blocked until intermediary and trustee approve fresh pricing.", "估值需要更新。中介重新估值并由受托人批准前，不能新增认购。")}</p>` : ""}
      <div class="iv-product-metrics"><div class="iv-yield"><small>${t("Projected net annualized return", "预计净年化收益")}</small><strong>${rate}</strong><span>${t("Model estimate · variable return", "模型测算 · 收益浮动")}</span></div><div><small>${t("Fundraising target", "募集目标")}</small><strong>${money(p.targetUSDC6)} <em>USDC</em></strong></div><div><small>${t("Rights term", "收益权期限")}</small><strong>${t("5 years", "5 年")}</strong></div><div><small>${t("Distribution cycle", "分配周期")}</small><strong>${t(Number(p.distributionIntervalMonths||3)===1?"Monthly":"Quarterly",Number(p.distributionIntervalMonths||3)===1?"每月":"每季度")}</strong></div></div>
      <div class="iv-funding"><span>${t("Subscribed", "已认购")} ${money(p.subscriptionsUSDC6)} / ${money(p.targetUSDC6)} USDC</span><span>${p.phase === 1 ? date(p.deadline) : t(...phaseNames[p.phase])}</span></div><div class="progress-bar"><div class="fill" style="width:${target > 0 ? Math.min(100, subscribed * 100 / target) : 0}%"></div></div>
      <footer><p>${t("No fixed coupon or principal guarantee. Select this product before applying for qualification and claiming demo funds.", "无固定票息或本金保证。先选择本产品，再申请投资资格并领取本产品的测试资金。")}</p><div class="iv-actions"><button class="btn btn-outline" data-product-vault="${esc(p.vault)}" data-product-target="pool_detail">${t("View details", "查看详情")} →</button><button class="btn btn-primary" data-product-vault="${esc(p.vault)}" data-product-target="${p.phase === 1 ? "subscribe" : "position"}">${p.phase === 1 ? p.subscriptionReviewRequired === false ? t("Original orders", "查看原订单") : t("Subscribe", "前往认购") : t("My holdings", "我的持仓")} →</button></div></footer></article>`;
    }).join("") : `<div class="iv-empty">${t("No matching published products.", "暂无匹配的已发布产品。")}</div>`);
}
function investorPoolDetails() {
  const m = productModel();
  if (
    !(state.products || []).some(
      (p) => p.vault === state.manifest.addresses.vault
    )
  )
    return (
      investorHead(
        t("Product not published", "产品尚未发布"),
        t(
          "This scenario has no published investment product yet.",
          "当前场景尚无已发布的投资产品。"
        )
      ) +
      `<div class="iv-empty">${investorLink(
        t("Back to product hall", "返回产品大厅"),
        "product_hall"
      )}</div>`
    );
  const assets = m.pooled.map((a) => {
    const station = state.stations.find((s) => s.id === a.stationId);
    const report = state.valuations.find(
      (v) => v.reportHash === state.activeReports[a.stationId]
    );
    return [
      `<strong>${esc(stationName(a.stationId))}</strong><p>${esc(
        station?.sourceId || ""
      )}</p>`,
      `${a.assumptions.shareBps / 100}% / ${a.assumptions.termMonths} ${t(
        "months",
        "个月"
      )}`,
      money(a.priceUSDC6) + " USDC",
      report ? money(report.rightsValueUSDC6) + " USDC" : "—",
      tag(station ? sourceLabel(station.source) : "—"),
      `<button class="btn btn-outline" data-wf-station="${esc(
        a.stationId
      )}">${t("Station data", "电站数据")} →</button>`,
    ];
  });
  return (
    investorHead(
      state.selectedProduct ? esc(state.selectedProduct.title[lang]) : t("Pool details · Series 01", "资产池详情 · 第一期"),
      t(
        "Underlying station rights, approved valuation and cashflow mechanics for this product.",
        "本产品的底层电站收益权、批准估值与现金流分配规则。"
      )
    ) +
    `<div class="iv-actions iv-toolbar">${investorLink(
      t("All products", "返回产品大厅"),
      "product_hall"
    )}${investorLink(
      t("Subscription & order", "认购与订单"),
      "subscribe",
      true
    )}</div>` +
    `<div class="metric-row">${metric(
      t("Admitted stations", "入池电站"),
      m.pooled.length
    )}${metric(
      t("Rights purchase cost", "收益权购买成本"),
      money(String(m.purchase)),
      "USDC"
    )}${metric(
      t("Approved remaining rights PV", "已批准剩余收益权现值"),
      money(m.c.rightsPV),
      "USDC"
    )}${metric(
      t("Valuation status", "估值状态"),
      m.approved
        ? t("Approved", "有效且已批准")
        : t("Update required", "待更新 / 审批")
    )}</div>` +
    card(
      t("Underlying assets", "底层资产清单"),
      assets.length
        ? table(
            [
              t("Station", "电站"),
              t("Share / term", "分成 / 期限"),
              t("Agreed purchase price", "协议购买价"),
              t("Remaining rights value", "剩余收益权价值"),
              t("Data source", "数据来源"),
              t("Evidence", "证据"),
            ],
            assets
          )
        : `<p class="blank">${t(
            "No rights admitted yet. The intermediary must complete custody before publication.",
            "尚无入池收益权，中介机构完成托管后才能发行。"
          )}</p>`
    ) +
    productReturnPanel(true) +
    card(
      t("Cashflow and investor protection rules", "现金流与投资者权益规则"),
      `<div class="iv-rule-grid"><div><h3>${t(
        "Cash distributions",
        "现金分配"
      )}</h3><p>${t(
        "After fees and six months of mandatory expense protection, 75% of surplus receipts is distributed at the product’s stated interval; 25% supports redemptions.",
        "按本产品展示的分配周期，扣除费用并保护六个月必需支出后，将剩余回款的75%用于分配、25%用于赎回流动性。"
      )}</p></div><div><h3>${t(
        "Subscription and exit",
        "认购与退出"
      )}</h3><p>${t(
        "No cooling period. Orders require intermediary review and pool settlement. Refunds are available before settlement. After a six-month lock, peer transfers or quarterly redemption requests; 30-day notice and a 5% NAV liquidity gate apply.",
        "认购无冷静期，中介可立即审核，统一结算前可全额退款。六个月锁定后可协商转让或申请季度赎回，赎回须提前30天通知并受净值5%额度和流动性限制。"
      )}</p></div></div><p class="iv-caption">${t(
        "Valuation cutoff / valid until (UTC)",
        "估值基准日 / 有效期（UTC）"
      )}: ${date(m.c.valuationAsOf)} / ${date(
        m.c.valuationValidUntil
      )}</p><details><summary>${t(
        "Approved valuation and contract references",
        "已批准估值与合约凭证"
      )}</summary><p class="mono">${esc(
        m.c.valuationReport
      )}</p><p class="mono">${esc(
        state.manifest.addresses.vault
      )}</p></details>`
    )
  );
}
function investorWalletFunds() {
  const a = state.accounts[actor];
  if (!a) return "";
  const explorer = state.network?.explorerUrl || networkConfig?.explorerUrl;
  const token = state.manifest.addresses.usdc;
  const link = (path, label) =>
    explorer
      ? `<a class="btn btn-outline" href="${esc(
          explorer + path
        )}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`
      : "";
  const native =
    a.nativeBalanceWei === undefined
      ? "—"
      : (Number(a.nativeBalanceWei) / 1e18).toLocaleString(
          lang === "zh" ? "zh-CN" : "en-US",
          { maximumFractionDigits: 6 }
        );
  return card(
    t("Wallet funds", "钱包可用资金"),
    `<div class="iv-section-line"><span class="mono">${esc(
      a.address
    )}</span>${tag(t("On-chain balance", "链上余额"), "normal")}</div>
    <div class="iv-facts"><div><small>${t(
      "Available test USDC",
      "可用测试 USDC"
    )}</small><b>${money(a.usdc)} mUSDC</b></div>
    <div><small>${t("Gas balance", "Gas 测试币余额")}</small><b>${native} ${esc(
      networkConfig?.nativeCurrency?.symbol || "ETH"
    )}</b></div></div>
    <p>${t(
      "Faucet funds are available in your wallet. They become an escrow subscription only after you submit a subscription order; shares are issued at settlement.",
      "领取的测试资金保存在钱包中。提交认购后才计入托管金额，发行结算后才获得投资份额。"
    )}</p>
    <div class="iv-actions">${
      networkConfig?.walletRequired
        ? `<button class="btn btn-outline" id="wallet-funds-refresh">${t(
            "Refresh balances",
            "刷新余额"
          )}</button><button class="btn btn-outline" id="wallet-import-usdc">${t(
            "Show mUSDC in MetaMask",
            "在 MetaMask 中显示 mUSDC"
          )}</button>`
        : ""
    }
    ${link("/address/" + a.address, t("View wallet", "查看链上钱包"))}
    ${
      a.faucetClaim?.usdcHash
        ? link(
            "/tx/" + a.faucetClaim.usdcHash,
            t("USDC funding receipt", "USDC 到账交易")
          )
        : ""
    }</div>
    ${
      token
        ? `<p class="iv-caption">${t(
            "Current test USDC contract",
            "当前测试 USDC 合约"
          )} <span class="mono">${esc(token)}</span></p>`
        : ""
    }`
  );
}
function investorOrder() {
  const a = state.accounts[actor],
    m = productModel(),
    view = productSubscriptionState(a);
  const paid = view.amount !== "0",
    settled = [2, 4].includes(m.phase) && paid;
  const title = settled
    ? t("Settled · shares issued", "已结算 · 份额已发行")
    : paid
    ? m.phase === 3 ? t("Refund available", "可领取全额退款")
      : m.c.subscriptionReviewRequired ? a.subscription.approved
        ? t("Approved · awaiting pool settlement", "已审核通过 · 等待统一结算")
        : t("Submitted · awaiting intermediary review", "已下单 · 等待中介审核")
      : t("Legacy order · original terms apply", "旧版订单 · 按原条款处理")
    : t("No subscription order", "尚无认购订单");
  return card(
    t("My subscription order", "我的认购订单"),
    `<div class="iv-section-line"><strong>${title}</strong>${tag(
      investorLabel(actor)
    )}</div><div class="iv-facts"><div><small>${t(
      "Cumulative escrowed / settled amount",
      "累计托管 / 已结算金额"
    )}</small><b>${money(view.amount)} USDC</b></div><div><small>${t(
      "Latest subscription (UTC)",
      "最近认购时间（UTC）"
    )}</small><b>${
      paid ? date(a.subscription.submittedAt || a.subscription.coolingEnd) : "—"
    }</b></div><div><small>${t(
      "Issued shares",
      "已发行份额"
    )}</small><b>${money(a.economicShares)} DRS</b></div></div><p>${
      settled
        ? t(
            "Shares have been issued and the household purchase has been paid. Review balances and claims in My holdings.",
            "份额已发行，业主购买款已支付。请到我的持仓查看余额及可领取分配。"
          )
        : paid && m.phase === 3
        ? t("This campaign has ended. Your original payment remains in escrow and can be claimed in full with the refund button.", "本次募集已停止。原认购款仍保存在托管合约中，请点击退款按钮全额领取。")
        : paid && !m.c.subscriptionReviewRequired
        ? t("This is an earlier contract. Its original refund terms remain in effect; use the current product for immediate intermediary review.", "这是旧版合约，退款仍按原条款执行。需要即时审核时，请进入新版产品重新认购。")
        : paid
        ? t(
            "Your payment is in escrow. The intermediary can review it immediately. Shares are issued only when approved orders and pool funding meet settlement conditions. You may cancel for a full refund before settlement.",
            "资金已托管，中介可以立即审核。全部订单审核通过且满足募集、购买款和留存条件后，统一结算并发行份额。结算前可以取消认购并全额退款。"
          )
        : t(
            "Complete qualification and submit an amount below. The order and refund entry will appear here.",
            "完成投资资格后，在下方填写金额认购；订单和退款入口将显示在这里。"
          )
    }</p><div class="iv-actions">${paid && m.phase === 1 && m.c.subscriptionTopUpsAllowed ? `<button type="button" class="btn btn-primary" data-investor-add>${t("Continue adding to my subscription", "继续追加认购")} →</button>` : ""}${
      view.canRefund
        ? button("refund", t("Refund the full cumulative subscription", "退回全部累计认购款"))
        : ""
    }${
      settled
        ? investorLink(t("View my holdings", "查看我的持仓"), "position", true)
        : paid && m.phase === 1
        ? productNav(
            t("Demo: intermediary settlement", "演示：前往中介结算"),
            "agent",
            "agent_product"
          )
        : ""
    }</div>${m.c.subscriptionTopUpsAllowed && paid && m.phase === 1 ? `<p class="notice-bar blue">${t("You may keep adding while fundraising is open and capacity remains. Each addition increases cumulative escrow, changes its review version and requires intermediary approval of the updated total. A refund or rejection returns the full cumulative amount.", "募集开放且额度未满时可以继续追加。每次追加都会增加累计托管金额、更新审核版本，并由中介重新审核最新总额。退款或审核不通过时退回全部累计金额。")}</p>` : ""}${(a.subscription.history || []).length ? `<details class="iv-subscription-history"><summary>${t("Subscription and refund records", "认购与退款记录")} · ${a.subscription.history.length}</summary>${table([t("Operation", "操作"), t("Amount", "金额"), t("Time (UTC)", "时间（UTC）"), t("Transaction", "交易")],a.subscription.history.map(item=>[item.kind === "refund" ? t("Full refund", "全额退款") : t("Subscription payment", "本次认购付款"), money(item.amountUSDC6)+" USDC", date(item.at), `<a href="${esc(networkConfig?.explorerUrl || state.network?.explorerUrl || "")}/tx/${esc(item.hash)}" target="_blank" rel="noopener">${esc(item.hash.slice(0,12))}… ↗</a>`]))}</details>` : ""}`
  );
}
function investorSubscribe() {
  const a = state.accounts[actor],
    view = productSubscriptionState(a),
    m = productModel();
  return (
    investorHead(
      t("Subscribe · Series 01", "认购 · 第一期"),
      t(
        "Qualification → escrow subscription → intermediary review → settlement → shares",
        "投资资格 → 托管认购 → 中介审核 → 募集结算 → 获得份额"
      )
    ) +
    investorWalletFunds() +
    investorEligibilityBanner() +
    investorOrder() +
    ((view.amount !== "0" && !m.c.subscriptionTopUpsAllowed) || m.phase >= 2
      ? ""
      : card(
          view.amount !== "0" ? t("Add to my subscription", "追加认购") : t("Place a subscription", "提交认购订单"),
          `${productSettlementHelp(m,{investor:true,canSubscribe:view.canSubscribe})}<div class="iv-facts"><div><small>${t(
            "Issuance price",
            "发行价格"
          )}</small><b>1.00 USDC / DRS</b></div><div><small>${t(
            "Remaining allocation",
            "剩余认购额度"
          )}</small><b>${money(view.remaining)} USDC</b></div><div><small>${t(
            "Deadline (UTC)",
            "募集截止（UTC）"
          )}</small><b>${date(m.c.deadline)}</b></div></div>${productChecks(
            view.checks
          )}${
            !m.approved || m.phase === 0
              ? productNav(
                  t(
                    "Demo: resolve publication / valuation",
                    "演示：处理发行 / 估值条件"
                  ),
                  "agent",
                  "agent_product"
                )
              : ""
          }${form(
            "subscribe",
            view.amount !== "0" ? t("Confirm additional payment", "确认追加认购") : t("Confirm escrow subscription", "确认认购并托管资金"),
            input(
              "amountUSDC6",
              view.amount !== "0" ? t("Additional amount (USDC)", "本次追加金额（USDC）") : t("Subscription amount (USDC)", "认购金额（USDC）"),
              view.amount !== "0" ? "" : view.remaining,
              "number",
              `min=1 required ${
                view.remaining ? `max="${Number(view.remaining) / 1e6}"` : ""
              }`
            ),
            {},
            !view.canSubscribe
          )}<p>${t(
            "Use the demo faucet if needed. Only the entered additional amount is charged. Existing escrow is not charged again. Each addition requires review of the updated total; the full cumulative amount can be refunded before settlement.",
            "钱包余额不足时，请先领取测试资金。每次只支付本次输入的新增金额，不重复支付已有托管款。追加成功后须重新审核累计金额，结算前可退回全部认购款。"
          )}</p>${
            networkConfig?.walletRequired
              ? `<p>${esc(networkConfig.chainName)} · Chain ID ${esc(
                  networkConfig.chainId
                )} · ${t(
                  "Sign with your connected wallet.",
                  "使用当前连接的钱包签名。"
                )}</p>`
              : `<details><summary>${t(
                  "Wallet signing options",
                  "钱包签名选项"
                )}</summary><label class="checkline"><input id="wallet-mode" type="checkbox" ${
                  sessionStorage.getItem("revenue.wallet") === "true"
                    ? "checked"
                    : ""
                }>${t(
                  "Use MetaMask with this local role account",
                  "使用 MetaMask 签名（须为当前本地角色账户）"
                )}</label><p class="mono">${esc(a.address)}</p><p>${t(
                  "Network: local Hardhat 31337. A rejected wallet request does not submit the subscription.",
                  "网络：本地 Hardhat 31337。拒绝钱包签名不会提交认购。"
                )}</p></details>`
          }`
        )) +
    productReturnPanel(true)
  );
}
function investorOperations() {
  const m=productModel(),o=m.operations,c=m.c,a=state.accounts[actor];
  if(m.phase!==2&&m.phase!==4)return '';
  const claims=(a.claims||[]).reduce((sum,r)=>sum+productAmount(r.amountUSDC6),0n);
  const next=claims>0n?{action:'claim',role:'investor',title:t('Claim your declared distribution below','在下方领取已宣告分配')}:o.next,who=next?.role==='investor'?t('Investor (you)','投资者（你）'):next?.role==='trustee'?t('Trustee','受托管理人'):t('Intermediary','中介机构');
  const status=m.approved?t('Approved','已批准'):m.proposalOutdated?t('Financial changes require a new report','账务变化后须重新编制'):m.proposalCanApprove?t('Awaiting trustee approval','待受托人审批'):t('Awaiting an updated valuation','待中介更新估值');
  const missing=m.unbookedPeriods.length;
  const paid=(a.claims||[]).reduce((sum,r)=>sum+productAmount(r.paidUSDC6),0n);
  const claimStatus=claims>0n?t('Your declared cash is ready to claim below.','已宣告的款项可在下方领取。'):next?.action==='approve-valuation'?t('The current valuation is awaiting trustee approval. The intermediary must then declare an eligible distribution before new claimable cash appears.','本期估值正在等待受托人批准。批准后，中介仍须宣告符合条件的分配，才会产生新的可领取金额。'):next?.action==='prepare-valuation'?t('The intermediary must reconcile the current period and prepare its valuation, followed by trustee approval and an eligible distribution declaration. New collections are not yet a personal payout.','中介须先完成本期对账并编制估值，再由受托人批准和中介宣告符合条件的分配。新收到的回款目前还不是个人可领取款项。'):t('No declared cash remains unpaid. Follow the next handling step below for the current period.','当前没有尚未领取的已宣告款项。本期流程请查看下方的处理人和下一步。');

  const receiptProof=r=>{const op=(state.operations||[]).filter(o=>o.action==='collect-revenue'&&o.body?.incomeId===r.id&&o.status==='confirmed').at(-1);const tx=op?.steps?.receive;return tx?.status==='mined'&&networkConfig?.explorerUrl?`<a href="${esc(networkConfig.explorerUrl)}/tx/${esc(tx.hash)}" target="_blank" rel="noopener">${t('View collection transaction','查看回款交易')} ↗</a>`:productAmount(r.amountUSDC6)===0n?t('Zero income; no collection transfer','本期零收入，无收款交易'):t('No confirmed receipt linked','暂无关联确认回执');};
  return `<section class="card iv-operations" data-investor-operations><header><div><small>${t('CONFIRMED COLLECTIONS · YOUR ENTITLEMENT','已确认回款 · 个人领取权')}</small><h2>${t('Collections and distribution progress','回款与分配进度')}</h2></div><span>${t('Financial clock (UTC)','财务时钟（UTC）')} ${date(state.financialTime)}</span></header>
    <div class="iv-operation-metrics">${metric(t('Pool cash collected','资产池累计已归集'),money(o.collected),'USDC')}${metric(t('Pool receivables outstanding','资产池待收应收款'),money(o.outstanding),'USDC')}${metric(t('Your cash available to claim','你当前可领取'),money(claims),'USDC')}${metric(t('Your distributions received','你累计已领取分配'),money(a.performance.cashDistributionsUSDC6),'USDC')}</div>
    <p class="notice-bar" data-personal-distribution-status>${claims===0n&&paid>0n?t('Your earlier distributions have been fully claimed. ','此前分配已全部领取。'):''}${claimStatus}</p>
    <p>${t('Pool collections belong to all holders collectively. They become your claimable cash only after costs, reserve protection and a distribution declaration. A stale NAV does not erase confirmed collections.','资产池回款属于全体持有人，须扣除费用、保留保护储备并宣告分配后，才形成你的个人领取权。净值待更新不会抹去已确认回款。')}</p><p>${t('In this demo, collections are paid by a system test account. They are recorded separately from station API observations.','本演示的回款由系统测试账户支付，与电站 API 观测数据分开记录。')}</p>
    <ol class="iv-operation-stages"><li><b>${t('1. Monthly billing and collection','1. 月度账单与归集')}</b><span>${t(`${o.completedServiceMonths} service months ended; ${o.collectedCount} station-period records collected.`,`${o.completedServiceMonths} 个服务月份已结束，${o.collectedCount} 笔电站月度回款已归集。`)}${missing?t(` ${missing} station-period bills remain to be recorded.`,` 另有 ${missing} 笔月度账单待登记。`):''}</span></li><li><b>${t('2. Fees and NAV review','2. 费用与净值审批')}</b><span>${t(`${o.feeMonths} monthly fee periods accrued. Valuation status: ${status}.`,`已计提 ${o.feeMonths} 期月费。估值状态为${status}。`)}</span></li><li><b>${distributionText('3. Quarterly declaration','3. 季度分配宣告','3. Monthly declaration','3. 月度分配宣告')}</b><span>${t(`${o.distributionCount} distributions declared.`, `已宣告 ${o.distributionCount} 次分配。`)} ${m.phase===2?t('Next scheduled date ','下一计划分配日为 ')+date(o.nextDistributionAt)+' UTC。':t('The product is closed.','产品已关闭。')}</span></li><li><b>${t('4. Investor claim','4. 投资者领取')}</b><span>${claims>0n?t('Your entitlement is ready. Use the claim button in the distribution table below.','你的领取权已经形成，请点击下方分配明细中的「领取」。'):t('No unpaid entitlement is currently available. See the handling participant and next action below.','当前没有待领取款项，请查看下方处理人及下一步操作。')}</span></li></ol>
    ${next?`<div class="iv-operation-next" data-investor-next-step><strong>${t('Next handler','下一位处理人')} · ${who}</strong><p>${esc(next.title)}${next.waitDate>m.now?' · '+date(next.waitDate)+' UTC':''}。</p><p>${next.waitDate>m.now?t('The next month has not ended. The intermediary can inspect the monthly cutoff and, in this local demo, explicitly advance the shared financial clock after reconciling the current period.','下一服务月份尚未结束。中介可以查看月度截止日；本地演示中，须先核对本期账务，再明确确认推进共享财务时间。'):next.action==='prepare-valuation'?t('The intermediary must include current receipts, receivables and fees in a new report, then ask the trustee to approve it.','中介须将最新回款、应收款和费用纳入新报告，再交受托人审批。'):next.action==='approve-valuation'?t('The trustee reviews the prepared report. After approval, the intermediary continues the monthly operation.','受托人核对已编制报告。审批完成后，由中介继续月度运营。'):t('Complete this operation before continuing the next monthly step.','请由处理人完成此操作后，再继续下一项月度任务。')}</p>${networkConfig?.guidanceEnabled?`<button type="button" class="btn btn-outline" data-guide-next-operation>${t('Locate the next handling step','定位下一处理步骤')} →</button>`:''}</div>`:''}
    ${state.income?.length?`<details class="iv-receipt-details"><summary>${t('View each confirmed monthly record','查看各期收款与费用明细')}</summary>${table([t('Service period','服务期'),t('Station','电站'),t('Assigned cashflow (USDC)','受让现金流（USDC）'),t('Collection','归集状态'),t('Monthly fee','月费计提'),t('Receipt evidence','回款凭证')],state.income.map(r=>[String(r.period),esc(stationName(r.stationId)),money(r.amountUSDC6),r.collected?t('Collected into pool','已进入资产池'):t('Receivable outstanding','待收款'),Number(r.period)<=o.feeMonths?t('Accrued','已计提'):t('Not accrued','未计提'),receiptProof(r)]))}</details>`:''}</section>`;
}
function investorPosition() {
  const a = state.accounts[actor];
  return (
    investorHead(
      t("My holdings", "我的持仓"),
      t(
        "Confirmed balances, cash distributions and account returns are shown separately.",
        "分别查看已确认份额、现金分配和账户投资回报。"
      )
    ) +
    investorWalletFunds() +
    investorOperations() +
    (productAmount(a.economicShares) === 0n &&
    productAmount(a.performance.investedUSDC6) === 0n
      ? investorOrder() +
        `<div class="iv-empty"><h3>${t(
          "No issued holdings yet",
          "暂无已发行持仓"
        )}</h3><p>${t(
          "Escrow subscriptions become holdings only after settlement.",
          "认购托管资金在成功结算后才转换为持仓。"
        )}</p>${investorLink(
          t("Browse products", "浏览产品"),
          "product_hall"
        )}${investorLink(
          t("Subscription & order", "认购与订单"),
          "subscribe",
          true
        )}</div>`
      : holdings() +
        `<div class="iv-actions">${investorLink(
          t("Transfers & exits", "查看转让与退出"),
          "bond_transfer"
        )}${investorLink(
          t("Underlying assets", "查看底层资产"),
          "pool_detail"
        )}</div>` +
        (state.cases.length
          ? card(t("Servicing votes", "服务事件投票"), cases())
          : ""))
  );
}
function investorExitState() {
  const a = state.accounts[actor],
    c = state.chain,
    now = state.financialTime;
  const active = Number(c.phase) === 2 && now < Number(c.expiresAt);
  const unlocked = active && now >= Number(c.unlockedAt);
  const shares = productAmount(a.shares),
    pending = productAmount(a.redemption.shares);
  const ready = unlocked && a.eligible && shares > 0n;
  const eligibleCounterparties = investorActors().filter(
    (who) => who !== actor && state.accounts[who]?.eligible
  );
  return {
    a,
    c,
    shares,
    pending,
    unlocked,
    ready,
    eligibleCounterparties,
    canTransfer:
      ready && productModel().approved && eligibleCounterparties.length > 0,
    canRequest: ready && pending === 0n && now < Number(c.redemptionCutoff),
    canCancel:
      pending > 0n &&
      (now < Number(c.redemptionCutoff) || Number(c.phase) === 4),
  };
}
function investorExits() {
  const m = investorExitState(),
    { a, c } = m;
  return (
    investorHead(
      t("Transfers & exits", "份额转让与退出"),
      t(
        "Peer sales exchange tokens for negotiated cash. Vault redemptions use scheduled windows and liquidity limits.",
        "协商转让由买方支付对价；资金池赎回按窗口、净值与可用流动性执行。"
      )
    ) +
    `<div class="iv-notice"><div><strong>${
      m.unlocked
        ? t("Transfer lock ended", "转让锁定期已结束")
        : t("Exit is not yet available", "暂未达到退出条件")
    }</strong><p>${
      Number(c.settledAt)
        ? t("Unlocks (UTC): ", "解锁时间（UTC）：") + date(c.unlockedAt)
        : t(
            "The six-month lock starts at successful product settlement.",
            "六个月锁定期自产品成功结算起算。"
          )
    }</p></div>${investorLink(
      t("My holdings", "查看持仓"),
      "position"
    )}</div>` +
    `<div class="metric-row">${metric(
      t("Available shares", "可用份额"),
      money(a.shares),
      "DRS"
    )}${metric(
      t("Queued redemption", "排队赎回"),
      money(a.redemption.shares),
      "DRS"
    )}${metric(
      t("Reference unit NAV", "参考份额净值"),
      money(c.price),
      "USDC / DRS"
    )}${metric(
      t("Redemption liquidity", "赎回流动性"),
      money(c.redemptionCash),
      "USDC"
    )}</div>` +
    card(
      t("Propose a peer transfer", "发起协商转让"),
      `<p>${t(
        "Both parties need approved eligibility. The buyer accepts and funds the exact terms, then the seller completes atomic exchange. Price deviations above 10% require intermediary review.",
        "双方须具备投资资格；买方确认具体条款并授权付款后，由卖方完成原子交换。成交价偏离净值超过10%须中介审核。"
      )}</p>${productChecks([
        [
          m.unlocked,
          t(
            "Active product and six-month lock ended",
            "产品存续且已过六个月锁定期"
          ),
        ],
        [
          a.eligible && m.eligibleCounterparties.length > 0,
          t("Both investors eligible", "双方投资资格有效"),
        ],
        [m.shares > 0n, t("Available shares to sell", "卖方持有可转让份额")],
        [
          productModel().approved,
          t("Approved current NAV", "参考净值有效且已批准"),
        ],
      ])}${form(
        "propose-trade",
        t("Submit transfer proposal", "提交转让条款"),
        select(
          "buyer",
          t("Buyer", "买方"),
          m.eligibleCounterparties.map((who) => [who, investorLabel(who)])
        ) +
          input(
            "sharesUSDC6",
            t("Shares (DRS)", "转让份额（DRS）"),
            "",
            "number",
            `required min=1 max="${Number(m.shares) / 1e6}"`
          ) +
          input(
            "paymentUSDC6",
            t("Agreed total payment (USDC)", "协商总价（USDC）"),
            "",
            "number",
            "required min=1"
          ),
        {},
        !m.canTransfer
      )}`
    ) +
    investorTrades() +
    card(
      t("Quarterly vault redemption", "季度资金池赎回"),
      `<div class="iv-facts"><div><small>${t(
        "Dealing date (UTC)",
        "交易日（UTC）"
      )}</small><b>${date(c.redemptionDate)}</b></div><div><small>${t(
        "Request / cancellation cutoff (UTC)",
        "申请 / 取消截止（UTC）"
      )}</small><b>${date(c.redemptionCutoff)}</b></div></div><p>${t(
        "Give 30 days' notice. Tokens remain in escrow and retain distribution rights until paid and burned. Each window is capped by available cash and 5% of NAV; unfilled requests carry forward.",
        "须提前30天通知。申请份额托管后仍享有分配权，付款时才销毁。每窗口受可用现金和净值5%双重限制，未成交部分顺延。"
      )}</p>${
        !m.canRequest
          ? `<p class="op-alert">${
              m.pending > 0n
                ? t(
                    "A request is already queued; you may cancel before cutoff.",
                    "已有赎回申请排队，可在截止前取消。"
                  )
                : t(
                    "Request entry unlocks when you hold eligible shares, the lock has ended and the next cutoff has not passed.",
                    "持有合资格份额、锁定结束且下一窗口尚未截止时开放申请。"
                  )
            }</p>`
          : ""
      }${form(
        "request-redemption",
        t("Submit redemption request", "提交赎回申请"),
        input(
          "sharesUSDC6",
          t("Redemption shares (DRS)", "申请赎回份额（DRS）"),
          "",
          "number",
          `required min=1 max="${Number(m.shares) / 1e6}"`
        ),
        {},
        !m.canRequest
      )}${form(
        "cancel-redemption",
        t("Cancel queued request", "取消排队申请"),
        "",
        {},
        !m.canCancel
      )}`
    )
  );
}
function investorTrades(review = false) {
  const rows = state.trades.filter(
    (x) => review || x.seller === actor || x.buyer === actor
  );
  if (!rows.length)
    return card(
      t("Transfer orders", "转让订单"),
      `<p class="blank">${t(
        "No transfer orders yet. Orders appear here after a seller proposes exact terms.",
        "暂无转让订单，卖方提交具体条款后将在此显示。"
      )}</p>`
    );
  return card(
    t("Transfer orders", "转让订单"),
    table(
      [
        t("Parties / terms", "双方 / 条款"),
        t("Status", "当前状态"),
        t("Next action", "下一步"),
      ],
      rows.map((x) => {
        const settled = x.settled || x.status === "settled",
          expired = state.financialTime > x.until;
        const consent =
            x.buyerConsented ??
            ["consented", "reviewed", "settled"].includes(x.status),
          approved = x.intermediaryApproved ?? x.status === "reviewed";
        const reference =
          (productAmount(x.shares) * productAmount(state.chain.price)) /
          1000000n;
        const delta =
          productAmount(x.payment) > reference
            ? productAmount(x.payment) - reference
            : reference - productAmount(x.payment);
        const reviewNeeded = reference === 0n || delta * 100n > reference * 10n;
        const status = settled
          ? t("Settled", "已结算")
          : expired
          ? t("Expired · propose new terms", "已过期 · 须重新提议")
          : !consent
          ? t("Awaiting buyer", "等待买方确认")
          : reviewNeeded && !approved
          ? t("Price review required", "等待价格审核")
          : t("Seller can settle", "等待卖方结算");
        let action = "—";
        if (!settled && !expired) {
          if (review)
            action =
              reviewNeeded && !approved
                ? button(
                    "review-trade",
                    t("Approve price deviation", "批准价格偏离"),
                    { tradeId: x.id }
                  )
                : `<button class="btn btn-outline" data-investor-return="${
                    x.seller
                  }" data-investor-destination="bond_transfer">${t(
                    "Demo: return to seller",
                    "演示：返回卖方继续结算"
                  )} →</button>`;
          else if (x.buyer === actor && !consent)
            action = form(
              "consent-trade",
              t("Buyer: fund and consent", "买方：注资并同意"),
              "",
              { tradeId: x.id },
              !state.accounts[actor].eligible
            );
          else if (x.seller === actor && consent)
            action = form(
              "settle-trade",
              t("Seller: settle atomically", "卖方：原子结算"),
              "",
              { tradeId: x.id },
              !productModel().approved || (reviewNeeded && !approved)
            );
          if (!review && reviewNeeded && !approved)
            action += productNav(
              t("Demo: price review", "演示：转让价格审核"),
              "agent",
              "agent_transfer_review"
            );
        }
        return [
          `<strong>${investorLabel(x.seller)} → ${investorLabel(
            x.buyer
          )}</strong><p>${money(x.shares)} DRS / ${money(
            x.payment
          )} USDC</p><small>${t("Expires (UTC)", "有效期（UTC）")}: ${date(
            x.until
          )}</small>`,
          tag(status, settled ? "normal" : "info"),
          action,
        ];
      })
    )
  );
}
function investorMessages() {
  const entries = (state.eligibilityApplications || []).filter(
    (r) => r.investor === actor
  );
  return (
    investorHead(
      t("Messages & receipts", "消息与凭证"),
      t(
        "Your review decisions, order status and confirmed cash claims.",
        "查看本账户的审核结果、订单进度与已确认现金凭证。"
      )
    ) +
    card(
      t("Qualification history", "资格审核记录"),
      entries.length
        ? table(
            [
              t("Submitted (UTC)", "申请时间（UTC）"),
              t("Result", "结果"),
              t("Review note", "审核意见"),
            ],
            entries
              .slice()
              .reverse()
              .map((r) => [
                date(r.submittedAt),
                t(
                  ...{
                    pending: ["Pending", "待审核"],
                    approved: ["Approved", "已通过"],
                    rejected: ["Returned / revoked", "已退回 / 撤销"],
                  }[r.status]
                ),
                esc(r.reviewNote || t("Awaiting intermediary", "等待中介处理")),
              ])
          )
        : `<p class="blank">${t(
            "No application records yet.",
            "暂无资格申请记录。"
          )}</p>`
    ) +
    (state.cases.length ? card(t("Servicing events requiring attention", "需要关注的服务事件"), `<p>${t("Review the documented incident and fixed snapshot before supporting a proposal. Ordinary forecast underperformance is not automatically a default.", "请先查看事件证据与固定持仓快照，再决定是否支持处置。普通预测未达标不自动构成违约。")}</p>${investorLink(t("Review events and snapshot vote", "查看事件并按快照表决"), "position", true)}`) : "") +
    investorOrder() +
    `<div class="iv-actions">${investorLink(
      t("View claims and balances", "查看分配与余额"),
      "position"
    )}${investorLink(
      t("Open transaction receipts", "查看链上交易凭证"),
      "transaction_log"
    )}</div>`
  );
}
document.addEventListener("submit", (e) => {
  if (!e.target.hasAttribute("data-catalog-search")) return;
  e.preventDefault();
  const data = new FormData(e.target);
  catalogQuery = String(data.get("query") || "").trim();
  catalogFilter = String(data.get("status") || "all");
  render();
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.hasAttribute("data-investor-funding-fill")) {
    const m=productModel(),view=productSubscriptionState(state.accounts[actor]);
    if(!view.canSubscribe||m.phase!==1||m.funding.shortfall<=0n||m.funding.shortfall>m.funding.capacity)return;
    const field=document.querySelector('form[data-action="subscribe"] [name="amountUSDC6"]');
    if(field){field.value=productExactUSDC6(m.funding.shortfall);field.dispatchEvent(new Event("input",{bubbles:true}));field.scrollIntoView({behavior:"instant",block:"center"});field.focus({preventScroll:true});}
    return;
  }
  if (b.hasAttribute("data-investor-add")) {
    if (page !== "subscribe") { page = "subscribe"; render(); }
    const form = document.querySelector('form[data-action="subscribe"]');
    form?.scrollIntoView({behavior:"instant",block:"center"});
    form?.querySelector('[name="amountUSDC6"]')?.focus({preventScroll:true});
    return;
  }
  if (b.dataset.operationFocus === "op-issuance") {
    document
      .querySelector("#op-issuance")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (b.dataset.investorReview) {
    investorReview = b.dataset.investorReview;
    render();
  }
  if (b.dataset.investorReturn) {
    try {
      if (await setRole("investor", b.dataset.investorReturn, {page:b.dataset.investorDestination === "bond_transfer" ? "bond_transfer" : "investor_eligibility"}) === false) return;
      page =
        b.dataset.investorDestination === "bond_transfer"
          ? "bond_transfer"
          : "investor_eligibility";
      render();
      document.querySelector("#main").scrollTop = 0;
    } catch (error) {
      feedback(error.message, true);
    }
  }
});
