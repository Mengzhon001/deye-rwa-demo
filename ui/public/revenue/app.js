function appStorageKey(k) { return globalThis.RevenueNetworks?.storageKey(k) || k; }
function walletProvider() { return window.RoleLogin ? window.RoleLogin.provider() : window.ethereum; }
"use strict";
let lang = localStorage.getItem("revenue.lang") || "zh",
  role = localStorage.getItem(appStorageKey("revenue.role")) || "investor",
  actor = localStorage.getItem(appStorageKey("revenue.actor")) || role,
  page = localStorage.getItem(appStorageKey("revenue.page")) || "product_hall",
  state,
  networkConfig,
  walletSession,
  walletWorkspaceLoad;
let selectedProduct = sessionStorage.getItem(appStorageKey("revenue.selected-product")) || "";
function productTitle() { return state?.selectedProduct?.title?.[lang] || t("Solar revenue rights", "光伏收益权"); }
function productMigrationNotice() {
  const legacy = state.chain.subscriptionReviewRequired === false;
  if (role !== "investor") {
    const next = legacy && state.productOptions?.slice().reverse().find(p => p.phase === 0 && p.subscriptionReviewRequired);
    return next ? `<div class="notice-bar blue">${t("This is an earlier draft. Use the new issuance draft for immediate subscription review.", "当前为旧版发行草稿。请使用新版发行草稿，后续认购无需冷静期。保留旧草稿不会转移资金或修改历史交易。")} <button class="btn btn-primary" data-product-vault="${esc(next.vault)}" data-product-target="${nav[role][0][0]}">${t("Open new issuance", "进入新版发行草稿")} →</button></div>` : "";
  }
  const refunds = (state.otherSubscriptions || []).map(p => `<p>${t("Withdrawn subscription", "已撤销认购")} · ${money(p.amountUSDC6)} USDC ${p.canRefund ? t("can be refunded in full using the original investor wallet.", "可用原认购钱包全额退款。") : t("remains in its original contract, subject to its original refund terms.", "保留在原合约中，退款仍按原条款执行。")} <button class="btn btn-outline" data-product-vault="${esc(p.vault)}" data-product-target="subscribe">${t("View original order", "查看原订单")} →</button></p>`).join("");
  const next = legacy && state.products?.find(p => p.phase === 1 && p.subscriptionReviewRequired && p.kind === "experience");
  return (refunds || next) ? `<div class="notice-bar blue">${refunds}${next ? `<p>${t("The current demo product has no cooling period. Your old order is preserved separately.", "新版体验产品已取消冷静期。旧订单单独保留，不会自动迁移或重复扣款。")} <button class="btn btn-primary" data-product-vault="${esc(next.vault)}" data-product-target="subscribe">${t("Open current product", "进入新版产品")} →</button></p>` : ""}</div>` : "";
}
function retiredRefundView() {
  const amount = state.accounts[actor]?.subscription.amount || "0";
  const current = state.products?.find(p => [1,2].includes(p.phase));
  return card(t("Subscription refund", "认购退款"),`<p>${t("This subscription campaign was withdrawn. Claim the original payment with your wallet; it is not transferred to a new product.", "原认购已撤销，请用原认购钱包领取全额退款。原款不会自动转入新的产品。")}</p><h2>${money(amount)} USDC</h2>${BigInt(amount)>0n && Number(state.chain.phase)===3 ? button("refund",t("Claim full refund", "领取全额退款")) : `<p>${t("No refund is outstanding for this wallet.", "当前钱包没有待领取退款。")}</p>`}${current ? `<button class="btn btn-outline" data-product-vault="${esc(current.vault)}" data-product-target="product_hall">${t("Return to current product", "返回当前产品")} →</button>` : ""}`);
}
async function switchProduct(vault, target) {
  if (sessionStorage.getItem(appStorageKey("revenue.pending"))) throw new Error(t("Resolve the pending wallet operation before changing products", "请先处理待确认钱包操作，再切换产品"));
  selectedProduct = vault;
  sessionStorage.setItem(appStorageKey("revenue.selected-product"), vault);
  if (target) page = target;
  await refresh();
}
const t = (en, zh) => (lang === "zh" ? zh : en);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
const money = (v) =>
  (Number(v || 0) / 1e6).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const date = (v) =>
  Number(v) > 0
    ? new Date(Number(v) * 1000).toLocaleString(
        lang === "zh" ? "zh-CN" : "en-GB",
        { timeZone: "UTC" }
      )
    : "—";
const names = {
  owner: ["Household", "业主"],
  agent: ["Intermediary", "中介机构"],
  investor: ["Investor", "投资者"],
  trustee: ["Trustee", "受托管理人"],
};
const walletChainActions = new Set([
  "admit",
  "mint-station",
  "custody-consent",
  "prepare-valuation",
  "approve-valuation",
  "publish",
  "eligible",
  "subscribe",
  "review-subscription",
  "refund",
  "settle",
  "fail",
  "release-station",
  "accrue-fee",
  "book-revenue",
  "publish-household-bill",
  "pay-household-bill",
  "confirm-receipt",
  "distribute",
  "claim",
  "request-redemption",
  "cancel-redemption",
  "carry-window",
  "process-redemptions",
  "consent-trade",
  "review-trade",
  "settle-trade",
  "open-case",
  "support-case",
  "approve-case",
  "close",
]);
const nav = {
  investor: [
    ["product_hall", "Product hall", "产品大厅"],
    ["pool_detail", "Pool details", "资产池详情"],
    ["investor_eligibility", "Investor qualification", "投资资格"],
    ["subscribe", "Subscribe", "认购"],
    ["position", "My holdings", "我的持仓"],
    ["bond_transfer", "Transfers & exits", "份额转让与退出"],
    ["station_transparent", "Station transparency", "电站透明化"],
    ["message_center", "Messages & receipts", "消息与凭证"],
  ],
  owner: [
    ["owner_kyc", "Household profile", "业主认证"],
    ["owner_stations", "My stations", "我的电站"],
    ["owner_station_detail", "Station details", "电站详情"],
    ["owner_apply", "Rights application", "收益权申请"],
    ["owner_agreement", "Offers & agreements", "报价与协议"],
    ["owner_funds", "Funds & monthly bills", "资金与月度缴费"],
  ],
  agent: [
    ["agent_apply_review", "Application review", "申请审核"],
    ["agent_financing", "Offers & valuation", "报价与估值"],
    ["agent_pool", "Pool management", "资产池管理"],
    ["agent_product", "Product operations", "产品运营"],
    ["agent_transfer_review", "Transfer review", "转让审核"],
    ["agent_kyc_review", "Investor eligibility", "投资者资格审核"],
    ["agent_monitor", "Monitoring & evidence", "监控与证据"],
  ],
  trustee: [
    ["trustee_events", "Review queue", "审核队列"],
    ["trustee_review", "Servicing cases", "服务事件审核"],
  ],
};
const phaseNames = [
  ["Draft", "草案"],
  ["Fundraising", "募集中"],
  ["Active", "存续中"],
  ["Failed", "募集失败"],
  ["Closed", "已结束"],
];
const statuses = {
  submitted: ["Submitted", "已提交"],
  supplement: ["Supplement required", "待补充"],
  rejected: ["Rejected", "已拒绝"],
  approved: ["Assessed", "已评估"],
  offered: ["Offer prepared", "报价待审批"],
  accepted: ["Accepted", "已接受"],
  signed: ["Agreement signed", "协议已签署"],
  pooled: ["Admitted", "已入池"],
};
const tag = (text, kind = "info") =>
  `<span class="tag tag-${kind}">${esc(text)}</span>`;
const card = (title, body) =>
  `<section class="card"><h2 class="card-title">${esc(
    title
  )}</h2>${body}</section>`;
const detail = (title, data) =>
  `<details><summary>${esc(title)}</summary><pre>${esc(
    JSON.stringify(data, null, 2)
  )}</pre></details>`;
const metric = (label, value, sub = "") =>
  `<div class="metric-card"><div class="label">${esc(
    label
  )}</div><div class="value">${esc(value)}</div><div class="sub">${esc(
    sub
  )}</div></div>`;
const empty = () =>
  `<p class="blank">${t(
    "No records yet. Follow the role workflow to create them.",
    "暂无记录。请按角色流程创建记录。"
  )}</p>`;
const unitFields = ["amountUSDC6", "priceUSDC6", "sharesUSDC6", "paymentUSDC6"];
const toUnits = (value) => {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value))
    throw new Error(
      t(
        "Use a positive amount with at most six decimals",
        "请使用最多六位小数的正数"
      )
    );
  const [whole, part = ""] = value.split(".");
  return (BigInt(whole) * 1000000n + BigInt(part.padEnd(6, "0"))).toString();
};
const input = (name, label, value = "", type = "text", extra = "") => {
  const currency = unitFields.includes(name);
  if (currency) {
    value = value === "" ? "" : (Number(value) / 1e6).toFixed(6);
    type = "number";
    extra = extra.replace("min=1", "min=0.000001") + ' step="0.000001"';
  }
  return `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(
    value
  )}" ${extra}></label>`;
};
const select = (name, label, options, selected) =>
  `<label>${esc(label)}<select name="${name}">${options
    .map(
      ([value, label]) =>
        `<option value="${esc(value)}" ${
          value === selected ? "selected" : ""
        }>${esc(label)}</option>`
    )
    .join("")}</select></label>`;
const note = (name, label) =>
  `<label>${esc(label)}<textarea name="${name}" required></textarea></label>`;
const form = (action, label, fields = "", payload = {}, disabled = false) =>
  `<form data-action="${action}" data-payload="${esc(
    JSON.stringify(payload)
  )}"><div class="form-grid">${fields}<button class="btn btn-primary" type="submit" ${
    disabled ? 'disabled data-operation-unavailable="true"' : ""
  }>${esc(label)}</button></div></form>`;
const button = (action, label, payload = {}) =>
  form(action, label, "", payload);
const table = (headers, rows) =>
  `<div class="table-wrap"><table class="data-table"><thead><tr>${headers
    .map((h) => `<th>${esc(h)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
const stationName = (id) => state.stations.find((s) => s.id === id)?.name || id;
const applicationSelect = () =>
  select(
    "applicationId",
    t("Station agreement", "电站协议"),
    state.applications.map((a) => [a.id, stationName(a.stationId)])
  );
const approvalCheck = () =>
  `<label class="checkline"><input name="acceptProvisional" type="checkbox">${t(
    "I reviewed any provisional estimate and its assumptions",
    "我已审核暂定估值及其假设"
  )}</label>`;
function chart(values, color = "#1a56db") {
  if (!values.length) return empty();
  const max = Math.max(...values, 1);
  const points = values
    .map(
      (v, i) =>
        `${15 + (i * 770) / Math.max(values.length - 1, 1)},${
          170 - (v / max) * 145
        }`
    )
    .join(" ");
  return `<svg class="spark" viewBox="0 0 800 190" role="img" aria-label="${t(
    "Monthly series",
    "月度数据"
  )}"><line x1="15" y1="170" x2="785" y2="170" stroke="#e5e7eb"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="3"/><text x="15" y="16" fill="#6b7280" font-size="12">${Math.round(
    max
  ).toLocaleString()}</text><text x="15" y="185" fill="#6b7280" font-size="10">${t(
    "Earlier",
    "较早"
  )}</text><text x="755" y="185" fill="#6b7280" font-size="10">${t(
    "Later",
    "较晚"
  )}</text></svg>`;
}
function valuation(report) {
  if (!report) return empty();
  return `<div class="metric-row">${metric(
    t("Estimated remaining rights", "预计剩余收益权价值"),
    money(report.rightsValueUSDC6),
    "demo USDC"
  )}${metric(t("Valid until", "有效期至"), date(report.validUntil))}</div>${tag(
    report.provisional
      ? t("Provisional · explicit approval required", "暂定 · 需明确批准")
      : t("Historical seasonal baseline", "历史季节性基线"),
    report.provisional ? "warning" : "normal"
  )}<p>${t(
    "This station forecast values assigned cashflows. Investor returns include pool costs and retained liquidity separately. Remaining NAV can fall as finite rights pay out.",
    "本电站预测用于评估约定现金流。投资者回报另行包含资金池成本和留存流动性。有限期收益权随现金分配，其剩余净值可能下降。"
  )}</p>${chart(report.rows.map((r) => Number(r.assignedUSDC6) / 1e6))}${table(
    [
      t("Scenario / discount", "情景 / 折现率"),
      t("Rights value (USDC)", "收益权价值 (USDC)"),
    ],
    [
      ...report.scenarios.map((r) => [
        esc(
          t(r.name, { base: "基准", downside: "下行", upside: "上行" }[r.name])
        ),
        money(r.valueUSDC6),
      ]),
      ...report.sensitivities.map((r) => [
        `${r.discountBps / 100}%`,
        money(r.valueUSDC6),
      ]),
    ]
  )}${detail(
    t("Assumptions, warnings and source hashes", "假设、提示及来源哈希"),
    report
  )}`;
}
let stationSelection = localStorage.getItem(appStorageKey("revenue.station")) || "";
const sourceLabel = (source) =>
  source === "synthetic"
    ? t("Synthetic fixture", "合成演示样本")
    : source === "replay"
    ? t("Recorded API replay", "API 录制回放")
    : t("Live API capture", "实时 API 采集");
const numberOrMissing = (v, unit = "") =>
  typeof v === "number" && Number.isFinite(v)
    ? `${v.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
        maximumFractionDigits: 2,
      })}${unit ? " " + unit : ""}`
    : t("Not provided", "未提供");
function stations() {
  return renderStationDashboard();
}
function applications(mode) {
  return renderApplications(mode);
}
function overview() {
  const c = state.chain;
  const fundingTarget =
    Number(c.phase) === 0 ? productModel().target.toString() : c.target;
  return (
    `<div class="metric-row">${metric(
      t("Pool NAV", "资金池净值"),
      money(c.nav),
      "demo USDC"
    )}${metric(
      t("Reference unit NAV", "参考份额净值"),
      money(c.price),
      "USDC / DRS"
    )}${metric(
      t("Cash distributions declared", "已宣告现金分配"),
      c.distributionCount
    )}${metric(
      t("Redemption liquidity", "赎回流动性"),
      money(c.redemptionCash),
      "demo USDC"
    )}</div>` +
    card(
      productTitle(),
      `${tag(t(...phaseNames[Number(c.phase)]))}${tag(
        c.fresh
          ? t("Approved current price", "已批准的有效价格")
          : t("Valuation refresh required", "需更新估值"),
        c.fresh ? "normal" : "warning"
      )}<p>${t(
        "Households sell defined cashflow rights while keeping their equipment. Investors share collected household electricity payments and export revenue. There is no guaranteed coupon or repayment of original principal.",
        "业主出售约定的现金流收益权并保留设备。投资者分享已归集的业主电费与售电净收入。不保证票息，也不承诺返还原始本金。"
      )}</p><div class="metric-row">${metric(
        t("Assigned share / term", "收益权比例 / 期限"),
        "100% / 5",
        t("years · configurable before signing", "年 · 签署前可配置")
      )}${metric(t("Initial retained cash", "初始留存现金"), "10%")}${metric(
        t("Annual pool fee", "资金池年费"),
        "0.5%"
      )}${metric(
        t("Discount assumption", "折现率假设"),
        "10%",
        t("6% / 14% sensitivity", "6% / 14% 敏感度")
      )}</div><p>${t(
        "At the product’s distribution cutoff, pay expenses, protect six months of mandatory costs, then allocate 75% of surplus receipts to distributions and 25% to exit liquidity. Transfers lock for six months; redemptions require 30 days’ notice and a 5% NAV gate.",
        "在本产品规定的分配日支付费用、保留六个月必需成本，再将剩余回款的75%用于分配、25%用于退出流动性。转让锁定六个月，赎回需提前30天申请并受净值5%额度限制。"
      )}</p><p>${t("Funding", "募集资金")}: ${money(
        c.totalSubscriptions
      )} / ${money(
        fundingTarget
      )} USDC</p><div class="progress-bar"><div class="fill" style="width:${Math.min(
        100,
        (Number(c.totalSubscriptions) / Math.max(1, Number(fundingTarget))) *
          100
      )}%"></div></div>`
    )
  );
}
function pricing() {
  const projected = productReturnPanel();
  const reports = Object.entries(state.activeReports)
    .filter(([k]) => k !== "aggregate")
    .map(([, h]) => state.valuations.find((r) => r.reportHash === h))
    .filter(Boolean);
  return (
    projected +
    (reports
      .map((r) => card(stationName(r.stationId), valuation(r)))
      .join("") || empty())
  );
}
function holdings() {
  const a = state.accounts[actor] || state.accounts.investor,
    c = state.chain;
  const current = productModel().approved || Number(c.phase) === 4;
  return card(
    t("Investor position", "投资者持仓"),
    `<div class="metric-row holding-metrics">${metric("DRS", money(a.economicShares))}${metric(
      t("Remaining NAV", "剩余净值"),
      current ? money((Number(a.economicShares) * Number(c.price)) / 1e6) : "—",
      current ? "USDC" : t("Awaiting approved NAV", "待更新批准净值")
    )}${metric(
      t("Queued shares", "待赎回份额"),
      money(a.redemption.shares)
    )}${metric(
      t("Cash distributions paid", "已支付现金分配"),
      money(a.performance.cashDistributionsUSDC6)
    )}${metric(
      t("Projected investor net IRR", "投资者预计净内部收益率"),
      !current || a.performance.projectedNetIRRPct == null
        ? "—"
        : a.performance.projectedNetIRRPct.toFixed(2) + "%",
      t(
        "Actual paid flows + projected remaining distributions",
        "已支付现金流 + 预计剩余分配"
      )
    )}${metric(
      t("Total return incl. remaining NAV", "含剩余净值的总回报"),
      !current || a.performance.totalReturnPct == null
        ? "—"
        : a.performance.totalReturnPct.toFixed(2) + "%"
    )}</div><p class="mono">${esc(a.address)}</p><p>${t(
      "Remaining NAV and declared distributions are separate. Pending redemption tokens continue to earn distributions until paid and burned. Demo faucet balances are not investment returns.",
      "剩余净值与已宣告分配分别列示。待赎回代币在付款并销毁前继续享有分配权。演示水龙头余额不是投资收益。"
    )}</p>${
      !current
        ? `<p class="op-alert">${t(
            "Valuation needs reconciliation after the latest cash movement. Holdings and confirmed cash remain visible; modeled returns resume after approval.",
            "最新资金变动后须重新对账并审批净值。份额和已确认现金照常显示，估值回报在审批后恢复。"
          )}</p>`
        : ""
    }${
      a.claims.length
        ? table(
            [
              t("Distribution", "分配期"),
              t("Claimable (USDC)", "待领取（USDC）"),
              t("Paid (USDC)", "已领取（USDC）"),
              t("Action", "操作"),
            ],
            a.claims.map((r) => [
              String(r.id),
              money(r.amountUSDC6),
              money(r.paidUSDC6),
              Number(r.amountUSDC6) > 0
                ? button("claim", t("Claim", "领取"), { distributionId: r.id })
                : t("Paid / none", "已支付 / 无"),
            ])
          )
        : `<p class="blank">${distributionText("No cash distributions declared yet. The first claim appears after quarterly operations are completed.","尚未宣告现金分配，完成季度运营后将在此显示可领取金额。","No cash distributions declared yet. Complete monthly operations, declare a distribution, then claim here.","尚未宣告现金分配。完成月度运营并宣告分配后，即可在这里领取。")}</p>`
    }`
  );
}
function trades(review = false) {
  return investorTrades(review);
}
function cases() {
  return (
    state.cases
      .map((c) =>
        card(
          `${t("Servicing case", "服务事件")} #${c.id}`,
          `<p>${esc(c.reason)} · ${t(
            "Fixed snapshot support",
            "固定快照支持率"
          )}: ${
            c.supply === "0"
              ? 0
              : ((Number(c.support) / Number(c.supply)) * 100).toFixed(1)
          }%</p>${tag(
            c.executed
              ? t("Recipient changed", "收款方已变更")
              : t("Under review", "审核中")
          )}<p class="mono">${esc(c.firstTrustee)} → ${esc(c.recipient)}</p>${
            role === "investor"
              ? form(
                  "support-case",
                  c.voters?.[actor]?.voted
                    ? t("Support recorded", "已记录支持")
                    : t("Support using snapshot holding", "按快照持仓支持"),
                  "",
                  { caseId: c.id },
                  c.executed ||
                    c.voters?.[actor]?.voted ||
                    productAmount(c.voters?.[actor]?.weight) === 0n
                )
              : role === "trustee"
              ? form(
                  "approve-case",
                  t("Record trustee approval", "记录受托人批准"),
                  "",
                  { caseId: c.id },
                  c.executed ||
                    productAmount(c.supply) === 0n ||
                    productAmount(c.support) * 100n <
                      productAmount(c.supply) * 30n ||
                    c.firstTrustee.toLowerCase() ===
                      state.manifest.accounts[actor].toLowerCase()
                )
              : ""
          }`
        )
      )
      .join("") || empty()
  );
}
function operations() {
  return (
    card(
      t(
        "Confirmed transactions & recoverable operations",
        "已确认交易及可恢复操作"
      ),
      table(
        [
          t("Role / action", "角色 / 操作"),
          t("Status", "状态"),
          t("Transaction receipts", "交易凭证"),
        ],
        state.operations
          .slice(-25)
          .reverse()
          .map((o) => [
            `${esc(o.actor)} / ${esc(o.action)}${networkConfig?.recordingEnabled ? `<br><a href="${globalThis.RevenueNetworks?.appPath("recording/") || "/app/recording/"}?operation=${encodeURIComponent(o.id)}" target="_blank">${t("Reconcile business & chain", "核对业务与链上记录")} ↗</a>` : ""}`,
            esc(o.status) +
              (o.actor === actor && o.status !== "confirmed" && !Object.values(o.steps).some(step=>step.status==='reverted')
                ? `<form data-action="${esc(o.action)}" data-retry-id="${esc(
                    o.id
                  )}" data-payload="${esc(
                    JSON.stringify(o.body)
                  )}"><button class="btn btn-outline" type="submit">${t(
                    "Retry original operation",
                    "重试原操作"
                  )}</button></form>`
                : "") +
              (o.error ? `<p>${esc(o.error)}</p>` : ""),
            Object.values(o.steps)
              .map((step) => {
                const hash = esc(step.hash);
                const receipt = state.network?.explorerUrl
                  ? `<a href="${esc(
                      state.network.explorerUrl
                    )}/tx/${hash}" target="_blank" rel="noopener">${hash.slice(
                      0,
                      10
                    )}…${hash.slice(-8)}</a>`
                  : hash;
                const chainStatus =
                  step.status === "reverted" ? t("On-chain reverted · original hash cannot be retried", "链上执行失败，不能重试原哈希") : step.status === "mined"
                    ? t("On-chain confirmed", "链上已确认")
                    : t("Wallet submitted", "钱包已提交");
                const explorerStatus =
                  step.indexed === null
                    ? ""
                    : step.indexed
                    ? ` · ${t("Blockscout indexed", "Blockscout 已索引")}`
                    : ` · ${t(
                        "Waiting for Blockscout",
                        "等待 Blockscout 索引"
                      )}`;
                return `<p class="mono">${receipt} · ${chainStatus}${explorerStatus} · #${
                  step.block || "—"
                }</p>`;
              })
              .join("") || "—",
          ])
      )
    ) +
    detail(t("Deployment and audit trail", "部署及审计记录"), {
      manifest: state.manifest,
      audit: state.audit.slice(-40),
    })
  );
}
function content() {
  const c = state.chain;
  switch (page) {
    case "product_hall":
      return investorCatalog();
    case "pool_detail":
      return investorPoolDetails();
    case "investor_eligibility":
      return investorQualification();
    case "subscribe":
      return investorSubscribe();
    case "position":
      return investorPosition();
    case "bond_transfer":
      return investorExits();
    case "owner_kyc":
      return card(
        t("Local household profile", "本地业主资料"),
        `<p>${t(
          "Demonstration account only; no production identity verification is asserted.",
          "仅为演示账户，不代表已完成生产环境身份认证。"
        )}</p><p class="mono">${esc(state.accounts.owner.address)}</p>`
      );
    case "owner_stations":
      return renderStationList();
    case "owner_station_detail":
    case "station_transparent":
      return stations();
    case "owner_apply":
      if (wfSelected) return applications("owner");
      return (
        `<div class="wf-workspace wf-owner-intro"><h2>${t(
          "Sell a defined share of future revenue",
          "申请出售未来收益权"
        )}</h2><p>${t(
          "Submit station evidence → intermediary valuation → trustee approval → accept and record agreement → pool admission → fundraising and payment. Equipment ownership stays with you.",
          "提交电站资料 → 中介估值报价 → 受托人审批 → 接受报价并记录协议 → 入池 → 募集成功付款。设备所有权始终归您。"
        )}</p></div>` +
        card(
          t("Apply to sell revenue rights", "申请出售收益权"),
          form(
            "apply",
            t("Submit application", "提交申请"),
            select(
              "stationId",
              t("Station", "电站"),
              state.stations.map((s) => [s.id, s.name])
            ) +
              note(
                "notes",
                t(
                  "Ownership, collection and documents note",
                  "所有权、收款及文件说明"
                )
              )
          )
        ) +
        applications("owner")
      );
    case "owner_agreement":
      return applications("owner");
    case "owner_funds":
      return (
        card(
          t("Household funds", "业主资金"),
          `${metric(
            t("Confirmed wallet balance", "已确认钱包余额"),
            money(state.accounts.owner.usdc),
            "demo USDC"
          )}<p>${t(
            "Upfront purchase proceeds arrive only at successful settlement. Monthly electricity payments below require your own wallet signature.",
            "首次购买款仅在成功结算后到账。后续月度电费请在下方账单中使用自己的钱包缴纳。"
          )}</p>`
        ) +
        householdBillsView()
      );
    case "agent_apply_review":
    case "agent_financing":
      return applications("agent");
    case "agent_pool":
      if (wfSelected) return applications("agent");
      return (
        wfPoolGuide(
          state.applications.some((a) => a.status === "pooled")
            ? button(
                "prepare-valuation",
                t("Start valuation preparation", "开始编制估值")
              )
            : ""
        ) +
        overview() +
        applications("agent") +
        card(
          t("Monthly valuation publication", "月度估值发布"),
          button(
            "prepare-valuation",
            t("Prepare updated valuation", "编制更新估值"),{},!productModel().can('valuation')
          ) +
            (productModel().unbookedPeriods.length?`<p class="notice-bar">${t("Record the receivable for completed service months before valuation. Fee accrual is not a prerequisite for recording a completed month.","请先登记已结束服务月份的应收款，再编制估值。登记已结束月份不需要先计提费用。")}</p>${productNav(t("Open monthly billing","前往月度账单登记"),"agent","agent_monitor")}`:"")+
            `<p>${t(
              "A trustee must approve the proposal before subscriptions, settlement or dealing. Record monthly approvals before advancing the next fee period.",
              "认购、结算或交易前，须由受托人批准估值。进入下一个计费期前须记录本月审批。"
            )}</p>`
        ) +
        pricing()
      );
    case "agent_product":
      return productDistributionHandoff() + productOperations();
    case "agent_transfer_review":
      return (
        investorHead(
          t("Transfer review", "转让审核"),
          t(
            "Review negotiated prices outside the NAV tolerance before atomic settlement.",
            "核对偏离参考净值的协商价格，批准后方可原子结算。"
          )
        ) + trades(true)
      );
    case "agent_kyc_review":
      return investorReviewQueue();
    case "agent_monitor":
      return (
        card(
          t("Deye data source", "德业数据源"),
          `<p>${t(
            "Live, recorded replay and synthetic are explicit modes. API errors never switch modes. Credentials stay on the server.",
            "实时、录制回放和合成数据为明确区分的模式。API 错误不会切换模式。凭据仅保存在服务端。"
          )}</p>${form(
            "source",
            t("Select source", "选择数据源"),
            select(
              "mode",
              t("Mode", "模式"),
              [
                ["synthetic", t("Synthetic fixture", "合成样本")],
                ["replay", t("Recorded replay", "录制回放")],
                ["live", t("Deye live API", "德业实时 API")],
              ],
              state.mode
            )
          )}${button(
            "discover",
            t("Discover accessible stations", "发现可访问电站")
          )}${form(
            "sync",
            t("Capture live station", "采集实时电站"),
            input(
              "sourceId",
              t("Deye station ID", "德业电站 ID"),
              state.stations.find((s) => s.source === "live")?.sourceId || "",
              "text",
              "required"
            )
          )}<p>${t("Live acceptance", "实时验收")}: ${
            state.liveAcceptance.retrieved && state.liveAcceptance.mapped
              ? t("Retrieved and mapped", "已获取并映射")
              : t(
                  "Pending — station access and export mapping unverified",
                  "待完成 — 电站权限与上网电量映射未验证"
                )
          }</p>${
            state.lastSyncError ? `<p>${esc(state.lastSyncError)}</p>` : ""
          }`
        ) +
        card(
          t("Monthly billing and receipt reconciliation", "月度账单与收款核对"),
          `<p>${t(
            "Select historical generation and export evidence. The signed model calculates household electricity payments plus export revenue, less agreed station costs. Tariffs and FX are demo assumptions. After publication, the household pays demo USDC with its wallet. Only grid export funding is simulated. This does not create live telemetry.",
            "为演示期间选择历史发电与上网证据。按签约模型计算业主电费与售电收入，再扣除约定站点费用。电价和汇率为演示假设。发布账单后，由业主钱包实际支付测试 USDC，只有电网售电回款单独模拟，不产生新的实时遥测。"
          )}</p>${form(
            "book-revenue",
            t("Publish monthly bill", "发布月度缴费账单"),
            applicationSelect() +
              input(
                "period",
                t("Completed service month (1–60)", "已完成服务月份 (1–60)"),
                String(productModel().unbookedPeriods[0]?.period||Math.max(1, Number(c.feeMonths))),
                "number",
                "min=1 max=60 required"
              ) +
              input(
                "historyMonth",
                t("Observed historical month", "观测历史月份"),
                state.stations[0]?.history.filter(h=>h.complete&&h.exportKWh!==null&&h.generationKWh!==null).at(-1)?.month || "",
                "month",
                "required"
              )
          )}${agentBillsView()}${state.income.length ? table(
              [t("Period", "期数"), t("Currency", "本币"), t("Household bill", "业主电费"), t("Export receipts", "售电收入"), t("Station costs", "站点费用"), t("Assigned USDC", "受让现金流 USDC"), t("Status", "状态")],
              state.income.map(r => [r.period, esc(state.stations.find(s => s.id === r.stationId)?.currency || ""), dsCash(r.billing?.householdPaymentLocal), dsCash(r.billing?.exportRevenueLocal), dsCash(r.billing?.costsLocal), money(r.amountUSDC6), r.collected ? t("Collected", "已归集") : t("Receivable", "待收款")])
            ) : ""}`
        ) +
        card(
          t("Open servicing case", "发起服务事件"),
          `<p>${t(
            "Ordinary forecast underperformance is not a household default. Collection changes need a 30% fixed ownership snapshot and two different trustees. Physical control and bank changes are excluded.",
            "普通预测未达标不构成业主违约。变更收款方需固定持仓快照的 30% 支持与两名不同受托人批准。不涉及物理设备控制或银行账户变更。"
          )}</p>${form(
            "open-case",
            t("Open documented case", "创建有证据的事件"),
            applicationSelect() +
              select("reason", t("Reason", "原因"), [
                ["missing-remittance", t("Missing remittance", "未汇款")],
                ["diverted-receipts", t("Diverted receipts", "挪用回款")],
                ["breached-obligations", t("Breached obligations", "违反义务")],
                [
                  "prolonged-incident",
                  t("Prolonged operational incident", "长期运行事件"),
                ],
              ]) +
              note("notes", t("Evidence and responsibilities", "证据与责任"))
          )}`
        ) +
        stations()
      );
    case "trustee_events":
      if (wfSelected) return applications("trustee");
      return (
        productDistributionHandoff() + wfPoolGuide() +
        applications("trustee") +
        card(
          t("Approve prepared monthly valuation", "批准已编制月度估值"),
          ((productModel().proposalExpired || productModel().proposalOutdated) ? `<div class="notice-bar" data-pool-valuation-expired><strong>${productModel().proposalOutdated?t("Financial inputs changed after this report","原报告编制后账务已变化"):t("Prepared valuation expired","待批准估值已过期")}</strong><p>${productModel().proposalOutdated?t("Reconcile current cash, receivables and expenses, prepare a new report, then return for independent approval.","请由中介核对最新现金、应收款及费用，重新编制报告后，再返回本页独立审批。"):t("Demo time has passed the report validity date. Ask the intermediary to prepare a new valuation, then return to review it. Retrying a reverted approval cannot extend the original report.","演示时间已超过原报告有效期。请由中介重新编制当前估值，再返回本页审核。重试失败交易不能延长原报告有效期。")}</p>${productNav(t("Open intermediary valuation preparation","打开中介估值编制"),"agent","agent_pool")}</div>` : "")+form(
            "approve-valuation",
            t("Approve and anchor valuation", "批准并锚定估值"),
            approvalCheck(),
            {},
            !productModel().proposalCanApprove
          )
        ) +
        pricing()
      );
    case "trustee_review":
      return (
        card(
          t("Servicing review", "服务事件审核"),
          `<p>${t(
            "Holders initiate with 30% of a fixed ownership snapshot. Two distinct trustees approve the collection-recipient change. Ordinary revenue underperformance is not a default.",
            "持有人按固定持仓快照达到30%方可发起，两名不同受托人批准后才变更演示收款方。普通收益未达预测不构成违约。"
          )}</p>`
        ) + cases()
      );
    case "message_center":
      return investorMessages();
    case "transaction_log":
      return operations();
    default:
      return overview();
  }
}
async function api(path, body, signal) {
  const r = await (globalThis.RevenueNetworks?.fetch || fetch)(
    path,
    body === undefined
      ? { signal, headers: selectedProduct ? { "X-Revenue-Product": selectedProduct } : {} }
      : {
          signal,
          method: "POST",
          headers: { "Content-Type": "application/json", ...(selectedProduct ? { "X-Revenue-Product": selectedProduct } : {}) },
          body: JSON.stringify({
            expectedVault: state?.manifest?.addresses.vault,
            ...body,
          }),
        }
  );
  const data = await r.json();
  if (!r.ok) {
    // A reset replaces the vault; recover read-only navigation, never replay a transaction.
    if (body === undefined && path === "/api/state" && selectedProduct &&
        /Product not found/.test(data.error || "") &&
        !sessionStorage.getItem(appStorageKey("revenue.pending"))) {
      selectedProduct = "";
      sessionStorage.removeItem(appStorageKey("revenue.selected-product"));
      return api(path, undefined, signal);
    }
    if (r.status === 401 && networkConfig?.walletRequired) {
      cancelWalletWorkspaceLoad();
      walletSession = undefined;
      state = undefined;
      document.querySelector("#nav").innerHTML = "";
      document.querySelector("#wallet-faucet").hidden = true;
      document.querySelector("#demo-reset").hidden = true;
      walletLanding(
        t(
          "Session expired. Choose your role and sign in again.",
          "登录已过期，请选择角色并重新登录。"
        )
      );
    }
    throw new Error(data.error || r.statusText);
  }
  return data;
}
async function publicGet(path) {
  const response = await (globalThis.RevenueNetworks?.fetch || fetch)(path, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}
async function ensureWalletNetwork() {
  const current = await walletProvider().request({ method: "eth_chainId" });
  if (current === networkConfig.chainIdHex) return;
  try {
    await walletProvider().request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: networkConfig.chainIdHex }],
    });
  } catch (error) {
    const unknownRabbyChain = walletProvider().isRabby && error.code === -32603 && /^Unrecognized chain ID /i.test(error.message || "") && error.message.toLowerCase().includes(networkConfig.chainIdHex.toLowerCase());
    if (error.code !== 4902 && !unknownRabbyChain) throw error;
    await walletProvider().request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: networkConfig.chainIdHex,
          chainName: networkConfig.chainName,
          rpcUrls: [networkConfig.rpcUrl],
          blockExplorerUrls: [networkConfig.explorerUrl],
          nativeCurrency: networkConfig.nativeCurrency,
        },
      ],
    });
    await walletProvider().request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: networkConfig.chainIdHex }],
    });
  }
}
function walletLanding(message = "") {
  window.RevenueGuide?.clear();
  document.querySelector("#main").classList.remove("dashboard-main");
  document.querySelector("#product-select").hidden = true;
  document.querySelector("#product-create").hidden = true;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelector("#language").textContent =
    lang === "zh" ? "English" : "中文";
  document.querySelector("#brand").textContent = t(
    "Revenue rights platform",
    "能源收益权平台"
  );
  document.querySelector("#roles").innerHTML = "";
  document.querySelector("#account").hidden = true;
  const connect = document.querySelector("#wallet-connect");
  connect.hidden = false;
  connect.disabled = false;
  document.querySelector("#refresh").disabled = false;
  connect.textContent = t("Connect wallet", "连接钱包");
  document.querySelector("#wallet-status").textContent = t(
    "Wallet sign-in required",
    "需要钱包登录"
  );
  document.querySelector(
    "#main"
  ).innerHTML = `<section class="wallet-gate"><div class="wallet-gate-icon">◇</div><h1>${t(
    "Choose your role",
    "选择角色进入工作台"
  )}</h1><p>${t(
    "This local demonstration uses wallet signatures for identity and every on-chain business action.",
    "本地演示使用钱包签名确认身份，并签署每一项链上业务操作。"
  )}</p><p class="wallet-gate-network">${esc(
    networkConfig?.chainName || "Deye RWA Local"
  )} · Chain ID ${esc(networkConfig?.chainId || "")}</p>${
    message ? `<p class="error">${esc(message)}</p>` : ""
  }<button class="btn btn-primary" id="wallet-connect-main">${t(
    "Choose role and sign in",
    "选择角色并登录"
  )}</button></section>`;
}
function cancelWalletWorkspaceLoad() {
  walletWorkspaceLoad?.controller.abort();
  clearTimeout(walletWorkspaceLoad?.slowTimer);
  walletWorkspaceLoad = undefined;
}
function walletWorkspaceGate(session, error = "") {
  walletLanding();
  document.querySelector("#nav").innerHTML = "";
  document.querySelector("#wallet-faucet").hidden = true;
  document.querySelector("#demo-reset").hidden = true;
  const address = `${session.address.slice(0, 6)}…${session.address.slice(-4)}`;
  const connect = document.querySelector("#wallet-connect");
  connect.textContent = address;
  connect.disabled = !error;
  document.querySelector("#refresh").disabled = !error;
  document.querySelector("#wallet-status").textContent = `${t(...names[session.role])} · ${networkConfig.chainName} · ${t("Signed in", "已登录")}`;
  document.querySelector("#main").innerHTML = `<section class="wallet-gate wallet-workspace" aria-busy="${!error}" aria-labelledby="wallet-workspace-title">
    <div class="wallet-gate-icon ${error ? "" : "wallet-loading-icon"}" aria-hidden="true">${error ? "!" : ""}</div>
    <p class="wallet-login-confirmed">${t("Wallet signature verified", "钱包签名已验证")}</p>
    <h1 id="wallet-workspace-title">${error ? t("Workspace could not load", "工作台暂时无法加载") : t("Signed in. Loading your workspace…", "已登录，正在加载工作台…")}</h1>
    <p>${esc(t(`Reading products, wallet balances and transaction records on ${networkConfig.chainName}.`, `正在读取 ${networkConfig.chainName} 上的产品、钱包余额和交易记录。`))}</p>
    <p class="wallet-gate-network">${esc(t(...names[session.role]))} · ${esc(address)}</p>
    ${error ? `<p class="wallet-load-error" role="alert">${esc(error)}</p><p>${t("Your sign-in is retained. Retry loading without connecting or signing again.", "登录状态已保留。请重试加载，无需再次连接钱包或签名。")}</p><button type="button" class="btn btn-primary" id="wallet-load-retry">${t("Retry loading workspace", "重新加载工作台")}</button>` : `<p data-wallet-load-detail role="status">${t("Please wait. You do not need to connect or sign again.", "请稍候，无需再次连接钱包或签名。")}</p>`}
  </section>`;
}
async function acceptWalletSession(session) {
  cancelWalletWorkspaceLoad();
  walletSession = session;
  role = session.role;
  actor = session.actor;
  if (!nav[role].some((item) => item[0] === page)) page = nav[role][0][0];
  state = undefined;
  const load = { controller: new AbortController(), error: "", pending: true };
  walletWorkspaceLoad = load;
  walletWorkspaceGate(session);
  feedback("");
  load.slowTimer = setTimeout(() => {
    if (walletWorkspaceLoad !== load) return;
    const detail = document.querySelector("[data-wallet-load-detail]");
    if (detail) detail.textContent = t("The network is responding slowly. Your wallet is signed in; chain data is still loading.", "网络响应较慢。钱包已完成登录，仍在加载链上数据，请稍候。");
  }, 8000);
  try {
    const valid = () => walletWorkspaceLoad === load && walletSession === session;
    const ready = await refresh({ signal: AbortSignal.any([load.controller.signal, AbortSignal.timeout(45000)]), valid });
    if (!valid() || !ready) return false;
    walletWorkspaceLoad = undefined;
    feedback("");
    return true;
  } catch (error) {
    if (walletWorkspaceLoad !== load || walletSession !== session) return false;
    load.error = ["TimeoutError", "AbortError"].includes(error.name)
      ? t("The data query timed out. No business transaction was submitted.", "数据查询超时，本次加载没有提交业务交易。")
      : t("The data service is temporarily unavailable. No business transaction was submitted.", "数据服务暂时不可用，本次加载没有提交业务交易。");
    walletWorkspaceGate(session, load.error);
    return false;
  } finally {
    clearTimeout(load.slowTimer);
    load.pending = false;
  }
}
async function connectWallet(selectedRole, destination) {
  await window.RoleLogin.open({
    network: networkConfig,
    role: selectedRole,
    onSuccess: async session => {
      const ready = await acceptWalletSession(session);
      if (ready && destination && session.role === selectedRole && nav[role].some(n => n[0] === destination.page)) {
        page = destination.page;
        wfSelect(destination.applicationId || "");
        render();
      }
    },
  });
}
window.addEventListener("revenue-wallet-invalidated", () => {
  cancelWalletWorkspaceLoad();
  walletSession = undefined;
  state = undefined;
  document.querySelector("#nav").innerHTML = "";
  document.querySelector("#wallet-faucet").hidden = true;
  document.querySelector("#demo-reset").hidden = true;
  walletLanding(
    t(
      "Wallet or network changed. Select your role and sign in again.",
      "钱包或网络已变化，请选择角色并重新登录。"
    )
  );
});
function feedback(message, error = false) {
  const el = document.querySelector("#feedback");
  el.textContent = message;
  el.className = error ? "error" : "";
}
async function requestWalletRole(nextRole) {
  await connectWallet(nextRole);
}
async function setRole(next, account = next, destination) {
  if (networkConfig?.walletRequired) {
    if (walletSession?.role === next && (account === next || account === walletSession.actor)) {
      feedback("");
      return true;
    }
    await connectWallet(next, destination);
    return false;
  }
  role = next;
  actor = account;
  if (!nav[role].some((n) => n[0] === page)) page = nav[role][0][0];
  await api("/api/session", { role: actor });
  localStorage.setItem(appStorageKey("revenue.role"), role);
  localStorage.setItem(appStorageKey("revenue.actor"), actor);
  await refresh();
  feedback("");
  return true;
}
function applyNetworkLabels(){
  if(!networkConfig?.publicTestnet)return;
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let node;while(node=walker.nextNode()){
    if(['SCRIPT','STYLE','TEXTAREA'].includes(node.parentElement?.tagName)||node.parentElement?.closest('#network-dialog'))continue;
    node.nodeValue=node.nodeValue.replace(/mUSDC/g,'USDC').replace(/DETH/g,'ETH').replace(/本地演示/g,'Base Sepolia 测试').replace(/local demonstration/gi,'Base Sepolia test').replace(/\bLOCAL DEMO\b/gi,'BASE SEPOLIA TEST').replace(/Demo funds/g,'Test funds').replace(/本地演示中，须先核对本期账务，再明确确认推进共享财务时间。/g,'公链按真实时间运行，须等待月度截止日。');
  }
}
const networkLabelObserver=new MutationObserver(()=>{networkLabelObserver.disconnect();applyNetworkLabels();networkLabelObserver.observe(document.body,{childList:true,subtree:true});});
networkLabelObserver.observe(document.body,{childList:true,subtree:true});
function renderBusiness() {
  const pendingApproval=JSON.parse(sessionStorage.getItem(appStorageKey("revenue.pending"))||'null');
  if(pendingApproval&&state.operations.some(o=>o.id===pendingApproval.id&&o.action==='approve-valuation'&&Object.values(o.steps).some(step=>step.status==='reverted')))sessionStorage.removeItem(appStorageKey("revenue.pending"));
  syncDemoGeneration();
  selectedProduct = state.manifest.addresses.vault;
  sessionStorage.setItem(appStorageKey("revenue.selected-product"), selectedProduct);
  const picker = document.querySelector("#product-select");
  if (picker) {
    picker.hidden = !!state.selectedProduct?.archived;
    picker.setAttribute("aria-label", t("Current product", "当前产品"));
    picker.innerHTML = (state.productOptions || []).map(p => `<option value="${esc(p.vault)}" ${p.vault === selectedProduct ? "selected" : ""}>${esc(p.title[lang])} · ${t(...phaseNames[p.phase])}</option>`).join("");
  }
  const createProduct = document.querySelector("#product-create");
  if (createProduct) { createProduct.hidden = role !== "agent" || networkConfig?.createProductEnabled === false; createProduct.textContent = t("New issuance", "创建新一期"); }
  const resetButton = document.querySelector("#demo-reset");
  resetButton.hidden = !!state.selectedProduct?.archived || networkConfig?.resetEnabled === false;
  resetButton.textContent = t("Reset demo", "重置 Demo");
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelector("#brand").textContent = t(
    "RWA investment platform · revenue rights",
    "RWA 投融资平台 · 收益权"
  );
  const walletRequired = Boolean(networkConfig?.walletRequired);
  document.querySelector("#roles").innerHTML = walletRequired
    ? Object.entries(names)
        .map(
          ([candidate, label]) =>
            `<button class="role-btn ${
              candidate === role ? "active" : ""
            }" data-wallet-role="${candidate}" title="${esc(
              candidate === role
                ? t("Current wallet role", "当前钱包角色")
                : t(
                    "Select this role's account in your wallet",
                    "在所选钱包中选择该角色账户"
                  )
            )}">${esc(t(...label))}</button>`
        )
        .join("")
    : Object.entries(names)
        .map(
          ([r, n]) =>
            `<button class="role-btn ${
              r === role ? "active" : ""
            }" data-role="${r}">${esc(t(...n))}</button>`
        )
        .join("");
  const accountSelect = document.querySelector("#account");
  accountSelect.hidden = walletRequired;
  accountSelect.innerHTML = (
    role === "investor"
      ? [
          ["investor", t("Investor A", "投资者 A")],
          ["investor2", t("Investor B", "投资者 B")],
        ]
      : role === "trustee"
      ? [
          ["trustee", t("Trustee A", "受托人 A")],
          ["trustee2", t("Trustee B", "受托人 B")],
        ]
      : [[role, t(...names[role])]]
  )
    .map(
      ([value, label]) =>
        `<option value="${value}" ${value === actor ? "selected" : ""}>${esc(
          label
        )}</option>`
    )
    .join("");
  const walletButton = document.querySelector("#wallet-connect");
  walletButton.hidden = !walletRequired;
  walletButton.disabled = false;
  document.querySelector("#refresh").disabled = false;
  walletButton.textContent = walletSession
    ? `${walletSession.address.slice(0, 6)}…${walletSession.address.slice(-4)}`
    : t("Connect wallet", "连接钱包");
  document.querySelector("#wallet-status").textContent = walletRequired
    ? `${t(...names[role])} · ${networkConfig.chainName}`
    : "";
  const faucetButton = document.querySelector("#wallet-faucet");
  faucetButton.hidden = !walletRequired;
  faucetButton.textContent = t("Demo funds", "领取测试资金");
  document.querySelector("#language").textContent =
    lang === "en" ? "中文" : "English";
  document.querySelector("#nav").innerHTML =
    `<div class="nav-group-title">${t(...names[role])}</div>` +
    nav[role]
      .map(
        ([id, en, zh]) =>
          `<button class="nav-item ${
            id === page ? "active" : ""
          }" data-page="${id}">${esc(t(en, zh))}</button>`
      )
      .join("") +
    `<div class="nav-group-title">${t(
      "Local demo · v2",
      "本地演示 · v2"
    )}</div><button class="nav-item" data-page="transaction_log">${t(
      "Transaction log",
      "交易日志"
    )}</button>`;
  const title = nav[role].find((n) => n[0] === page) || [
    page,
    "Transaction log",
    "交易日志",
  ];
  const dashboardPage = [
    "owner_stations",
    "owner_station_detail",
    "station_transparent",
    "agent_apply_review",
    "agent_financing",
    "agent_pool",
    "agent_product",
    "agent_kyc_review",
    "agent_transfer_review",
    "product_hall",
    "pool_detail",
    "investor_eligibility",
    "subscribe",
    "position",
    "bond_transfer",
    "message_center",
    "owner_apply",
    "owner_agreement",
    "trustee_events",
  ].includes(page);
  document
    .querySelector("#main")
    .classList.toggle("dashboard-main", dashboardPage);
  if (dashboardPage) {
    document.querySelector(
      "#main"
    ).innerHTML = `<div class="ds-demo-context"><span>${t(
      "RWA LOCAL DEMO · No real money",
      "RWA 本地演示 · 无真实资金"
    )}</span><span>${t("Financial clock (UTC)", "财务时钟 (UTC)")}: ${date(
      state.financialTime
    )}</span></div>${state.selectedProduct?.archived ? retiredRefundView() : productMigrationNotice()+content()}`;
    localStorage.setItem(appStorageKey("revenue.page"), page);
    return;
  }
  document.querySelector("#main").innerHTML = `<h1 class="page-title">${esc(
    t(title[1], title[2])
  )}</h1><div class="page-subtitle">${t(
    "Solar cashflows. Transparent evidence. Defined rights.",
    "光伏现金流 · 透明证据 · 明确收益权"
  )}</div><div class="source-strip">${tag(
    t("LOCAL DEMO · no real money", "本地演示 · 无真实资金"),
    "warning"
  )}${tag(state.mode, "mock")}<span>${t(
    "Financial clock (UTC)",
    "财务时钟 (UTC)"
  )}: ${date(state.financialTime)}</span></div><div class="notice-bar blue">${t(
    "Observed telemetry and modeled financial assumptions are separate. Returns depend on collected cash; the equipment belongs to the household.",
    "遥测观测与财务模拟假设分别记录。回报取决于实际回款；设备归业主所有。"
  )}</div>${state.selectedProduct?.archived ? retiredRefundView() : content()}`;
  localStorage.setItem(appStorageKey("revenue.page"), page);
}
function render() {
  renderBusiness();
  window.RevenueGuide?.update({
    state, role, actor, page, lang, network: networkConfig, session: walletSession,
    product: state ? productModel() : null,
    subscription: state && role === "investor" ? productSubscriptionState(state.accounts[actor]) : null,
    exit: state && role === "investor" ? investorExitState() : null,
    nextApplication: wfNext,
    refresh: async () => {
      const expected = {actor,role,wallet:walletSession?.address,vault:state?.manifest?.addresses.vault,chain:networkConfig?.chainId};
      let latest;
      try { latest = await api("/api/state",undefined,AbortSignal.timeout(networkConfig?.publicTestnet?45000:15000)); }
      catch(error) {
        if(error.name==="TimeoutError"||error.name==="AbortError")throw new Error(t("The status query timed out. Please retry; no business action was submitted.","状态查询超时，请重新查询。本次查询没有提交业务操作。"));
        if(error instanceof TypeError)throw new Error(t("The status service could not be reached. Check the local service and retry.","暂时无法连接状态服务，请检查本地服务后重新查询。"));
        throw error;
      }
      if (actor!==expected.actor||role!==expected.role||walletSession?.address!==expected.wallet||state?.manifest?.addresses.vault!==expected.vault||networkConfig?.chainId!==expected.chain||window.RevenueGuide?.isProcessing()) return false;
      state = latest; render(); return true;
    },
    navigate: async task => {
      if (task.role !== role) return;
      page = task.page;
      wfSelect(task.applicationId || "");
      if (task.action === "offer" && task.applicationId) wfEditing.add(task.applicationId);
      if (task.actor && role === "agent") investorReview = task.actor;
      render();
      if(task.action==='book-revenue'){
        const form=document.querySelector('form[data-action="book-revenue"]');
        const period=form?.querySelector('[name="period"]'),application=form?.querySelector('[name="applicationId"]'),historyMonth=form?.querySelector('[name="historyMonth"]');
        if(!period||!application||!historyMonth)throw new Error(t('The monthly billing form could not load completely. Refresh the page and retry.','月度账单表单未完整加载，请刷新页面后重试。'));
        period.value=String(task.period);application.value=task.applicationId;
        const stationId=state.applications.find(a=>a.id===task.applicationId)?.stationId;
        historyMonth.value=state.stations.find(s=>s.id===stationId)?.history.filter(h=>h.complete&&h.exportKWh!==null&&h.generationKWh!==null).at(-1)?.month||'';
      }
      document.querySelector("#main").scrollTop = 0;
    },
    handoff: async task => {
      const ready=await setRole(task.role, task.assignee || task.role, { page: task.page, applicationId: task.applicationId });
      if (ready!==false) { page = task.page; wfSelect(task.applicationId || ""); render(); }
    },
    advanceMonth: async cutoff => {
      const pending=JSON.parse(sessionStorage.getItem(appStorageKey("revenue.pending"))||'null');
      if(!networkConfig?.guidanceEnabled||!(Number(networkConfig.chainId)===20261014&&['127.0.0.1','localhost'].includes(location.hostname)||Number(networkConfig.chainId)===20261008&&networkConfig.demoTimeAdvanceEnabled===true)||role!=='agent'||!walletSession||walletSession.role!=='agent'||Number(state?.chain.phase)!==2||Number(state.chain.nextFeeAt)!==cutoff||cutoff<=state.financialTime||window.RevenueGuide?.isProcessing()||pending&&JSON.parse(pending.canonical).action!=='advance')throw new Error(t('The monthly target or session changed. Refresh and confirm again.','月度目标或登录状态已变化，请刷新后重新确认。'));
      return runBusinessAction('advance',{by:'month',expectedCutoff:cutoff});
    },
  });
}
async function refresh({ signal, valid = () => true } = {}) {
  let latest = await api("/api/state", undefined, signal);
  if (!valid()) return false;
  if (latest.selectedProduct?.archived && !sessionStorage.getItem(appStorageKey("revenue.pending")) &&
      BigInt(latest.accounts[actor]?.subscription.amount || "0") === 0n) {
    const next = role === "investor" ? latest.products?.find(p => [1,2].includes(p.phase))
      : latest.productOptions?.slice().reverse().find(p => p.phase === 0);
    if (next) {
      selectedProduct = next.vault;
      sessionStorage.setItem(appStorageKey("revenue.selected-product"), selectedProduct);
      latest = await api("/api/state", undefined, signal);
    }
  }
  if (!valid()) return false;
  state = latest;
  render();
  return true;
}
document.addEventListener("change", e => {
  if (e.target.id === "product-select") switchProduct(e.target.value).catch(error => feedback(error.message, true));
});
document.addEventListener("click", async e => {
  const product = e.target.closest("[data-product-vault]");
  if (product) { try { await switchProduct(product.dataset.productVault, product.dataset.productTarget); } catch (error) { feedback(error.message, true); } return; }
  if (!e.target.closest("#product-create")) return;
  const createKey = `revenue.product-create.v1:${networkConfig.chainId}`;
  let request = JSON.parse(localStorage.getItem(createKey) || "null");
  const dialog = document.createElement("dialog");
  dialog.className = "product-create-dialog";
  dialog.innerHTML = `<form><h2>${t("Create a new issuance product", "创建新一期发行产品")}</h2><p>${t("Existing products, subscriptions and transactions are preserved. The new product starts with household application and its own contract addresses.", "已有产品、认购和交易记录继续保留。新产品使用独立合约，从业主申请开始走完整发行流程。")}</p><label>${t("Product name", "产品名称")}<input name="title" maxlength="80" placeholder="${t("Optional", "可选，留空自动编号")}"></label><label class="checkline"><input type="checkbox" required>${t("This is an independent test product. Reusing station evidence does not constitute another sale of real revenue rights.", "我确认这是独立测试产品。复用电站证据仅供测试，不代表重复出售真实收益权。")}</label><p role="status"></p><div class="iv-actions"><button type="button" data-create-cancel class="btn btn-outline">${t("Cancel", "取消")}</button><button class="btn btn-primary">${t("Deploy and start", "部署并开始发行")}</button></div></form>`;
  document.body.append(dialog); dialog.showModal();
  if (request) {
    dialog.querySelector("input[name=title]").value = request.title;
    dialog.querySelector("input[name=title]").disabled = true;
    dialog.querySelector("input[type=checkbox]").checked = true;
    dialog.querySelector("[role=status]").textContent = t("Retry the saved deployment request to recover its product.", "重试已保存的部署请求，恢复同一个产品。");
  }
  dialog.querySelector("[data-create-cancel]").onclick = () => dialog.remove();
  dialog.querySelector("form").onsubmit = async event => {
    event.preventDefault(); event.stopPropagation();
    const submit = dialog.querySelector("button[type=submit],button:not([type])"); submit.disabled = true;
    const status = dialog.querySelector("[role=status]");
    status.textContent = t("Deploying product contracts…", "正在部署新产品合约…");
    try {
      request ||= { title: dialog.querySelector("input[name=title]").value, demoAcknowledged: true, idempotencyKey: crypto.randomUUID() };
      localStorage.setItem(createKey, JSON.stringify(request));
      dialog.querySelector("input[name=title]").disabled = true;
      const result = await api("/api/products/create", request);
      await switchProduct(result.vault, "agent_apply_review");
      localStorage.removeItem(createKey); dialog.remove();
      feedback(t("New product ready. Switch to the household role to submit an application.", "新产品已创建。请切换业主角色提交申请，后续按审核、报价和发行流程继续。"));
    } catch (error) { status.textContent = error.message; submit.disabled = false; }
  };
});
async function walletAction(action, payload) {
  if (!walletProvider())
    throw new Error(t("Selected wallet is not installed", "未安装所选钱包"));
  const idempotencyKey =
    JSON.parse(sessionStorage.getItem(appStorageKey("revenue.pending")) || "null")?.id ||
    crypto.randomUUID();
  const prepared = await api("/api/wallet/prepare", {
    action,
    payload,
    idempotencyKey,
  });
  const accounts = await walletProvider().request({
    method: "eth_requestAccounts",
  });
  if (accounts[0].toLowerCase() !== prepared.account.toLowerCase())
    throw new Error(
      t(
        "Select this role's test account in your wallet: ",
        "请在所选钱包中选择本演示角色的测试账户："
      ) + prepared.account
    );
  await ensureWalletNetwork();
  const sentKey=`revenue.sent.${networkConfig.chainId}.${prepared.account}.${idempotencyKey}`;
  const sent=JSON.parse(localStorage.getItem(sentKey)||'{}');
  try {
    for (const tx of prepared.transactions) {
      const { step, ...request } = tx;
      window.RevenueGuide?.operation({stage:"wallet",action,message:t("Check your account, chain, target contract and requested amount before signing.","请在签名前核对账户、链、目标合约和请求金额。")+" "+prepared.account+" → "+tx.to});
      const txHash = sent[step] || await walletProvider().request({method:"eth_sendTransaction",params:[request]});
      sent[step]=txHash;localStorage.setItem(sentKey,JSON.stringify(sent));
      window.RevenueGuide?.operation({stage:"submitted",action,hash:txHash});
      await api("/api/wallet/submitted", {
        operationId: idempotencyKey,
        step,
        hash: txHash,
      });
      let receipt;
      for (let i = 0; i < 40; i++) {
        receipt = await walletProvider().request({
          method: "eth_getTransactionReceipt",
          params: [txHash],
        });
        if (receipt) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!receipt)
        throw new Error(
          t(
            "Transaction pending; refresh to reconcile chain state",
            "交易处理中；刷新可同步链上状态"
          )
        );
      window.RevenueGuide?.operation({stage:"confirmed",action,hash:txHash});
      await api("/api/wallet/confirm", {
        operationId: idempotencyKey,
        step,
        hash: txHash,
      });
    }
  } catch (error) {
    await api("/api/wallet/reject", {
      operationId: idempotencyKey,
      reason: String(error?.message || "Wallet request rejected").slice(0, 240),
    }).catch(() => {});
    throw error;
  }
  const completed=await api("/api/actions", { action, payload, idempotencyKey });
  localStorage.removeItem(sentKey);return completed;
}
document.addEventListener("click", async (e) => {
  const el = e.target.closest("button");
  if (!el) return;
  try {
    if (el.dataset.walletRole) {
      await requestWalletRole(el.dataset.walletRole);
      return;
    }
    if (el.dataset.role) await setRole(el.dataset.role);
    if (el.dataset.page) {
      wfSelect("");
      wfFilter = "all";
      wfQuery = "";
      page = el.dataset.page;
      render();
      document.querySelector("#main").scrollTop = 0;
    }
    if (el.id === "language") {
      lang = lang === "en" ? "zh" : "en";
      localStorage.setItem("revenue.lang", lang);
      if (state) render();
      else if (walletWorkspaceLoad && walletSession) walletWorkspaceGate(walletSession, walletWorkspaceLoad.error);
      else walletLanding();
    }
    if (el.id === "refresh" || el.id === "wallet-funds-refresh") {
      if (networkConfig?.walletRequired && walletSession && !state) await acceptWalletSession(walletSession);
      else await refresh();
      feedback("");
    }
    if (el.id === "wallet-load-retry" && walletSession && !walletWorkspaceLoad?.pending) {
      await acceptWalletSession(walletSession);
    }
    if (el.id === "wallet-connect" || el.id === "wallet-connect-main") {
      await connectWallet();
    }
    if (el.id === "wallet-faucet" && networkConfig?.publicTestnet) {
      const box=document.createElement('dialog');box.className='wallet-funds-dialog';box.setAttribute('aria-labelledby','base-funds-title');
      box.innerHTML=`<h2 id="base-funds-title">${t('Base Sepolia test funds','Base Sepolia 测试资金')}</h2><p>${t('Use the official faucets and select Base Sepolia. These tokens have no monetary value. The application cannot mint Circle USDC. Return here and refresh your balance after confirmation.','请在官方水龙头选择 Base Sepolia。测试币没有货币价值，本系统无法增发 Circle USDC。到账后返回本页并刷新余额。')}</p><p>${esc(walletSession?.address||'')}</p><p><a href="${esc(networkConfig.faucets.eth)}" target="_blank" rel="noopener">${t('ETH faucet','ETH 水龙头')} ↗</a></p><p><a href="${esc(networkConfig.faucets.usdc)}" target="_blank" rel="noopener">${t('Circle USDC faucet','Circle USDC 水龙头')} ↗</a></p><button class="btn">${t('Close','关闭')}</button>`;
      box.querySelector('button').onclick=()=>box.close();box.addEventListener('close',()=>box.remove(),{once:true});document.body.append(box);box.showModal();return;
    }
    if (el.id === "wallet-faucet") {
      el.disabled = true;
      try {
        feedback(t("Issuing demo funds…", "正在发放测试资金…"));
        const funded = await api("/api/faucet", {});
        await refresh();
        const hashes = [funded.result.ethHash, funded.result.usdcHash]
          .filter(Boolean)
          .join(", ");
        feedback(
          t("Demo funds confirmed", "测试资金已确认") +
            (state.accounts[actor]
              ? ` · ${t("Available balance", "钱包可用余额")} ${money(
                  state.accounts[actor].usdc
                )} mUSDC`
              : "") +
            (hashes
              ? ` · ${hashes}`
              : ` · ${t("balance already sufficient", "余额已经充足")}`)
        );
      } finally {
        el.disabled = false;
      }
    }
    if (el.id === "wallet-import-usdc") {
      if (!walletProvider())
        throw new Error(t("Selected wallet is not installed", "未安装所选钱包"));
      await ensureWalletNetwork();
      const added = await walletProvider().request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: state.manifest.addresses.usdc,
            symbol: networkConfig?.paymentToken?.symbol || "mUSDC",
            decimals: 6,
          },
        },
      });
      feedback(
        added
          ? t("mUSDC added to wallet", "已在钱包中显示 mUSDC")
          : t("Token display was not added", "未添加代币显示")
      );
    }
  } catch (error) {
    feedback(error.message, true);
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "station-select") {
    stationSelection = e.target.value;
    localStorage.setItem(appStorageKey("revenue.station"), stationSelection);
    render();
  }
  if (e.target.id === "account") await setRole(role, e.target.value);
  if (e.target.id === "wallet-mode")
    sessionStorage.setItem(appStorageKey("revenue.wallet"), e.target.checked);
});
document.addEventListener("submit", async (e) => {
  const f = e.target;
  if (!f.dataset.action) return;
  e.preventDefault();
  const action = f.dataset.action,
    payload = JSON.parse(f.dataset.payload);
  try {
    if (f.dataset.wfEditor) {
      const a = state.applications.find((a) => a.id === f.dataset.wfEditor);
      const draft = wfReadDraft(f, a);
      wfSaveDraft(a.id, draft);
      if (
        !e.submitter?.hasAttribute("data-wf-preview") &&
        !wfValidateQuoteSubmission(f, a, draft.assumptions)
      )
        return;
      Object.assign(payload, draft);
    }
    for (const [k, v] of new FormData(f)) {
      if (v === "" || k.startsWith("wf_")) continue;
      payload[k] = unitFields.includes(k)
        ? toUnits(v)
        : ["period", "distributionId", "caseId"].includes(k)
        ? Number(v)
        : k === "assumptions"
        ? JSON.parse(v)
        : ["eligible", "approved"].includes(k)
        ? v === "true"
        : ["acceptProvisional", "riskAccepted", "demoAcknowledged"].includes(k)
        ? true
        : v;
    }
  } catch (error) {
    feedback(t("Check the form: ", "请检查表单：") + error.message, true);
    return;
  }
  if (e.submitter?.hasAttribute("data-wf-preview")) {
    const submit = e.submitter;
    submit.disabled = true;
    feedback(t("Calculating forecast…", "正在计算现金流…"));
    try {
      const report = await api("/api/offer-preview", payload);
      wfPreviews.set(payload.applicationId, report);
      render();
      document
        .querySelector(".wf-report-section")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      feedback(
        t(
          "Preview ready. No offer has been submitted.",
          "试算完成，尚未提交报价。"
        )
      );
    } catch (error) {
      feedback(error.message, true);
    } finally {
      submit.disabled = false;
    }
    return;
  }
  await runBusinessAction(action,payload,f.dataset.retryId);
});
async function runBusinessAction(action,payload,retryId) {
  const canonical = JSON.stringify({ actor, action, payload });
  const pending = JSON.parse(
    sessionStorage.getItem(appStorageKey("revenue.pending")) || "null"
  );
  const idempotencyKey =
    retryId ||
    (pending?.canonical === canonical ? pending.id : crypto.randomUUID());
  sessionStorage.setItem(
    appStorageKey("revenue.pending"),
    JSON.stringify({ canonical, id: idempotencyKey })
  );
  const originalDisabled = new WeakMap();
  document.querySelectorAll("button:not([data-guide-ui])").forEach((b) => {
    originalDisabled.set(b, b.disabled);
    b.disabled = true;
  });
  feedback(t("Waiting for confirmed operation…", "等待操作确认…"));
  window.RevenueGuide?.operation({stage:walletChainActions.has(action)||action==="sign"?"wallet":"processing",action,message:t("Read and confirm the business operation yourself. No step is complete until its result is verified.","请本人阅读并确认业务操作，只有核实结果后才算完成。")});
  try {
    let result;
    if (networkConfig?.walletRequired && action === "sign") {
      const preparedAgreement = await api("/api/wallet/agreement", {
        applicationId: payload.applicationId,
      });
      payload.walletSignature = await walletProvider().request({
        method: "personal_sign",
        params: [preparedAgreement.message, preparedAgreement.account],
      });
    }
    if (networkConfig?.walletRequired && walletChainActions.has(action))
      result = await walletAction(action, payload);
    else if (
      sessionStorage.getItem(appStorageKey("revenue.wallet")) === "true" &&
      walletChainActions.has(action)
    )
      result = await walletAction(action, payload);
    else
      result = await api("/api/actions", { action, payload, idempotencyKey });
    sessionStorage.removeItem(appStorageKey("revenue.pending"));
    wfAfter(action, payload, result);
    if(action==="distribute"&&["agent","trustee"].includes(role))page="agent_product";
    await refresh();
    window.RevenueGuide?.operation({stage:"done",action});
    if (
      [
        "apply",
        "review",
        "offer",
        "approve-offer",
        "accept",
        "sign",
        "admit",
      ].includes(action)
    )
      document.querySelector("#main").scrollTop = 0;
    feedback(
      t(
        "Confirmed. State and transaction receipts refreshed.",
        "操作已确认，状态与交易凭证已更新。"
      ) + (action === "discover" ? " " + JSON.stringify(result.result) : "")
    );
    return {ok:true,result};
  } catch (error) {
    feedback(error.message, true);
    await refresh();
    if(action==="subscribe"&&payload.amountUSDC6){
      const field=document.querySelector('form[data-action="subscribe"] [name="amountUSDC6"]');
      if(field){const amount=BigInt(payload.amountUSDC6);field.value=`${amount/1000000n}.${String(amount%1000000n).padStart(6,"0")}`;}
    }
    window.RevenueGuide?.operation({stage:"failed",action,message:error.message});
    return {ok:false,error:error.message};
  } finally {
    document.querySelectorAll("button").forEach((b) => {
      if (originalDisabled.has(b)) b.disabled = originalDisabled.get(b);
    });
  }
}
(async () => {
  if (location.protocol === "file:") {
    document.body.dataset.fileEntry = "true";
    document.querySelector("#startup-title").textContent =
      "请通过本地服务打开 Demo · Open the local server";
    return;
  }
  try {
    networkConfig = await publicGet("/api/network");
    if (networkConfig.walletRequired) {
      walletLanding();
      const session = await window.RoleLogin.resume(networkConfig);
      if (session) await acceptWalletSession(session);
      else await connectWallet(globalThis.RevenueNetworks?.requestedRole || undefined);
    } else {
      state = await api("/api/state");
      await setRole(role, actor);
    }
  } catch (e) {
    if (networkConfig?.walletRequired) {
      walletLanding(e.message);
      feedback(e.message, true);
      return;
    }
    const title = document.querySelector("#startup-title");
    if (title) title.textContent = "暂时无法连接 Demo · Connection unavailable";
    const message = document.querySelector("#startup-message");
    if (message)
      message.textContent =
        "请确认本地服务及区块链仍在运行，然后刷新页面。Please check the local server and blockchain, then refresh.";
    feedback(e.message, true);
  }
})();
