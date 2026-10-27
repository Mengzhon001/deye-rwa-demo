import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { chromium } from "playwright";
import { dir } from "./revenue-remote.mjs";
const base = "/deye-rwa-demo/";
const root = join(dir,"pages-build");
const server = createServer((req,res)=>{
  try {
    const path=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    if(!path.startsWith(base))throw Error();
    let file=resolve(root,path.slice(base.length));
    if(!file.startsWith(root+"/")&&file!==root)throw Error();
    if(statSync(file).isDirectory())file=join(file,"index.html");
    const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".sol":"text/plain"};
    res.setHeader("Content-Type",mime[extname(file)]||"application/octet-stream");res.end(readFileSync(file));
  }catch{res.writeHead(404);res.end("Not found");}
});
test("GitHub build: subpaths, bilingual deep links, public reads, offline documentation and recoverable Launch App",async()=>{
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const browser=await chromium.launch({headless:true});
  try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    const context=await browser.newContext({reducedMotion:"reduce"});
    const page=await context.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    const endpoints=JSON.parse(readFileSync(join(root,"remote.json"),"utf8"));
    let walletEntryStatus="verified";
    await page.route(origin+base+"remote.json",r=>r.fulfill({json:{...endpoints,walletEntryStatus,preferredWallet:"rabby",wallets:{rabby:"verified",metamask:"unverified"}}}));
    await page.route(endpoints.app+"/api/public/overview",r=>r.fulfill({json:{chainAvailable:true,telemetryStations:1,admittedStations:0,publishedProducts:0,dataModes:["replay"],chainId:20261008},headers:{"Access-Control-Allow-Origin":origin}}));
    await page.goto(origin+base);
    await page.waitForSelector("h1");await page.waitForFunction(()=>document.querySelector('[data-stat="publishedProducts"]').textContent==="0");
    assert.equal(await page.locator(".wallet-login").count(),0);
    await page.waitForSelector(".remote-wallet-notice");
    assert.match(await page.locator(".remote-wallet-notice").innerText(),/Rabby/);
    assert.ok(await page.locator("h1").innerText().then(t=>t.includes("清洁能源")));
    const paths=await page.locator('a[href^="/"]').evaluateAll(a=>a.map(e=>e.getAttribute("href")));
    assert.ok(paths.every(p=>p.startsWith(base)));
    await page.goto(origin+base+"docs/zh/accounting/");await page.reload();
    assert.ok((await page.locator("h1").innerText()).length>0);
    assert.ok(await page.locator("[data-cashflow-example]").count()>0);
    await page.locator("[data-language]").click();await page.waitForURL("**/docs/en/accounting/");
    assert.equal(await page.locator("html").getAttribute("lang"),"en");
    await page.unroute(endpoints.app+"/api/public/overview");
    await page.route(endpoints.app+"/**",r=>r.abort());
    await page.getByRole("button",{name:"Launch App"}).first().click();await page.waitForSelector("#remote-unavailable");
    assert.equal(await page.getByRole("button",{name:"Launch App"}).first().isEnabled(),true);
    await page.goto(origin+base+"docs/zh/contracts/");await page.waitForSelector("#source-content");
    await page.waitForFunction(()=>document.querySelector("#source-content")?.textContent.includes("contract RevenueShareVault"));
    assert.deepEqual(errors,[]);
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(dir,"pages-mobile.png"),fullPage:true});
    await page.unroute(endpoints.app+"/**");
    walletEntryStatus="blocked";
    await page.goto(origin+base);await page.getByRole("button",{name:"Launch App"}).first().click();
    assert.match(await page.locator("#remote-unavailable").innerText(),/钱包安全检查/);
    assert.equal(page.url(),origin+base);
    walletEntryStatus="verified";
    await page.route(endpoints.app+"/api/public/overview",r=>r.fulfill({json:{chainAvailable:true},headers:{"Access-Control-Allow-Origin":origin}}));
    await page.route(endpoints.app+"/app/**",r=>r.fulfill({contentType:"text/html",body:"<h1>Role selection</h1>"}));
    await page.goto(origin+base);await page.getByRole("button",{name:"Launch App"}).first().click();
    await page.waitForURL(endpoints.app+"/app/?lang=zh&wallet=rabby");
    assert.ok(await page.locator("h1").innerText().then(t=>t==="Role selection"));
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});
