import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createRpcGateway } from "./rpc-gateway.mjs";

const firefox = "moz-extension://a34a4e7c-6e56-47d2-8a90-d88a38c141fa";
const chrome = "chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn";
test("wallet origins, mixed batches and management-method isolation", async (t) => {
  const forwarded = [];
  const upstream = http
    .createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const call = JSON.parse(raw);
      forwarded.push(call.method);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: call.id,
          result: call.method === "eth_chainId" ? "0x135283a" : "0x1",
        })
      );
    })
    .listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const gateway = createRpcGateway(
    `http://127.0.0.1:${upstream.address().port}`
  ).listen(0, "127.0.0.1");
  await once(gateway, "listening");
  t.after(() => {
    gateway.closeAllConnections();
    gateway.close();
    upstream.closeAllConnections();
    upstream.close();
  });
  const url = `http://127.0.0.1:${gateway.address().port}/`;
  const rpc = (method, id = 1) => ({ jsonrpc: "2.0", id, method, params: [] });
  const send = (body, origin = firefox) =>
    fetch(url, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  for (const origin of [firefox, chrome]) {
    const preflight = await fetch(url, {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    const response = await send(rpc("eth_chainId"), origin);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal((await response.json()).result, "0x135283a");
  }
  for (const origin of [
    "https://unrelated.example",
    "moz-extension://a34a4e7c-6e56-47d2-8a90-d88a38c141fa.evil.example",
    "null",
  ]) {
    assert.equal((await send(rpc("eth_chainId"), origin)).status, 403);
  }
  const denied = [
    "eth_sendTransaction",
    "eth_sign",
    "personal_sign",
    "anvil_setBalance",
    "anvil_impersonateAccount",
    "hardhat_reset",
    "evm_increaseTime",
  ];
  const batch = await send([
    rpc("eth_chainId"),
    ...denied.map((method, i) => rpc(method, i + 2)),
    rpc("eth_getBalance", 99),
  ]);
  assert.equal(batch.status, 200);
  const values = await batch.json();
  assert.equal(values[0].result, "0x135283a");
  assert.equal(values.at(-1).id, 99);
  assert.equal(values.at(-1).result, "0x1");
  for (const value of values.slice(1, -1))
    assert.equal(value.error.code, -32601);
  for (const method of denied) assert.ok(!forwarded.includes(method), method);
  assert.equal(
    (await (await send(rpc("eth_sendRawTransaction"))).json()).result,
    "0x1"
  );
  assert.equal((await (await send(null)).json()).error.code, -32600);
  assert.equal((await (await send([])).json()).error.code, -32600);
  assert.equal(
    (await send(rpc("eth_chainId"))).status,
    200,
    "gateway survives malformed requests"
  );
});
