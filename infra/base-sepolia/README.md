# Independent Base Sepolia deployment

## 源码范围与查找方式 / Source layout

Base Sepolia 的系统代码已包含在仓库的 `main` 分支。它与私有链版本共用业务实现，不是另一份独立前后端工程。部署脚本将 Chain ID 设置为 `84532`，指定 Circle 测试 USDC，并为公链建立独立存储。`npm run web3:up` 是本地私链入口；本页的 `base:*` 命令才是独立 Base Sepolia 部署入口。

| 文件或目录 / Path | 职责 / Responsibility |
| --- | --- |
| [`../../scripts/revenue-base-sepolia.mjs`](../../scripts/revenue-base-sepolia.mjs) | 初始化、检查、构建、启动、隧道及停止 / Profile lifecycle |
| [`../../ui/scripts/base-deploy.ts`](../../ui/scripts/base-deploy.ts) | 显式部署与验证入口 / Explicit deployment and verification |
| [`../../onchain/scripts/deploy-revenue.ts`](../../onchain/scripts/deploy-revenue.ts) | 合约构造参数、部署交易持久化及恢复 / Contract deployment and recovery |
| [`../../onchain/scripts/revenue-network.ts`](../../onchain/scripts/revenue-network.ts) | Chain ID、外部 USDC 校验及禁止公链时间推进等限制 / Network policy |
| [`../../onchain/contracts/core/DeyeRWA.sol`](../../onchain/contracts/core/DeyeRWA.sol) | 电站收益权凭证 / Revenue-rights certificate |
| [`../../onchain/contracts/revenue/`](../../onchain/contracts/revenue/) | V5 资产池、月度缴费及其继承合约 / Vault, billing and base contracts |
| [`../../ui/src/revenue/`](../../ui/src/revenue/) | 共用鉴权、业务状态、RPC、事件缓存与交易恢复 / Shared backend |
| [`../../ui/public/revenue/`](../../ui/public/revenue/) | 共用角色页面、钱包登录、引导与渐进加载 / Shared browser application |
| [`../multinetwork/`](../multinetwork/) | 私有链和 Base Sepolia 的统一入口 / Shared network gateway |
| [`../../scripts/test-base-sepolia.mjs`](../../scripts/test-base-sepolia.mjs) | 需要显式启用和专用资金的公链测试 / Opt-in public-chain integration test |
| [`../../docs/manual/base-sepolia.public.json`](../../docs/manual/base-sepolia.public.json) | 公开的既有合约地址、角色地址和部署交易 / Public deployment metadata |

This is one application with two network profiles. The source files above are included in `main`; `gh-pages` contains the published static site. No separate Sepolia copy of the backend or frontend is required. The profile generates its Compose file under the operator's ignored data directory. That generated configuration, the role wallet file, recorded evidence and live database are deployment inputs, not missing source code. A new deployment creates its own contracts and business state; the public address list alone does not reconstruct the existing hosted service.

源码审查和离线网络策略回归不需要接触既有公网业务。安装依赖后可运行以下命令，它们不会广播公链交易。公共 RPC 测试使用本机模拟服务。

```sh
npm run base:test:unit
```

## Deployment

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

## Historical event reads

The optional `REVENUE_HISTORY_RPC_URL` selects a separate read-only RPC for historical logs. Set `REVENUE_HISTORY_BLOCK_RANGE` to a range that endpoint supports, between 1 and 50000. Without this configuration, the existing primary RPC and 200-block pages remain in use. Startup checks the history endpoint's Chain ID. The collector checks its historical boundary hash against the primary endpoint, reads the latest twelve blocks through the primary RPC, and commits its cursor only after every page and timestamp succeeds. A mismatch or failed page does not become a successful partial history.

The current test backend uses `https://base-sepolia.gateway.tenderly.co` with 50000-block history pages. Wallet RPC and current contract reads continue to use `https://sepolia.base.org`. This is another public RPC, not a dedicated service, an oracle, or an independent audit. No keys, API credentials or station evidence are sent to the history endpoint.
