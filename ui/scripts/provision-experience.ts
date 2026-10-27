/** Local maintenance tool. Signs with dedicated remote-demo wallets, never with backend impersonation. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { JsonRpcProvider, Wallet } from "ethers";
async function main() {
  const root = resolve(__dirname, "../..");
  const settings = JSON.parse(readFileSync(resolve(root, ".data/remote-demo/public.json"), "utf8"));
  if (settings.chainId !== 20261008) throw new Error("Provisioning is restricted to the remote demo network");
  const keys = JSON.parse(readFileSync(resolve(root, ".data/remote-demo/wallet-import.private.json"), "utf8"));
  const provider = new JsonRpcProvider(settings.rpc, settings.chainId, { staticNetwork: true, batchMaxCount: 1 });
  const cookies: Record<string, string> = {};
  const wallets = Object.fromEntries(["owner", "agent", "trustee", "investor", "investor2"].map(role => [role, new Wallet(keys[role].privateKey, provider)]));
  let selected = "";
  async function request(role: string, path: string, body?: unknown, attempt = 0): Promise<any> {
    const response = await fetch(settings.app + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { Origin: settings.app, "Content-Type": "application/json", ...(cookies[role] ? { Cookie: cookies[role] } : {}), ...(selected ? { "X-Revenue-Product": selected } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(180_000),
    });
    const raw = await response.text();
    if ([502,503,504].includes(response.status) && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve,1500 * (attempt + 1)));
      return request(role,path,body,attempt + 1);
    }
    let value: any; try { value = JSON.parse(raw); } catch { throw new Error(`${path}: service returned HTTP ${response.status}, not JSON`); }
    if (!response.ok) throw new Error(`${path}: ${value.error || response.status}`);
    const cookie = response.headers.get("set-cookie"); if (cookie) cookies[role] = cookie.split(";")[0];
    return value;
  }
  for (const role of Object.keys(wallets)) {
    const c = await request(role, "/api/auth/challenge", { address: wallets[role].address, requestedRole: role.startsWith("investor") ? "investor" : role });
    await request(role, "/api/auth/verify", { nonce: c.nonce, signature: await wallets[role].signMessage(c.message) });
  }
  const created = await request("agent", "/api/products/create", { idempotencyKey: process.env.REVENUE_EXPERIENCE_PRODUCT_KEY || "investor-experience-current", kind: "experience", title: "光伏收益权 · 投资者体验产品", demoAcknowledged: true });
  selected = created.vault;
  const state = () => request("agent", "/api/state");
  const resultFile = resolve(root,".data/remote-demo/experience-product.json");
  const previous = existsSync(resultFile) ? JSON.parse(readFileSync(resultFile,"utf8")) : undefined;
  if (previous && previous.vault !== selected) writeFileSync(resultFile.replace(".json", "-previous.json"), JSON.stringify(previous,null,2), {mode:0o600});
  const evidence: any[] = previous?.vault === selected ? previous.evidence : [];
  async function run(role: string, action: string, payload: any = {}, chain = false) {
    const key = createHash("sha256").update(JSON.stringify([role, action, payload.applicationId || payload.investor || "pool"])).digest("hex").slice(0, 32);
    const idempotencyKey = `experience-current-${action}-${key}`;
    if (chain) {
      const prepared = await request(role, "/api/wallet/prepare", { expectedVault: selected, action, payload, idempotencyKey });
      for (const step of prepared.transactions) {
        const nonce = Number(BigInt(await provider.send("eth_getTransactionCount", [wallets[role].address, "pending"])));
        const tx = await wallets[role].sendTransaction({ to: step.to, data: step.data, value: BigInt(step.value), nonce });
        await request(role, "/api/wallet/submitted", { expectedVault: selected, operationId: prepared.operationId, step: step.step, hash: tx.hash });
        const receipt = await tx.wait(); if (!receipt || receipt.status !== 1) throw new Error("Provisioning transaction failed");
        await request(role, "/api/wallet/confirm", { expectedVault: selected, operationId: prepared.operationId, step: step.step, hash: tx.hash });
        evidence.push({ action, actor: role, hash: tx.hash, block: receipt.blockNumber, explorer: `${settings.explorer}/tx/${tx.hash}` });
      }
    }
    return request(role, "/api/actions", { expectedVault: selected, action, payload, idempotencyKey });
  }
  let s = await state();
  if (Number(s.chain.phase) > 1) { console.log(JSON.stringify({vault:selected,phase:s.chain.phase,status:"already settled or ended; no state reset performed"})); provider.destroy(); return; }
  if (Number(s.chain.phase) === 0) {
  for (const role of ["owner", "agent", "trustee"]) await request(role, "/api/faucet", { expectedVault: selected });
  if (!s.applications.length) await run("owner", "apply", {stationId:s.stations[0].id, notes:"预置投资者体验产品。使用真实电站 API 证据与明确标注的模拟收益权协议，仅供测试。"});
  s = await state(); const appId = s.applications[0].id; const body = {applicationId:appId};
  if (s.applications[0].status === "submitted") await run("agent", "review", {...body,decision:"approved",notes:"测试产品资料已核对。该协议仅用于独立演示场景。"});
  s = await state();
  if (s.applications[0].status === "approved") {
    const station = s.stations[0];
    const assumptions = {...s.applications[0].assumptions,
      baselineMethod: "historical",
      baselineReviewSourceHash: station.sourceHash,
      baselineReviewNote:"近期完整日上网量超过发电量，无法据此分配光伏自用与售电。采用最多36个月的历史同月发电和有效上网样本作为暂定季节性演示基线，排除不平衡上网样本，不代表近期状态已核实。自用交付系数、电价、费用及未来现金流均为审核后的演示假设，不构成保证收益。"};
    await run("agent", "offer", {...body, assumptions});
  }
  s = await state();
  if (s.applications[0].status === "offered") {
    await run("trustee", "approve-offer", {...body,acceptProvisional:true});
    await run("owner", "accept", body);
  }
  s = await state();
  if (s.applications[0].status === "accepted") {
    const agreement = await request("owner", "/api/wallet/agreement", {...body,expectedVault:selected});
    await run("owner", "sign", {...body,walletSignature:await wallets.owner.signMessage(agreement.message)});
  }
  s = await state();
  if (!s.applications[0].chainAdmission.minted) await run("agent", "mint-station", body, true);
  s = await state();
  if (!s.applications[0].chainAdmission.approvedToVault && !s.applications[0].chainAdmission.admitted) await run("owner", "custody-consent", body, true);
  if (!(await state()).applications[0].chainAdmission.admitted) await run("agent", "admit", body, true);
  s = await state();
  if (!s.activeReports.aggregate) await run("agent", "prepare-valuation", {}, true);
  if (!(await state()).chain.fresh) await run("trustee", "approve-valuation", {acceptProvisional:true}, true);
  await run("agent", "publish", {}, true);
  }
  // Dedicated investor accounts are pre-reviewed so colleagues can test without another role.
  for (const investor of ["investor", "investor2"]) {
    if ((await state()).accounts[investor].eligible) continue;
    const applied = await run(investor, "apply-eligibility", {riskAccepted:true,demoAcknowledged:true});
    await run("agent", "eligible", {investor,applicationId:applied.result.id,eligible:true,reviewNote:"专用投资者测试账户的演示风险声明已核对。"}, true);
  }
  await request("agent", "/api/products/create", {idempotencyKey:process.env.REVENUE_ISSUANCE_PRODUCT_KEY || "instant-review-issuance-v3",kind:"issuance",title:"光伏收益权 · 新版发行演示",demoAcknowledged:true});
  s = await state();
  if (Number(s.chain.phase) !== 1 || !s.chain.fresh || Number(s.chain.target) <= 0) throw new Error("Experience product not ready for subscription");
  const result = {at:new Date().toISOString(),vault:selected,chainId:settings.chainId,phase:s.chain.phase,targetUSDC6:s.chain.target,projectedNetIRRPct:s.poolProjection.projectedNetIRRPct,source:s.stations[0].source,observedAt:s.stations[0].observedAt,evidence};
  writeFileSync(resultFile, JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify({...result,evidence: evidence.length}));
  provider.destroy();
}
main().catch(error=>{console.error(error.shortMessage||error.message);process.exitCode=1;});
