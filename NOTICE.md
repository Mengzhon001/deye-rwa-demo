# 许可与第三方组件

本仓库经项目负责人授权公开，用于展示、评审和测试光伏收益权平台的实现。此次公开不为整个系统新增统一的开源许可。使用、修改或再分发时，应核对相应文件和依赖已有的许可；未明确授予的权利仍需取得权利人的授权。

自有 Solidity 文件保留其原始 SPDX 声明。网站合约下载模板中的 MIT 许可位于 `ui/source-package/LICENSE`，仅适用于对应的合约源码包。OpenZeppelin 的许可副本位于 `ui/source-package/OpenZeppelin-LICENSE.txt`。其他依赖的许可随各自 npm 包或上游发行版提供。

Docker Compose 引用 Anvil、Blockscout、PostgreSQL、Redis、Nginx 和 Node.js 的镜像。它们不被重新打包为本项目的自有代码。录制工具使用的钱包扩展、媒体工具和语音模型需要另行获取，并遵守相应许可。

这些合约及系统尚未经过独立安全审计，当前交接对应演示和测试用途。
