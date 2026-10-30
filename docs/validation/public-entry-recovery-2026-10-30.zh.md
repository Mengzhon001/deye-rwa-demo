# 公网入口恢复验证

2026 年 10 月 30 日，原统一入口出现域名解析失败。Mac 上的统一网关、私链应用及 Base Sepolia 应用均可通过本机端口访问。原 Cloudflare 连接进程仍然存在，但其日志持续返回 `Unauthorized: Tunnel not found`。因此，进程存活不能证明临时隧道仍能提供公网访问。旧私链 RPC 和浏览器域名也未能解析。

本次重新建立了相同端口范围内的隧道，更新应用来源白名单，并重新加载应用与私链浏览器前端。没有重新启动 Anvil 或数据库，没有清理数据卷，也没有部署新合约。GitHub Pages 的公开配置已经更新，双语在线文档改为通过稳定的 GitHub 首页取得当前业务入口，避免继续依赖已经失效的临时地址。

恢复后的统一应用为 `https://reuters-romance-arranged-bloggers.trycloudflare.com`。Base Sepolia 入口为 `/networks/base-sepolia/app/`，私链入口为 `/networks/private/app/`。私链 RPC 为 `https://mazda-lopez-stevens-pittsburgh.trycloudflare.com`，私链浏览器为 `https://quizzes-faces-simplified-discuss.trycloudflare.com`。这些仍是临时地址，日后可能变化。Base Sepolia 的钱包 RPC 继续使用 `https://sepolia.base.org`，浏览器仍为公共 Base Sepolia Blockscout。

重新检查登录时，另发现工作台在补读隔夜历史事件。原节点每次日志查询最多允许 200 个区块，累计区块较多时，全量历史同步会超过浏览器等待期限。本次为历史日志增加可选的只读 RPC 配置。当前实例使用 `https://base-sepolia.gateway.tenderly.co`，每段最多读取 50000 个区块。启动时核对 Chain ID，读取时核对历史边界的区块哈希，最近十二个区块仍由原节点读取。全部日志页和时间信息读取成功后才提交缓存游标。节点分叉不匹配或读取失败时，不会把部分历史标记为完整记录。钱包交易广播和当前合约读取继续使用原 RPC。

公网状态工具现在实际查询网络描述，不再仅按连接进程是否存在报告正常。隧道命令可在核实进程属于本项目后替换失效连接；新的入口只有通过网络描述检查后才写入公开配置。这是手动运维命令，没有新增定时监控。

恢复后的检查覆盖两条链各六个测试角色的签名登录和工作台读取、错误角色拒绝、会话链隔离、受限 RPC 以及私链 Blockscout。真实 Rabby 0.94.11 在隐藏浏览器中成功进入 Base Sepolia 工作台并完成三步认购引导查看，没有提交认购。恢复前后，两套部署的合约地址和部署交易完全一致，历史缓存中的既有事件全部保留。八项 RPC 与事件读取检查、两项公网健康及网关检查和 TypeScript 检查通过。

本次没有提交业务交易、推进财务时间或再次执行完整生命周期。中英文 PDF 手册仍为 10 月 29 日版本，其中的临时地址应以 GitHub 首页当前配置为准。原始验证结果和截图保存在本机 `.data/unified-app/validation/recovery-2026-10-30/` 及相邻验证目录中，不包含公开发布的私钥。
