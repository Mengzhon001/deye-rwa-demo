# Independent Base Sepolia deployment

This profile runs only the RWA application on port 4194. It does not start, restart or reconfigure the original public demo, its node, Blockscout or tunnels. Its Compose project and image are `deye-base-sepolia-test` and `deye-rwa-base-sepolia-app:local`.

Use Node 22+, Docker with Compose, the repository lockfile and the official Circle Base Sepolia USDC contract. Keys and recorded station evidence are local inputs. The six role addresses can be reused without sharing application state or chain balances.

```sh
npm ci
export BASE_SEPOLIA_DATA_DIR="$PWD/.data/base-sepolia-test"
export BASE_EXISTING_ROLES_FILE="/absolute/local/ignored/role-configuration.private.json"
export BASE_REPLAY_FILE="/absolute/local/ignored/station.json"
npm run base:init
DEYE_LOCAL_SOLC=1 npm run build
npm run base:check
npm run base:deploy
npm run base:build
npm run base:start
export BASE_CLOUDFLARED="/absolute/path/to/cloudflared"
npm run base:tunnel
npm run base:status
```

The role file contains a `systemMnemonic` and a `wallets` object with `owner`, `agent`, `investor`, `investor2`, `trustee` and `trustee2` public addresses. Only the system mnemonic and public role addresses are read into the backend environment. Business-role phrases are not copied to the backend. The optional public integration tests read business-role phrases from the same ignored file on the operator's machine. Do not distribute that file with source code.

Deployment validates Chain ID 84532 and the official Circle address and decimals. It journals signed deployment transactions before broadcasting and reuses those transactions after interruption. A running app never auto-deploys a missing product. Back up the deployment intent journal, application directory and environment securely. Do not delete an intent file to solve a pending transaction.

`base:verify` checks Blockscout source verification. `node scripts/verify-base-sourcify.mjs` provides an independent source-verification route when the explorer submission service is rate-limited. The external Circle token is not claimed as project-deployed code. `base:stop` stops only this application's container and tunnel; it cannot stop or reset Base Sepolia.

The initial product is a draft. The owner, intermediary and trustee follow the normal reviewed-evidence workflow to publish it. `base:test:public` is an explicit opt-in integration test using dedicated funded role wallets. Set `BASE_TEST_SUBSCRIPTIONS=true` to make small real test-USDC subscriptions, additions and refunds. It is restricted to Chain ID 84532. Do not run it with personal investment accounts.

There is no time advance, reset, application token mint, or browser-triggered contract deployment. Circle faucets supply test USDC. A simulated export receipt must spend prefunded treasury tokens. Monthly billing and distribution require real service-period cutoffs, and transfers and redemptions retain their existing locks and notice periods. Full accelerated lifecycle testing remains on the original demo.

The anonymous Base RPC has request-rate and log-window limits. Application reads use the official Multicall3 deployment through eth_call, are bounded and throttled, and event pages contain at most 200 blocks. A transaction hash is stored before backend registration. If the backend RPC has not seen a wallet transaction yet, retry its registration with the same hash. Never send a second payment to remedy a delayed read.

Quick Tunnel hostnames can change after restart. After `base:tunnel`, copy only the reviewed `app`, `explorer`, `rpc`, `chainId` and public deployment fields to the website's separate `base-sepolia.json`. Do not replace the original `remote.json`, which points to the preserved private-chain demonstration. Homepage and manual publishing is independent from updating the original backend.

To stage the reviewed GitHub Pages output, first build with `REVENUE_SITE_BASE=/deye-rwa-demo/ npm run build:site --workspace ui`, then set `BASE_EXISTING_PAGES_CONFIG` to a local copy of the current public remote.json and run `node scripts/stage-base-pages.mjs`. This preserves the original demo entry, writes the independent Base configuration, creates documentation deep links and copies only the reviewed PDFs. `scripts/test-base-pages.mjs` checks the build under the Pages origin, and `scripts/test-base-github-live.mjs` checks the published entry and manual hashes. These commands do not update the original backend.

A completed public test reuses its saved records by default. Set a fresh `BASE_TEST_RUN_ID` to execute another small subscription/refund run. Keep every previous operation journal so a restart cannot accidentally repeat an already broadcast payment.

The preferred user entry is now the shared network-selection application described in `../multinetwork/README.md`. The dedicated Base service and its original HTTPS address remain available for backend diagnostics. The public Pages `networks.json` controls the shared user entry; keep it separate from both backend deployment manifests.
