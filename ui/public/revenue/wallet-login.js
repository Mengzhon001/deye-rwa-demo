/* Shared role-first sign-in. This file contains no keys or privileged demo accounts. */
(() => {
  const incomingLanguage = new URLSearchParams(location.search).get("lang");
  if (["zh", "en"].includes(incomingLanguage)) localStorage.setItem("revenue.lang", incomingLanguage);
  const incomingWallet = new URLSearchParams(location.search).get("wallet");
  if (["rabby", "metamask"].includes(incomingWallet)) localStorage.setItem("revenue.wallet", incomingWallet);
  let dialog,
    config,
    chosen = "",
    busy = false,
    epoch = 0,
    loginId = 0,
    onSuccess,
    onCancel;
  let providerBound,
    invalidation = Promise.resolve();
  const wallets = new Map();
  let selectedWallet = localStorage.getItem("revenue.wallet") || "";
  function registerWallet(p, info = {}) {
    if (typeof p?.request !== "function") return;
    const id = p.isRabby || info.rdns === "io.rabby" ? "rabby"
      : info.rdns === "io.metamask" || p.isMetaMask ? "metamask" : info.rdns || "injected";
    wallets.set(id, { provider: p, name: id === "rabby" ? "Rabby" : id === "metamask" ? "MetaMask" : info.name || "Browser wallet" });
  }
  window.addEventListener("eip6963:announceProvider", (event) => {
    registerWallet(event.detail?.provider, event.detail?.info);
    if (dialog?.open && !busy) render(dialog.querySelector(".wl-error")?.textContent || "");
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  function provider() {
    for (const p of window.ethereum?.providers || []) registerWallet(p);
    registerWallet(window.ethereum);
    if (!selectedWallet && wallets.size) selectedWallet = wallets.has("rabby") ? "rabby" : wallets.keys().next().value;
    return wallets.get(selectedWallet)?.provider;
  }
  function walletName() { provider(); return wallets.get(selectedWallet)?.name || (selectedWallet === "rabby" ? "Rabby" : "wallet"); }
  const language = () => localStorage.getItem("revenue.lang") || "zh";
  const tr = (zh, en) => (language() === "zh" ? zh : en);
  const labels = {
    owner: ["业主", "Household"],
    agent: ["中介机构", "Intermediary"],
    investor: ["投资者", "Investor"],
    trustee: ["受托管理人", "Trustee"],
  };
  const descriptions = {
    owner: [
      "申请出售收益权，签署协议及托管授权。",
      "Apply, sign agreements and authorize custody.",
    ],
    agent: [
      "审核电站、准备估值并管理产品运营。",
      "Assess stations, prepare valuations and operate products.",
    ],
    investor: [
      "申请资格、认购产品并管理收益与退出。",
      "Apply for eligibility, subscribe and manage your position.",
    ],
    trustee: [
      "独立审核估值，监督协议与服务事件。",
      "Review valuations and oversee agreements and servicing.",
    ],
  };
  const escape = (v) =>
    String(v).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );
  async function request(path, body) {
    const response = await fetch(path, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Service unavailable");
    return data;
  }
  function invalidate() {
    epoch++;
    invalidation = request("/api/auth/logout", {}).catch(() => {});
    window.dispatchEvent(new Event("revenue-wallet-invalidated"));
  }
  function bind() {
    const p = provider();
    if (!p || providerBound === p) return;
    ["accountsChanged", "chainChanged", "disconnect"].forEach((event) => providerBound?.removeListener?.(event, invalidate));
    providerBound = p;
    ["accountsChanged", "chainChanged", "disconnect"].forEach((event) =>
      p.on?.(event, invalidate)
    );
  }
  function render(message = "") {
    provider();
    const index = language() === "zh" ? 0 : 1;
    dialog.innerHTML = `<div class="wl-top"><span>DEYE / PROTOCOL</span><button type="button" data-wl-close aria-label="${tr(
      "关闭",
      "Close"
    )}">×</button></div><p class="wl-step">${tr(
      "01 选择角色　→　02 连接钱包　→　03 签名登录",
      "01 Choose role → 02 Connect wallet → 03 Sign in"
    )}</p><h2 id="wl-title">${tr(
      "以您的角色进入",
      "Choose your workspace"
    )}</h2><p class="wl-intro">${tr(
      "先选择您要参与的业务。钱包签名确认身份，不会发送交易。",
      "Choose how you participate. Sign-in verifies your identity without sending a transaction."
    )}</p><div class="wl-roles" role="group" aria-label="${tr(
      "登录角色",
      "Sign-in role"
    )}">${Object.keys(labels)
      .map(
        (r, i) =>
          `<button type="button" data-wl-role="${r}" aria-pressed="${
            chosen === r
          }" ${busy ? "disabled" : ""}><span class="wl-number">0${
            i + 1
          }</span><strong>${labels[r][index]}</strong><small>${
            descriptions[r][index]
          }</small></button>`
      )
      .join("")}</div><div class="wl-address">${
      chosen
        ? chosen === "investor"
          ? tr(
              "普通钱包可作为投资者登录。认购前仍须申请投资资格。",
              "An ordinary wallet can sign in as an investor. Subscription requires eligibility approval."
            )
          : `${tr(
              "请使用该角色配置的钱包",
              "Use a configured wallet for this role"
            )}<br>${(config?.roleAddresses?.[chosen] || [])
              .map((a) => `<code>${escape(a)}</code>`)
              .join("<br>")}`
        : tr(
            "选择角色后，连接并签署一次登录消息。",
            "Select a role, then connect and sign a login message."
          )
    }</div><label class="wl-wallet-label">${tr("选择钱包", "Choose wallet")}<select data-wl-wallet ${busy ? "disabled" : ""}>${[...new Set(["rabby", "metamask", ...wallets.keys()])].map(id => `<option value="${escape(id)}" ${selectedWallet === id ? "selected" : ""}>${escape(wallets.get(id)?.name || (id === "rabby" ? "Rabby" : "MetaMask"))}${wallets.has(id) ? "" : tr("（未检测到）", " (not detected)")}</option>`).join("")}</select></label>${incomingWallet === "rabby" ? `<p class="wl-wallet-help">${tr("远程演示请使用 Rabby。MetaMask 公网入口尚未通过验证。", "Use Rabby for the remote demo. Public MetaMask access has not been verified.")}</p>` : ""}<p class="wl-error" role="alert">${escape(
      message
    )}</p><div class="wl-actions"><button type="button" class="wl-connect" data-wl-connect ${
      !chosen || !config || busy ? "disabled" : ""
    }>${
      busy
        ? tr("请在钱包中确认…", "Confirm in your wallet…")
        : tr("连接钱包并登录", "Connect wallet & sign in")
    }</button><button type="button" class="wl-switch" data-wl-switch ${
      busy ? "disabled" : ""
    }>${tr(
      "切换钱包账户",
      "Switch wallet account"
    )}</button></div><p class="wl-foot">${escape(
      config?.chainName || "Deye RWA Local"
    )} · ${tr("本地演示 · 测试资金", "Local demo · Test funds")}</p>`;
  }
  async function ensureNetwork(p) {
    const target = config.chainIdHex.toLowerCase();
    if ((await p.request({ method: "eth_chainId" })).toLowerCase() === target) return;
    // MetaMask may resolve switching before broadcasting chainChanged. Drain the
    // expected notification before binding a new challenge to an event epoch.
    let changed;
    const settled = new Promise((resolve) => {
      changed = (id) => { if (String(id).toLowerCase() === target) resolve(); };
      p.on?.("chainChanged", changed);
    });
    try {
      try {
        await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: config.chainIdHex }] });
      } catch (error) {
        const unknownRabbyChain = p.isRabby && error.code === -32603 && /^Unrecognized chain ID /i.test(error.message || "") && error.message.toLowerCase().includes(config.chainIdHex.toLowerCase());
        if (error.code !== 4902 && !unknownRabbyChain) throw error;
        await p.request({ method: "wallet_addEthereumChain", params: [{
          chainId: config.chainIdHex, chainName: config.chainName,
          rpcUrls: [config.rpcUrl], blockExplorerUrls: [config.explorerUrl], nativeCurrency: config.nativeCurrency,
        }] });
        await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: config.chainIdHex }] });
      }
      await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 2000))]);
      if ((await p.request({ method: "eth_chainId" })).toLowerCase() !== target)
        throw new Error(tr("请切换到演示网络。", "Switch to the demo network."));
    } finally { p.removeListener?.("chainChanged", changed); }
  }
  async function login() {
    if (!chosen || busy) return;
    busy = true;
    render();
    const selected = chosen,
      id = ++loginId;
    let attempt = ++epoch,
      alive = true;
    const guard = () => {
      if (!alive || loginId !== id || !dialog.open || epoch !== attempt)
        throw new Error(
          tr(
            "登录已取消或钱包已变化，请重试。",
            "Sign-in cancelled or wallet changed. Please retry."
          )
        );
    };
    let timer;
    const timeout = new Promise(
      (_, reject) =>
        (timer = setTimeout(
          () =>
            reject(
              new Error(
                tr(
                  "钱包响应超时。请打开所选钱包完成或取消待处理请求后重试。",
                  "Wallet timed out. Open the selected wallet, finish or cancel the pending request, then retry."
                )
              )
            ),
          60000
        ))
    );
    try {
      const work = async () => {
        for (let n = 0; !provider() && n < 20; n++)
          await new Promise((r) => setTimeout(r, 100));
        guard();
        const p = provider();
        if (!p)
          throw new Error(
            tr(
              "未检测到所选钱包。请安装并启用对应扩展，或选择已安装的钱包。",
              "Selected wallet not detected. Enable its extension or choose an installed wallet."
            )
          );
        bind();
        const accounts = await p.request({ method: "eth_requestAccounts" });
        if (!dialog.open) throw new Error("Sign-in cancelled");
        await ensureNetwork(p);
        if (!alive || loginId !== id || !dialog.open)
          throw new Error("Sign-in cancelled");
        attempt = epoch;
        await invalidation;
        guard();
        const address = (await p.request({ method: "eth_accounts" }))[0];
        if (!address || !accounts.length)
          throw new Error(
            tr("没有选择钱包账户。", "No wallet account selected.")
          );
        const allowed = config.roleAddresses[selected];
        if (
          selected !== "investor" &&
          !allowed.some((a) => a.toLowerCase() === address.toLowerCase())
        )
          throw new Error(
            tr(
              "当前钱包不具备所选角色权限。请切换到上方地址，或重新选择角色。",
              "This wallet does not have the selected role. Switch to an address above or choose another role."
            )
          );
        const challenge = await request("/api/auth/challenge", {
          address,
          requestedRole: selected,
        });
        guard();
        const signature = await p.request({
          method: "personal_sign",
          params: [challenge.message, address],
        });
        guard();
        const current = (await p.request({ method: "eth_accounts" }))[0];
        const chain = await p.request({ method: "eth_chainId" });
        if (
          current?.toLowerCase() !== address.toLowerCase() ||
          chain.toLowerCase() !== config.chainIdHex.toLowerCase()
        )
          throw new Error(
            tr(
              "钱包或网络已变化，请重新登录。",
              "Wallet or network changed. Sign in again."
            )
          );
        guard();
        const session = await request("/api/auth/verify", {
          nonce: challenge.nonce,
          signature,
        });
        try {
          guard();
        } catch (e) {
          await request("/api/auth/logout", {});
          throw e;
        }
        return session;
      };
      const session = await Promise.race([work(), timeout]);
      guard();
      localStorage.setItem("revenue.role", session.role);
      localStorage.setItem("revenue.actor", session.actor);
      localStorage.setItem("revenue.wallet", selectedWallet);
      dialog.close();
      await onSuccess(session);
    } catch (e) {
      if (loginId !== id) return;
      epoch++;
      const message =
        e.code === 4001
          ? tr(
              "您取消了钱包请求。可以重新选择角色或重试。",
              "Wallet request declined. Choose a role or retry."
            )
          : e.code === -32002
          ? tr(
              "所选钱包中已有待处理请求，请打开钱包处理。",
              "The selected wallet has a pending request. Open it to continue."
            )
          : e.message;
      busy = false;
      if (dialog.open) render(message);
    } finally {
      alive = false;
      clearTimeout(timer);
      if (loginId === id) busy = false;
    }
  }
  async function open(options = {}) {
    onSuccess =
      options.onSuccess ||
      (() => {
        location.href = "/app/";
      });
    onCancel = options.onCancel;
    chosen = options.role || "";
    busy = false;
    epoch++;
    loginId++;
    config = undefined;
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "wallet-login";
      dialog.setAttribute("aria-labelledby", "wl-title");
      document.body.append(dialog);
      dialog.addEventListener("change", (event) => {
        if (!event.target.matches("[data-wl-wallet]") || busy) return;
        selectedWallet = event.target.value;
        localStorage.setItem("revenue.wallet", selectedWallet);
        invalidate(); bind(); render();
      });
      dialog.addEventListener("cancel", () => {
        epoch++;
        loginId++;
        busy = false;
        onCancel?.();
      });
      dialog.addEventListener("click", async (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.hasAttribute("data-wl-close")) {
          epoch++;
          loginId++;
          busy = false;
          dialog.close();
          onCancel?.();
        }
        if (b.dataset.wlRole && !busy) {
          chosen = b.dataset.wlRole;
          render();
          dialog.querySelector(`[data-wl-role="${chosen}"]`).focus();
        }
        if (b.hasAttribute("data-wl-connect")) await login();
        if (b.hasAttribute("data-wl-switch") && !busy) {
          try {
            if (!provider())
              throw new Error(
                tr("未检测到所选钱包。", "Selected wallet not detected.")
              );
            await provider().request({
              method: "wallet_requestPermissions",
              params: [{ eth_accounts: {} }],
            });
            render();
          } catch (e) {
            render(
              e.code === 4001
                ? tr("已取消切换账户。", "Account switch cancelled.")
                : e.message
            );
          }
        }
      });
    }
    if (!dialog.open) dialog.showModal();
    render();
    try {
      config = options.network || (await request("/api/network"));
      render();
      bind();
    } catch {
      render(
        tr(
          "暂时无法获取演示网络配置，请稍后重试。",
          "Demo network configuration is unavailable. Please retry shortly."
        )
      );
      dialog.querySelector("[data-wl-connect]").disabled = true;
    }
  }
  async function resume(network) {
    config = network;
    const session = await request("/api/session/current");
    if (!session.authenticated) return null;
    for (let n = 0; !provider() && n < 20; n++)
      await new Promise((r) => setTimeout(r, 100));
    if (!provider()) {
      await request("/api/auth/logout", {});
      return null;
    }
    bind();
    const [accounts, chain] = await Promise.all([
      provider().request({ method: "eth_accounts" }),
      provider().request({ method: "eth_chainId" }),
    ]);
    if (
      accounts[0]?.toLowerCase() !== session.address.toLowerCase() ||
      chain.toLowerCase() !== config.chainIdHex.toLowerCase() ||
      session.role !== session.requestedRole
    ) {
      await request("/api/auth/logout", {});
      return null;
    }
    return session;
  }
  window.RoleLogin = { open, resume, provider, walletName };
})();
