type Network = "private" | "base-sepolia";
type Lang = "zh" | "en";
const chevron = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const check = '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true"><path d="m5 10 3.2 3.2L15 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export function networkIcon(id: Network) {
  return id === "base-sepolia"
    ? '<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#0052ff"/><path d="M6 16h19" stroke="#fff" stroke-width="3.1"/></svg>'
    : '<svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden="true"><rect width="32" height="32" rx="11" fill="#b8f2c8"/><path d="m9 12 7-4 7 4v8l-7 4-7-4v-8Zm0 0 7 4 7-4m-7 4v8" stroke="#173f35" stroke-width="1.5" stroke-linejoin="round"/></svg>';
}
const title = (id: Network, lang: Lang) => id === "private" ? (lang === "zh" ? "私有演示链" : "Private demo") : "Base Sepolia";
export function renderNetworkPicker(id: Network, lang: Lang) {
  return `<div class="net-picker"><button type="button" class="net-picker__trigger" data-site-network aria-label="${lang === "zh" ? "选择网络" : "Select network"}" aria-haspopup="menu" aria-expanded="false" aria-controls="site-network-menu" popovertarget="site-network-menu"><span class="net-picker__icon" data-network-icon>${networkIcon(id)}</span><span data-network-label>${title(id, lang)}</span><span class="net-picker__chevron">${chevron}</span></button><div id="site-network-menu" class="net-picker__menu" popover="auto" role="menu" aria-label="${lang === "zh" ? "选择网络" : "Select network"}"><div class="net-picker__heading"><span>${lang === "zh" ? "选择网络" : "Select network"}</span><span class="net-picker__test-label">${lang === "zh" ? "测试环境" : "TEST NETWORKS"}</span></div>${(["private", "base-sepolia"] as Network[]).map(n => `<button type="button" class="net-picker__option" role="menuitemradio" aria-checked="${n === id}" data-site-network-option="${n}" tabindex="${n === id ? "0" : "-1"}"><span class="net-picker__option-icon">${networkIcon(n)}</span><span class="net-picker__copy"><strong>${title(n, lang)}</strong><span>${n === "private" ? (lang === "zh" ? "完整流程演示 · mUSDC" : "Full lifecycle demo · mUSDC") : (lang === "zh" ? "公共链测试 · Circle USDC" : "Public testnet · Circle USDC")}</span></span><span class="net-picker__check">${check}</span></button>`).join("")}<div class="net-picker__foot">${lang === "zh" ? "切换网络不会转移资金。" : "Switching networks does not move funds."}</div></div></div>`;
}
export function installNetworkPicker(onChange: (id: Network) => void) {
  const menu = () => document.querySelector<HTMLElement>("#site-network-menu");
  const trigger = () => document.querySelector<HTMLButtonElement>("[data-site-network]");
  const options = () => [...(menu()?.querySelectorAll<HTMLButtonElement>("[data-site-network-option]") || [])];
  const hide = (focus = false) => { menu()?.hidePopover(); trigger()?.setAttribute("aria-expanded", "false"); if (focus) trigger()?.focus(); };
  const position = () => {
    const m = menu(), b = trigger(); if (!m || !b) return;
    const rect = b.getBoundingClientRect(), width = Math.min(332, innerWidth - 32);
    m.style.setProperty("--picker-left", `${Math.max(16, Math.min(rect.right - width, innerWidth - width - 16))}px`);
    m.style.setProperty("--picker-top", `${rect.bottom + 10}px`);
  };
  document.addEventListener("beforetoggle", event => {
    if (!(event.target instanceof HTMLElement) || event.target.id !== "site-network-menu") return;
    position();
    trigger()?.setAttribute("aria-expanded", String((event as ToggleEvent).newState === "open"));
  }, true);
  document.addEventListener("toggle", event => {
    if (!(event.target instanceof HTMLElement) || event.target.id !== "site-network-menu") return;
    const open = event.target.matches(":popover-open"); trigger()?.setAttribute("aria-expanded", String(open));
    if (open) (options().find(b => b.getAttribute("aria-checked") === "true") || options()[0])?.focus();
  }, true);
  document.addEventListener("click", event => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-site-network-option]");
    if (!b) return;
    const id = b.dataset.siteNetworkOption as Network;
    if (!["private", "base-sepolia"].includes(id)) return;
    const lang: Lang = document.documentElement.lang.startsWith("zh") ? "zh" : "en";
    const icon = trigger()?.querySelector("[data-network-icon]"), label = trigger()?.querySelector("[data-network-label]");
    if (icon) icon.innerHTML = networkIcon(id); if (label) label.textContent = title(id, lang);
    options().forEach(option => { const selected = option === b; option.setAttribute("aria-checked", String(selected)); option.tabIndex = selected ? 0 : -1; });
    hide(true); onChange(id);
  });
  document.addEventListener("keydown", event => {
    const b = trigger(), m = menu(); if (!b || !m) return;
    if (event.target === b && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); position(); m.showPopover(); return; }
    if (!m.matches(":popover-open")) return;
    if (event.key === "Escape") { event.preventDefault(); hide(true); return; }
    if (event.key === "Tab") { hide(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const list = options(), index = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
    list[next]?.focus();
  });
  window.addEventListener("resize", () => hide());
  document.addEventListener("scroll", event => { if (menu()?.matches(":popover-open") && !menu()?.contains(event.target as Node)) hide(); }, true);
}
