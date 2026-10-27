# 远程测试与录制

## 远程测试工具

`scripts/revenue-remote.mjs` 保留现有的 Mac 远程测试部署工具。它建立独立 Chain ID 为 `20261008` 的场景，使用应用 4178、浏览器 4004 和 RPC 18549 端口。它需要一份已验证的真实电站采集文件，以及 Docker、隧道工具和 GitHub CLI 等额外依赖。

```sh
export REVENUE_REMOTE_CAPTURE="$PWD/.data/private-evidence/station.json"
export REVENUE_PAGES_REPO="YOUR_ACCOUNT/YOUR_PUBLIC_STATIC_REPOSITORY"
export REVENUE_PAGES_URL="https://YOUR_ACCOUNT.github.io/YOUR_PUBLIC_STATIC_REPOSITORY/"
npm run remote:check
npm run remote:start
npm run remote:status
```

源码与静态网站通过分支区分。当前公开仓库的 `main` 分支保存源码，`gh-pages` 分支保存网站构建产物及不含私钥的双语手册。`remote:publish` 只更新 `gh-pages`，不得覆盖 `main`。它要求显式设置 `REVENUE_PAGES_REPO` 和 `REVENUE_PAGES_URL`；维护者应在发布前核对目标仓库与手册内容。

远程工具需要访问公网，并会创建能够转发请求的隧道。域名信誉或钱包拦截可能影响实际连接，不能由服务健康检查保证钱包可以登录。开始共享前，应使用独立测试钱包实际验证签名登录、认购交易及对应的 Blockscout 记录。隧道地址变化后，应更新入口配置与钱包 RPC。

`remote:wallets` 只在本机被忽略的目录生成角色钱包导入文件。需要向同事提供测试账户时，请单独、安全地传递所需的业务账户，不要把系统账户或 API 凭证作为源码附件发送。

## 投资者体验产品

`ui/scripts/provision-experience.ts` 保留建立投资者体验产品的专用工具。它读取远程场景的配置及本地测试钱包，通过角色签名完成申请、入池与发布等步骤。它会发送真实测试链交易，不属于只读检查。

只有远程环境准备完成、钱包导入文件存在，并且明确需要为这套测试环境建立产品时，才运行 `npm run remote:provision`。本次源码交接没有附带现有环境的订单、已发行产品或钱包文件。

## 演示录制工具

录制工具使用独立的应用 4176、浏览器 4002、RPC 18547 和 Chain ID `20260924`。具体说明见[四角色演示录制工具](revenue/demo-recording/README.zh.md)。它依赖真实钱包扩展、Playwright Chromium、FFmpeg、已验证的电站记录及可选的本地语音模型。

这部分工具保留现有实现，主要面向 Apple Silicon Mac。部分媒体脚本使用 Homebrew 的工具路径，Tingting 配音需要 macOS，自然配音需要单独安装 Python 和 MLX 依赖。基础系统构建与估值测试不依赖这些媒体组件。

录像、字幕生成缓存、浏览器用户目录和下载模型均不纳入 Git。不得把钱包初始化、助记词或私钥画面录入正式视频。

## 2026年10月16日更新

新体验产品使用正常部署和验证的 RevenueShareVaultV5，按月分配。投资者可在募集期多次追加，中介须审核最新累计金额。动态引导按实际状态定位操作，受托批准本期估值后才进入分配，存在新可领取金额时交接给投资者。六个月锁定期与季度赎回不变。中英文操作手册保存在 docs/manual，私钥不进入源码仓库。

## 月度 USDC 缴费

新部署默认包含 `HouseholdBilling`。对已有产品启用 `REVENUE_HOUSEHOLD_PAYMENTS_ENABLED=true` 后，服务启动会安装与该产品及角色绑定的缴费合约，不重置产品，也不会向已收款的旧账期补收电费。远程运行工具已开启此配置。运维升级前应备份应用数据、节点状态和浏览器数据库。

中介在「监控与证据」发布月度账单，业主在「资金与月度缴费」核对金额，先授权测试 USDC，再确认缴费。中介单独登记电网售电的模拟到账，核对两笔资金后点击「核对并确认收款入池」。业主的缴费不能由售电模拟款替代。收款后仍需按月计提费用、编制并审批净值，然后宣告分配，最后由投资者领取。网页会显示各自的交易链接。

已有未收款账单可以显式发布为钱包缴费账单。已结清账期保持原记录。钱包拒签、余额不足或交易失败不会把账单标为已支付，重复付款会被合约拦截。
