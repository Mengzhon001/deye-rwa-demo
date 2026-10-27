"use strict";
const dsStations = () => state.monitoringStations?.length ? state.monitoringStations : state.stations;
function dsConnection(s) {
  const raw = s.metadata?.connectionStatus;
  const old = s.source === "replay" || Date.now() / 1000 - s.observedAt > 30 * 60;
  const labels = {
    NORMAL: old ? t("Normal at capture", "采集时通讯正常") : t("Communication normal", "通讯正常"),
    ALL_OFFLINE: old ? t("All offline at capture", "采集时全部离线") : t("All offline (API status)", "全部离线（API 状态）"),
    PARTIAL_OFFLINE: t("Partially offline", "部分离线"),
  };
  return { good: raw === "NORMAL" && !old, label: labels[raw] || t("Status unavailable", "状态未提供"), raw, old };
}

let dsTab = "overview",
  dsPeriod = "day",
  dsYear = "",
  dsStation = "",
  dsDevicePage = 0,
  dsAlertPage = 0;
let dsHidden = new Set(),
  dsPlots = new Map();
let dsSearch = "";
// Dashboard-only scenarios. These never write valuation, receipt or contract state.
const dsValidNumber = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const dsEstimate = (kWh, rate) =>
  dsValidNumber(kWh) && dsValidNumber(rate) && Number.isFinite(kWh * rate)
    ? kWh * rate
    : null;
function dsTariff(s) {
  const key = `revenue.dashboard-tariff.v1:${s.region}:${s.sourceId}:${s.currency}`;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && dsValidNumber(saved.rate))
      return { ...saved, key, source: "custom" };
  } catch {
    /* A corrupt browser preference must not hide station telemetry. */
  }
  if (
    s.region === "eu" &&
    s.sourceId === "60994015" &&
    s.currency === "CNY" &&
    s.source !== "synthetic"
  )
    return { key, rate: 0.3, source: "screenshot" };
  return { key, rate: null, source: "unset" };
}
function dsMonths(s) {
  const months = new Map(s.history.map((m) => [m.month, m]));
  for (const m of s.telemetry?.currentMonth || [])
    if (!months.has(m.month)) months.set(m.month, { ...m, complete: false });
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}
function dsExportSum(rows) {
  const available = rows.filter((r) => dsValidNumber(r.exportKWh));
  return {
    kWh: available.length
      ? available.reduce((sum, r) => sum + r.exportKWh, 0)
      : null,
    count: available.length,
    total: rows.length,
  };
}
const dsCash = (value) =>
  dsValidNumber(value)
    ? value.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—";
const dsIcons = {
  solar:
    '<path d="M5 10h14l2 10H3l2-10Zm7 0v10M4 15h16M8 3l1 3m7-3-1 3M2 6l3 2m17-2-3 2"/>',
  power: '<path d="m13 2-9 12h7l-1 8L21 9h-8l1-7Z"/>',
  battery:
    '<rect x="3" y="6" width="17" height="12" rx="3"/><path d="M23 10v4M7 10v4m4-4v4m4-4v4"/>',
  chart: '<path d="M4 3v17h17M8 14l4-5 4 3 5-8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  grid: '<path d="m12 2-7 20m7-20 7 20M7 9h10M5 16h14M3 22h18M8 3h8"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  alert: '<path d="m12 3 10 18H2L12 3Z M12 9v5m0 3v1"/>',
  file: '<path d="M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h8"/>',
};
const dsIcon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
    dsIcons[name] || dsIcons.chart
  }</svg>`;
const dsNum = (v, digits = 1) =>
  typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
        maximumFractionDigits: digits,
      })
    : "—";
const dsEnergy = (v) =>
  typeof v === "number"
    ? {
        value: dsNum(v >= 1000 ? v / 1000 : v, v >= 1000 ? 2 : 1),
        unit: v >= 1000 ? "MWh" : "kWh",
      }
    : { value: "—", unit: "kWh" };
const dsLocal = (stamp, station, timeOnly = false) =>
  typeof stamp === "number"
    ? new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-GB", {
        timeZone: station.timezone,
        ...(timeOnly
          ? {}
          : { year: "numeric", month: "2-digit", day: "2-digit" }),
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(stamp * 1000))
    : "—";
const dsPanel = (title, subtitle, body, extra = "") =>
  `<section class="ds-panel ${extra}"><header class="ds-panel-head"><div><h3>${title}</h3>${
    subtitle ? `<p>${subtitle}</p>` : ""
  }</div></header>${body}</section>`;
function dsKpi(label, value, unit, tone, icon, caption) {
  return `<div class="ds-kpi ${tone}"><div class="ds-kpi-label"><span class="ds-icon">${dsIcon(
    icon
  )}</span>${label}</div><div class="ds-kpi-value">${value}<small>${unit}</small></div><div class="ds-kpi-caption">${caption}</div></div>`;
}
function dsChart(id, rows, definitions, opts = {}) {
  const shown = definitions.filter((d) => !dsHidden.has(d.key));
  const values = rows
    .flatMap((r) => shown.map((d) => r[d.key]))
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  const W = 940,
    H = opts.small ? 145 : 310,
    L = 54,
    R = 20,
    T = 26,
    B = 36;
  let min = Math.min(0, ...values),
    max = Math.max(opts.max || 0, ...values, 1);
  if (!opts.max) max = Math.ceil(max / 5) * 5;
  const y = (v) => H - B - ((v - min) / (max - min || 1)) * (H - T - B);
  const x = (r, i) =>
    L +
    (opts.day
      ? r.minute / 1440
      : rows.length > 1
      ? i / (rows.length - 1)
      : 0.5) *
      (W - L - R);
  let svg = "";
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) * i) / 4;
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(
      v
    )}" stroke="#edf0f5"/><text x="${L - 10}" y="${
      y(v) + 4
    }" text-anchor="end">${dsNum(v, 0)}</text>`;
  }
  svg += `<text x="${L}" y="14">${esc(opts.unit || "kWh")}</text>`;
  if (opts.day) {
    for (let h = 0; h <= 24; h += 4) {
      const px = L + (h / 24) * (W - L - R);
      svg += `<text x="${px}" y="${H - 10}" text-anchor="middle">${String(
        h
      ).padStart(2, "0")}:00</text>`;
    }
  } else
    rows.forEach((r, i) => {
      if (
        i % Math.max(1, Math.ceil(rows.length / 12)) === 0 ||
        i === rows.length - 1
      )
        svg += `<text x="${x(r, i)}" y="${H - 10}" text-anchor="middle">${esc(
          r.short || r.label
        )}</text>`;
    });
  for (const d of shown) {
    if (opts.bars) {
      const bw = Math.min(24, (W - L - R) / Math.max(rows.length, 1) / 3);
      rows.forEach((r, i) => {
        if (typeof r[d.key] !== "number") return;
        const px = x(r, i) + (shown.indexOf(d) - (shown.length - 1) / 2) * bw;
        svg += `<rect x="${px - bw / 2}" y="${Math.min(
          y(r[d.key]),
          y(0)
        )}" width="${bw - 2}" height="${Math.max(
          1,
          Math.abs(y(0) - y(r[d.key]))
        )}" fill="${d.color}" rx="3" opacity=".85"/>`;
      });
    } else {
      let segment = [];
      const finish = () => {
        if (!segment.length) return;
        const points = segment.map(([px, py]) => `${px},${py}`).join(" ");
        if (!opts.small)
          svg += `<polygon points="${segment[0][0]},${y(0)} ${points} ${
            segment.at(-1)[0]
          },${y(0)}" fill="${d.color}" opacity=".055"/>`;
        svg += `<polyline points="${points}" fill="none" stroke="${d.color}" stroke-width="2.3" stroke-linejoin="round"/>`;
        segment = [];
      };
      rows.forEach((r, i) => {
        if (
          typeof r[d.key] !== "number" ||
          (opts.day && i && r.minute - rows[i - 1].minute > 20)
        )
          finish();
        if (typeof r[d.key] === "number") segment.push([x(r, i), y(r[d.key])]);
      });
      finish();
    }
  }
  dsPlots.set(id, { rows, shown, x, W, L, R });
  return `<div class="ds-chart-legend">${definitions
    .map(
      (d) =>
        `<button type="button" data-ds-series="${
          d.key
        }" aria-pressed="${!dsHidden.has(d.key)}" class="${
          dsHidden.has(d.key) ? "muted" : ""
        }"><i style="background:${d.color}"></i>${d.label}</button>`
    )
    .join("")}</div><div class="ds-chart ${
    opts.small ? "small" : ""
  }" data-ds-plot="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(
    opts.label || t("Station energy trend", "电站能源趋势")
  )}">${svg}</svg>${
    !values.length
      ? `<div class="ds-chart-empty">${t(
          "No readings available for this period",
          "该期间暂无可用读数"
        )}</div>`
      : ""
  }<div class="ds-tooltip" hidden></div></div>`;
}
function dsEnergySummary(label, data) {
  const tile = (name, key, tone, icon) => {
    const e = dsEnergy(data?.[key]);
    return `<div class="ds-energy-tile ${tone}"><span>${dsIcon(
      icon
    )}${name}</span><strong>${e.value}<small>${e.unit}</small></strong></div>`;
  };
  return `<aside class="ds-energy-summary"><div class="ds-ribbon">${label}</div>${tile(
    t("Solar generation", "光伏发电"),
    "generationKWh",
    "green",
    "solar"
  )}${tile(t("Grid export", "上网电量"), "exportKWh", "blue", "grid")}${tile(
    t("Grid import", "购电电量"),
    "importKWh",
    "purple",
    "grid"
  )}${tile(
    t("Consumption", "用电量"),
    "consumptionKWh",
    "orange",
    "power"
  )}<p class="ds-caption">${t(
    "Energy readings, not cash receipts. See the export-income scenario below.",
    "这里展示电量，不代表现金回款。售电收入情景估算见下方。"
  )}</p></aside>`;
}
function dsIncome(s, rows, caption) {
  const tariff = dsTariff(s),
    coverage = dsExportSum(rows);
  const value = dsEstimate(coverage.kWh, tariff.rate);
  const source =
    tariff.source === "screenshot"
      ? t(
          "Deye Cloud screenshot · 17 Sep 2026 · 0.30 CNY/kWh; effective dates and tax basis unverified",
          "德业云截图 · 2026-09-17 · 0.30 元/kWh；生效期间及含税口径待确认"
        )
      : tariff.source === "custom"
      ? t(
          "Your scenario rate · saved in this browser for this station",
          "自定义情景电价 · 仅在本浏览器按电站保存"
        )
      : t(
          "No applicable tariff configured. Enter a scenario rate below.",
          "尚未配置适用电价，请在下方输入情景电价。"
        );
  const estimateRows = rows.map((r) => ({
    ...r,
    estimatedIncome: dsEstimate(r.exportKWh, tariff.rate),
  }));
  const a = state.applications.find((a) => a.stationId === s.id);
  return dsPanel(
    t("Estimated export income", "售电收益估算"),
    `${esc(caption)} · ${t(
      "Scenario calculation · not settled cash",
      "情景回算 · 非实际到账"
    )}`,
    `<div class="ds-income-grid">${dsKpi(
      t("Export income estimate", "预计售电毛收入"),
      dsCash(value),
      esc(s.currency),
      "orange",
      "chart",
      t("Export energy × scenario rate", "上网电量 × 情景电价")
    )}${dsKpi(
      t("Export energy used", "参与估算的上网电量"),
      dsNum(coverage.kWh, 2),
      "kWh",
      "blue",
      "grid",
      `${coverage.count} / ${coverage.total} ${t(
        "displayed periods have export data",
        "个展示时段有上网电量"
      )}`
    )}${dsKpi(
      t("Flat export rate", "统一上网电价假设"),
      dsNum(tariff.rate, 4),
      esc(s.currency) + "/kWh",
      "purple",
      "file",
      t(
        "Unverified · applies only to this scenario",
        "待核实 · 仅用于本次情景计算"
      )
    )}</div>
    <div class="ds-income-explanation">${t(
      "Available energy only; no extrapolation for missing or unfinished periods. Gross export income excludes expenses, taxes and revenue sharing. Self-consumption savings and battery arbitrage are not included.",
      "仅统计已有电量，缺测及未结束期间不外推。此处为售电毛收入，未扣费用、税费及收益权分成，不含自用节省电费或储能套利。"
    )}</div>${
      dsPeriod !== "day"
        ? `<div class="ds-income-chart">${dsChart(
            "income",
            estimateRows,
            [
              {
                key: "estimatedIncome",
                label: t("Estimated export income", "预计售电收入"),
                color: "#e9a33b",
              },
            ],
            {
              bars: true,
              unit: s.currency,
              label: t(
                "Export income calculated at the scenario rate",
                "按情景电价回算的售电收入"
              ),
            }
          )}</div>`
        : ""
    }
    <div class="ds-tariff-note"><span class="ds-source">${t(
      "Estimated",
      "估算"
    )}</span><span>${esc(source)}<br>${t(
      "A single assumed rate is applied to the displayed historical periods; it is not their verified historical settlement price.",
      "展示的历史期间统一按此假设电价回算，不代表这些期间的真实结算电价。"
    )}</span></div>
    ${
      s.metadata?.qualityWarnings?.length
        ? `<div class="ds-income-explanation ds-amber">${t(
            "Source data has reconciliation warnings; review Evidence & profile before using these estimates for valuation.",
            "源数据存在对账差异；用于估值前请在「资料与凭证」查看数据质量说明。"
          )}</div>`
        : ""
    }
    <details class="ds-tariff-settings"><summary>${t(
      "Adjust scenario rate & view calculation basis",
      "调整情景电价与查看计算口径"
    )}</summary>
      <form data-ds-tariff-form class="ds-tariff-form">
        <label for="ds-tariff-rate">${t("Export rate", "上网电价")} (${esc(
      s.currency
    )}/kWh)</label>
        <input id="ds-tariff-rate" name="rate" type="number" required min="0" step="0.0001" value="${
          tariff.rate ?? ""
        }" inputmode="decimal">
        <button class="btn btn-primary btn-sm" type="submit">${t(
          "Apply scenario",
          "应用情景"
        )}</button>
        <button class="btn btn-outline btn-sm" type="button" data-ds-tariff-reset>${t(
          "Reset",
          "恢复默认"
        )}</button>
      </form>
      <p>${t("Source energy", "电量来源")}: ${sourceLabel(s.source)} · ${esc(
      dsLocal(s.observedAt, s)
    )} · ${t("Station", "电站")} ${esc(s.sourceId)}</p>
      <p>${t(
        "Formula: Σ (available export kWh × scenario tariff). Prices are not fetched from a public tariff API. This calculator does not update offers, approved valuations or on-chain receipts.",
        "公式：Σ（已有上网电量 kWh × 情景电价）。电价并非由公开电价 API 获取。本计算器不修改报价、已审批估值或链上回款。"
      )}</p>
      ${
        a
          ? `<p>${t(
              "Separate rights-valuation tariff",
              "收益权估值使用的独立电价"
            )}: ${esc(a.assumptions.tariffLocal)} ${esc(s.currency)}/kWh · ${t(
              "See Revenue rights for its approved/proposed assumptions.",
              "已批准或拟议假设请查看「收益权」。"
            )}</p>`
          : ""
      }
    </details>`
  );
}
function renderStationList() {
  dsPlots = new Map();
  const stations = dsStations();
  const shown = stations.filter((s) =>
    `${s.name} ${s.sourceId}`.toLowerCase().includes(dsSearch.toLowerCase())
  );
  const online = stations.filter(
    (s) => dsConnection(s).good
  ).length;
  const capacity = stations.reduce((sum, s) => sum + s.capacityKW, 0);
  const rows = shown.map((s) => {
    const today = s.telemetry?.days?.find((d) => d.date === s.telemetry.date);
    const application = state.applications.find((a) => a.stationId === s.id);
    return [
      `<button class="ds-station-link" data-ds-open="${esc(s.id)}">${esc(
        s.name
      )}</button><small class="ds-list-sub">ID ${esc(s.sourceId)} · ${esc(
        s.timezone
      )}</small>`,
      `<span class="${dsConnection(s).good ? "ds-status" : ""}">● ${esc(dsConnection(s).label)}</span>`,
      dsNum(s.capacityKW),
      dsNum(s.latest.generationPowerKW, 2),
      `${dsNum(today?.generationKWh, 2)}<small class="ds-list-sub">${esc(
        s.telemetry?.date || "—"
      )}</small>`,
      `${dsCash(dsEstimate(today?.exportKWh, dsTariff(s).rate))} <small>${esc(
        s.currency
      )}</small><small class="ds-list-sub">${t(
        "Scenario · gross export income",
        "情景估算 · 售电毛收入"
      )}</small>`,
      application
        ? tag(
            t(
              ...(statuses[application.status] || [
                application.status,
                application.status,
              ])
            )
          )
        : tag(t("Not submitted", "未申请")),
      `<span class="ds-list-sub">${sourceLabel(
        s.source
      )}</span><button class="ds-text-button" data-ds-open="${esc(s.id)}">${t(
        "Station details",
        "查看详情"
      )} →</button>`,
    ];
  });
  return `<div class="station-dashboard ds-station-list"><header class="ds-station-head"><div><div class="ds-eyebrow">${dsIcon(
    "solar"
  )}${t("MY SOLAR STATIONS", "我的光伏电站")}</div><h2>${t(
    "My stations",
    "我的电站"
  )}</h2><p class="ds-list-description">${t(
    "Manage your station portfolio and revenue-right applications. Select a station to open its monitoring dashboard.",
    "集中查看电站运行与收益权申请状态，选择电站进入运行与收益看板。"
  )}</p></div></header>
    <div class="ds-list-kpis">${dsKpi(
      t("Stations", "电站总数"),
      stations.length,
      t("sites", "座"),
      "blue",
      "solar",
      t("Connected to this demo", "已接入当前演示")
    )}${dsKpi(
    t("Communication normal", "通讯正常"),
    online,
    t("sites", "座"),
    "green",
    "check",
    t("At the last capture", "以最近采集状态为准")
  )}${dsKpi(
    t("Installed capacity", "总装机容量"),
    dsNum(capacity),
    "kWp",
    "purple",
    "power",
    t("All connected stations", "已接入电站合计")
  )}</div>
    <section class="ds-panel"><header class="ds-list-toolbar"><h3>${t(
      "Station list",
      "电站列表"
    )}</h3><form data-ds-search-form><input name="query" type="search" aria-label="${t(
    "Station name or ID",
    "电站名称或 ID"
  )}" placeholder="${t("Search name or ID", "搜索电站名称或 ID")}" value="${esc(
    dsSearch
  )}"><button class="ds-refresh" type="submit">${t(
    "Search",
    "搜索"
  )}</button></form></header>${
    shown.length
      ? table(
          [
            t("Station", "电站名称"),
            t("Communication", "通讯"),
            "kWp",
            "kW",
            t("Daily generation · kWh", "当日发电 · kWh"),
            t("Daily estimated income", "当日预计收入"),
            t("Revenue rights", "收益权状态"),
            t("Actions", "操作"),
          ],
          rows
        )
      : `<div class="ds-empty">${t(
          "No matching stations",
          "没有匹配的电站"
        )}</div>`
  }<p class="ds-income-explanation">${t(
    "Income uses each station’s scenario tariff and captured export energy. Open details to inspect or adjust assumptions; it does not represent received cash.",
    "收入按各电站情景电价与已采集上网电量估算。进入详情可查看和调整假设，不代表实际到账。"
  )}</p></section></div>`;
}

function dsOverview(s) {
  const tele = s.telemetry || {},
    days = tele.days || [],
    current = (tele.currentMonth || []).find(
      (m) => m.month === tele.date?.slice(0, 7)
    );
  const today = days.find((d) => d.date === tele.date),
    years = tele.years || [];
  const total =
    years.length && years.every((y) => typeof y.generationKWh === "number")
      ? years.reduce((n, y) => n + y.generationKWh, 0)
      : null;
  const ed = dsEnergy(today?.generationKWh),
    em = dsEnergy(current?.generationKWh),
    et = dsEnergy(total);
  const cards = `<div class="ds-kpis">${dsKpi(
    t("Generation power", "实时发电功率"),
    dsNum(s.latest.generationPowerKW, 2),
    "kW",
    "blue",
    "power",
    t("Latest API reading", "最新 API 读数")
  )}${dsKpi(
    t("Installed capacity", "总装机容量"),
    dsNum(s.capacityKW),
    "kWp",
    "purple",
    "solar",
    t("Station configuration", "电站配置容量")
  )}${dsKpi(
    t("Today's generation", "当日发电量"),
    ed.value,
    ed.unit,
    "cyan",
    "chart",
    tele.date || t("Unavailable", "未提供")
  )}${dsKpi(
    t("This month's generation", "当月发电量"),
    em.value,
    em.unit,
    "green",
    "chart",
    t("Month to capture time", "本月至采集时点")
  )}${dsKpi(
    t("Recorded generation", "历史累计发电量"),
    et.value,
    et.unit,
    "orange",
    "chart",
    years.length
      ? `${years[0].year}–${years.at(-1).year} · ${t(
          "API annual totals",
          "API 年度汇总"
        )}`
      : t("No lifetime value inferred", "不推算未提供的累计量")
  )}</div>`;
  const months = dsMonths(s);
  const availableYears = [...new Set(months.map((m) => m.month.slice(0, 4)))];
  if (!availableYears.includes(dsYear)) dsYear = availableYears.at(-1) || "";
  const power = (tele.power || []).map((r) => {
    const p = new Intl.DateTimeFormat("en-GB", {
      timeZone: s.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(r.timestamp * 1000));
    const [h, m] = p.split(":").map(Number);
    return { ...r, minute: h * 60 + m, label: p };
  });
  const energyDefs = [
    {
      key: "generationKWh",
      label: t("Generation", "发电量"),
      color: "#26b983",
    },
    { key: "exportKWh", label: t("Grid export", "上网电量"), color: "#3978ee" },
  ];
  let rows, summary, caption, plot;
  if (dsPeriod === "day") {
    rows = power;
    summary = today;
    caption = tele.date || t("No intraday capture", "尚无日内采集");
    plot =
      dsChart(
        "power",
        rows,
        [
          {
            key: "generationKW",
            label: t("Generation", "发电功率"),
            color: "#24bc85",
          },
          {
            key: "consumptionKW",
            label: t("Load", "负载功率"),
            color: "#f5a623",
          },
          {
            key: "batteryKW",
            label: t("Battery · signed", "电池功率 · 原始符号"),
            color: "#9071ed",
          },
        ],
        {
          day: true,
          unit: "kW",
          label: t(
            "Intraday generation, load and signed battery power",
            "日内发电、负载与电池功率曲线"
          ),
        }
      ) +
      `<div class="ds-chart-divider"></div>` +
      dsChart(
        "soc",
        rows,
        [{ key: "soc", label: t("Battery SOC", "电池 SOC"), color: "#55b4fb" }],
        {
          day: true,
          unit: "%",
          small: true,
          max: 100,
          label: t("Intraday battery state of charge", "日内电池荷电状态曲线"),
        }
      );
  } else if (dsPeriod === "month") {
    rows = tele.date
      ? Array.from({ length: Number(tele.date.slice(8, 10)) }, (_, i) => {
          const date = tele.date.slice(0, 8) + String(i + 1).padStart(2, "0");
          return {
            ...days.find((d) => d.date === date),
            label: date,
            short: date.slice(8),
          };
        })
      : [];
    summary = current;
    caption = tele.date?.slice(0, 7) || t("No daily capture", "尚无每日采集");
    plot = dsChart("daily", rows, energyDefs, { bars: true });
  } else {
    rows = Array.from({ length: 12 }, (_, i) => {
      const month = dsYear + "-" + String(i + 1).padStart(2, "0");
      return {
        ...(months.find((m) => m.month === month) || {}),
        label: month,
        short:
          lang === "zh"
            ? i + 1 + "月"
            : new Date(2020, i, 1).toLocaleString("en", { month: "short" }),
      };
    });
    const present = rows.filter((r) => typeof r.generationKWh === "number");
    summary = present.length
      ? {
          generationKWh: present.reduce((n, r) => n + r.generationKWh, 0),
          exportKWh: present.every((r) => typeof r.exportKWh === "number")
            ? present.reduce((n, r) => n + r.exportKWh, 0)
            : null,
        }
      : undefined;
    caption =
      dsYear + " · " + t("Available monthly totals", "已有月度记录汇总");
    plot = dsChart("monthly", rows, energyDefs, { bars: true });
  }
  const controls = `<div class="ds-period-toolbar"><div class="ds-segment">${[
    ["day", "Day", "日"],
    ["month", "Month", "月"],
    ["year", "Year", "年"],
  ]
    .map(
      ([key, en, zh]) =>
        `<button type="button" data-ds-period="${key}" class="${
          dsPeriod === key ? "active" : ""
        }" aria-pressed="${dsPeriod === key}">${t(en, zh)}</button>`
    )
    .join("")}</div><span class="ds-date">${dsIcon("clock")}${esc(
    caption
  )}</span>${
    dsPeriod === "year"
      ? `<select id="ds-year" aria-label="${t(
          "Select year",
          "选择年份"
        )}">${availableYears
          .map((y) => `<option ${y === dsYear ? "selected" : ""}>${y}</option>`)
          .join("")}</select>`
      : ""
  }<span class="ds-period-note">${t("Station timezone", "电站时区")} · ${esc(
    s.timezone
  )}</span></div>`;
  const analysis = `<section class="ds-panel ds-analysis">${controls}<div class="ds-analysis-grid">${dsEnergySummary(
    dsPeriod === "day"
      ? t("Daily energy", "每日电量")
      : dsPeriod === "month"
      ? t("Monthly energy", "当月电量")
      : t("Displayed year", "所选年份"),
    summary
  )}<div class="ds-trends">${plot}<p class="ds-chart-note">${t(
    "Hover for values · click legends to compare · gaps are not filled with estimates",
    "移动鼠标查看数值 · 点击图例切换曲线 · 缺测区间不做估算填充"
  )}</p></div></div></section>`;
  const soc = s.latest.batterySOC;
  const status = dsPanel(
    t("Storage & operation", "储能与运行"),
    t("Latest captured values", "最新采集读数"),
    `<div class="ds-storage"><div class="ds-soc" style="--soc:${
      typeof soc === "number" ? Math.max(0, Math.min(100, soc)) : 0
    }%"><div><b>${dsNum(
      soc,
      0
    )}<small>%</small></b><span>SOC</span></div></div><div class="ds-storage-values"><span>${t(
      "Battery power",
      "电池功率"
    )}<b>${dsNum(
      s.latest.batteryPowerKW,
      2
    )} <small>kW</small></b></span><span>${t(
      "Load power",
      "负载功率"
    )}<b>${dsNum(
      s.latest.consumptionPowerKW,
      2
    )} <small>kW</small></b></span><p>${t(
      "Battery power retains the API sign.",
      "电池功率保留 API 正负号。"
    )}</p></div></div>`
  );
  const warnings = s.metadata?.qualityWarnings || [];
  const health = dsPanel(
    t("Data quality & evidence", "数据质量与凭证"),
    t(
      "Traceable inputs for revenue-right valuation",
      "用于收益权估值的可追溯输入"
    ),
    `<div class="ds-quality-row"><span>${dsIcon("check")}${t(
      "Deye field mapping",
      "德业字段映射"
    )}</span><b>${
      s.mappingVerified ? t("Verified", "已核验") : t("Pending", "待核验")
    }</b></div><div class="ds-quality-row"><span>${dsIcon("chart")}${t(
      "Monthly history",
      "月度历史"
    )}</span><b>${s.history.length} ${t(
      "months",
      "个月"
    )}</b></div><div class="ds-quality-row"><span>${dsIcon("alert")}${t(
      "Valuation quality",
      "估值数据质量"
    )}</span><b class="${warnings.length ? "ds-amber" : ""}">${
      warnings.length
        ? t("Provisional review", "须暂定审核")
        : t("See evidence", "查看凭证")
    }</b></div><button class="ds-text-button" data-ds-tab="evidence">${t(
      "View sources and reconciliation notes",
      "查看来源与对账说明"
    )} →</button>`
  );
  return (
    cards +
    analysis +
    `<div class="ds-income-section">${dsIncome(
      s,
      dsPeriod === "day" ? [{ ...today, label: tele.date }] : rows,
      caption
    )}</div>` +
    `<div class="ds-bottom-grid">${status}${health}</div>` +
    `<details class="ds-raw-table"><summary>${t(
      "View monthly data table",
      "展开月度数据明细表"
    )}</summary>${table(
      [
        t("Month", "月份"),
        "kWh · " + t("Generation", "发电"),
        "kWh · " + t("Export", "上网"),
      ],
      s.history.map((h) => [
        esc(h.month),
        dsNum(h.generationKWh),
        dsNum(h.exportKWh),
      ])
    )}</details>`
  );
}
function dsPaged(items, pageIndex, kind, headers, row) {
  const size = 8,
    total = Math.max(1, Math.ceil(items.length / size)),
    index = Math.min(pageIndex, total - 1);
  return (
    table(headers, items.slice(index * size, (index + 1) * size).map(row)) +
    `<div class="ds-pagination"><span>${items.length} ${t(
      "records",
      "条记录"
    )} · ${
      index + 1
    } / ${total}</span><button data-ds-paging="${kind}" data-ds-delta="-1" ${
      index === 0 ? "disabled" : ""
    }>${t(
      "Previous",
      "上一页"
    )}</button><button data-ds-paging="${kind}" data-ds-delta="1" ${
      index >= total - 1 ? "disabled" : ""
    }>${t("Next", "下一页")}</button></div>`
  );
}
function dsDevices(s) {
  const typeName = (d) =>
    ({
      INVERTER: t("Inverter", "逆变器"),
      BATTERY: t("Battery", "电池"),
      COLLECTOR: t("Data logger", "采集器"),
    }[d.deviceType] ||
    d.deviceType ||
    d.type ||
    "—");
  return dsPanel(
    t("Connected equipment", "关联设备"),
    t(
      "One station asset, multiple devices. Select a device to inspect its actual measurement points.",
      "一座电站对应一个 RWA 资产。选择设备可查看其真实测点与单位。"
    ),
    dsPaged(
      s.devices,
      dsDevicePage,
      "devices",
      [
        t("Device / serial", "设备 / 序列号"),
        t("Type", "类型"),
        t("Communication", "通讯"),
        t("Last report", "最近上报"),
        t("Measurements", "测点"),
      ],
      (d) => [
        esc(d.deviceSn || d.serial || "—"),
        esc(typeName(d)),
        d.connectStatus === 1
          ? `<span class="ds-status">● ${t("Online", "在线")}</span>`
          : d.connectStatus === 0
          ? t("Offline", "离线")
          : "—",
        esc(dsLocal(d.readingTime || d.collectionTime, s)),
        `<button class="ds-text-button" data-ds-device="${s.devices.indexOf(
          d
        )}">${t("View details", "查看详情")} →</button>`,
      ]
    )
  );
}
function dsAlerts(s) {
  return dsPanel(
    t("Alert history", "告警历史"),
    t(
      "Events captured in the preceding 30 days; this count is not the number of currently active alarms.",
      "最近 30 天采集到的事件记录；历史记录数量不等于当前活动告警数。"
    ),
    s.alerts.length
      ? dsPaged(
          [...s.alerts].sort((a, b) => b.alertStartTime - a.alertStartTime),
          dsAlertPage,
          "alerts",
          [
            t("Event", "告警事件"),
            t("Device", "设备"),
            t("Started", "开始时间"),
            t("Ended", "结束时间"),
            t("Details", "详情"),
          ],
          (a) => [
            esc(a.alertName?.replace(/\\xa0/g, " ") || a.alertCode || "—"),
            esc(a.deviceSn || "—"),
            esc(dsLocal(a.alertStartTime, s)),
            a.alertEndTime
              ? esc(dsLocal(a.alertEndTime, s))
              : t("No end reported", "未报告结束时间"),
            detail(t("Source record", "原始记录"), a),
          ]
        )
      : `<div class="ds-empty">${t(
          "No events in this capture",
          "本次采集没有告警事件"
        )}</div>`
  );
}
function dsEvidence(s) {
  const m = s.metadata || {},
    warnings = m.qualityWarnings || [];
  return dsPanel(
    t("Source & station profile", "数据来源与电站资料"),
    sourceLabel(s.source),
    `<div class="ds-evidence-grid">${[
      [t("Station ID", "电站 ID"), s.sourceId],
      [t("Data centre", "数据中心"), s.region.toUpperCase()],
      [t("Timezone", "电站时区"), s.timezone],
      [t("Commissioned", "投运日期"), dsLocal(m.startOperatingTime, s)],
      [t("API captured", "API 采集时间"), dsLocal(s.observedAt, s)],
      [t("Meter updated", "遥测更新时间"), dsLocal(s.latest.lastUpdateTime, s)],
      [t("Interconnection", "并网类型"), m.gridInterconnectionType || "—"],
      [
        t("Modeling currency", "建模货币"),
        s.currency + " · " + t("demo assumption", "演示假设"),
      ],
    ]
      .map(([k, v]) => `<div><span>${k}</span><strong>${esc(v)}</strong></div>`)
      .join("")}</div>${warnings
      .map(
        (w) =>
          `<div class="ds-warning">${dsIcon("alert")}<p>${esc(w)}</p></div>`
      )
      .join("")}<div class="ds-evidence-note">${esc(
      m.mappingVerificationNote || t("Mapping review pending", "字段映射待核验")
    )}</div><p class="ds-hash"><b>${t(
      "Evidence hash",
      "证据哈希"
    )}</b><code>${esc(s.sourceHash)}</code></p>${
      Object.keys(s.telemetry?.errors || {}).length
        ? detail(
            t("Unavailable telemetry series", "未成功采集的数据序列"),
            s.telemetry.errors
          )
        : ""
    }${detail(t("Original station metadata", "原始电站资料"), m)}${detail(
      t("Original latest response", "原始最新读数"),
      s.latest.raw || s.latest
    )}`
  );
}
function dsRights(s) {
  const a = state.applications.find((a) => a.stationId === s.id);
  return dsPanel(
    t("Revenue rights", "收益权与估值"),
    t(
      "Financial modeling is separate from operational telemetry",
      "财务建模与运行遥测分别记录"
    ),
    `<div class="ds-warning">${dsIcon("file")}<p>${t(
      "Tariffs, FX, expenses and payment receipts are demo assumptions, not Deye API income or bank settlements. Equipment stays with the household.",
      "电价、汇率、费用及回款仍为演示假设，不是德业 API 营收或银行结算。设备所有权归业主。"
    )}</p></div>${
      a
        ? `<div class="ds-evidence-grid">${[
            [
              t("Revenue share", "收益分成"),
              a.assumptions.shareBps / 100 + "%",
            ],
            [
              t("Term", "期限"),
              a.assumptions.termMonths + t(" months", " 个月"),
            ],
            [
              t("Purchase price", "购买价格"),
              money(a.priceUSDC6) + " demo USDC",
            ],
            [
              t("Export tariff assumption", "上网电价假设"),
              a.assumptions.tariffLocal + " " + s.currency + "/kWh",
            ],
            ...(a.assumptions.revenueModel === "household-export" ? [
              [t("Household payment at grid tariff", "业主按电网价支付比例"), a.assumptions.householdPaymentBps / 100 + "%"],
              [t("Grid purchase tariff assumption", "电网购电价假设"), a.assumptions.gridTariffLocal + " " + s.currency + "/kWh"],
            ] : []),
            [
              t("FX assumption", "汇率假设"),
              a.assumptions.fxUSDC + " USDC/" + s.currency,
            ],
            [t("Workflow status", "流程状态"), a.status],
          ]
            .map(
              ([k, v]) =>
                `<div><span>${k}</span><strong>${esc(v)}</strong></div>`
            )
            .join("")}</div>${detail(
            t("Approved / proposed assumptions", "已批准 / 拟议假设"),
            a.assumptions
          )}`
        : `<div class="ds-empty">${dsIcon("file")}<h3>${t(
            "Revenue rights not yet submitted",
            "尚未提交收益权申请"
          )}</h3><p>${t(
            "The real station is connected. Start the application and valuation workflow using its captured evidence.",
            "真实电站已接入，可使用已采集证据开始申请与估值流程。"
          )}</p>${
            role === "owner"
              ? `<button class="btn btn-primary" data-page="owner_apply">${t(
                  "Start rights application",
                  "发起收益权申请"
                )}</button>`
              : ""
          }</div>`
    }`
  );
}
function renderStationDashboard() {
  if (!dsStations().length) return empty();
  const s =
    dsStations().find((s) => s.id === stationSelection) || dsStations()[0];
  if (dsStation !== s.id) {
    dsStation = s.id;
    dsPeriod = s.telemetry?.power?.length ? "day" : "year";
    dsYear = "";
    dsDevicePage = dsAlertPage = 0;
    dsHidden = new Set(["batteryKW"]);
  }
  dsPlots = new Map();
  const online = s.devices.filter(
    (d) => d.deviceType === "INVERTER" && d.connectStatus === 1
  ).length;
  const connection = dsConnection(s);
  const good = connection.good;
  const tabs = [
    ["overview", "Overview", "运行总览"],
    ["devices", "Devices", "设备"],
    ["alerts", "Alerts", "告警"],
    ["rights", "Revenue rights", "收益权"],
    ["evidence", "Evidence & profile", "资料与凭证"],
  ];
  return `<div class="station-dashboard">${
    typeof wfSelected !== "undefined" && wfSelected
      ? `<button class="ds-back" data-wf-return>← ${t(
          "Return to application",
          "返回申请处理"
        )}</button>`
      : ""
  }${
    role === "owner"
      ? `<button class="ds-back" data-page="owner_stations">← ${t(
          "My stations",
          "返回我的电站"
        )}</button>`
      : ""
  }<header class="ds-station-head"><div><div class="ds-eyebrow">${dsIcon(
    "solar"
  )}${t("STATION MONITORING", "电站运行监控")}</div><h2>${esc(
    s.name
  )}</h2><div class="ds-station-meta"><span class="${
    good ? "ds-status" : ""
  }">● ${
    esc(connection.label)
  }</span><span>${dsNum(s.capacityKW)} kWp</span><span>${t(
    "Online inverters",
    "在线逆变器"
  )} <b>${online}</b></span><span>${t("Updated", "最后更新")} ${esc(
    dsLocal(s.latest.lastUpdateTime || s.observedAt, s)
  )} · ${esc(
    s.timezone
  )}</span></div></div><div class="ds-head-actions"><span class="ds-source">${sourceLabel(
    s.source
  )}</span>${
    dsStations().length > 1
      ? `<select id="station-select">${dsStations()
          .map(
            (st) =>
              `<option value="${esc(st.id)}" ${
                st.id === s.id ? "selected" : ""
              }>${esc(st.name)}</option>`
          )
          .join("")}</select>`
      : ""
  }${
    state.monitoring?.enabled
      ? `<button class="ds-refresh" data-ds-sync>${t("Refresh API data", "更新 API 数据")} ↻</button>`
      : `<button class="ds-refresh" data-ds-refresh>${t(
          "Refresh view",
          "刷新视图"
        )} ↻</button>`
  }</div></header>${state.monitoring ? `<div class="ds-monitor-note"><strong>${s.source === "live" ? t("Live API monitoring", "实时 API 监控") : t("Recorded capture · not current status", "历史记录回放 · 非当前状态")}</strong><p>${t("Capture time", "采集时间")} ${esc(dsLocal(s.observedAt, s))} · ${t("Device reading time", "设备读数时间")} ${esc(dsLocal(s.latest.lastUpdateTime || s.observedAt, s))} · ${t("API communication code", "API 通讯状态码")} ${esc(connection.raw || "—")}</p><p>${state.monitoring.error ? esc(t("Refresh failed; displaying the last successful capture. ", "同步失败，保留最近一次成功采集的数据。") + state.monitoring.error) : connection.old ? t("This capture is stale. Its offline/online status is not a current connectivity test.", "该采集记录已过期，其中的在线或离线状态不能代表当前通讯状态。") : t("Monitoring refreshes every 15 minutes. Approved offers keep their original valuation evidence until an explicit reassessment.", "每 15 分钟更新监控数据。已批准报价保留原估值证据，需要重新评估时另行审批。")}</p></div>` : ""}<div class="ds-tabs" role="tablist" aria-label="${t(
    "Station sections",
    "电站栏目"
  )}">${tabs
    .map(
      ([key, en, zh]) =>
        `<button role="tab" aria-selected="${
          dsTab === key
        }" data-ds-tab="${key}" class="${dsTab === key ? "active" : ""}">${t(
          en,
          zh
        )}${
          key === "devices"
            ? `<small>${s.devices.length}</small>`
            : key === "alerts"
            ? `<small>${s.alerts.length}</small>`
            : ""
        }</button>`
    )
    .join("")}</div><div class="ds-content">${
    dsTab === "devices"
      ? dsDevices(s)
      : dsTab === "alerts"
      ? dsAlerts(s)
      : dsTab === "rights"
      ? dsRights(s)
      : dsTab === "evidence"
      ? dsEvidence(s)
      : dsOverview(s)
  }</div><div class="ds-footnote">${dsIcon("clock")}${t(
    "API snapshot",
    "API 采集快照"
  )} ${esc(dsLocal(s.observedAt, s))} · ${t(
    "Financial demo clock does not alter telemetry. Missing readings remain unavailable.",
    "财务演示时钟不会改变遥测时间。缺失读数不做补造。"
  )}</div></div>`;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.dsOpen) {
    stationSelection = b.dataset.dsOpen;
    localStorage.setItem("revenue.station", stationSelection);
    dsTab = "overview";
    page = "owner_station_detail";
    render();
  }
  if (b.hasAttribute("data-ds-tariff-reset")) {
    const s = dsStations().find((s) => s.id === dsStation);
    localStorage.removeItem(dsTariff(s).key);
    render();
  }
  if (b.dataset.dsTab) {
    dsTab = b.dataset.dsTab;
    render();
  }
  if (b.dataset.dsPeriod) {
    dsPeriod = b.dataset.dsPeriod;
    render();
  }
  if (b.dataset.dsSeries) {
    const key = b.dataset.dsSeries;
    dsHidden.has(key) ? dsHidden.delete(key) : dsHidden.add(key);
    render();
  }
  if (b.dataset.dsPaging) {
    const d = Number(b.dataset.dsDelta);
    if (b.dataset.dsPaging === "devices")
      dsDevicePage = Math.max(0, dsDevicePage + d);
    else dsAlertPage = Math.max(0, dsAlertPage + d);
    render();
  }
  if (b.hasAttribute("data-ds-sync")) {
    b.disabled = true;
    feedback(t("Retrieving current station data…", "正在查询最新电站数据…"));
    try {
      const result = await api("/api/stations/refresh", {});
      await refresh();
      feedback(result.monitoring.error || t("Station monitoring updated; valuation evidence was preserved.", "电站监控已更新，已批准估值的证据保持不变。"), !!result.monitoring.error);
    } catch (error) { feedback(error.message, true); }
    finally { b.disabled = false; }
  }
  if (b.hasAttribute("data-ds-refresh")) {
    try {
      await refresh();
    } catch (error) {
      feedback(error.message, true);
    }
  }
  if (b.hasAttribute("data-ds-device")) {
    const s = dsStations().find((s) => s.id === dsStation),
      d = s.devices[Number(b.dataset.dsDevice)];
    const modal = document.createElement("dialog");
    modal.className = "ds-device-modal";
    modal.innerHTML = `<div class="ds-modal-head"><div><span>${t(
      "DEVICE MEASUREMENTS",
      "设备测点"
    )}</span><h3>${esc(d.deviceSn || d.serial || "—")}</h3><p>${esc(
      dsLocal(d.readingTime || d.collectionTime, s)
    )} · ${esc(s.timezone)}</p></div><button data-ds-close aria-label="${t(
      "Close",
      "关闭"
    )}">×</button></div>${
      d.readings?.length
        ? table(
            [t("Measurement", "测点"), t("Value", "数值"), t("Unit", "单位")],
            d.readings.map((r) => [
              esc(r.key),
              esc(r.value ?? "—"),
              esc(r.unit || "—"),
            ])
          )
        : `<div class="ds-empty">${t(
            "No measurement values were provided for this device.",
            "该设备未提供测点读数。"
          )}</div>`
    }${detail(t("Original device record", "原始设备记录"), d)}`;
    document.body.append(modal);
    modal.addEventListener("close", () => modal.remove(), { once: true });
    modal.showModal();
  }
  if (b.hasAttribute("data-ds-close")) b.closest("dialog").close();
});
document.addEventListener("change", (e) => {
  if (e.target.id === "ds-year") {
    dsYear = e.target.value;
    render();
  }
});
document.addEventListener("pointermove", (e) => {
  const chart = e.target.closest(".ds-chart");
  if (!chart) return;
  const plot = dsPlots.get(chart.dataset.dsPlot);
  if (!plot?.rows.length) return;
  const box = chart.getBoundingClientRect(),
    px = ((e.clientX - box.left) / box.width) * plot.W;
  let index = 0;
  plot.rows.forEach((r, i) => {
    if (
      Math.abs(plot.x(r, i) - px) <
      Math.abs(plot.x(plot.rows[index], index) - px)
    )
      index = i;
  });
  const r = plot.rows[index],
    tooltip = chart.querySelector(".ds-tooltip");
  tooltip.innerHTML = `<b>${esc(r.label)}</b>${plot.shown
    .map(
      (d) =>
        `<span><i style="background:${d.color}"></i>${d.label}<strong>${dsNum(
          r[d.key],
          2
        )}</strong></span>`
    )
    .join("")}`;
  tooltip.hidden = false;
  tooltip.style.left =
    Math.max(0, Math.min(e.clientX - box.left + 12, box.width - 230)) + "px";
  tooltip.style.top = "18px";
});
document.addEventListener("pointerout", (e) => {
  const chart = e.target.closest(".ds-chart");
  if (chart && !chart.contains(e.relatedTarget))
    chart.querySelector(".ds-tooltip").hidden = true;
});

// These forms are local display controls, not transaction/workflow actions.
document.addEventListener("submit", (e) => {
  const form = e.target;
  if (form.hasAttribute("data-ds-search-form")) {
    e.preventDefault();
    dsSearch = new FormData(form).get("query").toString().trim();
    render();
  }
  if (form.hasAttribute("data-ds-tariff-form")) {
    e.preventDefault();
    const raw = new FormData(form).get("rate").toString().trim();
    const rate = raw === "" ? NaN : Number(raw);
    if (!dsValidNumber(rate))
      return feedback(
        t("Enter a non-negative finite rate", "请输入非负的有效电价"),
        true
      );
    try {
      const s = dsStations().find((s) => s.id === dsStation);
      localStorage.setItem(
        dsTariff(s).key,
        JSON.stringify({ rate, updatedAt: new Date().toISOString() })
      );
      render();
      feedback(t("Dashboard scenario updated", "已更新看板情景估算"));
    } catch (error) {
      feedback(error.message, true);
    }
  }
});
