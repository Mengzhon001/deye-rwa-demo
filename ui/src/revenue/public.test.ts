import { test } from "node:test";
import assert from "node:assert/strict";
import { publishedProducts, publicOverview } from "./public";
const manifest: any = {
  scenarioId: "one",
  chainId: 20260922,
  addresses: { vault: "0x1" },
};
test("published product policy excludes drafts, separates history, and retains stale published products", () => {
  for (const phase of [0, 1, 2, 3, 4]) {
    const chain = {
      phase,
      fresh: false,
      target: "1",
      totalSubscriptions: "0",
      totalSupply: "0",
      deadline: 10,
    };
    assert.equal(
      publishedProducts(manifest, chain).length,
      phase === 0 ? 0 : 1
    );
    assert.equal(
      publishedProducts(manifest, chain, "current").length,
      [1, 2].includes(phase) ? 1 : 0
    );
    assert.equal(
      publishedProducts(manifest, chain, "history").length,
      [3, 4].includes(phase) ? 1 : 0
    );
    assert.equal(
      publishedProducts(manifest, chain, String(phase)).length,
      phase === 0 ? 0 : 1
    );
    if (phase)
      assert.equal(publishedProducts(manifest, chain)[0].valuationFresh, false);
  }
});
test("public overview separates telemetry and admission without exposing private store; unavailable is not zero", async () => {
  const repo = {
    read: () => ({
      manifest,
      stations: [
        { observedAt: 10, source: "live", secret: "must not publish" },
      ],
      applications: [{ privateDocument: "must not publish" }],
    }),
  };
  const vault = {
    phase: async () => 0n,
    rightCount: async () => 0n,
    totalSupply: async () => 0n,
  };
  const data = await publicOverview(
    { repo, vault } as any,
    "http://localhost:4000"
  );
  assert.equal(data.telemetryStations, 1);
  assert.equal(data.admittedStations, 0);
  assert.equal(data.publishedProducts, 0);
  assert.ok(!JSON.stringify(data).includes("must not publish"));
  vault.phase = async () => {
    throw new Error("node offline");
  };
  const unavailable = await publicOverview(
    { repo, vault } as any,
    "http://localhost:4000"
  );
  assert.equal(unavailable.chainAvailable, false);
  assert.equal(unavailable.admittedStations, null);
  assert.equal(unavailable.publishedProducts, null);
});
