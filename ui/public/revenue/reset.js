"use strict";
let resetBusy = false;
function clearDemoClient() {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith("revenue.")) sessionStorage.removeItem(key);
  }
  for (const key of Object.keys(localStorage)) {
    if (
      key.startsWith("revenue.dashboard-tariff.") ||
      key === "revenue.station"
    )
      localStorage.removeItem(key);
  }
  wfSelected = "";
  investorReview = "";
  catalogFilter = "current";
  catalogQuery = "";
  stationSelection = "";
  wfQuery = "";
  wfFilter = "all";
  wfDrafts.clear();
  wfPreviews.clear();
  wfEditing.clear();
  dsTab = "overview";
  dsPeriod = "day";
  dsYear = "";
  dsStation = "";
  dsDevicePage = 0;
  dsAlertPage = 0;
  dsSearch = "";
  dsHidden.clear();
  dsPlots.clear();
}
function syncDemoGeneration() {
  const current = state?.manifest?.addresses.vault;
  if (!current) return;
  const previous = sessionStorage.getItem("revenue.generation");
  if (previous && previous !== current) clearDemoClient();
  sessionStorage.setItem("revenue.generation", current);
}
function openResetDialog() {
  if (!state || resetBusy) return;
  const canReset = role === "agent";
  const dialog = document.querySelector("#reset-dialog");
  const pending = JSON.parse(
    sessionStorage.getItem("revenue.reset-pending") || "null"
  );
  const request =
    pending?.expectedVault === state.manifest.addresses.vault
      ? pending
      : {
          expectedVault: state.manifest.addresses.vault,
          idempotencyKey: crypto.randomUUID(),
          confirmation: "RESET_DEMO",
        };
  dialog.innerHTML = `<form id="reset-form"><div class="reset-heading"><span class="reset-icon">↻</span><div><h2 id="reset-title">${t(
    "Start a fresh demo",
    "重新开始 Demo"
  )}</h2><p>${t("This scenario only", "仅重置当前场景")} · ${esc(
    location.host
  )}</p></div></div>
    <p class="reset-intro">${t(
      "Archive the current workflow and deploy a fresh local product. You can then apply and price rights using the updated model.",
      "归档当前业务流程，部署一套全新的本地演示合约。之后可按更新后的模型重新申请、报价和认购。"
    )}</p>
    <div class="reset-counts"><div><strong>${
      state.applications.length
    }</strong><span>${t(
    "Applications / agreements",
    "申请 / 协议"
  )}</span></div><div><strong>${state.valuations.length}</strong><span>${t(
    "Valuation records",
    "估值记录"
  )}</span></div><div><strong>${state.stations.length}</strong><span>${t(
    "Stations retained",
    "保留电站"
  )}</span></div></div>
    <div class="reset-scope"><h3>${t("Start over", "重新开始")}</h3><p>${t(
    "Applications, quotes, agreements, reviews, pool admission, fundraising, demo balances, positions, distributions, transfers, redemptions and servicing cases. Browser quote drafts and tariff overrides are also cleared.",
    "申请、报价、协议、审批、入池、募集、演示代币余额、持仓、分红、转让、赎回及服务事件；同时清除浏览器报价草稿和自定义情景电价。"
  )}</p><h3>${t("Keep", "继续保留")}</h3><p>${t(
    "Captured station telemetry, historical evidence, source mode and server API configuration. The old scenario is backed up before switching contracts.",
    "已采集的电站遥测、历史凭证、数据来源模式和服务器 API 配置。切换合约前自动备份旧场景。"
  )}</p></div>
    <p class="reset-note">${t(
      "The shared blockchain, its clock and other demos stay available. Old contracts remain on-chain; this demo switches to new addresses. Subscription and lock periods begin again with the new workflow. MetaMask must use the new demo token addresses.",
      "共享区块链、链上时钟和其他 Demo 保持可用；旧合约仍留在链上，当前页面切换至新地址。产品期限和锁定期随新流程重新起算。MetaMask 请使用重置后的新演示代币地址。"
    )}</p>
    ${
      canReset
        ? `<label class="reset-ack"><input type="checkbox" id="reset-ack" required>${t(
            "I understand that the current business scenario will be archived and restarted.",
            "我确认将当前业务场景备份归档，并从头开始演示。"
          )}</label>`
        : `<p class="reset-note">${t(
            "Reset is managed by the intermediary demo account. Switch to that role to review and confirm. Switching roles does not reset any data.",
            "重置由中介演示账户执行。请先切换至中介角色，再核对并确认重置。切换角色不会重置数据。"
          )}</p>`
    }
    <p id="reset-status" role="status" aria-live="polite"></p><div class="reset-actions"><button type="button" id="reset-cancel" class="btn btn-outline">${t(
      "Cancel",
      "取消"
    )}</button>${
    canReset
      ? `<button type="submit" id="reset-confirm" class="btn btn-primary" disabled>${t(
          "Back up and reset demo",
          "备份并重置 Demo"
        )}</button>`
      : `<button type="button" id="reset-switch-role" class="btn btn-primary">${t(
          "Switch to intermediary and continue",
          "切换至中介并继续"
        )}</button>`
  }</div></form>`;
  dialog
    .querySelector("#reset-switch-role")
    ?.addEventListener("click", async (e) => {
      const button = e.currentTarget;
      button.disabled = true;
      try {
        if (await setRole("agent") === false) { dialog.close(); return; }
        dialog.close();
        openResetDialog();
      } catch (error) {
        dialog.querySelector("#reset-status").textContent = error.message;
        button.disabled = false;
      }
    });
  dialog.querySelector("#reset-ack")?.addEventListener("change", (e) => {
    dialog.querySelector("#reset-confirm").disabled = !e.target.checked;
  });
  dialog
    .querySelector("#reset-cancel")
    .addEventListener("click", () => dialog.close());
  dialog.querySelector("#reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (
      role !== "agent" ||
      resetBusy ||
      !dialog.querySelector("#reset-ack")?.checked
    )
      return;
    resetBusy = true;
    sessionStorage.setItem("revenue.reset-pending", JSON.stringify(request));
    dialog
      .querySelectorAll("button,input")
      .forEach((el) => (el.disabled = true));
    dialog.querySelector("#reset-status").textContent = t(
      "Backing up and deploying new local contracts…",
      "正在备份并部署新的本地合约…"
    );
    try {
      const { result } = await api("/api/demo/reset", request);
      clearDemoClient();
      selectedProduct = result.vault;
      state = await api("/api/state");
      page = networkConfig?.walletRequired ? "agent_apply_review" : "owner_stations";
      if (networkConfig?.walletRequired) render();
      else await setRole("owner");
      dialog.close();
      feedback(
        t(
          "Demo reset. Station data retained; start a new rights application. Backup: ",
          "Demo 已重置，电站数据已保留，可重新申请收益权。备份："
        ) + result.backup
      );
    } catch (error) {
      dialog.querySelector("#reset-status").textContent =
        t(
          "Reset did not finish in this browser. Retry uses the same request without resetting twice. ",
          "浏览器尚未确认重置完成。重试将沿用同一请求，避免重复重置。"
        ) + error.message;
      dialog
        .querySelectorAll("button,input")
        .forEach((el) => (el.disabled = false));
      dialog.querySelector("#reset-confirm").textContent = t(
        "Retry same reset",
        "重试本次重置"
      );
    } finally {
      resetBusy = false;
    }
  });
  dialog.showModal();
}
document.addEventListener("click", (e) => {
  if (e.target.closest("#demo-reset")) openResetDialog();
});
document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#reset-dialog").addEventListener("cancel", (e) => {
    if (resetBusy) e.preventDefault();
  });
});
