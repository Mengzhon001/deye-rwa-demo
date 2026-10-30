import { createServer, IncomingMessage, ServerResponse } from "node:http";
import {
  readFileSync,
  existsSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hostname } from "node:os";
import { getAddress, verifyMessage } from "ethers";
import { RevenueRuntime, safeError } from "./runtime";
import { RevenueCatalog } from "./catalog";
import { Actor } from "./store";
import { recordingEvidence } from "./recording-evidence";
import { publishedProducts, publicOverview, deploymentSources } from "./public";
import { loadDeyeCredentials } from "../../../offchain/src/revenue/deye";
import { workspaceMetadata, workspaceBalances, workspaceRecords } from "./workspace";

const root = resolve(__dirname, "../../..");
export async function startRevenueServer(
  port = Number(process.env.REVENUE_PORT || 4174),
  dataDir = resolve(root, process.env.REVENUE_DATA_DIR || ".data/revenue")
) {
  mkdirSync(dataDir, { recursive: true });
  const lock = join(dataDir, "server.pid");
  const startTicks = (pid: number) => {
    try { return readFileSync(`/proc/${pid}/stat`, "utf8").split(") ").at(-1)!.split(" ")[19]; }
    catch { return undefined; }
  };
  if (existsSync(lock)) {
    const saved = JSON.parse(readFileSync(lock, "utf8"));
    const previous = typeof saved === "number" ? saved : saved.pid;
    let alive = false;
    try { if (previous !== process.pid &&
        (typeof saved === "number" || (saved.host === hostname() && (!saved.startTicks || saved.startTicks === startTicks(previous))))) {
      process.kill(previous, 0);
      alive = true;
    }} catch {}
    if (alive) throw new Error("A server already owns this revenue store");
  }
  const lockValue = JSON.stringify({pid: process.pid, host: hostname(), startTicks: startTicks(process.pid)});
  writeFileSync(lock, lockValue, { mode: 0o600 });
  const cleanup = () => {
    if (existsSync(lock) && readFileSync(lock, "utf8") === lockValue)
      unlinkSync(lock);
  };
  process.once("exit", cleanup);
  process.once("SIGINT", () => process.exit(0));
  process.once("SIGTERM", () => process.exit(0));
  const runtime = new RevenueRuntime(dataDir);
  const catalog = new RevenueCatalog(runtime);
  await catalog.start();
  async function checkpoint() {
    const url=process.env.REVENUE_STATE_CHECKPOINT_URL;
    if(!url)return;
    if(process.env.REVENUE_CHAIN_ID!=="20261014"||url!=="http://state-keeper:8765/checkpoint")throw new Error("Invalid local checkpoint configuration");
    const saved=await fetch(url,{method:"POST",signal:AbortSignal.timeout(30000)});
    if(!saved.ok)throw new Error("交易可能已经确认，本地链备份暂未完成。请保留原操作并重试确认，不要重复付款。Local checkpoint failed; retry the original operation.");
  }
  async function serialize<T>(work:()=>Promise<T>|T) {const result=await catalog.serialize(work);await checkpoint();return result;}
  await checkpoint();

  const keyFile = join(dataDir, "session-key");
  if (!existsSync(keyFile))
    writeFileSync(keyFile, randomBytes(32), { mode: 0o600 });
  const key = readFileSync(keyFile);
  const cookieName = `revenue_session_${port}`;
  const walletRequired = process.env.REVENUE_WALLET_REQUIRED === "true";
  const chainId = runtime.repo.read().manifest!.chainId;
  const publicRpcUrl =
    process.env.REVENUE_PUBLIC_RPC_URL || "http://127.0.0.1:18545";
  const explorerUrl =
    process.env.REVENUE_EXPLORER_URL || "http://127.0.0.1:4000";
  const allowedOrigins = new Set(
    (
      process.env.REVENUE_ALLOWED_ORIGINS ||
      `http://127.0.0.1:${port},http://localhost:${port}`
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const publicReadOrigins = new Set((process.env.REVENUE_PUBLIC_READ_ORIGINS || "").split(",").filter(Boolean));
  const cookieSecurity = process.env.REVENUE_SECURE_COOKIES === "true" ? "; Secure" : "";
  type Session = {
    actor: Actor;
    address: string;
    expiresAt: number;
    requestedRole: string;
  };
  const challenges = new Map<
    string,
    {
      address: string;
      actor: Actor;
      message: string;
      expiresAt: number;
      requestedRole: string;
    }
  >();
  const mac = (value: string) =>
    createHmac("sha256", key).update(value).digest("hex");
  const encodeSession = (session: Session) => {
    const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
    return `${payload}.${mac(payload)}`;
  };
  const decodeSession = (req: IncomingMessage): Session => {
    const cookie = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    const [payload, signature] = cookie?.split(".") || [];
    const expected = payload ? mac(payload) : "";
    if (
      !payload ||
      !signature ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new Error("Connect and sign in with your wallet first");
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Session;
    if (
      !session.actor ||
      session.requestedRole !== runtime.actorRole(session.actor) ||
      session.expiresAt <= Date.now() ||
      getAddress(session.address) !== getAddress(runtime.address(session.actor))
    )
      throw new Error("Wallet session expired or changed");
    return session;
  };
  const roleOf = (req: IncomingMessage) => decodeSession(req).actor;
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  const readRetries=new WeakMap<IncomingMessage,number>();
  const server = createServer(async (req, res) => {
    try {
      const origin = req.headers.origin;
      const hostAllowed = [...allowedOrigins].some(
        (allowed) => new URL(allowed).host === req.headers.host
      );
      if (!hostAllowed) {
        json(res, 403, { error: "Unrecognized application host" });
        return;
      }
      const path = new URL(req.url || "/", `http://${req.headers.host}`)
        .pathname;
      let viewer: Session | undefined;
      try { viewer = decodeSession(req); } catch {}
      const runtime = await catalog.select(
        typeof req.headers["x-revenue-product"] === "string" ? req.headers["x-revenue-product"] : undefined,
        viewer?.requestedRole
      );
      if (viewer?.actor.startsWith("investor:")) runtime.registerInvestor(viewer.address);
      if (req.method === "GET" && origin && publicReadOrigins.has(origin) &&
          ["/api/public/overview", "/api/public/deployment"].includes(path)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
      );
      if (req.method === "GET") {
        if (path === "/api/network") {
          json(res, 200, {
            chainId,
            chainIdHex: `0x${chainId.toString(16)}`,
            chainName: process.env.REVENUE_CHAIN_NAME || "Deye RWA Local",
            rpcUrl: publicRpcUrl,
            progressiveWorkspace: true,
            explorerUrl,
            publicTestnet: chainId === 84532,
            resetEnabled: chainId !== 84532,
            createProductEnabled: chainId !== 84532,
            paymentToken: {address:runtime.repo.read().manifest!.addresses.usdc,symbol:chainId===84532?"USDC":"mUSDC",decimals:6,external:chainId===84532},
            faucets: chainId===84532 ? {eth:"https://portal.cdp.coinbase.com/products/faucet",usdc:"https://faucet.circle.com/"} : null,
            nativeCurrency: {
              name: chainId===84532?"Ether":"Demo Ether",
              symbol: chainId===84532?"ETH":"DETH",
              decimals: 18,
            },
            walletRequired,
            guidanceEnabled: process.env.REVENUE_GUIDANCE_ENABLED === "true",
            demoTimeAdvanceEnabled: process.env.REVENUE_GUIDANCE_ENABLED === "true" && (chainId === 20261014 || chainId === 20261008 && process.env.REVENUE_DEMO_TIME_ADVANCE === "true"),
            recordingEnabled: process.env.REVENUE_DEMO_RECORDING === "true",
            roleAddresses: {
              owner: [runtime.address("owner")],
              agent: [runtime.address("agent")],
              trustee: [
                runtime.address("trustee"),
                runtime.address("trustee2"),
              ],
              investor: [],
            },
          });
          return;
        }
        if (path === "/api/session/current") {
          try {
            const session = decodeSession(req);
            json(res, 200, {
              authenticated: true,
              ...session,
              role: runtime.actorRole(session.actor),
            });
          } catch {
            json(res, 200, { authenticated: false });
          }
          return;
        }
        if (path === "/api/public/overview") {
          const overview = await publicOverview(runtime, explorerUrl);
          try {
            const all = await catalog.rows("all");
            Object.assign(overview, { publishedProducts: all.length, currentProducts: all.filter(p => p.phase <= 2).length,
              admittedStations: all.reduce((n, p) => n + p.admittedStations, 0),
              totalSupply: all.reduce((n, p) => n + BigInt(p.totalSupply), 0n).toString() });
          } catch { Object.assign(overview, { chainAvailable: false, publishedProducts: null, currentProducts: null, admittedStations: null, totalSupply: null }); }
          const monitoring = catalog.monitor.read();
          json(res, 200, { ...overview, observedAt: monitoring.stations.length ? Math.max(...monitoring.stations.map(s => s.observedAt)) : overview.observedAt,
            dataModes: [...new Set(monitoring.stations.map(s => s.source))] });
          return;
        }
        if (path === "/api/public/deployment") {
          json(res, 200, await deploymentSources(runtime, root, explorerUrl));
          return;
        }
        if (["/api/workspace/metadata", "/api/workspace/balances", "/api/workspace/records"].includes(path)) {
          const account = walletRequired ? decodeSession(req).actor : viewer?.actor || "investor";
          if (path.endsWith("/metadata")) json(res, 200, workspaceMetadata(runtime, catalog));
          else if (path.endsWith("/records")) json(res, 200, workspaceRecords(runtime));
          else json(res, 200, await workspaceBalances(runtime, account));
          return;
        }
        if (path === "/api/products") {
          if (walletRequired) decodeSession(req);
          const filter =
            new URL(req.url!, "http://localhost").searchParams.get("status") ||
            "current";
          if (
            !["all", "current", "history", "1", "2", "3", "4"].includes(filter)
          )
            throw new Error("Invalid product filter");
          const products = await catalog.rows(filter);
          json(res, 200, { chainId, readAt: Date.now(), products });
          return;
        }
        if (/^\/api\/recording\/operations\/[a-zA-Z0-9-]{8,100}$/.test(path)) {
          if (process.env.REVENUE_DEMO_RECORDING !== "true") { json(res, 404, { error: "Not found" }); return; }
          decodeSession(req);
          json(res, 200, await recordingEvidence(runtime, path.split("/").pop()!));
          return;
        }
        if (path === "/api/state") {
          const session = walletRequired ? decodeSession(req) : undefined;
          const current = await runtime.state();
          const otherSubscriptions = [];
          if (viewer?.requestedRole === "investor") for (const other of catalog.runtimes.values()) {
            if (other === runtime) continue;
            const phase = Number(await other.vault.phase());
            if (![1,3].includes(phase)) continue;
            const subscription = await other.vault.subscriptions(viewer.address);
            if (subscription.amount > 0n) otherSubscriptions.push({vault:other.repo.read().manifest!.addresses.vault,
              title:catalog.entry(other).title,amountUSDC6:String(subscription.amount),phase,
              canRefund:phase === 3 || ["RevenueShareVaultV3", "RevenueShareVaultV4"].includes(other.repo.read().manifest?.contractName || "") || current.financialTime < Number(subscription.coolingEnd)});
          }
          const productOptions=await catalog.rows("all",viewer?.requestedRole!=="investor");
          json(res, 200, {
            ...current,
            products: productOptions.filter(product=>[1,2,3,4].includes(Number(product.phase))),
            productOptions,
            selectedProduct: catalog.entry(runtime),
            otherSubscriptions,
            monitoring: catalog.monitor.read(),
            monitoringStations: catalog.monitor.read().stations,
            network: { chainId, publicRpcUrl, explorerUrl },
            viewer: session
              ? {
                  actor: session.actor,
                  role: runtime.actorRole(session.actor),
                  address: session.address,
                }
              : undefined,
          });
          return;
        }
        if (path === "/app") {
          res.writeHead(302, { Location: "/app/" });
          res.end();
          return;
        }
        const siteRoot = join(root, "ui/site-dist");
        const siteFile =
          path === "/" || /^\/docs(?:\/|$)/.test(path)
            ? join(siteRoot, "index.html")
            : /^\/(site-assets|contracts)\/[a-zA-Z0-9_./@-]+$/.test(path) &&
              !path.includes("..")
            ? join(siteRoot, path)
            : null;
        if (siteFile && existsSync(siteFile)) {
          const extension = siteFile.split(".").pop()!;
          const mime: Record<string, string> = {
            html: "text/html; charset=utf-8",
            js: "text/javascript",
            css: "text/css",
            json: "application/json",
            svg: "image/svg+xml",
            sol: "text/plain; charset=utf-8",
            zip: "application/zip",
            gz: "application/gzip",
            txt: "text/plain; charset=utf-8",
          };
          res.writeHead(200, {
            "Content-Type": mime[extension] || "application/octet-stream",
            "Cache-Control": "no-cache",
          });
          res.end(readFileSync(siteFile));
          return;
        }
        const files: Record<string, [string, string]> = {
          "/app/": ["index.html", "text/html"],
          ...(process.env.REVENUE_DEMO_RECORDING === "true" ? {"/app/recording/": ["recording.html", "text/html"] as [string,string], "/recording.js": ["recording.js", "text/javascript"] as [string,string]} : {}),
          "/network-context.js": ["network-context.js", "text/javascript"],
          "/network-context.css": ["network-context.css", "text/css"],
          "/wallet-login.js": ["wallet-login.js", "text/javascript"],
          "/wallet-login.css": ["wallet-login.css", "text/css"],
          "/guidance-model.js": ["guidance-model.js", "text/javascript"],
          "/guidance.js": ["guidance.js", "text/javascript"],
          "/guidance.css": ["guidance.css", "text/css"],
          "/guidance-driver.js": ["vendor/driver-1.9.0.js", "text/javascript"],
          "/guidance-driver.css": ["vendor/driver-1.9.0.css", "text/css"],
          "/app.js": ["app.js", "text/javascript"],
          "/dashboard.js": ["dashboard.js", "text/javascript"],
          "/period-timeline.js": ["period-timeline.js", "text/javascript"],
          "/period-timeline.css": ["period-timeline.css", "text/css"],
          "/cashflow.js": ["cashflow.js", "text/javascript"],
          "/cashflow.css": ["cashflow.css", "text/css"],
          "/workflow.js": ["workflow.js", "text/javascript"],
          "/billing.js": ["billing.js", "text/javascript"],
          "/product.js": ["product.js", "text/javascript"],
          "/investor.js": ["investor.js", "text/javascript"],
          "/reset.js": ["reset.js", "text/javascript"],
          "/style.css": ["style.css", "text/css"],
        };
        if (files[path]) {
          const [file, type] = files[path];
          res.writeHead(200, {
            "Content-Type": type,
            "Cache-Control": "no-store",
          });
          res.end(readFileSync(join(root, "ui/public/revenue", file)));
          return;
        }
        json(res, 404, { error: "Not found" });
        return;
      }
      if (
        req.method !== "POST" ||
        !origin ||
        !allowedOrigins.has(origin) ||
        !req.headers["content-type"]?.startsWith("application/json")
      ) {
        json(res, 403, { error: "Same-origin JSON request required" });
        return;
      }
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 100000) {
          json(res, 413, { error: "Request too large" });
          return;
        }
      }
      const body = JSON.parse(raw || "{}");
      if (path === "/api/auth/challenge") {
        const address = getAddress(String(body.address));
        const actor = runtime.actorForAddress(address, false);
        const requestedRole = String(body.requestedRole || "");
        if (!["owner", "agent", "investor", "trustee"].includes(requestedRole))
          throw new Error("Select a role before connecting / 请先选择登录角色");
        if (runtime.actorRole(actor) !== requestedRole)
          throw new Error(
            "Wallet is not authorized for the selected role / 当前钱包不具备所选角色权限"
          );
        const nonce = randomBytes(16).toString("hex");
        const issuedAt = new Date();
        const expiresAt = issuedAt.getTime() + 5 * 60_000;
        // The allowlisted request origin is the actual wallet-facing domain.
        // A loopback maintenance session must not sign into the tunnel host.
        const domain = new URL(origin).host;
        // SIWE assumes HTTPS if the scheme is omitted. Include the actual scheme for local HTTP origins.
        const message = `${origin} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to the local RWA revenue-rights demonstration. Role: ${requestedRole}.\n\nURI: ${origin}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt.toISOString()}\nExpiration Time: ${new Date(
          expiresAt
        ).toISOString()}`;
        challenges.set(nonce, {
          address,
          actor,
          message,
          expiresAt,
          requestedRole,
        });
        json(res, 200, { nonce, message, expiresAt });
        return;
      }
      if (path === "/api/auth/verify") {
        const nonce = String(body.nonce || "");
        const challenge = challenges.get(nonce);
        challenges.delete(nonce);
        if (!challenge || challenge.expiresAt <= Date.now())
          throw new Error("Login challenge expired");
        const recovered = getAddress(
          verifyMessage(challenge.message, String(body.signature || ""))
        );
        if (recovered !== challenge.address)
          throw new Error("Wallet signature does not match the challenge");
        const actor = runtime.actorForAddress(recovered, true);
        if (runtime.actorRole(actor) !== challenge.requestedRole)
          throw new Error("Role configuration changed. Sign in again.");
        const session: Session = {
          requestedRole: challenge.requestedRole,
          actor,
          address: recovered,
          expiresAt: Date.now() + 2 * 60 * 60_000,
        };
        res.setHeader(
          "Set-Cookie",
          `${cookieName}=${encodeSession(
            session
          )}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200${cookieSecurity}`
        );
        json(res, 200, {
          authenticated: true,
          actor,
          role: runtime.actorRole(actor),
          address: recovered,
          expiresAt: session.expiresAt,
        });
        return;
      }
      if (path === "/api/auth/logout") {
        res.setHeader(
          "Set-Cookie",
          `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecurity}`
        );
        json(res, 200, { authenticated: false });
        return;
      }
      if (path === "/api/session") {
        if (walletRequired)
          throw new Error("Wallet sign-in is required for this environment");
        if (
          ![
            "owner",
            "agent",
            "investor",
            "investor2",
            "trustee",
            "trustee2",
          ].includes(body.role)
        )
          throw new Error("Invalid demo role");
        const address = runtime.address(body.role);
        res.setHeader(
          "Set-Cookie",
          `${cookieName}=${encodeSession({
            actor: body.role,
            requestedRole: runtime.actorRole(body.role),
            address,
            expiresAt: Date.now() + 2 * 60 * 60_000,
          })}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200${cookieSecurity}`
        );
        json(res, 200, { role: body.role });
        return;
      }
      const actor = roleOf(req);
      if (path === "/api/products/retire") {
        json(res,200,{result:await catalog.retire(actor,String(body.expectedVault || ""))});
        return;
      }
      if (path === "/api/products/create") {
        if (body.demoAcknowledged !== true) throw new Error("Acknowledge the independent test-product scope / 请确认独立测试产品说明");
        const created = await catalog.create(actor, String(body.idempotencyKey || ""), typeof body.title === "string" ? body.title : undefined,
          body.kind === "experience" ? "experience" : "issuance");
        await checkpoint();
        json(res, 200, { vault: created.repo.read().manifest!.addresses.vault, title: catalog.entry(created).title });
        return;
      }
      if (path === "/api/stations/refresh") {
        await catalog.monitor.refresh();
        json(res, 200, { monitoring: catalog.monitor.read() });
        return;
      }
      if (catalog.entry(runtime).archived) {
        const action = ["/api/actions", "/api/wallet/prepare"].includes(path) ? body.action
          : ["/api/wallet/submitted", "/api/wallet/confirm"].includes(path)
            ? runtime.repo.read().operations.find(o => o.id === body.operationId)?.action : path;
        catalog.assertAction(runtime, String(action || ""));
      }
      if (path === "/api/demo/reset") {
        json(res, 200, { result: await serialize(() => runtime.resetDemo(actor, body)) });
        return;
      }
      if (path === "/api/faucet") {
        json(res, 200, {
          result: await serialize(() => runtime.faucet(actor, body.expectedVault)),
        });
        return;
      }
      if (path === "/api/offer-preview") {
        json(
          res,
          200,
          await runtime.previewOffer(
            actor,
            body.applicationId,
            body.assumptions,
            body.expectedVault
          )
        );
        return;
      }
      if (path === "/api/actions") {
        json(res, 200, {
          result: await serialize(() => {
            if (actor === "owner" && body.action === "apply" && !runtime.repo.read().applications.length &&
                catalog.monitor.read().stations.some(st => st.id === body.payload?.stationId) &&
                (!body.expectedVault || getAddress(body.expectedVault) === getAddress(runtime.repo.read().manifest!.addresses.vault))) {
              runtime.repo.update(s => {
                s.stations = catalog.monitor.read().stations;
                s.mode = s.stations.some(st => st.source === "live") ? "live" : s.mode;
              });
            }
            return runtime.action(
            actor,
            body.action,
            body.payload || {},
            body.idempotencyKey,
            body.expectedVault
          ); }),
        });
        return;
      }
      if (path === "/api/wallet/prepare") {
        json(
          res,
          200,
          await serialize(() => runtime.walletTransactions(
            actor,
            body.action,
            body.payload || {},
            body.expectedVault,
            body.idempotencyKey
          ))
        );
        return;
      }
      if (path === "/api/wallet/submitted") {
        json(
          res,
          200,
          await serialize(() => runtime.recordWalletSubmission(
            actor,
            body.operationId,
            body.step,
            body.hash,
            body.expectedVault
          ))
        );
        return;
      }
      if (path === "/api/wallet/confirm") {
        json(
          res,
          200,
          await serialize(() => runtime.confirmWalletTransaction(
            actor,
            body.operationId,
            body.step,
            body.hash,
            body.expectedVault
          ))
        );
        return;
      }
      if (path === "/api/wallet/reject") {
        json(
          res,
          200,
          await serialize(() => runtime.rejectWalletOperation(
            actor,
            body.operationId,
            body.reason,
            body.expectedVault
          ))
        );
        return;
      }
      if (path === "/api/wallet/agreement") {
        json(res, 200, {
          message: runtime.agreementSigningMessage(
            actor,
            body.applicationId,
            body.expectedVault
          ),
          account: runtime.address(actor),
        });
        return;
      }
      json(res, 404, { error: "Not found" });
    } catch (e) {
      const rpcError=e as any;
      if(chainId===84532&&req.method==="GET"&&req.url?.startsWith("/api/state")&&rpcError.code==="CALL_EXCEPTION"&&rpcError.data==null){
        const attempt=readRetries.get(req)||0;
        if(attempt<2){readRetries.set(req,attempt+1);setTimeout(()=>server.emit("request",req,res),750);return;}
        console.error("Base Sepolia state RPC failure",JSON.stringify({code:rpcError.code,shortMessage:rpcError.shortMessage,transaction:rpcError.transaction,info:rpcError.info}));
      }
      const message = safeError(e);
      json(
        res,
        /Wallet session expired|Connect and sign in/.test(message) ? 401 : 400,
        { error: message }
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, process.env.REVENUE_HOST || "127.0.0.1", resolve);
  });
  server.once("close", () => catalog.monitor.stop());
  console.log(`Deye revenue-rights demo: http://127.0.0.1:${port}`);
  return { server, runtime, catalog };
}
if (require.main === module) {
  // Server-only configuration. Never include this file or credentials in public state.
  const envFile = resolve(root, process.env.REVENUE_ENV_FILE || ".env.revenue");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  if (process.env.DEYE_CREDENTIALS_FILE)
    loadDeyeCredentials(resolve(root, process.env.DEYE_CREDENTIALS_FILE));
  startRevenueServer().catch((e) => {
    console.error(safeError(e));
    process.exitCode = 1;
  });
}
