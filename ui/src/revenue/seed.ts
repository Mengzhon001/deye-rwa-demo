import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envFile = resolve(
  __dirname,
  "../../..",
  process.env.REVENUE_ENV_FILE || ".env.revenue"
);
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** Exercise the public HTTP/session boundary and leave a reviewable demo at month three. */
async function main() {
  const stage = process.env.REVENUE_SEED_STAGE || "complete";
  if (!["complete", "fundraising"].includes(stage))
    throw new Error("REVENUE_SEED_STAGE must be complete or fundraising");
  const base = `http://127.0.0.1:${Number(process.env.REVENUE_PORT || 4174)}`;
  let cookie = "";
  const request = async (path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie")!.split(";")[0];
    const json = (await res.json()) as any;
    if (!res.ok) throw new Error(json.error);
    return json;
  };
  let state = await request("/api/state");
  if (state.mode === "live" || state.mode === "replay")
    throw new Error(
      "Synthetic seed cannot replace live/replayed station data; start a separate fixture scenario"
    );
  if (state.applications.length || state.chain.phase !== "0")
    throw new Error(
      "Seed requires a fresh revenue scenario; it never overwrites existing applications"
    );
  const run = async (
    role: string,
    action: string,
    payload: unknown = {},
    idempotencyKey = randomUUID()
  ) => {
    await request("/api/session", { role });
    return request("/api/actions", { action, payload, idempotencyKey });
  };
  const foreign = await fetch(base + "/api/session", {
    method: "POST",
    headers: {
      Origin: "https://example.invalid",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "agent" }),
  });
  assert.equal(foreign.status, 403);
  await assert.rejects(() => run("owner", "publish"), /not authorized/);
  await run("agent", "source", { mode: "synthetic" });
  state = await request("/api/state");
  const station = state.stations[0];
  await run("owner", "apply", {
    stationId: station.id,
    notes:
      "Demo household ownership and collection agreement / 演示业主所有权与收款协议",
  });
  state = await request("/api/state");
  const applicationId = state.applications[0].id;
  await run("agent", "review", { applicationId, decision: "approved" });
  await run("agent", "offer", { applicationId });
  await run("trustee", "approve-offer", { applicationId, acceptProvisional: true });
  await run("owner", "accept", { applicationId });
  await run("owner", "sign", { applicationId });
  await run("agent", "admit", { applicationId });
  const value = async () => {
    await run("agent", "prepare-valuation");
    await run("trustee", "approve-valuation", { acceptProvisional: true });
  };
  await value();
  for (const investor of ["investor", "investor2"]) {
    const applied = await run(investor, "apply-eligibility", {
      riskAccepted: true,
      demoAcknowledged: true,
    });
    await run("agent", "eligible", {
      investor,
      applicationId: applied.result.id,
      eligible: true,
      reviewNote: "Reviewed declarations for the local demo",
    });
  }
  await run("agent", "publish");
  if (stage === "fundraising") {
    console.log(
      `Fundraising scenario ready at ${base}. Select Investor A/B and enable MetaMask on Subscribe. No investor subscriptions have been made.`
    );
    return;
  }
  state = await request("/api/state");
  const target = BigInt(state.chain.target),
    a = (target * 6n) / 10n;
  await run("investor", "subscribe", { amountUSDC6: a.toString() });
  await run("investor2", "subscribe", { amountUSDC6: (target - a).toString() });
  for (const investor of ["investor", "investor2"] as const) {
    const order = (await request("/api/state")).accounts[investor].subscription;
    await run("agent", "review-subscription", {investor,amountUSDC6:order.amount,terms:order.terms,orderNonce:order.nonce,approved:true,reviewNote:"Reviewed wallet, escrow and issuance terms"});
  }
  await run("agent", "settle");
  await value();
  for (let period = 1; period <= 3; period++) {
    await run("agent", "advance", { by: "month" });
    await run("agent", "accrue-fee");
    await run("agent", "book-revenue", {
      applicationId,
      period,
      historyMonth: station.history.at(-1).month,
    });
    state = await request("/api/state");
    await run("agent", "collect-revenue", { incomeId: state.income.at(-1).id });
    await value();
  }
  await run("agent", "distribute");
  await value();
  const key = randomUUID();
  await run("investor", "claim", { distributionId: 1 }, key);
  await run("investor", "claim", { distributionId: 1 }, key);
  await run("investor2", "claim", { distributionId: 1 });
  state = await request("/api/state");
  assert.equal(state.chain.phase, "2");
  assert.equal(state.stations[0].observedAt, station.observedAt);
  assert.ok(
    BigInt(state.accounts.investor.performance.cashDistributionsUSDC6) > 0n
  );
  console.log(
    `HTTP/session checks and seeded quarterly lifecycle passed. Open ${base}; Investor → My holdings shows confirmed positions and distributions.`
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
