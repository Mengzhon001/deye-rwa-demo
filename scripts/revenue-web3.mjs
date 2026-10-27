#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { HDNodeWallet, Mnemonic } from "ethers";

const root = resolve(import.meta.dirname, "..");
const compose = join(root, "infra/revenue-web3/docker-compose.yml");
const envFile = join(root, ".env.web3.local");
const command = process.argv[2] || "help";

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${program} exited with status ${result.status}`);
}

function output(program, args) {
  const result = spawnSync(program, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (result.error || result.status !== 0)
    throw result.error || new Error(result.stderr || `${program} failed`);
  return result.stdout.trim();
}

function derive(mnemonic, index) {
  return HDNodeWallet.fromPhrase(
    mnemonic,
    undefined,
    `m/44'/60'/0'/0/${index}`
  ).address;
}

function ensureEnvironment() {
  if (!existsSync(join(root, ".env.revenue"))) copyFileSync(join(root, ".env.example"), join(root, ".env.revenue"));
  if (existsSync(envFile)) return false;
  const mnemonic = Mnemonic.entropyToPhrase(randomBytes(16));
  const names = [
    "ADMIN",
    "AGENT",
    "TRUSTEE",
    "TRUSTEE2",
    "TREASURY",
    "OWNER",
    "INVESTOR",
    "INVESTOR2",
  ];
  const lines = [
    "# Generated local-only QA configuration. Never commit this file.",
    `LOCAL_DATABASE_PASSWORD=${randomBytes(24).toString("hex")}`,
    `LOCAL_BLOCKSCOUT_SECRET=${randomBytes(64).toString("hex")}`,
    `DEYE_DOCKER_PLATFORM=linux/${process.arch === "arm64" ? "arm64" : "amd64"}`,
    `ANVIL_MNEMONIC=${mnemonic}`,
    `REVENUE_SYSTEM_MNEMONIC=${mnemonic}`,
    ...names.map(
      (name, index) => `REVENUE_${name}_ADDRESS=${derive(mnemonic, index)}`
    ),
    "REVENUE_WALLET_REQUIRED=true",
    "REVENUE_AUTH_DOMAIN=127.0.0.1:4174",
  ];
  writeFileSync(envFile, `${lines.join("\n")}\n`, { mode: 0o600, flag: "wx" });
  process.stdout.write(
    "Created .env.web3.local with isolated QA wallets. The mnemonic was not printed.\n"
  );
  return true;
}

function composeRun(args) {
  ensureEnvironment();
  run("docker-compose", ["-f", compose, "--env-file", envFile, ...args]);
}

async function health() {
  const checks = [
    ["Wallet RPC", "http://127.0.0.1:18545", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
    }],
    ["Blockscout API", "http://127.0.0.1:4000/api/v2/stats"],
    ["Blockscout interface", "http://127.0.0.1:4000/"],
    ["RWA API", "http://127.0.0.1:4174/api/network"],
    ["RWA homepage", "http://127.0.0.1:4174/"],
    ["RWA application", "http://127.0.0.1:4174/app/"],
    ["RWA documentation", "http://127.0.0.1:4174/docs/"],
  ];
  let failed = false;
  for (const [name, url, options] of checks) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(8_000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 120)}`);
      if (name === "Wallet RPC") {
        const chainId = JSON.parse(text).result;
        if (chainId !== "0x135283a")
          throw new Error(`unexpected chain id ${chainId}`);
      }
      process.stdout.write(`OK  ${name}\n`);
    } catch (error) {
      failed = true;
      process.stderr.write(`FAIL ${name}: ${error.message}\n`);
    }
  }
  if (failed) process.exitCode = 1;
}

function checkEnvironment() {
  ensureEnvironment();
  const dockerVersion = output("docker", ["version", "--format", "{{.Server.Version}}"]);
  const composeVersion = output("docker-compose", ["version", "--short"]);
  output("docker-compose", ["-f", compose, "--env-file", envFile, "config", "--quiet"]);
  process.stdout.write(`OK  Docker ${dockerVersion}\n`);
  process.stdout.write(`OK  Docker Compose ${composeVersion}\n`);
  process.stdout.write(`OK  Host architecture ${process.arch}\n`);
  process.stdout.write("OK  Local QA wallet configuration exists and Compose is valid\n");
}

function backup() {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const destination = resolve(
    root,
    process.argv[3] || join(".data", "web3-backups", timestamp)
  );
  mkdirSync(destination, { recursive: true });
  composeRun(["stop"]);
  for (const volume of [
    "anvil-data",
    "blockscout-db",
    "blockscout-redis",
    "revenue-app-data",
  ]) {
    const actual = output("docker", [
      "volume",
      "ls",
      "--filter",
      `label=com.docker.compose.volume=${volume}`,
      "--filter", "label=com.docker.compose.project=deye-rwa-platform",
      "--format",
      "{{.Name}}",
    ]);
    if (!actual) throw new Error(`Docker volume ${volume} was not found`);
    run("docker", [
      "run",
      "--rm",
      "-v",
      `${actual}:/source:ro`,
      "-v",
      `${destination}:/backup`,
      "alpine:3.22.1",
      "tar",
      "czf",
      `/backup/${volume}.tgz`,
      "-C",
      "/source",
      ".",
    ]);
    const archive = join(destination, `${volume}.tgz`);
    if (!existsSync(archive) || statSync(archive).size === 0)
      throw new Error(`Backup archive was not written: ${archive}`);
  }
  writeFileSync(
    join(destination, "manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        chainId: 20260922,
        composeProject: "deye-rwa-platform",
        files: [
          "anvil-data.tgz",
          "blockscout-db.tgz",
          "blockscout-redis.tgz",
          "revenue-app-data.tgz",
        ],
      },
      null,
      2
    )
  );
  composeRun(["start"]);
  process.stdout.write(`Backup written to ${destination}\n`);
}

function restore() {
  const source = process.argv[3] && resolve(root, process.argv[3]);
  if (!source || process.argv[4] !== "--confirm")
    throw new Error("Usage: npm run web3:restore -- <backup-directory> --confirm");
  const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
  if (manifest.chainId !== 20260922)
    throw new Error("Backup belongs to another chain");
  composeRun(["down"]);
  composeRun(["up", "--no-start"]);
  for (const file of manifest.files) {
    const volume = file.replace(/\.tgz$/u, "");
    const actual = output("docker", [
      "volume",
      "ls",
      "--filter",
      `label=com.docker.compose.volume=${volume}`,
      "--filter", "label=com.docker.compose.project=deye-rwa-platform",
      "--format",
      "{{.Name}}",
    ]);
    run("docker", [
      "run",
      "--rm",
      "-v",
      `${actual}:/target`,
      "-v",
      `${source}:/backup:ro`,
      "alpine:3.22.1",
      "sh",
      "-c",
      `find /target -mindepth 1 -delete && tar xzf /backup/${file} -C /target`,
    ]);
  }
  composeRun(["up", "-d"]);
}

function waitUntilHealthy(label) {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 1; attempt <= 45; attempt++) {
    const result = spawnSync(
      process.execPath,
      [join(root, "scripts/revenue-web3.mjs"), "health"],
      { cwd: root, encoding: "utf8", env: process.env }
    );
    if (result.status === 0) {
      process.stdout.write(`${label}: services are healthy\n`);
      return;
    }
    Atomics.wait(sleeper, 0, 0, 2_000);
  }
  throw new Error(`${label}: services did not become healthy within 90 seconds`);
}

function e2e() {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const snapshot = join(".data", "web3-e2e", timestamp);
  run(process.execPath, [
    join(root, "scripts/revenue-web3.mjs"),
    "backup",
    snapshot,
  ]);
  waitUntilHealthy("E2E setup");
  let failed;
  try {
    run("npm", ["run", "test:revenue:web3", "--workspace", "ui"]);
  } catch (error) {
    failed = error;
  } finally {
    run(process.execPath, [
      join(root, "scripts/revenue-web3.mjs"),
      "restore",
      snapshot,
      "--confirm",
    ]);
    waitUntilHealthy("E2E restore");
  }
  if (failed) throw failed;
  process.stdout.write(
    `E2E passed and the previous demo state was restored from ${snapshot}\n`
  );
}

try {
  switch (command) {
    case "init":
      ensureEnvironment();
      break;
    case "check":
      checkEnvironment();
      break;
    case "up":
      output("docker", ["info", "--format", "{{.ServerVersion}}"]).length;
      composeRun(["up", "-d", "--build"]);
      break;
    case "down":
      composeRun(["down"]);
      break;
    case "logs":
      composeRun(["logs", "--tail", "200", "-f"]);
      break;
    case "status":
      composeRun(["ps"]);
      break;
    case "health":
      await health();
      break;
    case "e2e":
      e2e();
      break;
    case "backup":
      backup();
      break;
    case "restore":
      restore();
      break;
    case "clean":
      if (process.argv[3] !== "--confirm")
        throw new Error("Usage: npm run web3:clean -- --confirm");
      composeRun(["down", "--volumes", "--remove-orphans"]);
      break;
    default:
      process.stdout.write(
        "Commands: init, check, up, down, status, logs, health, e2e, backup [dir], restore <dir> --confirm, clean --confirm\n"
      );
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
