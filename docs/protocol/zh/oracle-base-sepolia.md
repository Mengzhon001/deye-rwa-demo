# Local Oracle on Sepolia

## 环境与数据边界

网络菜单中的第三项是独立的自托管 Oracle 测试环境。它与原 Base Sepolia 产品都运行在 Chain ID 84532 上，因此同一钱包的测试 ETH 和 Circle 测试 USDC 余额共享。两套产品使用不同的资产池、账单合约、业务存储和登录会话。切换环境时无需再次切链，但必须对目标环境重新签名登录。私有演示链仍用于完整生命周期演示。

本机 Oracle 服务读取经授权的德业只读 API，逐日核对完整自然月的数据，再按已批准参数计算六位精度的 USDC 金额。它以独立密钥签署 EIP-712 报告，由另一个账户支付 Gas 并提交到 Base Sepolia 报告登记合约。德业尚未对这些观测值提供数字签名，因此页面只称“自托管 Oracle 已核对并签署”。本环境并非 Chainlink 运营的 DON，也不依赖 CRE 部署权限。API、记录或参数检查失败时，服务停止提交，不回退到回放或合成数据。

## 报告、账单与收款

报告绑定链、登记合约、电站、资产池、新版账单合约、业主、观测月、服务期、来源与参数摘要、USDC 金额、版本和有效期。两个不同的受托人须分别批准电站、首个完整观测月和参数摘要。只有产品结算、对应服务期和自然月均结束后，Oracle 才能登记可计费报告。新版账单合约在同一交易中核验并占用该报告，直接读取报告金额生成账单。历史月份的“仅验证”报告不能用于收费。

业主在账单发布后使用本人钱包支付 Circle 测试 USDC。电网售电款仍由独立测试资金账户提供，并明确标为模拟资金。中介在核对两笔资金后确认收入入池，之后才可处理费用、估值和投资者分配。报告签名不证明德业独立认证，也不证明业主或电网已经付款。

## 当前测试结果

截至 2026 年 11 月 9 日，Oracle 已从德业 API 实际读取 2026 年 8 月完整自然月，签名并登记一份明确标为“仅验证”的报告。报告编号为 `0x27a8e1073e45d570c03dcd07c48efe5f655ad23f37b045ef277359c323f7a965`，[登记交易](https://base-sepolia.blockscout.com/tx/0x3df71ae9d301c9a5736316fac0857e9f1507549492f5c39e6a79be41cf51e411) 已确认。新版账单合约拒绝该报告生成账单。可计费报告、业主缴费、中介确认及分配，需要新产品真实结算并到达月末后另行验收，现阶段不得记为通过。

请从[公开首页](https://mengzhon001.github.io/deye-rwa-demo/)选择第三项，再在应用的“Oracle 报告”页面核对观测月、来源摘要、参数摘要、报告签名者和登记交易。当前环境的[电站凭证](https://base-sepolia.blockscout.com/address/0x18a88350eb54FD2A98902509DF110851097c6a9b)、[资产池](https://base-sepolia.blockscout.com/address/0x0479eB8a2bb68D23bAa88de32B27Af63bFCf0C32)、[报告登记合约](https://base-sepolia.blockscout.com/address/0x49a3b54c2972786987B24dC44490332bcb5D41c6)和[新版账单合约](https://base-sepolia.blockscout.com/address/0xFa650D2619452E1763695c780F478bDeA7027D28)可分别在浏览器查询。

## 本机运行

环境负责人在本机受限配置中保管 API 凭证、Oracle 签名密钥和 Gas 账户。`npm run oracle:dry-run` 只取数计算；`npm run oracle:validate-report` 登记仅验证报告；`npm run oracle:billable` 会检查双受托审批、产品结算和真实月度截止日。运行前应先用 `npm run oracle:check` 核对链与余额。以上密钥和原始观测记录均不进入公开源码、网页或手册。
