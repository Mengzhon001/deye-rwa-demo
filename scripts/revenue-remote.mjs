#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { publishManuals } from "./publish-manuals.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync, chmodSync, cpSync, readdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { Mnemonic, HDNodeWallet } from "ethers";
const require = createRequire(import.meta.url);
const yaml = require("js-yaml");
export const root = resolve(import.meta.dirname, "..");
export const dir = join(root, ".data/remote-demo");
export const ports = { app: 4178, explorer: 4004, rpc: 18549 };
export const chainId = 20261008;
export const pages = process.env.REVENUE_PAGES_URL || "https://example.github.io/deye-rwa-demo/";
const repo = process.env.REVENUE_PAGES_REPO;
const roles = ["owner", "agent", "investor", "investor2", "trustee", "trustee2"];
const cloudflaredVersion = "2026.10.0";
const cloudflaredDigest = "a2f79ff7b9420aa537d74af239f376da170bbabeb529aec416002adac6a72e70";
const ngrokVersion = "3.39.11";
const ngrokDigest = "9324a6552d74e25d5bdfdbedc4b32422c96f044fda37877498ad8ef10bddf7f7";
const sha = data => createHash("sha256").update(data).digest("hex");
const read = file => JSON.parse(readFileSync(file, "utf8"));
const save = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
const wait = ms => new Promise(r => setTimeout(r, ms));
function run(program, args, options = {}) {
  const r = spawnSync(program, args, { cwd: root, stdio: "inherit", ...options });
  if (r.error || r.status !== 0) throw r.error || Error(`${program} failed (${r.status})`);
  return r.stdout;
}
function output(program, args, options = {}) { return run(program, args, { ...options, stdio: "pipe", encoding: "utf8" }).trim(); }
function privateConfig() {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const file = join(dir, "private.json");
  if (!existsSync(file)) {
    save(file, {
      systemMnemonic: Mnemonic.entropyToPhrase(randomBytes(16)),
      wallets: Object.fromEntries(roles.map(role => {
        const phrase = Mnemonic.entropyToPhrase(randomBytes(16));
        return [role, { phrase, address: HDNodeWallet.fromPhrase(phrase).address }];
      })),
      databasePassword: randomBytes(24).toString("hex"),
      blockscoutSecret: randomBytes(64).toString("hex"),
      password: randomBytes(24).toString("base64url"),
    });
  }
  const c = read(file);
  if (!c.password) { c.password = randomBytes(24).toString("base64url"); save(file,c); }
  return c;
}
function accounts(c) {
  const system = index => HDNodeWallet.fromPhrase(c.systemMnemonic, undefined, `m/44'/60'/0'/0/${index}`).address;
  return { admin: system(0), treasury: system(4), ...Object.fromEntries(roles.map(role => [role, c.wallets[role].address])) };
}
function walletEntryStatus(app) {
  const file=join(dir,"wallet-entry.json");
  if(!existsSync(file))return "unverified";
  const check=read(file);
  return check.app===app && ["verified","blocked"].includes(check.status)?check.status:"unverified";
}
function walletEntryDetails(app) {
  const file=join(dir,"wallet-entry.json");
  if(!existsSync(file))return {};
  const check=read(file);
  if(check.app!==app)return {};
  return {preferredWallet:["rabby","metamask"].includes(check.preferredWallet)?check.preferredWallet:undefined,
    wallets:Object.fromEntries(Object.entries(check.wallets||{}).filter(([name,status])=>["rabby","metamask"].includes(name)&&["verified","blocked","unverified"].includes(status)))};
}
function selectCapture() {
  const file = process.env.REVENUE_REMOTE_CAPTURE || join(root, ".data/demo-recording/source/station.json");
  if (!existsSync(file)) throw Error("A verified real station capture is required; set REVENUE_REMOTE_CAPTURE.");
  const capture = read(file);
  if (!capture.mapping?.verified || !capture.capturedAt || !capture.history?.length || !capture.mapping?.verificationNote)
    throw Error("Station capture must contain history, a verified mapping, and its verification note.");
  const destination = join(dir, "evidence"); mkdirSync(destination, { recursive: true, mode: 0o700 });
  if (!existsSync(join(destination, "station.json"))) cpSync(file, join(destination, "station.json"));
  const pinned = read(join(destination, "station.json"));
  return { capturedAt: pinned.capturedAt, sourceId: pinned.sourceId, sha256: sha(readFileSync(join(destination, "station.json"))) };
}
export function makeCompose(c, urls) {
  const d = yaml.load(readFileSync(join(root, "infra/revenue-web3/docker-compose.yml"), "utf8"));
  d.name = process.env.REVENUE_REMOTE_PROJECT || "deye-rwa-remote";
  const s = d.services;
  const environment = join(dir, "environment.env");
  s.anvil.env_file = [environment];
  s.anvil.command = s.anvil.command.map(v => v.replaceAll("20260922", String(chainId)));
  s["rpc-gateway"].ports = [`127.0.0.1:${ports.rpc}:8545`];
  s["rpc-gateway"].environment.RPC_ALLOWED_ORIGINS = `${urls.app},${urls.explorer},http://127.0.0.1:${ports.app}`;
  s["rpc-gateway"].volumes = [`${join(root, "infra/revenue-web3/rpc-gateway.mjs")}:/gateway/rpc-gateway.mjs:ro`];
  s.postgres.environment.POSTGRES_PASSWORD = "${REMOTE_DATABASE_PASSWORD:?Missing database password}";
  s.postgres.env_file = [environment];
  s.blockscout.environment.DATABASE_URL = "postgresql://blockscout:${REMOTE_DATABASE_PASSWORD}@postgres:5432/blockscout?ssl=false";
  s.blockscout.environment.SECRET_KEY_BASE = "${REMOTE_BLOCKSCOUT_SECRET:?Missing explorer secret}";
  s.blockscout.environment.CHAIN_ID = String(chainId);
  s.blockscout.environment.NETWORK = "Deye RWA Remote Test";
  s.blockscout.environment.API_RATE_LIMIT_DISABLED = "false";
  // Cloudflare/nginx clients share the upstream IP bucket. Keep a bounded
  // short window so explorer polling cannot exhaust a 15-minute allowance.
  s.blockscout.environment.API_RATE_LIMIT_BY_IP = "60";
  s.blockscout.environment.API_RATE_LIMIT_BY_IP_TIME_INTERVAL = "1s";
  const fe = s["blockscout-frontend"].environment;
  Object.assign(fe, {
    NEXT_PUBLIC_APP_HOST: new URL(urls.explorer).hostname, NEXT_PUBLIC_APP_PORT: "443", NEXT_PUBLIC_APP_PROTOCOL: "https",
    NEXT_PUBLIC_API_HOST: new URL(urls.explorer).hostname, NEXT_PUBLIC_API_PORT: "443", NEXT_PUBLIC_API_PROTOCOL: "https",
    NEXT_PUBLIC_API_WEBSOCKET_PROTOCOL: "wss", NEXT_PUBLIC_NETWORK_ID: String(chainId),
    NEXT_PUBLIC_NETWORK_NAME: "Deye RWA Remote Test", NEXT_PUBLIC_NETWORK_RPC_URL: urls.rpc,
    NEXT_PUBLIC_AD_BANNER_PROVIDER: "none", NEXT_PUBLIC_AD_TEXT_PROVIDER: "none",
  });
  s.explorer.ports = [`127.0.0.1:${ports.explorer}:4000`];
  s.explorer.volumes = [`${join(root, "infra/revenue-web3/explorer-nginx.conf")}:/etc/nginx/conf.d/default.conf:ro`];
  s.app.build.context = root;
  s.app.image = "deye-rwa-remote-app:local";
  s.app.env_file = [environment];
  Object.assign(s.app.environment, {
    REVENUE_CHAIN_ID: String(chainId), REVENUE_PUBLIC_RPC_URL: urls.rpc,
    REVENUE_EXPLORER_URL: urls.explorer, REVENUE_AUTO_SYNC_STATION_ID: "",
    REVENUE_CHAIN_NAME: "Deye RWA Remote Test", REVENUE_DATA_DIR: "/data/revenue-remote",
    REVENUE_PORT: String(ports.app), REVENUE_AUTH_DOMAIN: new URL(urls.app).host,
    REVENUE_ALLOWED_ORIGINS: `${urls.app},http://127.0.0.1:${ports.app}`,
    REVENUE_PUBLIC_READ_ORIGINS: new URL(pages).origin,
    REVENUE_SECURE_COOKIES: d.name.endsWith("-qa") && process.env.REVENUE_REMOTE_QA_LOCAL_LOGIN === "true" ? "false" : "true", REVENUE_INITIAL_REPLAY: "true",
    DEYE_REPLAY_FILE: "/remote-evidence/station.json",
    REVENUE_DEMO_RECORDING: d.name.endsWith("-qa") ? "true" : "false",
    REVENUE_GUIDANCE_ENABLED: "true",
    REVENUE_HOUSEHOLD_PAYMENTS_ENABLED: "true",
    REVENUE_DEMO_TIME_ADVANCE: "true",
    REVENUE_DISTRIBUTION_INTERVAL_MONTHS: "1",
    REVENUE_MONITOR_LIVE: d.name.endsWith("-qa") ? "false" : "true",
  });
  s.app.ports = [`127.0.0.1:${ports.app}:${ports.app}`];
  s.app.volumes = ["revenue-app-data:/data/revenue-remote", `${environment}:/app/.env.revenue:ro`, `${join(dir, "evidence")}:/remote-evidence:ro`];
  for (const service of Object.values(s)) service.logging = { driver: "json-file", options: { "max-size": "10m", "max-file": "3" } };
  return d;
}
function prepare(urls) {
  const c = privateConfig(); const capture = selectCapture();
  const env = [
    `ANVIL_MNEMONIC=${c.systemMnemonic}`, `REVENUE_SYSTEM_MNEMONIC=${c.systemMnemonic}`,
    ...Object.entries(accounts(c)).map(([r,a]) => `REVENUE_${r.toUpperCase()}_ADDRESS=${a}`),
    "REVENUE_WALLET_REQUIRED=true", `REMOTE_DATABASE_PASSWORD=${c.databasePassword}`, `REMOTE_BLOCKSCOUT_SECRET=${c.blockscoutSecret}`,
  ].join("\n") + "\n";
  // Monitoring credentials are server-only, copied from the user's existing local configuration.
  // No private API documentation or credential file is mounted into the publicly served filesystem.
  const monitoring = {};
  if (existsSync(join(root, ".env.revenue"))) {
    const configured = process.env.DEYE_CREDENTIALS_FILE;
    process.loadEnvFile(join(root, ".env.revenue"));
    if (configured) process.env.DEYE_CREDENTIALS_FILE = configured;
    const note = process.env.DEYE_CREDENTIALS_FILE;
    if (note && existsSync(resolve(root, note))) {
      for (const line of readFileSync(resolve(root, note), "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*(user\s+email|email|password|appid|appsecrete?)\s*[:：=]\s*(.*?)\s*$/i);
        if (!match) continue;
        const names = {useremail:"DEYE_EMAIL",email:"DEYE_EMAIL",password:"DEYE_PASSWORD",appid:"DEYE_APP_ID",appsecret:"DEYE_APP_SECRET",appsecrete:"DEYE_APP_SECRET"};
        const key = names[match[1].toLowerCase().replace(/\s+/g, "")];
        if (!process.env[key]) process.env[key] = match[2].replace(/^`(.*)`$/, "$1").replace(/\\([_@])/g, "$1");
      }
    }
    for (const [name,value] of Object.entries(process.env)) if (/^DEYE_/.test(name) && !["DEYE_CREDENTIALS_FILE", "DEYE_REPLAY_FILE"].includes(name)) monitoring[name] = value;
  }
  const safeEnv = Object.entries(monitoring).map(([name,value]) => `${name}=${JSON.stringify(value)}`).join("\n");
  writeFileSync(join(dir, "environment.env"), env + safeEnv + "\n", { mode: 0o600 });
  save(join(dir, "compose.json"), makeCompose(c, urls));
  save(join(dir, "public.json"), { version: 1, ...urls, chainId, pages, walletEntryStatus:walletEntryStatus(urls.app), updatedAt: new Date().toISOString(), accounts: accounts(c), capture });
}
function docker(args, options = {}) {
  return run("docker-compose", ["--env-file", join(dir, "environment.env"), "-f", join(dir, "compose.json"), ...args], options);
}
async function installTunnel() {
  const binary = join(dir, "bin/cloudflared");
  if (existsSync(binary)) return binary;
  if (process.platform !== "darwin" || process.arch !== "arm64") throw Error("This pinned tunnel installer supports this Apple Silicon Mac only.");
  mkdirSync(join(dir, "bin"), { recursive: true });
  console.log(`Downloading official cloudflared ${cloudflaredVersion}; checksum verification is required.`);
  const archive = join(dir, "bin/cloudflared.tgz");
  if (!existsSync(archive) || sha(readFileSync(archive)) !== cloudflaredDigest)
    run("curl", ["--fail", "--location", "--silent", "--show-error", "--retry", "2", "--continue-at", "-", "--connect-timeout", "15", "--max-time", "600", "--output", archive,
      `https://github.com/cloudflare/cloudflared/releases/download/${cloudflaredVersion}/cloudflared-darwin-arm64.tgz`]);
  const bytes = readFileSync(archive);
  if (sha(bytes) !== cloudflaredDigest) throw Error("cloudflared checksum mismatch");
  writeFileSync(join(dir, "bin/cloudflared.tgz"), bytes);
  run("tar", ["-xzf", join(dir, "bin/cloudflared.tgz"), "-C", join(dir, "bin")]);
  chmodSync(binary, 0o700); return binary;
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function ownedProcess(name, record) {
  if(!record?.pid || !alive(record.pid))return false;
  const r=spawnSync("ps",["-p",String(record.pid),"-o","command="],{encoding:"utf8"});
  const command=r.stdout?.trim()||"";
  if((name==="app"&&record.provider==="ngrok")||name==="ngrok")return command.startsWith(join(dir,"bin/ngrok")+" http ")&&command.includes(`http://127.0.0.1:${ports.app}`)&&command.includes(join(dir,"ngrok.yml"));
  return name==="awake" ? /(?:^|\/)caffeinate -i$/.test(command)
    : Object.hasOwn(ports,name) && (command.startsWith(join(dir,"bin/cloudflared")+" tunnel ") || command.startsWith(".data/remote-demo/bin/cloudflared tunnel ")) && command.includes(`--url http://127.0.0.1:${ports[name]}`);
}
async function startTunnel(name, binary, state) {
  const log = join(dir, `tunnel-${name}.log`);
  if (state[name]?.url && state[name]?.provider!=="ngrok" && ownedProcess(name,state[name])) {
    // A surviving connector process does not guarantee the temporary DNS name still exists.
    try { const response=await fetch(state[name].url,{signal:AbortSignal.timeout(8000)}); if(response.status<500)return state[name].url; } catch {}
  }
  const previous=state[name];
  const fd = openSync(log, "w", 0o600);
  const child = spawn(binary, ["tunnel", "--no-autoupdate", "--protocol", "http2", "--url", `http://127.0.0.1:${ports[name]}`], {
    cwd: dir, detached: true, stdio: ["ignore", fd, fd],
  }); child.unref(); closeSync(fd);
  state[name] = { pid: child.pid, provider:"cloudflare" }; save(join(dir, "processes.json"), state);
  for (let i = 0; i < 90; i++) {
    await wait(1000);
    const text = readFileSync(log, "utf8");
    const url = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
    if (url) { state[name].url = url; save(join(dir, "processes.json"), state); if(ownedProcess(name,previous))process.kill(-previous.pid,"SIGTERM"); return url; }
    if (!alive(child.pid)) throw Error(`Tunnel ${name} stopped; see ${log}`);
  }
  throw Error(`Tunnel ${name} timed out; see ${log}`);
}
async function startNgrok(state) {
  if(state.app?.provider==="ngrok"&&ownedProcess("app",state.app))return state.app.url;
  const configuration=join(dir,"ngrok.yml"),binary=join(dir,"bin/ngrok"),archive=join(dir,"bin/ngrok.zip");
  if(!existsSync(configuration))throw Error("Configure the ngrok account locally first: npm run remote:ngrok:configure");
  chmodSync(configuration,0o600);
  if(!existsSync(archive)||sha(readFileSync(archive))!==ngrokDigest){
    run("curl",["--fail","--location","--silent","--show-error","--max-time","180","--output",archive,`https://bin.ngrok.com/a/dy27whJwwmb/ngrok-v3-${ngrokVersion}-darwin-arm64.zip`]);
  }
  if(sha(readFileSync(archive))!==ngrokDigest)throw Error("ngrok archive checksum mismatch");
  if(!existsSync(binary))run("unzip",["-o",archive,"-d",join(dir,"bin")]);
  if(sha(readFileSync(binary))!=="ea3a570604bd161d00ba7358af4ad2d6b0ac4c8421c17fc0106b527deffbc88f")throw Error("ngrok binary checksum mismatch");
  chmodSync(binary,0o700);
  const checked=spawnSync(binary,["config","check","--config",configuration],{encoding:"utf8"});
  if(checked.status!==0)throw Error("ngrok configuration is invalid; configure the token locally again");
  if(ownedProcess("ngrok",state.ngrok))process.kill(-state.ngrok.pid,"SIGTERM");
  await freePort(4049);
  const log=join(dir,"tunnel-ngrok.log"),fd=openSync(log,"w",0o600);
  const child=spawn(binary,["http",`http://127.0.0.1:${ports.app}`,"--config",configuration,"--inspect=false","--log","stdout","--log-format","json"],{cwd:dir,detached:true,stdio:["ignore",fd,fd]});
  child.unref();closeSync(fd);state.ngrok={pid:child.pid,provider:"ngrok"};save(join(dir,"processes.json"),state);
  for(let attempt=0;attempt<60;attempt++){
    await wait(1000);
    if(!alive(child.pid))throw Error("ngrok stopped. Check the local token/account configuration; see the private tunnel-ngrok.log.");
    try{
      const data=await fetch("http://127.0.0.1:4049/api/tunnels",{signal:AbortSignal.timeout(2000)}).then(r=>r.json());
      const tunnel=data.tunnels?.find(t=>t.proto==="https"&&t.config?.addr===`http://127.0.0.1:${ports.app}`);
      if(!tunnel)continue;
      const u=new URL(tunnel.public_url);
      if(u.protocol!=="https:"||![".ngrok-free.app",".ngrok-free.dev",".ngrok.app"].some(s=>u.hostname.endsWith(s)))throw Error("Unexpected ngrok endpoint");
      if(ownedProcess("app",state.app))process.kill(-state.app.pid,"SIGTERM");
      state.app={...state.ngrok,url:u.origin};delete state.ngrok;save(join(dir,"processes.json"),state);return u.origin;
    }catch(e){if(e.message==="Unexpected ngrok endpoint")throw e;}
  }
  throw Error("ngrok did not expose the approved application port in time");
}
async function freePort(port) {
  await new Promise((ok, reject) => { const server = createServer(); server.once("error", () => reject(Error(`Port ${port} is occupied. Stop its owner before starting this isolated stack.`))); server.listen(port,"127.0.0.1",() => server.close(ok)); });
}
export async function health(urls = read(join(dir, "public.json"))) {
  const get = async (url, init) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000), ...init });
    if (!r.ok) throw Error(`${url}: HTTP ${r.status}`); return r;
  };
  const n = await (await get(urls.app + "/api/network")).json();
  if (n.chainId !== chainId || n.rpcUrl !== urls.rpc || n.explorerUrl !== urls.explorer) throw Error("Public wallet configuration mismatch");
  const rpc = await (await get(urls.rpc, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_chainId",params:[]}) })).json();
  if (rpc.result !== "0x" + chainId.toString(16)) throw Error("Public RPC chain mismatch");
  const blocked = await (await get(urls.rpc, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:2,method:"anvil_reset",params:[]})})).json();
  if (blocked.error?.code !== -32601) throw Error("Administrative RPC method was not blocked");
  const overview = await get(urls.app + "/api/public/overview", { headers: { Origin: new URL(pages).origin } });
  if (overview.headers.get("access-control-allow-origin") !== new URL(pages).origin || !(await overview.json()).chainAvailable) throw Error("Public overview or CORS unavailable");
  await get(urls.explorer + "/api/v2/stats"); await get(urls.explorer + "/"); await get(urls.app + "/app/");
  console.log("PASS public HTTP services, network configuration, restricted RPC, CORS and Blockscout (wallet signing checked separately).");
}
async function start() {
  privateConfig(); output("docker", ["version", "--format", "{{.Server.Version}}"]);
  const existing = output("docker", ["ps", "--filter", `label=com.docker.compose.project=${process.env.REVENUE_REMOTE_PROJECT || "deye-rwa-remote"}`, "--format", "{{.ID}}"]);
  if (!existing) for (const port of Object.values(ports)) await freePort(port);
  const binary = await installTunnel();
  const state = existsSync(join(dir, "processes.json")) ? read(join(dir, "processes.json")) : {};
  const urls = {};
  const savedProvider=existsSync(join(dir,"tunnel-provider.json"))?read(join(dir,"tunnel-provider.json")).provider:null;
  const provider=process.env.REVENUE_REMOTE_APP_TUNNEL||savedProvider||"ngrok";
  if(!["ngrok","cloudflare"].includes(provider))throw Error("Unknown application tunnel provider");
  const ngrokSelected=provider==="ngrok";
  for (const name of Object.keys(ports)) urls[name] = name==="app"&&ngrokSelected ? await startNgrok(state) : await startTunnel(name, binary, state);
  save(join(dir, "tunnel-urls.json"), urls);
  if (process.argv.includes("--tunnels-only")) { console.log("Approved tunnels started; application configuration has not been changed."); return; }
  if (!ownedProcess("awake",state.awake)) {
    const p = spawn("caffeinate", ["-i"], { detached: true, stdio: "ignore" }); p.unref(); state.awake = { pid: p.pid }; save(join(dir, "processes.json"), state);
  }
  prepare(urls);
  docker(["up", "-d", "--build", "--wait", "--wait-timeout", "360"]);
  let error;
  for (let attempt = 0; attempt < 18; attempt++) { try { await health(); error = null; break; } catch(e) { error=e; await wait(5000); } }
  if (error) throw error;
  if (!process.argv.includes("--no-publish")) await publish();
  console.log(`Remote services running. Homepage: ${pages}\nApp: ${urls.app}/app/\nExplorer: ${urls.explorer}\nRPC: ${urls.rpc}\nChain ID: ${chainId}\nWallet entry: ${walletEntryStatus(urls.app)}\nIf the RPC URL changed, use the application's Add network button or update your wallet's RPC URL.`);
}
export async function buildPages(pub = read(join(dir, "public.json"))) {
  run("npm", ["run", "build", "--workspace", "onchain"], { env:{...process.env,DEYE_LOCAL_SOLC:"1"} });
  run("npm", ["run", "build:site", "--workspace", "ui"]);
  const out = join(dir, "pages-build"); rmSync(out,{recursive:true,force:true}); mkdirSync(out,{recursive:true});
  cpSync(join(root,"ui/site-dist/contracts"),join(out,"contracts"),{recursive:true});
  run("npm", ["exec", "--workspace", "ui", "--", "vite", "build", "--config", "site/vite.config.ts"], {env:{...process.env,REVENUE_SITE_BASE:"/deye-rwa-demo/",REVENUE_SITE_OUT:out}});
  let html = readFileSync(join(out,"index.html"),"utf8");
  html = html.replace(/<link[^>]*href="\/wallet-login.css"[^>]*>/g, "").replace(/<script[^>]*src="\/wallet-login.js"[^>]*><\/script>/g, "");
  writeFileSync(join(out,"index.html"),html);
  const navigation = read(join(root,"docs/protocol/navigation.json"));
  for(const lang of ["zh","en"]) for(const slug of ["",...navigation]) {
    const target=join(out,"docs",lang,slug);mkdirSync(target,{recursive:true});writeFileSync(join(target,"index.html"),html);
  }
  mkdirSync(join(out,"docs"),{recursive:true});writeFileSync(join(out,"docs/index.html"),html);
  writeFileSync(join(out,".nojekyll"),"");
  writeFileSync(join(out,"remote.json"),JSON.stringify({app:pub.app,explorer:pub.explorer,rpc:pub.rpc,chainId,walletEntryStatus:walletEntryStatus(pub.app),...walletEntryDetails(pub.app),updatedAt:pub.updatedAt})+"\n");
  writeFileSync(join(out,"README.md"),"# Deye RWA demonstration\n\nPublic website build artifacts, public bilingual documentation and MIT contract source package. Reviewed application source is available on the main branch. Credentials, wallet keys, private station evidence and runtime state are excluded. Public operating manuals: [Chinese](manual/manual.zh.pdf) and [English](manual/manual.en.pdf).\n\n"+pages+"\n");
  publishManuals(root, out);
  auditPublic(out);
  return out;
}
async function publish() {
  if (!repo || !process.env.REVENUE_PAGES_URL) throw Error("Set REVENUE_PAGES_REPO and REVENUE_PAGES_URL to your public static repository; never publish the private source repository.");
  await health();
  const out = await buildPages();
  const check=spawnSync("gh",["api",`repos/${repo}`],{encoding:"utf8"});
  if(check.status!==0) {
    if(!check.stderr.includes("404")) throw Error("Cannot check GitHub repository; verify gh authentication.");
    run("gh",["repo","create",repo,"--public","--description","Deye RWA public demonstration website and protocol documentation"]);
  }
  const info=JSON.parse(output("gh",["api",`repos/${repo}`]));
  if(info.private) throw Error("The static deployment repository must be public; visibility is not changed automatically.");
  const gitDir=join(dir,"pages-git");
  if(!existsSync(join(gitDir,".git"))) {
    mkdirSync(gitDir,{recursive:true});run("git",["init","-b","gh-pages",gitDir]);
    run("git",["-C",gitDir,"remote","add","origin",`https://github.com/${repo}.git`]);
    const remote=output("git",["-C",gitDir,"ls-remote","--heads","origin","gh-pages"]);
    if(remote){run("git",["-C",gitDir,"fetch","origin","gh-pages"]);run("git",["-C",gitDir,"reset","--hard","FETCH_HEAD"]);}
    run("git",["-C",gitDir,"config","user.name",output("gh",["api","user","--jq",".login"])]);run("git",["-C",gitDir,"config","user.email",output("gh",["api","user","--jq",".login"])+"@users.noreply.github.com"]);
  }
  for(const f of readdirSync(gitDir))if(f!==".git")rmSync(join(gitDir,f),{recursive:true,force:true});
  cpSync(out,gitDir,{recursive:true});
  run("git",["-C",gitDir,"add","--all"]);
  const diff=spawnSync("git",["-C",gitDir,"diff","--cached","--quiet"]);
  if(diff.status===1)run("git",["-C",gitDir,"commit","-m","Publish remote demo website"]);
  if(diff.status!==0&&diff.status!==1)throw Error("Cannot inspect staged public artifacts");
  // A previous push may have failed after a successful local commit.
  run("git",["-C",gitDir,"-c","credential.helper=!gh auth git-credential","push","-u","origin","gh-pages"]);
  const pagesCheck=spawnSync("gh",["api",`repos/${repo}/pages`],{encoding:"utf8"});
  if(pagesCheck.status!==0){
    if(!pagesCheck.stderr.includes("404"))throw Error("Cannot inspect Pages settings");
    const created=spawnSync("gh",["api",`repos/${repo}/pages`,"--method","POST","--input","-"],{input:JSON.stringify({source:{branch:"gh-pages",path:"/"},build_type:"legacy"}),encoding:"utf8"});
    // Creating the gh-pages branch can enable Pages before this request runs.
    if(created.status!==0 && !created.stderr.includes("409"))throw Error(created.stderr||"Cannot enable Pages");
  }
  const configured=JSON.parse(output("gh",["api",`repos/${repo}/pages`]));
  if(configured.source?.branch!=="gh-pages" || configured.source?.path!=="/" || !configured.https_enforced)throw Error("Unexpected Pages source or HTTPS configuration");
  console.log(`Published static artifacts to ${pages}. GitHub may take a few minutes to finish deployment.`);
}
export function auditPublic(out) {
  const secrets=existsSync(join(dir,"private.json"))?privateConfig():null;
  const forbidden=secrets?[secrets.systemMnemonic,secrets.password,secrets.databasePassword,secrets.blockscoutSecret,...roles.map(r=>secrets.wallets[r].phrase),...roles.map(r=>HDNodeWallet.fromPhrase(secrets.wallets[r].phrase).privateKey)]:[];
  if(existsSync(join(dir,"ngrok.yml"))){const n=yaml.load(readFileSync(join(dir,"ngrok.yml"),"utf8"));if(n.authtoken)forbidden.push(n.authtoken);}
  function walk(folder,prefix="") {
    for(const name of readdirSync(folder)){
      const rel=prefix+name,file=join(folder,name);
      const stat=require("node:fs").lstatSync(file);
      if(stat.isSymbolicLink())throw Error("Symlink in public artifact");
      if(stat.isDirectory()){if(!/^(site-assets|contracts|docs|manual)(\/|$)/.test(rel))throw Error(`Unexpected public directory ${rel}`);walk(file,rel+"/");continue;}
      if(!prefix && !["index.html",".nojekyll","remote.json","base-sepolia.json","README.md"].includes(name))throw Error(`Unexpected public file ${name}`);
      if(/(^|\/)(\.env|private\.json|station\.json|wallets.*\.json|.*\.map)$/.test(rel))throw Error(`Private file in public output: ${rel}`);
      if(rel.startsWith("manual/") && !["manual/index.html","manual/manual.zh.pdf","manual/manual.en.pdf"].includes(rel))throw Error(`Unexpected manual file ${rel}`);
      const bytes=readFileSync(file);if(forbidden.some(v=>bytes.includes(Buffer.from(v))))throw Error(`Secret detected in ${rel}`);
    }
  }
  walk(out);
  const archive=join(out,"contracts/deye-rwa-source.tar.gz");
  const list=output("tar",["-tzf",archive]);
  if(list.split("\n").some(p=>p.startsWith("/")||p.split("/").includes("..")||/\.env|private\.json|materials_from_Deye|station\.json/.test(p)))throw Error("Unsafe source archive member");
  console.log("PASS public artifact allowlist and private-wallet scan.");
}
async function stop() {
  const file=join(dir,"processes.json");
  if(existsSync(file)){for(const [name,p] of Object.entries(read(file)))if(ownedProcess(name,p))try{process.kill(-p.pid,"SIGTERM");}catch{}save(file,{});}
  if(existsSync(join(dir,"compose.json")))docker(["stop"]);
  console.log("Remote services and tunnels stopped. Chain and application volumes retained.");
}
async function main() {
  const command=process.argv[2]||"status";
  if(command==="start")await start();
  else if(command==="configure-existing") {
    const p=read(join(dir,"public.json"));
    prepare({app:p.app,explorer:p.explorer,rpc:p.rpc});
    console.log("Updated the existing remote server configuration; tunnel URLs and wallets were preserved.");
  }
  else if(command==="prepare-local") {
    prepare({app:"https://pending-app.trycloudflare.com",explorer:"https://pending-explorer.trycloudflare.com",rpc:"https://pending-rpc.trycloudflare.com"});
    docker(["up","-d","--build","--wait","--wait-timeout","360"]);
    console.log("Local QA services started on loopback only. No public tunnels were created.");
  }
  else if(command==="publish")await publish();
  else if(command==="stop")await stop();
  else if(command==="status") { if(!existsSync(join(dir,"public.json")))console.log("Remote environment has not been started.");else{const p=read(join(dir,"public.json"));console.log(JSON.stringify({...p,walletEntryStatus:walletEntryStatus(p.app)},null,2));await health();} }
  else if(command==="check") { console.log(output("docker",["version","--format","{{.Server.Version}}"]));console.log(output("docker-compose",["version","--short"]));console.log(output("gh",["api","user","--jq",".login"])); console.log(`Ports ${JSON.stringify(ports)}; chain ${chainId}; pinned cloudflared ${cloudflaredVersion}`); }
  else if(command==="wallets") {
    const c=privateConfig(),file=join(dir,"wallet-import.private.json");
    save(file,Object.fromEntries(roles.map(r=>[r,{address:c.wallets[r].address,privateKey:HDNodeWallet.fromPhrase(c.wallets[r].phrase).privateKey}])));
    console.log(`Local-only wallet import file: ${file}\nOpen it locally; share only each participant's individual TEST key through a private channel. Never upload this file.`);
  } else if(command==="build-pages")await buildPages();
  else throw Error("Commands: check, start, status, stop, publish, wallets, build-pages, prepare-local");
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
