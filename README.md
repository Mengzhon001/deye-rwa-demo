> **Unified application / 统一业务入口**
>
> Open the current application through https://mengzhon001.github.io/deye-rwa-demo/ and Launch App. Temporary application addresses can change. Use the network button in the upper-right corner to select Private demo (20261008) or Base Sepolia (84532). Confirm the wallet network and sign in again. Products, tokens and business records remain separate.
>
> 两条链现在共用一个业务网站。请使用右上角网络按钮切换，核对钱包网络后重新登录。切换不会跨链转移资金。操作与维护说明见 `infra/multinetwork/README.md`。

# Deye RWA 收益权平台

本仓库公开提供光伏收益权演示系统的源码与操作手册，包含光伏电站收益权平台的智能合约、估值模型、服务端、双语网站、钱包业务应用和部署工具。本次于 2026 年 10 月 29 日更新，包含截至目前的最新业务实现，包括业主月度 USDC 缴费、独立售电回款、中介确认入池及按月分配。仓库不包含原工作目录的 Git 历史和运行数据。

平台将电站收益权凭证托管到资产池，并在认购结算成功后发行投资者份额。设备仍归业主所有。新协议的现金流来自业主按约定折扣支付的光伏用电费与上网售电收入，并归集全部约定净收益。产品没有固定票息，也不保证返还原始本金。

## 在线入口与操作手册

- [公开首页及双语文档](https://mengzhon001.github.io/deye-rwa-demo/)提供当前测试环境入口。业务应用、RPC 和 Blockscout 运行在演示负责人的 Mac 上，GitHub Pages 只托管静态内容。
- [中文操作手册（PDF）](https://mengzhon001.github.io/deye-rwa-demo/manual/manual.zh.pdf)及[English operating manual (PDF)](https://mengzhon001.github.io/deye-rwa-demo/manual/manual.en.pdf)包含角色交接、钱包操作、截图和月度缴费流程。两份公开手册均不含私钥。
- 源码位于 `main` 分支，静态网站位于 `gh-pages` 分支。手册 PDF、LaTeX 源文件及配图也保存在 [docs/manual/](docs/manual/)。

## 开始运行

建议使用 Node.js 22.19 或更高的 22.x 版本、npm，以及已经启动的 Docker Desktop 或 Colima。当前完整部署主要在 Apple Silicon Mac 上使用，其他环境的限制见[安装说明](docs/SETUP.zh.md)。

```sh
npm ci
DEYE_LOCAL_SOLC=1 npm run build
npm run web3:init
npm run web3:wallets
npm run web3:up
npm run web3:health
```

启动后访问以下入口。

| 入口 | 本机地址 |
| --- | --- |
| 品牌首页 | http://127.0.0.1:4174/ |
| 角色选择与业务应用 | http://127.0.0.1:4174/app/ |
| 中英文产品文档 | http://127.0.0.1:4174/docs/ |
| Blockscout 区块链浏览器 | http://127.0.0.1:4000/ |
| 钱包 RPC | http://127.0.0.1:18545 |

网络 Chain ID 为 `20260922`。初始化会生成这份源码自己的本地测试钱包，并保存到被 Git 忽略的文件中。它们与既有演示环境的钱包不同。导入方式、数据源设置和第一轮业务操作见[安装说明](docs/SETUP.zh.md)。

本仓库不附带真实电站记录、API 凭证或预先发行的产品。首次运行从空白业务场景开始。中介可明确选择合成样本，也可在取得授权后配置实时接口或导入已验证的记录回放。真实数据缺失时，系统不会静默改用合成数据。

## 源码结构

| 目录 | 主要内容 |
| --- | --- |
| `onchain/` | 收益权合约、旧版合约、Hardhat 编译、部署与测试 |
| `offchain/src/revenue/` | Deye 数据适配、电量预测、账单、折现估值与现金流模型 |
| `ui/src/revenue/` | 钱包身份、角色权限、业务流程、交易意图、回执核对与持久化 |
| `ui/public/revenue/` | 四角色业务应用与逐期现金流时间轴 |
| `ui/site/` | Vite、TypeScript 和 Three.js 首页及双语文档站 |
| `docs/protocol/` | 网站使用的公开中英文产品说明 |
| `infra/revenue-web3/` | Anvil、RPC 网关、Blockscout、数据库和应用的 Compose 配置 |
| `scripts/` | 本地运行、备份恢复、可选远程测试及源码交接检查 |
| `ui/scripts/recording/` | 可选的浏览器彩排、演示录制和配音工具 |

## 开发与文档

- [安装、钱包与数据源配置](docs/SETUP.zh.md)说明如何从零运行。
- [系统组成与业务流程](docs/ARCHITECTURE.zh.md)说明模块关系及四角色交接。
- [开发与测试](docs/DEVELOPMENT.zh.md)说明修改入口、回归命令和贡献方式。
- [远程测试与录制](docs/OPERATIONS.zh.md)说明可选工具及额外依赖。
- [源码交接范围](docs/HANDOFF.zh.md)说明本次纳入和排除的内容。
- [本次验证记录](docs/VALIDATION.zh.md)记录本仓库实际执行的检查和适用范围。

当前新产品使用 `RevenueShareVaultV5`，并通过 `HouseholdBilling` 处理月度钱包缴费。旧合约与旧版应用保留在源码中，以便兼容和回归。源码中使用的 MIT 合约及第三方代码保留其许可声明，见[许可说明](NOTICE.md)。公开源码不改变各文件及依赖已有的许可范围，整个系统的使用与再分发须遵守相应许可。

## 2026-10-16 release

New V5 demo products distribute monthly. The four-role task guide locates actual controls and supplies specific remediation and handoffs. Investors can add subscriptions repeatedly during fundraising, with review bound to the latest cumulative amount. Monthly payouts do not change quarterly redemption windows or the six-month lock.

The bilingual operating manual generator is in `scripts/manual/`. Reviewed manuals and illustrations are under `docs/manual/`. Test keys, API credentials and raw station evidence are excluded.

## 2026 年 10 月 22 日更新

月度运营现已区分账单、业主实际缴费、电网售电回款和中介核对入池。中介发布账单后，业主使用自己的钱包授权并支付测试 USDC。只有电网售电部分由独立系统账户模拟。中介核对两笔资金后签署确认交易，净回款才进入资产池。费用、净值审批和月度分配继续按既有权限执行。

公网测试环境已启用这套流程，既有产品、角色地址、认购和历史回款均保留。已完成的旧账期不会重复收费。更新后的中英文操作手册及截图位于 `docs/manual/`，仓库中的手册不包含测试私钥。

## Base Sepolia 独立公链测试

首页与业务应用共用网络选择入口，原公网私链的产品和业务记录保留。公链版本使用 Chain ID `84532` 和 Circle 官方测试 USDC，沿用现有角色地址，采用独立合约及业务存储。它不支持增发、重置和时间推进，适合检查公共链交易，不用于压缩完整生命周期。

部署命令、恢复机制及本机输入说明见 [Base Sepolia 部署说明](infra/base-sepolia/README.md)。双语产品文档见 [中文说明](docs/protocol/zh/base-sepolia.md) 和 [English instructions](docs/protocol/en/base-sepolia.md)。中英文 PDF 手册均增加了独立环境、钱包网络、资金准备、交易核对和真实时间限制的说明。

The independent Base Sepolia environment uses official Circle test USDC and separate contracts and storage behind a shared HTTPS application. The existing demonstration retains its business state. See the deployment guide and bilingual manuals for public-chain test boundaries and recovery instructions.
