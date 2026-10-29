/// <reference types="vite/client" />
import "./style.css";
import docs from "./docs.generated.json";
import example from "./cashflow-example.generated.json";
import "../../public/revenue/period-timeline.js";
import "../../public/revenue/period-timeline.css";

declare global {
  interface Window {
    RevenueNetworks?: { appPath(suffix?: string): string };
    RoleLogin: { open(options?: any): Promise<void> };
    RevenueTimeline: {
      owner(report: unknown, price: string, currency: string, lang: string): unknown;
      investor(projection: unknown, reports: unknown[], lang: string): unknown;
      render(model: unknown): string;
    };
  }
}
type Lang = "zh" | "en";
const siteBase = import.meta.env.BASE_URL;
const sitePath = (path: string) => siteBase + path.replace(/^\//, "");
const pagesMode = siteBase !== "/";
type RemoteConfig = { app: string; explorer: string; rpc: string; chainId: number; walletEntryStatus?: string; preferredWallet?: string; wallets?: Record<string,string> };
const remoteConfig: Promise<RemoteConfig | null> = pagesMode
  ? fetch(sitePath("remote.json"), { cache: "no-store" }).then(r => {
      if (!r.ok) throw new Error("Remote configuration unavailable");
      return r.json();
    }).then(c => {
      for (const key of ["app", "explorer", "rpc"]) {
        const u = new URL(c[key]);
        const allowedHost = u.hostname.endsWith(".trycloudflare.com") || key === "app" && [".ngrok-free.app", ".ngrok-free.dev", ".ngrok.app"].some(s => u.hostname.endsWith(s));
        if (u.protocol !== "https:" || !allowedHost || u.pathname !== "/" || u.username || u.password || u.port || u.search || u.hash)
          throw new Error("Invalid remote endpoint");
      }
      if (c.chainId !== 20261008) throw new Error("Wrong remote chain");
      return c;
    }).catch(() => null)
  : Promise.resolve(null);
type UnifiedConfig = { app: string; version: number; networks: {id: string; chainId: number}[] };
const unifiedConfig: Promise<UnifiedConfig | null> = pagesMode
  ? fetch(sitePath("networks.json"), {cache:"no-store"}).then(r=>r.ok?r.json():null).then(c=>{
      if(!c)return null;const u=new URL(c.app);
      if(c.version!==1 || u.protocol!=="https:" || !u.hostname.endsWith(".trycloudflare.com") || u.pathname!=="/" || u.username || u.password || u.port || u.search || u.hash || c.networks?.length!==2 || !c.networks.some((n:any)=>n.id==="private"&&n.chainId===20261008) || !c.networks.some((n:any)=>n.id==="base-sepolia"&&n.chainId===84532))throw Error("Invalid unified network entry");
      return c;
    }).catch(()=>null) : Promise.resolve(null);
let selectedNetwork=new URLSearchParams(location.search).get("network") || localStorage.getItem("revenue.preferred-network") || "private";
if(!["private","base-sepolia"].includes(selectedNetwork))selectedNetwork="private";
async function publicRead(path: string, timeout = 10000) {
  if(pagesMode){
    const c=await unifiedConfig;if(!c)throw Error("Remote environment unavailable");
    return fetch(c.app+`/networks/${selectedNetwork}`+path,{credentials:"omit",signal:AbortSignal.timeout(timeout),cache:"no-store"});
  }
  return (window as any).RevenueNetworks?.fetch(path,{credentials:"omit",signal:AbortSignal.timeout(timeout),cache:"no-store"}) || fetch(path,{credentials:"omit",signal:AbortSignal.timeout(timeout),cache:"no-store"});
}

function showLaunchError(walletStatus?: string) {
  let message = document.querySelector<HTMLElement>("#remote-unavailable");
  if (!message) {
    message = document.createElement("p"); message.id = "remote-unavailable";
    message.setAttribute("role", "alert");
    document.querySelector(".site-header")?.after(message);
  }
  message.textContent = walletStatus === "blocked"
    ? tr("当前应用域名未通过钱包安全检查，暂不开放登录。文档及链上记录仍可查看。请勿关闭钱包安全检测。", "The application domain failed wallet safety checks, so login is unavailable. Documentation and on-chain records remain available. Keep wallet security checks enabled.")
    : walletStatus === "unverified"
    ? tr("新的应用域名正在等待真实钱包验证。文档及链上记录仍可查看。", "The new application domain awaits real-wallet verification. Documentation and on-chain records remain available.")
    : tr("远程测试环境暂不可用。请联系演示负责人启动服务后重试。", "The remote test environment is unavailable. Ask the demo operator to start it and retry.");
}
let lang: Lang = localStorage.getItem("revenue.lang") === "en" ? "en" : "zh";
const root = document.querySelector<HTMLDivElement>("#site")!;
const tr = (zh: string, en: string) => (lang === "zh" ? zh : en);
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ]!)
  );
const link = (slug = "overview") => sitePath(`docs/${lang}/${slug}/`);
const launch = `<button class="launch" data-launch>Launch App <span aria-hidden="true">↗</span></button>`;
function header() {
  return `<a class="skip" href="#main">${tr(
    "跳至内容",
    "Skip to content"
  )}</a><header class="site-header"><a class="wordmark" href="${siteBase}" aria-label="Deye RWA home"><strong>Deye</strong><span>RWA</span></a><nav class="site-nav" aria-label="${tr(
    "主导航",
    "Main navigation"
  )}"><a class="nav-secondary" href="${siteBase}#how-it-works">${tr(
    "工作原理",
    "How it works"
  )}</a><a class="nav-secondary" href="${link()}">Documentation ↗</a><button class="language" data-language>${tr(
    "EN",
    "中文"
  )}</button>${pagesMode?`<label class="site-network-label"><span class="sr-only">${tr('当前网络','Current network')}</span><select class="language" data-site-network aria-label="${tr('当前网络','Current network')}"><option value="private" ${selectedNetwork==='private'?'selected':''}>${tr('私有演示链','Private demo')}</option><option value="base-sepolia" ${selectedNetwork==='base-sepolia'?'selected':''}>Base Sepolia</option></select></label>`:''}${launch}</nav></header>`;
}
function footer() {
  return `<footer class="site-footer"><a class="wordmark" href="${siteBase}"><strong>Deye</strong><span>RWA</span></a><span>${tr(
    "本地演示 · 测试资金 · 未经独立安全审计",
    "Local demo · Test funds · No independent security audit"
  )}</span><nav><a href="${link()}">Documentation</a><a href="${link(
    "contracts"
  )}">${tr("合约源码", "Source code")}</a><a href="${link("limitations")}">${tr(
    "风险与边界",
    "Limitations"
  )}</a>${pagesMode ? `<a href="${sitePath("manual/")}">${tr("操作手册", "Operating manuals")}</a>` : ""}</nav></footer>`;
}
function fallback() {
  return `<svg class="hero-fallback" viewBox="0 0 850 620" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="land" x2="1" y2="1"><stop stop-color="#173b43"/><stop offset="1" stop-color="#0a222c"/></linearGradient><pattern id="solar" width="23" height="18" patternUnits="userSpaceOnUse"><rect width="23" height="18" fill="#124665" stroke="#538496" stroke-width=".7"/></pattern></defs><ellipse cx="439" cy="330" rx="353" ry="201" fill="none" stroke="#476d6255"/><path d="M100 345 411 150 748 325 441 524Z" fill="url(#land)" stroke="#346156"/>${[
    0, 1, 2,
  ]
    .map((y) =>
      [0, 1, 2]
        .map(
          (x) =>
            `<path d="M${160 + x * 66 + y * 52} ${
              318 - x * 40 + y * 27
            } l55 -33 56 29 -55 33Z" fill="url(#solar)" stroke="#6f9b9b"/>`
        )
        .join("")
    )
    .join(
      ""
    )}<path d="M540 264 603 229 644 252 583 287Z" fill="#abd3c6"/><path d="M540 264v-91l63-35v91Z" fill="#799e9b"/><path d="M603 138l41 23v91l-41-23Z" fill="#486e71"/><path d="M540 173l41 23 63-35-41-23Z" fill="#a6c5b9"/><path d="M565 389v-85l67-35 70 36v85l-68 37Z" fill="#194651" stroke="#a1ddbd"/><path d="M565 304l69 35 68-34M634 339v88" stroke="#9bceaf" fill="none"/><path d="M408 333l86 43 0-95 45-28M625 254l70 40" fill="none" stroke="#d6ebb6" stroke-width="2" stroke-dasharray="6 8"/></svg>`;
}
function home() {
  document.title = tr(
    "Deye RWA · 清洁能源，透明收益",
    "Deye RWA · Clean energy. Verifiable revenue."
  );
  root.innerHTML =
    header() +
    `<div class="demo-strip"><span class="dot"></span>${tr(
      "能源收益权协议 / 私链与 Base Sepolia / 测试资金",
      "ENERGY REVENUE RIGHTS / PRIVATE DEMO + BASE SEPOLIA / TEST FUNDS"
    )}</div><main id="main"><section class="hero"><div class="hero-copy"><p class="eyebrow">REAL ENERGY. VERIFIABLE VALUE.</p><h1>${tr(
      "让清洁能源的收益<br><em>看得见，可验证。</em>",
      "Clean energy.<br><em>Verifiable value.</em>"
    )}</h1><p class="hero-description">${tr(
      "从真实电站数据出发，将有限期能源收益权连接到链上。每一份估值有依据，每一步资金流可追溯。",
      "Connect finite energy revenue rights to the blockchain, starting with real station data. Trace the valuation, the agreement and every movement of funds."
    )}</p><div class="hero-actions">${launch}<a class="text-link" href="${link()}">${tr(
      "了解协议",
      "Explore the protocol"
    )} ↗</a></div><p class="hero-caption">${tr(
      "光伏与储能 / 数据驱动估值 / 链上资金记录",
      "SOLAR + STORAGE / DATA-INFORMED VALUATION / ONCHAIN ACCOUNTING"
    )}</p></div><div class="hero-visual" id="energy-scene">${fallback()}<span class="visual-tag tag-solar">01 / SOLAR</span><span class="visual-tag tag-battery">02 / STORAGE</span><span class="visual-tag tag-vault">03 / REVENUE RIGHTS</span></div><div class="metrics" aria-live="polite"><div class="metric"><span class="metric-label">${tr(
      "接入遥测电站",
      "Connected telemetry stations"
    )}</span><strong data-stat="telemetryStations">—</strong><small data-modes>${tr(
      "正在核对数据来源",
      "Checking data provenance"
    )}</small></div><div class="metric"><span class="metric-label">${tr(
      "收益权入池电站",
      "Stations admitted to the vault"
    )}</span><strong data-stat="admittedStations">—</strong><small>${tr(
      "以当前场景链上记录为准",
      "Confirmed in the current scenario"
    )}</small></div><div class="metric"><span class="metric-label">${tr(
      "已发布产品",
      "Published products"
    )}</span><strong data-stat="publishedProducts">—</strong><small>${tr(
      "已部署的草稿不计入",
      "Deployed drafts are excluded"
    )}</small></div><div class="metric"><span class="metric-label">${tr(
      "网络",
      "Network"
    )}</span><strong>Deye Local</strong><small data-network>${tr(
      "正在连接本地节点",
      "Connecting to local network"
    )}</small></div></div></section>
  <section class="section section-line" id="how-it-works"><div class="section-heading reveal"><div><p class="eyebrow">01 / FROM ENERGY TO REVENUE RIGHTS</p><h2>${tr(
    "真实资产的收益，<br>清晰可循的路径。",
    "A clear path from<br>energy to revenue rights."
  )}</h2></div><p>${tr(
      "设备始终归业主所有。协议将约定比例、约定期限的业主电费与售电收益权纳入资产池，由投资者分享实际归集的现金。",
      "Equipment stays with the household. The vault acquires a defined share of household electricity payments plus export revenue for a finite term. Investors participate in the cash actually collected."
    )}</p></div><div class="process reveal">${[
      [
        "⌁",
        tr("观测能源", "Observe energy"),
        tr(
          "采集电站遥测与历史电量，保留来源、时间和原始证据摘要。",
          "Capture station telemetry and historical energy with timestamps and evidence hashes."
        ),
      ],
      [
        "◈",
        tr("评估收益权", "Value the rights"),
        tr(
          "根据季节性、成本和电价假设预测现金流，由中介准备、受托人审核。",
          "Forecast seasonal cashflows and explicit costs. An intermediary prepares; a trustee reviews."
        ),
      ],
      [
        "⬡",
        tr("链上发行", "Settle onchain"),
        tr(
          "业主签署协议，完成凭证托管。认购经中介审核且募集资金条件满足后，结算并发行份额。",
          "Sign the agreement and authorize custody. Issue shares only after funding and intermediary order-review conditions are met."
        ),
      ],
      [
        "↗",
        tr("分配与退出", "Distribute & exit"),
        tr(
          "按已归集现金分配。锁定期后按规则转让或申请受流动性限制的赎回。",
          "Distribute collected cash. After the lock, transfer or request liquidity-limited redemptions."
        ),
      ],
    ]
      .map(
        (a, i) =>
          `<article><span class="number">0${
            i + 1
          } /</span><span class="step-icon" aria-hidden="true">${
            a[0]
          }</span><h3>${a[1]}</h3><p>${a[2]}</p></article>`
      )
      .join("")}</div></section>
  <section class="section section-line"><div class="section-heading reveal"><div><p class="eyebrow">02 / A TRANSPARENT FOUNDATION</p><h2>${tr(
    "从电站读数，<br>到链上凭证。",
    "From station readings<br>to onchain evidence."
  )}</h2></div><p>${tr(
      "观测事实、估值假设和资金交易分开记录。收益估算不会被当成已经到账的现金。",
      "Observed facts, valuation assumptions and financial transactions are recorded separately. Estimated revenue is never presented as cash already received."
    )}</p></div><div class="proof-grid reveal"><article class="proof-card"><h3>${tr(
      "能源数据有来源",
      "Energy data with provenance"
    )}</h3><p>${tr(
      "电站详情展示发电、上网、设备及告警。实时、记录回放和合成演示数据均有明确标识。",
      "Station dashboards show generation, exports, devices and alerts. Live, recorded replay and synthetic datasets are clearly identified."
    )}</p><svg class="mini-chart" viewBox="0 0 500 120" aria-hidden="true"><path d="M0 100H500M0 60H500M0 20H500" stroke="#ffffff10"/><path d="M0 100 55 100 95 95 125 60 165 35 190 53 230 8 260 29 285 18 320 54 360 62 398 96 440 100 500 100" fill="none" stroke="#adecc3" stroke-width="2"/><path d="M0 105 80 105 130 92 180 85 210 51 260 67 300 65 345 95 400 105 500 105" fill="none" stroke="#548eae" stroke-width="2"/></svg><div class="proof-meta"><span>${tr(
      "示意曲线 · 非真实读数",
      "ILLUSTRATIVE CURVES · NOT TELEMETRY"
    )}</span><span>kWh / kW</span></div></article><article class="proof-card"><h3>${tr(
      "资金交易可核对",
      "Transactions you can inspect"
    )}</h3><p>${tr(
      "协议与估值摘要、认购结算和现金分配留下链上记录。通过 Blockscout 查看地址、源码和交易回执。",
      "Agreements, valuation hashes, settlement and distributions leave an onchain record. Inspect addresses, source code and receipts in Blockscout."
    )}</p><div>${[
      "Agreement anchored",
      "Valuation approved",
      "Subscription settled",
      "Distribution declared",
    ]
      .map(
        (s, i) =>
          `<div class="event-line"><span>◇</span><span>${s}</span><small>0${
            i + 1
          }</small></div>`
      )
      .join("")}</div><p class="proof-meta">${tr(
      "业务事件示意 · 非当前交易状态",
      "ILLUSTRATIVE EVENTS · NOT CURRENT TRANSACTION STATUS"
    )}</p></article></div></section>
  <section class="section section-line"><div class="section-heading reveal"><div><p class="eyebrow">03 / FOUR ROLES. SHARED TRUST.</p><h2>${tr(
    "各司其职，每一步有凭据。",
    "Distinct roles. Accountable actions."
  )}</h2></div><a class="text-link" href="${link("roles")}">${tr(
      "阅读角色与权限",
      "Read roles & permissions"
    )} ↗</a></div><div class="roles reveal">${[
      [
        "HOUSEHOLD",
        tr("业主", "Household"),
        tr(
          "保有设备所有权，通过出售约定收益权获取资金。",
          "Keep equipment ownership and sell agreed revenue rights for an upfront payment."
        ),
      ],
      [
        "INTERMEDIARY",
        tr("中介机构", "Intermediary"),
        tr(
          "审核资料、准备报价，负责发行与日常运营。",
          "Assess applications, prepare offers and manage issuance and servicing."
        ),
      ],
      [
        "INVESTOR",
        tr("投资者", "Investor"),
        tr(
          "了解估值与风险，参与认购、分配及退出。",
          "Review valuation and risk, subscribe, claim distributions and manage exits."
        ),
      ],
      [
        "TRUSTEE",
        tr("受托管理人", "Trustee"),
        tr(
          "独立审批估值，依据约定监督服务和处置。",
          "Independently approve valuations and oversee servicing under the agreed rules."
        ),
      ],
    ]
      .map(
        (a) =>
          `<article><div class="role-label">${a[0]}</div><h3>${a[1]}</h3><p>${a[2]}</p></article>`
      )
      .join("")}</div></section>
  <section class="section"><div class="principles reveal"><h2>${tr(
    "清楚理解收益，<br>也清楚理解边界。",
    "Understand the return.<br>Understand the limits."
  )}</h2><ul><li>${tr(
      "有期限的收益权，不转移设备产权。",
      "Finite revenue rights; equipment ownership stays put."
    )}</li><li>${tr(
      "回报取决于回款，没有固定票息保证。",
      "Returns depend on collections; no guaranteed coupon."
    )}</li><li>${tr(
      "预计年化收益与折现率是不同指标。",
      "Projected IRR and discount rate are different measures."
    )}</li><li>${tr(
      "退出受锁定期、窗口与可用现金限制。",
      "Exits are subject to locks, windows and available cash."
    )}</li></ul></div></section>
  <section class="section"><div class="closing reveal"><div><p class="eyebrow">EXPLORE THE PROTOCOL</p><h2>${tr(
    "从了解规则开始。",
    "Start with the rules."
  )}</h2><p class="hero-description">${tr(
      "完整业务文档、估值计算规则与可复现的合约源码，向每位参与者开放。",
      "Explore the business process, valuation methodology and reproducible contract source code."
    )}</p></div><a class="primary-link" href="${link()}">${tr(
      "阅读 Documentation",
      "Read Documentation"
    )} ↗</a></div></section></main>` +
    footer();
  publicRead("/api/public/overview")
    .then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then((data) => {
      document.querySelectorAll<HTMLElement>("[data-stat]").forEach((el) => {
        el.textContent =
          data[el.dataset.stat!] == null
            ? tr("暂不可用", "Unavailable")
            : String(data[el.dataset.stat!]);
      });
      const modes: Record<string, string> = {
        live: tr("真实 API 观测", "Live API observations"),
        replay: tr("已记录的 API 回放", "Recorded API replay"),
        synthetic: tr("合成演示数据", "Synthetic demonstration data"),
      };
      document.querySelector("[data-modes]")!.textContent =
        data.dataModes.map((s: string) => modes[s]).join(" / ") ||
        tr("尚未接入数据", "No data connected");
      document.querySelector("[data-network]")!.textContent =
        data.chainAvailable
          ? `Chain ID ${data.chainId}`
          : tr("节点暂不可用", "Node unavailable");
    })
    .catch(() => {
      document
        .querySelectorAll<HTMLElement>(
          "[data-stat], [data-modes], [data-network]"
        )
        .forEach((el) => {
          el.textContent = tr("暂不可用", "Unavailable");
        });
    });
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.body.classList.add("motion-ready");
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("entered");
            observer.unobserve(e.target);
          }
        }),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".reveal").forEach((e) => observer.observe(e));
    import("./hero")
      .then((m) => m.mountHero(document.querySelector("#energy-scene")!))
      .catch(() => {});
  }
}
async function contractPanel() {
  const container = document.querySelector("#contract-runtime");
  if (!container) return;
  try {
    const [mr, dr] = await Promise.all([
      fetch(sitePath("contracts/manifest.json")),
      publicRead("/api/public/deployment", 18000).catch(() => null),
    ]);
    if (!mr.ok) throw new Error();
    const manifest = await mr.json();
    container.innerHTML = `<p><a class="docs-download" href="${sitePath("contracts/deye-rwa-source.tar.gz")}" download>${tr(
      "下载完整合约源码包",
      "Download contract source package"
    )} ↓</a></p><p class="contract-status">SHA-256 <code>${esc(
      manifest.bundleHash
    )}</code><br>Solidity ${esc(
      manifest.compiler
    )}</p><div id="deployments"></div><h2 id="source-viewer">${tr(
      "源码阅读",
      "Source viewer"
    )}</h2><label for="source-file">${tr(
      "选择源码或 ABI",
      "Choose a source file or ABI"
    )}</label><select id="source-file" class="source-select">${manifest.files
      .filter((f: any) => /\.(sol|json|txt)$/.test(f.path))
      .map((f: any) => `<option value="${esc(f.path)}">${esc(f.path)}</option>`)
      .join(
        ""
      )}</select><pre class="source-code"><code id="source-content"></code></pre>`;
    const deployments = document.querySelector("#deployments")!;
    if (dr?.ok) {
      const d = await dr.json();
      deployments.innerHTML =
        `<h2>${tr("当前部署", "Current deployment")}</h2><p>Chain ID ${esc(
          d.chainId
        )} · ${tr("部署区块", "Deployment block")} ${esc(
          d.deployedBlock
        )}</p>` +
        d.contracts
          .map(
            (c: any) =>
              `<div class="contract-box"><strong>${esc(
                c.name
              )}</strong><code>${esc(
                c.address
              )}</code><p class="contract-status">${
                c.status === "matched"
                  ? tr(
                      "源码构建与部署字节码及不可变量匹配",
                      "Source build matches runtime bytecode and immutable values"
                    )
                  : c.status === "external"
                  ? tr("外部 Circle 测试 USDC，不属于本项目部署的合约源码包。", "External Circle test USDC; not deployed from this project source bundle.")
                  : c.status === "mismatch"
                  ? tr(
                      "当前源码与部署不匹配，请勿将此包视为该部署版本。",
                      "Current source does not match this deployment. Do not treat this bundle as the deployed version."
                    )
                  : tr(
                      "节点暂不可用，尚未核对部署版本。",
                      "Node unavailable; deployment correspondence not checked."
                    )
              }</p><a href="${esc(
                c.explorer
              )}" target="_blank" rel="noreferrer">Blockscout ↗</a>${
                c.deploymentTransaction
                  ? ` · <a href="${esc(new URL(c.explorer).origin)}/tx/${esc(
                      c.deploymentTransaction
                    )}" target="_blank" rel="noreferrer">${tr(
                      "部署交易",
                      "Deployment transaction"
                    )} ↗</a>`
                  : ""
              }</div>`
          )
          .join("");
    } else
      deployments.textContent = tr(
        "部署信息暂不可用。源码仍可阅读和下载。",
        "Deployment information is unavailable. Source remains readable and downloadable."
      );
    const select = document.querySelector<HTMLSelectElement>("#source-file")!;
    select.value = "contracts/revenue/RevenueShareVaultV5.sol";
    let version = 0;
    async function show() {
      const v = ++version;
      const code = document.querySelector("#source-content")!;
      code.textContent = tr("正在加载…", "Loading…");
      try {
        const r = await fetch(sitePath(`contracts/files/${select.value}`));
        if (!r.ok) throw new Error();
        const value = await r.text();
        if (v === version) code.textContent = value;
      } catch {
        if (v === version)
          code.textContent = tr(
            "无法读取该文件。",
            "Could not load this file."
          );
      }
    }
    select.addEventListener("change", show);
    await show();
  } catch {
    container.innerHTML = `<p>${tr(
      "源码包暂不可用。请先运行站点构建。",
      "Source package unavailable. Build the site first."
    )}</p>`;
  }
}
function documentation() {
  const parts = localPath.split("/").filter(Boolean);
  if (parts[1] === "zh" || parts[1] === "en") lang = parts[1];
  localStorage.setItem("revenue.lang", lang);
  const pages = docs.filter((d) => d.lang === lang),
    slug = parts[2] || "overview",
    page = pages.find((d) => d.slug === slug);
  if (!page) {
    root.innerHTML =
      header() +
      `<main id="main" class="not-found"><h1>404</h1><p>${tr(
        "文档不存在。",
        "Document not found."
      )}</p><a href="${link()}">Documentation →</a></main>` +
      footer();
    return;
  }
  document.title = `${page.title} · Deye RWA Documentation`;
  const current = pages.indexOf(page);
  root.innerHTML =
    header() +
    `<main class="docs-body" id="main"><div class="docs-layout"><aside class="docs-sidebar"><button class="mobile-doc-toggle">${tr(
      "文档目录",
      "Documentation menu"
    )} ☰</button><input class="docs-search" type="search" placeholder="${tr(
      "搜索文档…",
      "Search documentation…"
    )}" aria-label="${tr(
      "搜索文档",
      "Search documentation"
    )}"><div class="docs-search-results" aria-live="polite"></div><div class="docs-label">PROTOCOL DOCUMENTATION</div><nav aria-label="${tr(
      "文档目录",
      "Documentation navigation"
    )}">${pages
      .map(
        (d) =>
          `<a href="${link(d.slug)}" class="${
            d.slug === slug ? "active" : ""
          }" ${d.slug === slug ? 'aria-current="page"' : ""}>${d.title}</a>`
      )
      .join(
        ""
      )}</nav></aside><article class="docs-article"><div class="docs-breadcrumb">DEYE RWA / DOCUMENTATION / ${lang.toUpperCase()}</div>${
      page.html
    }<nav class="docs-nav-bottom">${
      current > 0
        ? `<a href="${link(pages[current - 1].slug)}">← ${
            pages[current - 1].title
          }</a>`
        : "<span></span>"
    }${
      current < pages.length - 1
        ? `<a href="${link(pages[current + 1].slug)}">${
            pages[current + 1].title
          } →</a>`
        : ""
    }</nav></article><aside class="docs-toc"><strong>${tr(
      "本页内容",
      "On this page"
    )}</strong>${page.headings
      .map((h) => `<a href="#${h.id}">${h.text}</a>`)
      .join("")}</aside></div></main>` +
    footer();
  document
    .querySelector(".mobile-doc-toggle")!
    .addEventListener("click", () =>
      document.querySelector(".docs-sidebar")!.classList.toggle("expanded")
    );
  document
    .querySelector<HTMLInputElement>(".docs-search")!
    .addEventListener("input", (e) => {
      const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
      document.querySelector(".docs-search-results")!.innerHTML = q
        ? pages
            .filter((p) => (p.title + " " + p.text).toLowerCase().includes(q))
            .map((p) => `<a href="${link(p.slug)}">${p.title} ↗</a>`)
            .join("") ||
          `<p>${tr("没有匹配的文档。", "No matching documents.")}</p>`
        : "";
    });
  document.querySelectorAll<HTMLElement>("[data-cashflow-example]").forEach(el => {
    const model = el.dataset.cashflowExample === "owner"
      ? window.RevenueTimeline.owner(example.report, example.report.rightsValueUSDC6, example.currency, lang)
      : window.RevenueTimeline.investor(example.projection, [example.report], lang);
    el.innerHTML = window.RevenueTimeline.render(model);
  });
  if (slug === "contracts") void contractPanel();
}
document.addEventListener("click", async (e) => {
  const el = (e.target as HTMLElement).closest("button");
  if (el?.hasAttribute("data-launch")) {
    el.setAttribute("disabled", "");
    try {
      if(!pagesMode){location.href=window.RevenueNetworks?.appPath() || "/app/";return;}
      const c=await unifiedConfig;if(!c)throw Error("Unified entry unavailable");
      const path=`/networks/${selectedNetwork}`;
      const r=await fetch(c.app+path+"/api/public/overview",{credentials:"omit",signal:AbortSignal.timeout(20000),cache:"no-store"});
      const status=await r.json();if(!r.ok||!status.chainAvailable||status.chainId!==(selectedNetwork==="private"?20261008:84532))throw Error("Selected network unavailable");
      location.href=`${c.app}${path}/app/?lang=${lang}&wallet=rabby`;
    }catch{showLaunchError();}finally{el.removeAttribute("disabled");}
  }
  if (el?.hasAttribute("data-language")) {
    lang = lang === "zh" ? "en" : "zh";
    localStorage.setItem("revenue.lang", lang);
    location.href = localPath.startsWith("/docs")
      ? link(localPath.split("/")[3] || "overview")
      : siteBase;
  }
});
document.addEventListener("change",event=>{
  const select=event.target as HTMLSelectElement;
  if(!select.matches("[data-site-network]")||!["private","base-sepolia"].includes(select.value))return;
  selectedNetwork=select.value;localStorage.setItem("revenue.preferred-network",selectedNetwork);
  if(localPath.startsWith("/docs"))documentation();else home();
});
const localPath = "/" + location.pathname.slice(siteBase.length);
if (localPath.startsWith("/docs")) documentation();
else home();
document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
if (pagesMode) void remoteConfig.then(c => {
  if (c?.walletEntryStatus !== "verified" || c.preferredWallet !== "rabby") return;
  const note = document.createElement("p");
  note.className = "remote-wallet-notice";
  note.textContent = tr("远程演示请使用 Rabby 钱包。MetaMask 公网入口尚未通过验证。", "Use Rabby for this remote demo. Public MetaMask access has not been verified.");
  document.querySelector(".site-header")?.after(note);
});
