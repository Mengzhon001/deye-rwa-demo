import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { DemoRuntime } from "./runtime";
import { DemoStoreRepository } from "./store";
import type {
  InvestorTradeRequest,
  MarketTxRecordRequest,
  ManagerDeployRequest,
  ManagerLifecycleRequest
} from "./types";

const publicDir = resolve(__dirname, "../public");
const store = new DemoStoreRepository();
const runtime = new DemoRuntime(store);
runtime.startScheduler();
const port = Number(process.env.UI_PORT ?? 4173);

function json(res: ServerResponse<IncomingMessage>, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendFile(res: ServerResponse<IncomingMessage>, filePath: string) {
  const extension = extname(filePath);
  const contentType =
    extension === ".css"
      ? "text/css; charset=utf-8"
      : extension === ".js"
        ? "application/javascript; charset=utf-8"
        : "text/html; charset=utf-8";
  res.writeHead(200, { "Content-Type": contentType });
  res.end(readFileSync(filePath));
}

async function readBody<T>(req: { on: Function }): Promise<T> {
  const chunks: Buffer[] = [];
  return new Promise((resolvePromise, rejectPromise) => {
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
      } catch (error) {
        rejectPromise(error);
      }
    });
    req.on("error", rejectPromise);
  });
}

createServer(async (req, res) => {
  if (!req.url) {
    json(res, 400, { error: "missing request url" });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? `localhost:${port}`}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/state") {
      const walletAddress = url.searchParams.get("walletAddress") as `0x${string}` | null;
      json(res, 200, await runtime.getUiState(walletAddress));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/manifest") {
      json(res, 200, await runtime.manifest());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/manager/deploy-facility") {
      json(res, 200, await runtime.deployFacility(await readBody<ManagerDeployRequest>(req)));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/manager/submit-lifecycle") {
      json(res, 200, await runtime.submitLifecycleEvent(await readBody<ManagerLifecycleRequest>(req)));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/investor/faucet") {
      const body = await readBody<InvestorTradeRequest>(req);
      json(res, 200, await runtime.requestDemoUsdc(body.walletAddress));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/investor/fund-native") {
      const body = await readBody<InvestorTradeRequest>(req);
      json(res, 200, await runtime.requestDemoEth(body.walletAddress));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/investor/prepare-buy") {
      const body = await readBody<InvestorTradeRequest>(req);
      json(res, 200, await runtime.prepareBuyTransaction(body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/investor/prepare-redeem") {
      const body = await readBody<InvestorTradeRequest>(req);
      json(res, 200, await runtime.prepareRedeemTransaction(body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/investor/record-market-tx") {
      const body = await readBody<MarketTxRecordRequest>(req);
      json(res, 200, await runtime.recordMarketTransaction(body));
      return;
    }

    const filePath =
      url.pathname === "/" || url.pathname === "/manager" || url.pathname === "/investor"
        ? join(publicDir, "index.html")
        : join(publicDir, url.pathname.replace(/^\//u, ""));

    if (existsSync(filePath)) {
      sendFile(res, filePath);
      return;
    }

    json(res, 404, { error: "not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    json(res, 500, { error: message });
  }
}).listen(port, () => {
  process.stdout.write(`Demo UI server listening on http://localhost:${port}\n`);
});
