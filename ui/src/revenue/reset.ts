import { existsSync, readFileSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
const root = resolve(__dirname, "../../..");
const envFile = resolve(root, process.env.REVENUE_ENV_FILE || ".env.revenue");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const dir = resolve(root, process.env.REVENUE_DATA_DIR || ".data/revenue");
if (!existsSync(dir)) {
  console.log("Revenue store does not exist; nothing to reset.");
  process.exit(0);
}
const lock = join(dir, "server.pid");
if (existsSync(lock)) {
  const saved = JSON.parse(readFileSync(lock, "utf8"));
  const pid = typeof saved === "number" ? saved : saved.pid;
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {}
  if (alive)
    throw new Error("Stop the revenue server before resetting its store");
}
const backup =
  dir + ".backup-" + new Date().toISOString().replace(/[:.]/g, "-");
renameSync(dir, backup);
console.log(
  `Archived revenue store at ${backup}. Restart the revenue server to deploy a fresh pool. The local chain and legacy store were not reset.`
);
