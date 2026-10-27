# 开发与测试

## 修改与协作

请从 `main` 建立独立的功能分支，并通过 Pull Request 说明具体问题、修改后的行为和已运行的验证。不要在共享远程测试环境上直接运行重置、全流程测试或时间推进。测试应使用临时数据目录和隔离链。

根目录 `package-lock.json` 管理工作区依赖。新增或升级依赖时从根目录更新并提交该文件。`ui/source-package/package-lock.json` 则属于网站可下载合约包的独立模板，不是工作区安装入口。

## 本机回归

以下检查不需要真实 API 凭证，也不连接共享远程链。

```sh
DEYE_LOCAL_SOLC=1 npm run build
npm run typecheck:offchain
npm run typecheck:ui
npm run typecheck:site --workspace ui
DEYE_LOCAL_SOLC=1 npm run test:onchain
DEYE_LOCAL_SOLC=1 npm run test:revenue
npm run test:demo --workspace offchain
DEYE_LOCAL_SOLC=1 npm run test:ui
npm run test:revenue:workflow --workspace ui
npm run test:revenue:dashboard --workspace ui
npm run test:revenue:billing-ui --workspace ui
npm run test:revenue:timeline --workspace ui
npm run test:revenue:public --workspace ui
npm run test:revenue:catalog
npm run web3:test:rpc
npm run remote:test:config
npm run test:handoff
```

`DEYE_LOCAL_SOLC=1` 使 Hardhat 使用已安装的匹配版本 solc，避免另外下载 Solidity 编译器。构建顺序是合约、模型、应用。网站构建会读取当前编译产物，生成双语文档、现金流示例以及公开合约源码下载包；因此不能先跳过合约编译而单独构建网站。

前端页面测试可以另外运行 `npm run test:site --workspace ui`。首次使用 Playwright 时应安装匹配的 Chromium。钱包扩展自动化、Blockscout 索引和完整 Docker 交易回归属于另一层测试，不能由单元测试通过来替代。

## 调试运行

不使用 Docker 时，可在一个终端运行 `npm run chain:local`，并在另一个终端运行 `npm run dev:revenue:local`。这使用 Hardhat 开发节点，默认并不启动 Blockscout，也不等同于完整钱包演示环境。需要统一钱包、持久链和浏览器时，应使用 `web3:*` 命令。

旧版场景使用 `npm run dev:ui:local`，并保留原有合约和 Merkle 定义。不要用旧版固定收益或 NAV 份额逻辑替换当前收益权产品。

## 完整业务验证

已有 Docker 环境运行健康后，`npm run web3:e2e` 会先备份场景，再运行钱包签名与交易流程，最后恢复备份。它会停止服务、发送交易和推进财务时间，所以只能在自己管理的本地测试实例执行。它通过自动化测试钱包签名，不构成实际钱包扩展界面的验收。

实际扩展彩排工具位于 `ui/scripts/recording/`。它需要另行准备验证过的电站记录、匹配的浏览器与钱包扩展，并使用独立的数据卷和端口。具体步骤见[远程测试与录制](OPERATIONS.zh.md)。

## 修改数据与交易流程

修改估值时，应同时检查单位、季节性、业主电费、售电收入、费用、应收款和折现时点，确保同一金额只计入一次。修改链上流程时，应同时检查角色权限、交易意图持久化、回执与事件匹配，以及刷新后的恢复行为。

每次需要人工钱包签名的操作都应由对应角色执行。不得为了方便测试，在公开业务接口增加绕过鉴权、代办业务角色交易或直接修改链状态的入口。测试账户、采集记录和截图保存在被 Git 忽略的 `.data/` 中。

## 月度缴费回归

运行 `npm run test:revenue:household --workspace ui` 检查金额拆分及取整，再在 `onchain/` 运行 `DEYE_LOCAL_SOLC=1 npx hardhat test test/household-billing.spec.ts` 检查链上权限、付款和重复请求。

`npm run test:household-payments` 使用独立端口 4196 和 18559、Chain ID 20261021，以及 `.data/household-payment-qa/` 下的新测试钱包。它不会重置共享演示。执行前须安装 Anvil 与 Playwright Chromium，并通过 `DEYE_HOUSEHOLD_QA_REPLAY_FILE` 指定本机有权使用的已验证电站回放文件。可以通过 `ANVIL_BINARY` 指定节点程序，通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定浏览器程序。真实电站记录和密钥不随源码分发。

浏览器场景覆盖连续两个月的账单、业主缴费、单独售电回款、确认入池、费用、估值审批和分配领取，还检查拒签、余额不足、重复付款及后台重启恢复。此场景使用专用测试钱包签名真实交易，不等于重新完成实际 Rabby 扩展验收。
