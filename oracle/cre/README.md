# Deye 月度账单 CRE 验证工作流

本目录实现 Oracle 接入方案的取数与计算验证。它包含两种独立模式。回放模式通过本机 HTTP 读取固定版本的月度输入，直接取数模式通过德业鉴权接口访问指定电站的只读数据。两种模式均独立计算业主电费、售电收入、站点费用和归集净额，并通过 CRE 的 EVM 读取能力检查 Base Sepolia 上 Circle USDC 的小数位数。当前工作流没有链上写入或资金操作，也未连接现有账单与资产池合约。

回放模式标记为 `local-shadow`，直接取数模式标记为 `local-direct-simulation`，后者采用 `deye-api-direct` 来源标识。两种报告均保留 `independentSourceVerified: false` 和 `provisional: true`，因为它们仍由本机模拟器执行。用户已明确授权指定电站的只读 API 接入，本机实测也已完成直接取数，但这不等于德业提供了签名月报或 Chainlink DON 已执行工作流。正式接入还需要报告接收身份检查及新版业务合约约束。

## 当前状态与验证

2026 年 11 月 3 日，本机 CRE 登录和注册表查询成功，组织可以看到 Private Registry，但 `cre whoami` 仍返回 `Deploy Access: Not enabled`。CLI 的权限申请命令返回申请已提交并等待审核。本次未部署 DON 工作流或接收合约，没有可交付的正式工作流 ID。

验证使用 CRE CLI 1.39.0、Bun 1.4.4、CRE SDK 1.23.0 和 TypeScript 5.9.3。29 项计算、来源校验与拒绝测试，以及 3 项 CLI 结果解析测试均通过。现有电站中符合条件的历史月份和四个服务期参数位置形成 140 组对照，金额逐项精确一致，一个不满足比较条件的观测月份被明确跳过。直接取数实测读取 2026 年 8 月的全部 31 天记录，日合计与月度汇总一致，金额与原采集记录对应结果一致。历史观测月只是测试输入，没有重新发布收费账单。参数快照用于本机复算，尚未通过新的链上参数登记合约认证。

## 文件与计算规则

| 文件 | 用途 |
| --- | --- |
| `monthly-bill/bill.ts` | 校验月度输入，以精确有理数计算金额并生成摘要。 |
| `monthly-bill/main.ts` | 执行回放模式的 CRE Cron、HTTP 和 Base Sepolia 只读调用。 |
| `monthly-bill/main-direct.ts` | 使用 CRE secrets 和 HTTP 能力直接访问德业鉴权与只读接口。 |
| `monthly-bill/deye-direct.ts` | 校验电站、期间、逐日覆盖、日月一致性及内容修订摘要。 |
| `fixtures/example-month.json` | 与实施方案金额一致的合成示例，不包含真实电站数据。 |
| `scripts/simulate.mjs` | 建立临时回环 HTTP 服务，调用官方模拟器并保存本机报告。 |
| `scripts/replay-parity.ts` | 只读加载获授权的本机状态，对比现有收费实现与独立算术。 |
| `scripts/prepare-direct.ts` | 在受限目录准备指定电站和期间的非公开配置及鉴权资料。 |
| `scripts/direct-simulate.mjs` | 执行直接取数模拟，并与已有采集结果比较。 |
| `scripts/result.mjs` | 读取 CLI 的完整最终结果，避免把被截断的日志当作报告。 |

观测电量采用整数 Wh。电价、成本及汇率使用十进制字符串，计算过程不提前舍入。业主付款、售电付款和请求费用分别换算为六位 USDC 最小单位并按非负数四舍五入。可支付费用不超过两项资金合计，未覆盖费用另行记录。归集比例只应用一次，余数保留，避免汇率取整形成没有资金支持的额外收入。自用光伏量仍是既有模型代理量，计量口径和商业假设继续需要业务审核。

## 本地回放模式

安装项目原有工作区依赖后，在本目录执行以下命令。示例假设 `bun` 和 `cre` 已加入当前终端 PATH；也可以通过 `BUN_BINARY` 和 `CRE_BINARY` 指定本机程序路径。

```sh
bun install --frozen-lockfile --cwd monthly-bill
bun run --cwd monthly-bill typecheck
bun test --cwd monthly-bill
node --test scripts/result.test.mjs
node scripts/simulate.mjs
```

模拟工具仅监听 `127.0.0.1`，采用临时端口，结束后关闭。它不附加 `--broadcast`，报告、配置及日志保存在仓库被忽略的 `.data/oracle-cre/`。从仓库根目录运行以下命令可重新执行真实回放对照。

```sh
ORACLE_REPLAY_STORE=/absolute/local/application/store.json node --import tsx oracle/cre/scripts/replay-parity.ts
```

生成的规范化样本仅供本机使用。通过 `ORACLE_INPUT_FILE` 可以指定该样本再运行模拟工具，不能把这个回放路径描述为独立德业接口。

## 德业直接取数

从仓库根目录执行以下准备命令。它只读加载现有状态，固定一座电站、一个已结束月份和首服务期参数，将配置与鉴权资料写入被 Git 忽略的受限目录。账户原始密码不会写入新配置，德业鉴权所需的 SHA-256 凭证仍按秘密保护。`ORACLE_CRE_DATA_DIR` 应为绝对路径，并在后续命令中保持一致。

```sh
ORACLE_REPLAY_STORE=/absolute/local/application/store.json DEYE_CREDENTIALS_FILE=/absolute/local/deye-credentials.md ORACLE_CRE_DATA_DIR=/absolute/local/oracle-direct node --import tsx oracle/cre/scripts/prepare-direct.ts
```

随后进入本目录运行模拟。凭证通过子进程环境交给 CRE 本机 secrets 映射，不属于 workflow config，不进入公开源码、报告或终端输出。本次没有上传凭证到 CRE secret 服务。

```sh
ORACLE_CRE_DATA_DIR=/absolute/local/oracle-direct node scripts/direct-simulate.mjs
```

工作流只允许固定区域的德业域名。它取得令牌后仅访问 `/station/detail` 和 `/station/history`，不会调用设备控制接口。逐日数据分为两个较短窗口读取，以满足德业的查询范围限制。相同边界记录只保留一次，边界内容冲突、缺测、分页不完整、时区或电站不匹配，以及日月电量不一致都会导致失败。标准化来源摘要绑定逐日电量和月度事实，排除令牌、请求编号、姓名等无关字段。德业未提供独立修订编号时，报告明确采用内容摘要，不将其描述为上游签名版本。

## 正式部署条件

当前目标均用于本机验证，不能作为现有产品收费或估值的授权。组织获得 DON 权限后，仍需建立正式目标及秘密管理配置，绑定工作流身份，并落实报告登记、新账单合约和新资产池的强制检查。现有产品保留原合约及历史，不通过替换部署文件迁移订单或资金。普通 secrets 管理与机密执行是不同能力，是否使用机密 HTTP 应结合德业保密要求和平台实际权限确定。

## English

This directory implements local source and calculation validation for the Oracle plan. The shadow target reads a pinned localhost input. The direct target authenticates with Deye and reads the explicitly selected station and month from its read-only API. Both independently compute household charges, export revenue, costs and assigned cash flow, and read the official Circle USDC contract on Base Sepolia to verify its six-decimal denomination. Neither issues bills, transfers funds or changes the existing vault.

Reports distinguish `local-shadow` from `local-direct-simulation`. The direct target now reads Deye itself under the user's explicit authorization, but execution remains local. All reports remain provisional and retain `independentSourceVerified: false`. This is not a deployed DON attestation or a Deye-signed monthly statement. The parameter snapshot is pinned for comparison and is not yet registered onchain.

The CRE account is authenticated, but the organization still reports `Deploy Access: Not enabled`. An access request was reported as submitted for review. No live workflow or receiver deployment is claimed. The implementation uses CLI 1.39.0, SDK 1.23.0, Bun 1.4.4 and TypeScript 5.9.3. Twenty-nine calculation/source tests and three result-parser tests pass. All 140 eligible replay comparisons match the existing system exactly in micro-USDC; one ineligible observation month is explicitly skipped. The actual direct-source simulation checked all 31 days of August 2026, reconciled daily and monthly aggregates, and matched the previous capture's billing amounts.

Use the commands above with authorized local input files. The direct client permits only regional Deye hosts and station detail/history endpoints after authentication. Bounded requests avoid the API's 31-day inclusive-window restriction. Identical boundary observations are deduplicated, conflicts are rejected, and incomplete or unreconciled data cannot produce a successful report. The normalized content digest includes daily observations and excludes request IDs, tokens and irrelevant personal fields. A content digest is not an upstream revision number or signature.

Real credentials and run outputs remain in ignored, permission-restricted local storage. The password hash is an authentication secret and is protected accordingly. Credentials have not been uploaded to the CRE secret service during this validation. Live deployment still requires DON approval, authenticated report reception, and enforcement through the separately deployed billing and vault contracts. Private Registry is a workflow-management choice, not this project's private demonstration chain or a guarantee of confidential execution.
