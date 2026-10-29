# Unified test application

The gateway serves one frontend and forwards fixed network paths to the two existing application services. It does not sign transactions, hold keys, deploy contracts, reset products or provide an RPC proxy.

| Network | Application path | Chain ID | Backend |
|---|---|---:|---|
| Private demonstration | `/networks/private/app/` | 20261008 | Existing service on 4178 |
| Base Sepolia | `/networks/base-sepolia/app/` | 84532 | Existing service on 4194 |

`/app/` redirects to the private demonstration. A network button is available in the header and the role-first login dialog. Switching checks the destination configuration, requests the wallet network change, logs out the source session and navigates to the destination. The user signs in again. Rejecting the wallet request or failing the health check leaves the original application context in place. Unresolved wallet operations block switching and remain recoverable on their own chain.

Each backend retains its original data directory, session key and contracts. The gateway forwards the actual browser Origin without rewriting signed login messages. Both backend origin allowlists explicitly include the shared HTTPS origin. Cookies use distinct backend names and network-specific paths. The proxy forwards only the selected backend's cookie. Every authenticated or mutating API call requires an explicit network path. Browser selections, draft applications and pending transactions are scoped by Chain ID; language and wallet-extension preferences are shared.

The public gateway listens only on `127.0.0.1:4196`. A Quick Tunnel forwards to that port. Its configuration lives in an ignored local directory, separate from both business stores. Only the reviewed public configuration is staged for GitHub Pages. The public explorer and RPC remain those of the selected chain. Switching does not bridge tokens, transfer eligibility or create a product on another chain.

## Running the existing deployment

Set `REVENUE_UNIFIED_DATA_DIR` to the existing ignored gateway directory. Start the private and Base application backends first. Then run `npm run unified:start`. `npm run unified:status` reports the current gateway and tunnel. `npm run unified:stop` stops only the gateway and its own tunnel; it preserves both backend environments and their chain state.

For a new installation, set `REVENUE_UNIFIED_REMOTE_DIR` and `BASE_SEPOLIA_DATA_DIR` to the existing backend configuration directories, then run `npm run unified:init`. This creates the gateway configuration without changing products. The start and tunnel commands extend the two backend origin allowlists and recreate only the application containers with their existing data mounts. Compose environment interpolation uses each backend's existing private environment file. Node, Docker Compose and the two backend images must already be available.

Set `BASE_CLOUDFLARED` to the local cloudflared executable and run `npm run unified:tunnel` to create the shared HTTPS entry. It records the new origin and updates both application allowlists. If its hostname changes, verify real-wallet access before publishing the new `public.json` as GitHub Pages `networks.json`. Restarting a tunnel does not redeploy either chain. Do not use a chain reset to recover an application outage.

## Validation

`npm run unified:test` checks proxy routing, exact transaction-body forwarding, cookie isolation, public-only CORS, host restrictions and rejection of unscoped mutations. `scripts/test-unified-api.mjs` checks all six configured accounts on both chains. `scripts/test-unified-ui.mjs` covers a declined network request, pending operations, unavailable destination, bilingual labels and mobile layout. `scripts/test-unified-rabby.mjs` uses an isolated real Rabby profile in a hidden browser to switch both ways and perform a Base Sepolia subscription and refund. Local test secrets are read from ignored files and never enter the frontend, screenshots, public artifacts or logs.

## 中文使用说明

同事现在可以通过同一个网站测试两条链。进入业务页面后，点击右上角的当前网络按钮，选择私有演示链或 Base Sepolia，在 Rabby 核对网络并重新签名登录。登录窗口也可以切换网络。两边的业主、中介和受托人地址相同，但产品、余额、资格和业务进度分别保存。

私有演示链用于加速演示完整生命周期，支付代币是 mUSDC。Base Sepolia 用于公共链测试，支付代币是 Circle 测试 USDC，Gas 使用本链测试 ETH，不能通过应用推进时间。切换网站网络不会把另一条链的余额带过来。每个实际使用的钱包地址都需要单独准备本链测试资金。

维护时应先确认两套后端运行，再启动统一入口。`unified:status` 检查网关与隧道，`unified:stop` 只停止统一入口。数据和链状态不会清空。公网地址变更后，需要重新验证钱包并更新 GitHub 的公共配置，不能只修改浏览器收藏地址。
