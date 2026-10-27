import http from "node:http";
import { pathToFileURL } from "node:url";

const upstream = new URL(process.env.RPC_UPSTREAM || "http://anvil:8545");
const port = Number(process.env.RPC_PORT || 8545);
const origins = new Set(
  (process.env.RPC_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const allowed = new Set([
  "web3_clientVersion",
  "net_version",
  "net_listening",
  "eth_chainId",
  "eth_blockNumber",
  "eth_syncing",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_blobBaseFee",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getTransactionCount",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getBlockReceipts",
  "eth_getBlockTransactionCountByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getTransactionByBlockHashAndIndex",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getLogs",
  "eth_call",
  "eth_estimateGas",
  "eth_createAccessList",
  "eth_sendRawTransaction",
]);

// Wallet extensions issue RPC requests from their own origin, not the dapp's.
// They receive only the same public reads and signed-transaction relay below.
export function originAllowed(origin) {
  return (
    !origin ||
    origins.has(origin) ||
    /^moz-extension:\/\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
      origin
    ) ||
    /^chrome-extension:\/\/[a-p]{32}$/.test(origin)
  );
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function reply(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}

export function createRpcGateway(target = upstream) {
  return http.createServer(async (req, res) => {
    cors(req, res);
    const origin = req.headers.origin;
    if (!originAllowed(origin)) {
      reply(res, 403, { error: "Origin is not allowed" });
      return;
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method !== "POST" || req.url !== "/") {
      reply(res, 404, { error: "JSON-RPC endpoint not found" });
      return;
    }
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 1_000_000) {
        reply(res, 413, { error: "JSON-RPC request is too large" });
        return;
      }
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      reply(res, 200, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Invalid JSON" },
      });
      return;
    }
    const calls = Array.isArray(payload) ? payload : [payload];
    if (!calls.length || calls.length > 100) {
      reply(res, 200, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid batch size" },
      });
      return;
    }
    // A wallet may probe an unsupported method alongside normal balance reads.
    // Return one JSON-RPC result per call; never fail the entire batch for a probe.
    const results = await Promise.all(
      calls.map(async (call) => {
        const error = (code, message) => ({
          jsonrpc: "2.0",
          id: call?.id ?? null,
          error: { code, message },
        });
        if (
          !call ||
          Array.isArray(call) ||
          call.jsonrpc !== "2.0" ||
          typeof call.method !== "string"
        )
          return error(-32600, "Invalid JSON-RPC request");
        if (!allowed.has(call.method))
          return error(-32601, "JSON-RPC method is not allowed");
        try {
          const response = await fetch(target, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(call),
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok) return error(-32000, "Local chain is unavailable");
          return await response.json();
        } catch {
          return error(-32000, "Local chain is unavailable");
        }
      })
    );
    reply(res, 200, Array.isArray(payload) ? results : results[0]);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  createRpcGateway().listen(port, "0.0.0.0", () => {
    process.stdout.write(`Filtered JSON-RPC listening on ${port}\n`);
  });
}
