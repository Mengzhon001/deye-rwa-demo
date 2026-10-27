import { test, expect, Page } from "@playwright/test";
import { HDNodeWallet, JsonRpcProvider } from "ethers";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
const baseURL=process.env.REVENUE_SITE_TEST_URL||"http://127.0.0.1:4174";
const isolated=process.env.REVENUE_SITE_TEST_WALLETS
  ? JSON.parse(readFileSync(process.env.REVENUE_SITE_TEST_WALLETS,"utf8")) : undefined;
if(!isolated)process.loadEnvFile(resolve(__dirname, "../../..", ".env.web3.local"));
const chainId=Number(process.env.REVENUE_SITE_TEST_CHAIN_ID||20260922);
const chainHex="0x"+chainId.toString(16);
const provider = new JsonRpcProvider(process.env.REVENUE_SITE_TEST_RPC||"http://127.0.0.1:18545", chainId, {staticNetwork:true});
function testSigner(index=6){
  if(isolated){const role=({1:'agent',2:'trustee',3:'trustee2',5:'owner',6:'investor'} as Record<number,string>)[index];return HDNodeWallet.fromPhrase(isolated.wallets[role].phrase);}
  return HDNodeWallet.fromPhrase(process.env.REVENUE_SYSTEM_MNEMONIC!,undefined,`m/44'/60'/0'/0/${index}`);
}
const labels: Record<string, string> = {
  owner: "业主",
  agent: "中介机构",
  investor: "投资者",
  trustee: "受托管理人",
};
async function wallet(page: Page, index = 6) {
  const signer = testSigner(index);
  await page.exposeFunction(
    "__qaWalletRequest",
    async (method: string, params: any[]) => {
      if (method === "personal_sign") {
        expect(params[1].toLowerCase()).toBe(signer.address.toLowerCase());
        return signer.signMessage(params[0]);
      }
      if (["eth_requestAccounts", "eth_accounts"].includes(method))
        return [signer.address];
      if (method === "eth_chainId") return chainHex;
      if (method.startsWith("wallet_")) return null;
      return provider.send(method, params || []);
    }
  );
  await page.addInitScript(
    ({ address,chainHex }) => {
      const w = window as any;
      w.__qaRequests = [];
      w.__qaReject = false;
      w.__qaWrongChain = false;
      const handlers: Record<string, Array<Function>> = {};
      w.__qaEmit = (event: string, value: any) => {
        handlers[event]?.forEach((f) => f(value));
      };
      w.ethereum = {
        on: (event: string, f: Function) => {
          (handlers[event] ||= []).push(f);
        },
        removeListener: (event: string, f: Function) => {handlers[event]=(handlers[event]||[]).filter(h=>h!==f);},
        request: async ({ method, params = [] }: any) => {
          w.__qaRequests.push(method);
          if (w.__qaHangSign && method === "personal_sign")
            return new Promise((resolve) => {
              w.__qaRelease = async () =>
                resolve(await w.__qaWalletRequest(method, params));
            });
          if (w.__qaReject && method === "personal_sign")
            throw Object.assign(new Error("User rejected"), { code: 4001 });
          if (method === "eth_chainId" && w.__qaWrongChain) return "0x1";
          if (method === "wallet_switchEthereumChain") {
            w.__qaWrongChain = false;
            setTimeout(()=>w.__qaEmit("chainChanged", chainHex),100);
            return null;
          }
          return w.__qaWalletRequest(method, params);
        },
      };
    },
    { address: signer.address,chainHex }
  );
  return signer;
}
async function signIn(page: Page, role: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Launch App" }).first().click();
  await page.locator(`[data-wl-role="${role}"]`).click();
  await page.locator("[data-wl-connect]").click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.locator("#wallet-status")).toContainText(labels[role]);
}

test("home is public, uses real draft counts and does not prompt wallet; desktop visual", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await wallet(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "清洁能源"
  );
  await expect(page.locator('[data-stat="publishedProducts"]')).toHaveText("0");
  expect(await page.evaluate(() => (window as any).__qaRequests)).toEqual([]);
  for (const section of await page.locator(".reveal").all()) {
    await section.scrollIntoViewIfNeeded();
    await expect(section).toHaveCSS("opacity", "1");
  }
  await page.locator("h1").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("role selection precedes requests; mismatch and rejection remain recoverable", async ({
  page,
}) => {
  await wallet(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Launch App" }).first().click();
  await expect(page.locator("[data-wl-connect]")).toBeDisabled();
  await page.locator('[data-wl-role="owner"]').click();
  expect(await page.evaluate(() => (window as any).__qaRequests)).toEqual([]);
  await page.locator("[data-wl-connect]").click();
  await expect(page.locator(".wl-error")).toContainText("不具备");
  expect(
    await page.evaluate(() =>
      (window as any).__qaRequests.includes("personal_sign")
    )
  ).toBe(false);
  await page.locator('[data-wl-role="investor"]').click();
  await page.evaluate(() => ((window as any).__qaReject = true));
  await page.locator("[data-wl-connect]").click();
  await expect(page.locator(".wl-error")).toContainText("取消");
  await page.evaluate(() => {
    (window as any).__qaReject = false;
    (window as any).__qaWrongChain = true;
  });
  await page.locator("[data-wl-connect]").click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.locator("#main")).toContainText("暂无已发布产品");
  await page.getByRole("button", { name: "资产池详情", exact: true }).click();
  await expect(page.locator("#main")).toContainText("产品尚未发布");
  await page.reload();
  await expect(page.locator("#wallet-status")).toContainText("投资者");
  await expect(page.locator(".wallet-login")).not.toBeVisible();
  await page.evaluate(() => (window as any).__qaEmit("accountsChanged", []));
  await expect(page.locator("#main")).toContainText("重新登录");
  await expect
    .poll(async () =>
      page.evaluate(
        async () =>
          (
            await (await fetch("/api/session/current")).json()
          ).authenticated
      )
    )
    .toBe(false);
});
for (const [role, index] of [
  ["owner", 5],
  ["agent", 1],
  ["trustee", 2],
  ["trustee", 3],
] as const) {
  test(`role-first signed login ${role} wallet ${index}`, async ({ page }) => {
    await wallet(page, index);
    await signIn(page, role);
    await expect(page.locator("#nav")).toContainText(labels[role]);
    await page.reload();
    await expect(page.locator("#wallet-status")).toContainText(labels[role]);
    await page.evaluate(() => (window as any).__qaEmit("disconnect", {}));
    await expect(page.locator("#main")).toContainText("重新登录");
  });
}
test("direct app opens selector without requesting wallet; cancellation returns to a usable gate", async ({
  page,
}) => {
  await wallet(page);
  await page.goto("/app/");
  await expect(page.locator(".wallet-login")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__qaRequests)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.locator(".wallet-login")).not.toBeVisible();
  await page.locator("#wallet-connect-main").click();
  await expect(page.locator(".wallet-login")).toBeVisible();
});
test("public docs, search, language, deep links, source matching and safe downloads", async ({
  page,
  request,
}) => {
  await page.goto("/docs/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("协议概览");
  await page.locator(".docs-search").fill("折现");
  await expect(page.locator(".docs-search-results")).toContainText("预测");
  await page.goto("/docs/zh/valuation");
  await expect(page.locator(".docs-article")).toContainText("259.20");
  await page.locator("[data-language]").click();
  await expect(page).toHaveURL(/\/docs\/en\/valuation/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Forecasts, household electricity bills and valuation"
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Clean energy"
  );
  await page.goto("/docs/zh/contracts");
  await expect(page.locator(".contract-box")).toHaveCount(3);
  await expect(page.locator(".contract-box").first()).toContainText("匹配");
  await expect(page.locator("#source-content")).not.toHaveText("正在加载…");
  const m = await (await request.get("/contracts/manifest.json")).json();
  expect(m.files.some((f: any) => f.path === "package-lock.json")).toBeTruthy();
  expect(
    m.files.some((f: any) =>
      /\.env|deye_api|store\.json|session-key/.test(f.path)
    )
  ).toBeFalsy();
  const archive = await request.get("/contracts/deye-rwa-source.tar.gz");
  expect(archive.ok()).toBeTruthy();
  expect((await archive.body()).byteLength).toBeGreaterThan(10000);
  const deployment = await (await request.get("/api/public/deployment")).json();
  expect(
    deployment.contracts.every(
      (c: any) => c.status === "matched" && c.deploymentTransaction
    )
  ).toBeTruthy();
  const privatePath = await request.get("/contracts/files/.env.web3.local");
  expect(privatePath.status()).toBe(404);
  await page.screenshot({
    path: "test-results/docs-desktop.png",
    fullPage: true,
  });
});
test("mobile navigation, reduced-motion fallback and unavailable API still render content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/public/overview", (r) =>
    r.fulfill({ status: 503, body: "{}" })
  );
  await page.goto("/");
  await expect(page.locator('[data-stat="publishedProducts"]')).toHaveText(
    "暂不可用"
  );
  await expect(page.locator(".hero-fallback")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  await page.goto("/docs/zh/walkthrough");
  await page.locator(".mobile-doc-toggle").click();
  await expect(page.locator(".docs-sidebar nav")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
});
test("all bilingual documentation pages render with headings and valid internal navigation", async ({
  page,
  request,
}) => {
  const slugs = JSON.parse(
    readFileSync(
      resolve(__dirname, "../../../docs/protocol/navigation.json"),
      "utf8"
    )
  );
  for (const language of ["zh", "en"])
    for (const slug of slugs) {
      await page.goto(`/docs/${language}/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.locator(".docs-article").innerText()).not.toContain(
        "undefined"
      );
    }
  const unauth = await request.get("/api/products");
  expect(unauth.ok()).toBe(false);
  const challenge = await request.post("/api/auth/challenge", {
    headers: { Origin: baseURL },
    data: {
      address: testSigner().address,
    },
  });
  expect(challenge.ok()).toBe(false);
});

test("cancelled pending signature cannot sign in later; duplicate clicks yield one request", async ({
  page,
}) => {
  await wallet(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Launch App" }).first().click();
  await page.locator('[data-wl-role="investor"]').click();
  await page.evaluate(() => ((window as any).__qaHangSign = true));
  await page.locator("[data-wl-connect]").click();
  await expect(page.locator("[data-wl-connect]")).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).__qaRequests.filter(
            (s: string) => s === "personal_sign"
          ).length
      )
    )
    .toBe(1);
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as any).__qaRelease());
  expect(
    await page.evaluate(
      async () =>
        (
          await (await fetch("/api/session/current")).json()
        ).authenticated
    )
  ).toBe(false);
  await expect(page).toHaveURL(baseURL+"/");
});
test("expired session clears protected UI and offers role-first sign-in", async ({
  page,
  context,
}) => {
  await wallet(page);
  await signIn(page, "investor");
  await context.clearCookies();
  await page.locator("#refresh").click();
  await expect(page.locator("#main")).toContainText("登录已过期");
  await expect(page.locator("#wallet-faucet")).toBeHidden();
  await page.locator("#wallet-connect-main").click();
  await expect(page.locator(".wallet-login")).toBeVisible();
});
test("nonce is role-bound, one-use and wrong-role requests are rejected server-side", async ({
  request,
}) => {
  const signer = testSigner();
  const headers = { Origin: baseURL };
  const rejected = await request.post("/api/auth/challenge", {
    headers,
    data: { address: signer.address, requestedRole: "agent" },
  });
  expect(rejected.ok()).toBe(false);
  const challenge = await (
    await request.post("/api/auth/challenge", {
      headers,
      data: { address: signer.address, requestedRole: "investor" },
    })
  ).json();
  expect(challenge.message).toContain("Role: investor");
  const data = {
    nonce: challenge.nonce,
    signature: await signer.signMessage(challenge.message),
  };
  expect((await request.post("/api/auth/verify", { headers, data })).ok()).toBe(
    true
  );
  expect((await request.post("/api/auth/verify", { headers, data })).ok()).toBe(
    false
  );
});
