import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] = rawValue.replace(/^['"]|['"]$/gu, "");
  }
}

loadEnvFile();

// Opt-in offline compiler for reproducible demo builds; the installed compiler must match exactly.
if (process.env.DEYE_LOCAL_SOLC === "1") {
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }: {solcVersion:string}) => {
    const compiler = require("solc");
    if (!compiler.version().startsWith(`${solcVersion}+`)) throw new Error("Installed solc version does not match configuration");
    return { compilerPath: require.resolve("solc/soljson.js"), isSolcJs: true, version: solcVersion, longVersion: compiler.version() };
  });
}

const forkEnabled = process.env.HARDHAT_FORK === "1";
const forkRpcUrl = process.env.FORK_RPC_URL || process.env.RPC_URL;
const forkBlockNumber = process.env.FORK_BLOCK_NUMBER
  ? Number.parseInt(process.env.FORK_BLOCK_NUMBER, 10)
  : undefined;
const revenueRpcUrl = process.env.REVENUE_RPC_URL || "http://127.0.0.1:18545";
const revenueMnemonic =
  process.env.REVENUE_SYSTEM_MNEMONIC ||
  "test test test test test test test test test test test junk";
const revenueChainId = Number(process.env.REVENUE_CHAIN_ID || 20260922);

if (forkEnabled && !forkRpcUrl) {
  throw new Error("HARDHAT_FORK=1 requires FORK_RPC_URL or RPC_URL");
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      evmVersion: "cancun",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "metadata", "storageLayout"], "": ["ast"] } },
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337,
      forking: forkEnabled
        ? {
            url: forkRpcUrl!,
            blockNumber: Number.isFinite(forkBlockNumber) ? forkBlockNumber : undefined
          }
        : undefined
    },
    revenue: {
      url: revenueRpcUrl,
      chainId: revenueChainId,
      accounts: { mnemonic: revenueMnemonic },
    },
  },
  etherscan: {
    apiKey: {
      revenue: process.env.REVENUE_BLOCKSCOUT_API_KEY || "local-demo",
    },
    customChains: [
      {
        network: "revenue",
        chainId: revenueChainId,
        urls: {
          apiURL:
            process.env.REVENUE_BLOCKSCOUT_API_URL ||
            "http://127.0.0.1:4000/api",
          browserURL:
            process.env.REVENUE_EXPLORER_URL || "http://127.0.0.1:4000",
        },
      },
    ],
  },
  sourcify: { enabled: false },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};

export default config;
