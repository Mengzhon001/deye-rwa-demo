import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  translations
} from "./i18n.js";

const LOCALE_STORAGE_KEY = "deye-demo-locale";

const ERROR_MESSAGE_KEYS = {
  "MetaMask was not detected.": "errors.metamaskNotDetected",
  "Connect MetaMask first.": "errors.connectWalletFirst",
  "request failed": "errors.requestFailed",
  "failed to refresh UI state": "errors.refreshFailed",
  "facility deployment failed": "errors.facilityDeploymentFailed",
  "lifecycle update failed": "errors.lifecycleUpdateFailed",
  "buy transaction failed": "errors.buyFailed",
  "redeem transaction failed": "errors.redeemFailed",
  "demo USDC faucet failed": "errors.faucetFailed",
  "wallet connection failed": "errors.walletConnectionFailed",
  "MetaMask was not detected. You can still view the public bond metrics without connecting.":
    "errors.publicMetricsWithoutWallet",
  "provider unavailable for native balance funding":
    "errors.providerUnavailableForNativeBalanceFunding",
  "facility not found in demo store": "errors.facilityNotFoundInDemoStore",
  "missing request url": "errors.missingRequestUrl",
  "not found": "errors.notFound",
  "unknown error": "errors.unknownError"
};

const routes = {
  manager: document.getElementById("manager-view"),
  investor: document.getElementById("investor-view")
};

let currentWallet = null;
let currentState = null;
let currentLocale = loadLocale();

function byId(id) {
  return document.getElementById(id);
}

function localeTag() {
  return currentLocale === "zh-CN" ? "zh-CN" : "en-US";
}

function translationForLocale(locale, key) {
  return key.split(".").reduce((value, part) => {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    return value[part];
  }, translations[locale]);
}

function t(key, values = {}) {
  const template = translationForLocale(currentLocale, key);
  if (typeof template !== "string") {
    return key;
  }

  return template.replace(/\{(\w+)\}/gu, (_, name) => `${values[name] ?? ""}`);
}

function loadLocale() {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (SUPPORTED_LOCALES.includes(stored)) {
      return stored;
    }
  } catch {}

  return DEFAULT_LOCALE;
}

function persistLocale(locale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {}
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function rawHtml(html) {
  return { html };
}

function renderCellValue(value) {
  if (value && typeof value === "object" && "html" in value) {
    return value.html;
  }
  return escapeHtml(value);
}

function shortWallet(wallet) {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function setLocalizedDefaultValue(element, key) {
  const knownValues = SUPPORTED_LOCALES.map((locale) => translationForLocale(locale, key)).filter(
    (value) => typeof value === "string"
  );
  const nextValue = t(key);
  if (!element.value || knownValues.includes(element.value)) {
    element.value = nextValue;
  }
}

function applyStaticTranslations() {
  document.documentElement.lang = currentLocale;
  document.body.dataset.locale = currentLocale;
  document.title = t("meta.title");

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });

  document.querySelectorAll("[data-i18n-default-value]").forEach((element) => {
    setLocalizedDefaultValue(element, element.dataset.i18nDefaultValue);
  });

  document.querySelectorAll("[data-locale-switch]").forEach((button) => {
    const isActive = button.dataset.localeSwitch === currentLocale;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.setAttribute(
      "aria-label",
      `${t("common.language")}: ${LOCALE_LABELS[button.dataset.localeSwitch]}`
    );
  });
}

function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale) || locale === currentLocale) {
    return;
  }

  currentLocale = locale;
  persistLocale(locale);
  applyStaticTranslations();
  render();
}

function translateErrorMessage(message) {
  const translationKey = ERROR_MESSAGE_KEYS[message];
  return translationKey ? t(translationKey) : message;
}

function errorText(error, fallbackKey) {
  if (error instanceof Error && error.message) {
    return translateErrorMessage(error.message);
  }
  return t(fallbackKey);
}

function translateStatus(status) {
  return t(`status.${status}`);
}

function translateActivitySource(source) {
  return t(`activity.source.${source}`);
}

function translateActivityKind(kind) {
  return t(`activity.kind.${kind}`);
}

function translateTradeKind(kind) {
  return t(`trade.kind.${kind}`);
}

function translateClaimMode(mode) {
  return t(`claimMode.${mode}`);
}

function localizeMessageValues(values = {}) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      if (key === "status") {
        return [key, translateStatus(value)];
      }
      if (key === "reason") {
        return [key, translateErrorMessage(value)];
      }
      return [key, value];
    })
  );
}

function formatMessage(message) {
  if (!message) {
    return "";
  }

  if (typeof message === "string") {
    return message;
  }

  return t(message.key, localizeMessageValues(message.values));
}

function formatNumber(value, options = {}) {
  return new Intl.NumberFormat(localeTag(), options).format(Number(value || 0));
}

function formatInteger(value) {
  return formatNumber(value, { maximumFractionDigits: 0 });
}

function formatMicroUsdc(value) {
  const amount = Number(value || 0) / 1_000_000;
  return formatNumber(amount, { maximumFractionDigits: 2 });
}

function formatDbond(raw) {
  const amount = Number(raw || 0) / 1_000_000_000_000_000_000;
  return formatNumber(amount, { maximumFractionDigits: 2 });
}

function formatEthWei(raw) {
  const amount = Number(raw || 0) / 1_000_000_000_000_000_000;
  return formatNumber(amount, { maximumFractionDigits: 4 });
}

function formatPercent(value) {
  return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(value) {
  if (!value) {
    return t("common.notAvailable");
  }
  return new Date(value).toLocaleTimeString(localeTag());
}

function money(value) {
  return `$${formatMicroUsdc(value)}`;
}

function setNotice(text) {
  byId("notice-banner").textContent = text;
}

function renderWalletStatus() {
  byId("wallet-status").textContent = currentWallet
    ? t("common.connected", { wallet: shortWallet(currentWallet) })
    : t("common.walletNotConnected");
}

function injectedProvider() {
  if (!window.ethereum) {
    return null;
  }

  if (Array.isArray(window.ethereum.providers) && window.ethereum.providers.length > 0) {
    return (
      window.ethereum.providers.find((provider) => provider.isMetaMask) || window.ethereum.providers[0]
    );
  }

  return window.ethereum;
}

async function providerRequest(method, params) {
  const provider = injectedProvider();
  if (!provider) {
    throw new Error("MetaMask was not detected.");
  }

  return provider.request({
    method,
    ...(params ? { params } : {})
  });
}

async function currentChainIdHex(provider) {
  try {
    const chainId = await provider.request({ method: "eth_chainId" });
    if (typeof chainId === "string") {
      return chainId;
    }
  } catch (error) {
    if (!String(error?.message || error).includes("not supported")) {
      throw error;
    }
  }

  const networkId = await provider.request({ method: "net_version" });
  return `0x${Number(networkId).toString(16)}`;
}

function expectedChainIdHex() {
  const chainId = currentState?.contractHealth?.chainId || 31337;
  return `0x${Number(chainId).toString(16)}`;
}

async function ensureDemoChain() {
  const provider = injectedProvider();
  if (!provider) {
    throw new Error("MetaMask was not detected.");
  }

  const targetChainId = expectedChainIdHex();
  const currentChainId = await currentChainIdHex(provider);
  if (currentChainId === targetChainId) {
    return;
  }

  try {
    await providerRequest("wallet_switchEthereumChain", [{ chainId: targetChainId }]);
  } catch (error) {
    if (error && error.code === 4902) {
      await providerRequest("wallet_addEthereumChain", [
        {
          chainId: targetChainId,
          chainName: "Hardhat Local 31337",
          rpcUrls: ["http://127.0.0.1:8545"],
          nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18
          }
        }
      ]);
      return;
    }
    throw error;
  }
}

function setRoute(route) {
  Object.entries(routes).forEach(([key, view]) => {
    view.classList.toggle("active", key === route);
  });
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === route);
  });
}

function statusPill(status) {
  const tone = status === "ACTIVE" ? "active" : status === "PENDING" ? "pending" : "retired";
  return rawHtml(`<span class="pill ${tone}">${escapeHtml(translateStatus(status))}</span>`);
}

function metricCards(target, cards) {
  target.innerHTML = cards
    .map(
      (card) => `
        <article class="metric-card">
          <div class="metric-label">${escapeHtml(card.label)}</div>
          <div class="metric-value">${escapeHtml(card.value)}</div>
          <div class="metric-label">${escapeHtml(card.caption)}</div>
        </article>
      `
    )
    .join("");
}

function stack(target, rows) {
  target.innerHTML = rows
    .map(
      (row) => `
        <div class="stack-row">
          <span>${escapeHtml(row.label)}</span>
          <strong>${renderCellValue(row.value)}</strong>
        </div>
      `
    )
    .join("");
}

function table(target, columns, rows) {
  target.innerHTML = `
    <table>
      <thead>
        <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>${row.map((cell) => `<td>${renderCellValue(cell)}</td>`).join("")}</tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function codeValue(value) {
  return rawHtml(`<code>${escapeHtml(value)}</code>`);
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "request failed");
  }
  return payload;
}

async function fetchState() {
  try {
    const query = currentWallet ? `?walletAddress=${currentWallet}` : "";
    const response = await fetch(`/api/state${query}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "failed to refresh UI state");
    }
    currentState = payload;
    render();
  } catch (error) {
    console.error(error);
    setNotice(errorText(error, "errors.refreshFailed"));
  }
}

function render() {
  applyStaticTranslations();
  renderWalletStatus();

  if (!currentState) {
    return;
  }

  metricCards(byId("manager-cards"), [
    {
      label: t("metrics.manager.facilities"),
      value: formatInteger(currentState.managerOverview.facilitiesTotal),
      caption: t("metrics.manager.activeCaption", {
        count: formatInteger(currentState.managerOverview.activeFacilities)
      })
    },
    {
      label: t("metrics.manager.claimedPeriods"),
      value: formatInteger(currentState.managerOverview.periodsClaimed),
      caption: t("metrics.manager.nextTickCaption", {
        time: formatTime(currentState.scheduler.nextTickAtMs)
      })
    },
    {
      label: t("metrics.manager.rewards"),
      value: money(currentState.managerOverview.totalRewardsUSDC6),
      caption: t("metrics.manager.rewardsCaption")
    },
    {
      label: t("metrics.manager.marketReserve"),
      value: money(currentState.managerOverview.reserveUSDC6),
      caption: t("metrics.manager.inventoryCaption", {
        amount: formatDbond(currentState.managerOverview.marketInventoryOnchain)
      })
    }
  ]);

  table(
    byId("facility-table"),
    [
      t("tables.facility.facility"),
      t("tables.facility.assetId"),
      t("tables.facility.status"),
      t("tables.facility.holder"),
      t("tables.facility.facilityValue"),
      t("tables.facility.rewarded"),
      t("tables.facility.nextTick")
    ],
    currentState.facilities.map((facility) => [
      facility.displayName,
      codeValue(`${facility.facility.assetId.slice(0, 10)}...`),
      statusPill(facility.onchainStatus),
      facility.currentHolder
        ? codeValue(`${facility.currentHolder.slice(0, 10)}...`)
        : t("common.notAvailable"),
      money(facility.facility.commercialTerms.acquisitionCostUSDC6),
      money(facility.totalRewardedUSDC6),
      formatTime(facility.nextRevenueTickAtMs)
    ])
  );

  table(
    byId("period-table"),
    [
      t("tables.period.facility"),
      t("tables.period.period"),
      t("tables.period.reward"),
      t("tables.period.status"),
      t("tables.period.claimMode")
    ],
    currentState.periods.map((period) => [
      period.facilityDisplayId,
      period.periodId,
      money(period.rewardAmountUSDC6),
      translateStatus(period.rewardStatus),
      translateClaimMode(period.claimMode)
    ])
  );

  stack(byId("contract-summary"), [
    {
      label: t("summary.contract.network"),
      value: `${currentState.contractHealth.network} (${currentState.contractHealth.chainId})`
    },
    {
      label: t("summary.contract.functionsRouter"),
      value: currentState.contractHealth.addresses.functionsRouter
    },
    {
      label: t("summary.contract.dbondMarket"),
      value: currentState.contractHealth.addresses.dbondMarket
    },
    {
      label: t("summary.contract.rwaVaultNavPerShare"),
      value: money(currentState.contractHealth.navPerShareUSDC6)
    },
    {
      label: t("summary.contract.vaultAssets"),
      value: money(currentState.contractHealth.totalVaultAssetsUSDC6)
    }
  ]);

  stack(byId("bond-summary"), [
    {
      label: t("summary.bond.onchainSupply"),
      value: formatDbond(currentState.bondMetrics.totalSupplyOnchain)
    },
    {
      label: t("summary.bond.marketInventory"),
      value: formatDbond(currentState.bondMetrics.marketInventoryOnchain)
    },
    {
      label: t("summary.bond.marketReserve"),
      value: money(currentState.bondMetrics.marketReserveUSDC6)
    },
    {
      label: t("summary.bond.pricePerShare"),
      value: money(currentState.bondMetrics.marketPriceUSDC6)
    },
    {
      label: t("summary.bond.totalReturn"),
      value: `${formatPercent(currentState.bondMetrics.returnPct)}%`
    },
    {
      label: t("summary.bond.simulatedApy"),
      value: `${formatPercent(currentState.bondMetrics.simulatedApyPct)}%`
    }
  ]);

  table(
    byId("activity-table"),
    [
      t("tables.activity.time"),
      t("tables.activity.source"),
      t("tables.activity.kind"),
      t("tables.activity.summary"),
      t("tables.activity.ref")
    ],
    currentState.activity.map((entry) => [
      formatTime(entry.timestamp),
      translateActivitySource(entry.source),
      translateActivityKind(entry.kind),
      formatMessage(entry.summary),
      entry.txHash ? codeValue(`${entry.txHash.slice(0, 10)}...`) : translateStatus(entry.status)
    ])
  );

  metricCards(byId("investor-cards"), [
    {
      label: t("metrics.investor.totalSupply"),
      value: formatDbond(currentState.bondMetrics.totalSupplyOnchain),
      caption: t("metrics.investor.totalSupplyCaption")
    },
    {
      label: t("metrics.investor.inventoryLeft"),
      value: formatDbond(currentState.bondMetrics.marketInventoryOnchain),
      caption: t("metrics.investor.inventoryLeftCaption")
    },
    {
      label: t("metrics.investor.navPerShare"),
      value: money(currentState.bondMetrics.navPerShareUSDC6),
      caption: t("metrics.investor.navPerShareCaption")
    },
    {
      label: t("metrics.investor.simulatedApy"),
      value: `${formatPercent(currentState.bondMetrics.simulatedApyPct)}%`,
      caption: t("metrics.investor.simulatedApyCaption")
    }
  ]);

  stack(byId("investor-bond-overview"), [
    {
      label: t("summary.notices.marketNotice"),
      value: formatMessage(currentState.notices.marketState)
    },
    {
      label: t("summary.notices.cadenceNotice"),
      value: formatMessage(currentState.notices.simulationDisclosure)
    },
    {
      label: t("summary.notices.networkMode"),
      value: formatMessage(currentState.notices.networkMode)
    }
  ]);

  stack(byId("investor-wallet-summary"), [
    {
      label: t("summary.wallet.connectedWallet"),
      value: currentState.investor.walletAddress || t("common.walletNotConnected")
    },
    {
      label: t("summary.wallet.onchainDbondBalance"),
      value: formatDbond(currentState.investor.onchainBalance)
    },
    {
      label: t("summary.wallet.demoUsdcBalance"),
      value: money(currentState.investor.usdcBalance)
    },
    {
      label: t("summary.wallet.demoEthBalance"),
      value: `${formatEthWei(currentState.investor.nativeBalanceWei)} ETH`
    }
  ]);

  table(
    byId("investor-history"),
    [
      t("tables.history.type"),
      t("tables.history.dbond"),
      t("tables.history.usdc6"),
      t("tables.history.status"),
      t("tables.history.reference")
    ],
    currentState.investor.marketTrades.map((trade) => [
      translateTradeKind(trade.kind),
      trade.shareAmount ? formatDbond(trade.shareAmount) : t("common.notAvailable"),
      trade.amountUSDC6 ? money(trade.amountUSDC6) : t("common.notAvailable"),
      translateStatus(trade.status),
      trade.txHash ? codeValue(`${trade.txHash.slice(0, 10)}...`) : trade.id
    ])
  );

  setNotice(formatMessage(currentState.notices.networkMode));
}

async function waitForReceipt(txHash) {
  while (true) {
    const receipt = await providerRequest("eth_getTransactionReceipt", [txHash]);
    if (receipt) {
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function executePreparedTransactions(path, amountUnits) {
  if (!currentWallet) {
    alert(t("errors.connectWalletFirst"));
    return;
  }
  if (!injectedProvider()) {
    alert(t("errors.metamaskNotDetected"));
    return;
  }

  const prepared = await postJson(path, {
    walletAddress: currentWallet,
    amountUnits
  });

  for (const step of prepared.steps) {
    setNotice(t("common.processingStep", { step: formatMessage(step.label) }));
    await ensureDemoChain();
    const txHash = await providerRequest("eth_sendTransaction", [step.request]);
    await waitForReceipt(txHash);
    await postJson("/api/investor/record-market-tx", {
      walletAddress: currentWallet,
      txHash,
      kind: step.kind,
      shareAmount: step.shareAmount,
      amountUSDC6: step.amountUSDC6
    });
  }

  await fetchState();
}

document.querySelectorAll("[data-locale-switch]").forEach((button) => {
  button.addEventListener("click", () => {
    setLocale(button.dataset.localeSwitch);
  });
});

byId("refresh-manager").addEventListener("click", () => {
  void fetchState();
});

byId("deploy-form").addEventListener("submit", async (event) => {
  try {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await postJson("/api/manager/deploy-facility", {
      adminAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      deploymentInput: {
        facilityName: form.get("facilityName"),
        facilityType: "INVERTER",
        location: {
          country: "Singapore",
          region: form.get("region"),
          siteName: form.get("siteName"),
          latitude: 1.3483,
          longitude: 103.6831
        },
        commercialTerms: {
          acquisitionCostUSDC6: form.get("acquisitionCostUSDC6"),
          commissionedAt: Math.floor(Date.now() / 1000),
          expectedLifetimePeriods: 120
        },
        technicalProfile: {
          nameplateCapacityKW: Number(form.get("nameplateCapacityKW")),
          gridConnectionId: `GRID-${Date.now()}`
        },
        beneficiary: "0x1111111111111111111111111111111111111111",
        operatorId: "ui.manager.operator",
        activateOnDeploy: true
      }
    });
    await fetchState();
  } catch (error) {
    console.error(error);
    alert(errorText(error, "errors.facilityDeploymentFailed"));
  }
});

byId("lifecycle-form").addEventListener("submit", async (event) => {
  try {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await postJson("/api/manager/submit-lifecycle", {
      facilityAssetId: form.get("facilityAssetId"),
      eventInput: {
        eventType: form.get("eventType"),
        eventTs: Math.floor(Date.now() / 1000),
        reason: form.get("reason")
      }
    });
    await fetchState();
  } catch (error) {
    console.error(error);
    alert(errorText(error, "errors.lifecycleUpdateFailed"));
  }
});

byId("buy-form").addEventListener("submit", async (event) => {
  try {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await executePreparedTransactions("/api/investor/prepare-buy", Number(form.get("amountUnits")));
  } catch (error) {
    console.error(error);
    alert(errorText(error, "errors.buyFailed"));
  }
});

byId("redeem-form").addEventListener("submit", async (event) => {
  try {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await executePreparedTransactions("/api/investor/prepare-redeem", Number(form.get("amountUnits")));
  } catch (error) {
    console.error(error);
    alert(errorText(error, "errors.redeemFailed"));
  }
});

byId("request-faucet").addEventListener("click", async () => {
  try {
    if (!currentWallet) {
      alert(t("errors.connectWalletFirst"));
      return;
    }
    await postJson("/api/investor/faucet", {
      walletAddress: currentWallet,
      amountUnits: 0
    });
    await fetchState();
  } catch (error) {
    console.error(error);
    alert(errorText(error, "errors.faucetFailed"));
  }
});

byId("connect-wallet").addEventListener("click", async () => {
  try {
    if (!injectedProvider()) {
      alert(t("errors.publicMetricsWithoutWallet"));
      return;
    }

    await ensureDemoChain();
    const [account] = await providerRequest("eth_requestAccounts");
    currentWallet = account || null;
    renderWalletStatus();
    if (currentWallet) {
      await postJson("/api/investor/fund-native", {
        walletAddress: currentWallet,
        amountUnits: 0
      });
    }
    await fetchState();
  } catch (error) {
    console.error(error);
    alert(errorText(error, "errors.walletConnectionFailed"));
  }
});

const walletProvider = injectedProvider();

if (walletProvider) {
  providerRequest("eth_accounts")
    .then((accounts) => {
      if (accounts && accounts[0]) {
        currentWallet = accounts[0];
        renderWalletStatus();
        void fetchState();
      }
    })
    .catch((error) => console.error(error));

  walletProvider.on?.("accountsChanged", (accounts) => {
    currentWallet = accounts && accounts[0] ? accounts[0] : null;
    renderWalletStatus();
    void fetchState();
  });

  walletProvider.on?.("chainChanged", () => {
    void fetchState();
  });
}

window.addEventListener("hashchange", () => {
  const route = window.location.hash.replace("#", "") || "manager";
  setRoute(route);
});

applyStaticTranslations();
renderWalletStatus();
setRoute(window.location.hash.replace("#", "") || "manager");
void fetchState();
setInterval(fetchState, 5000);
