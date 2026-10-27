# 智能合约与公开源码

当前收益权场景由电站凭证、收益权资产池、月度账单合约和测试支付代币组成。自有合约以 MIT 许可提供源码。依赖保留各自许可，完整包附带 OpenZeppelin 许可。当前版本未经独立安全审计。

## 合约职责

| 合约 | 职责与主要接口 |
| --- | --- |
| DeyeRWA | 电站 NFT 与设施元数据摘要。中介调用 mintFacility，业主调用 approve 完成托管授权。 |
| RevenueShareVaultV5 | 托管收益权，管理估值、资格、募集、份额、分配与退出。 |
| HouseholdBilling | 按期发布不可重复缴费的账单，指定业主调用 payBill，独立系统账户调用 fundExport，中介调用 confirmReceipt 核对净额入池。 |
| MockUSDC | 六位小数的演示支付币，只有授权系统角色可以铸造。它不是 Circle USDC。 |
| Calendar | 为日历月期限、费用与季度窗口提供月度计算。 |

主要业务接口包括 admit、proposeValuation、approveValuation、publish、subscribe、reviewSubscription、withdrawSubscription、settle、receiveRevenue、distribute、claim、peerTransfer、requestRedemption、processRedemptions、openCase、supportCase、approveCase 和 closeProduct。完整参数和事件请查看下方 ABI。

## 状态与权限

生命周期依次为 Draft、Fundraising、Active，并可能进入 Failed 或 Closed。发布募集不铸造投资者份额，成功结算才铸造份额。MANAGER 负责管理方法，TRUSTEE 独立批准估值和案件，TREASURY 向资产池提供回款，新账单由获授权的 HouseholdBilling 合约在中介确认后转入净额；独立系统账户只模拟电网售电部分。合约也检查资格、订单审核、锁定期、净值有效性及重复事件。

电站 NFT 不是设备所有权转让文件。合约只校验已提交摘要及流程权限，不能自主证明线下合同有效或 API 数据真实。协议文档和证据仍需线下治理。

## 源码与部署对应关系

下方按当前场景读取地址，核对本次源码构建的运行时代码和不可变量。匹配结果不等于安全审计。Blockscout 的源码验证状态应在其合约页面核对；未索引或未验证时不能宣称已验证。

下载包包含 Solidity 文件、必要依赖源码及许可、ABI、标准编译输入、固定版本依赖锁、完整收益权合约测试和部署模板。不含项目凭据、钱包密钥或电站原始证据。

```sh
# 解压下载包后，在其目录运行
npm ci
npm run compile
npm test
npm run reproduce
```

reproduce 会检查标准编译输入生成的运行时代码及 ABI 是否与发布清单一致。部署模板需要自行提供系统签名账户和角色地址，不能直接拿真实资产测试。源码包不自动对现有演示场景重新部署。

<div id="contract-runtime">正在读取源码与部署清单…</div>

当前 RevenueShareVaultV4 允许募集期间多次追加认购，每次追加都会更新累计金额和审核序号并使原审批失效。中介须重新审核最新累计金额，退款则退回全部累计托管款。此前的 RevenueShareVaultV3 不支持追加，RevenueShareVault 使用原冷静期规则。旧部署及交易记录保留，网站升级不会改写旧合约。


本地和公网新建演示产品使用 V5，按日历月宣告分配，季度赎回窗口保持独立。V4 的原部署按季度分配。页面从当前合约读取周期，不通过文字替换改变链上规则。当前本地 Anvil 为保留持仓做过维护代码更新，该操作不是代理升级交易。原创建交易和旧源码验证保留在 Blockscout，代码已变化的标记不等于新源码经过创建交易验证。部署资料中的当前运行代码匹配检查可用于核对 V5 源码。新建 V5 产品按正常部署验证。
