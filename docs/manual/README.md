# Operating manuals / 操作说明书

The Chinese and English PDFs cover the four-role workflow, system composition, the four architecture views, wallet setup, repeated subscriptions, monthly distributions, exits and on-chain reconciliation. Repository copies omit private keys. The demonstration operator supplies account import material through an internal channel.

中文和英文 PDF 说明四角色流程、系统构成与四类架构、钱包准备、追加认购、月度分配、退出和链上核对。本仓库不包含账户私钥，测试负责人应通过内部渠道提供导入资料。

The manuals were updated on 30 October 2026. They show bill publication, household wallet approval and USDC payment, separate simulated export funding, intermediary receipt reconciliation, and monthly distributions. The monthly sequence diagrams and nine illustrated monthly steps come from a two-month isolated walkthrough. Every illustrated English step uses the English interface; the Chinese language-switch button names the alternative language. Station display text is translated without altering recorded energy observations or collection times. Screenshots do not represent the shared product's current balances or stage.

The 30 October revision updates the unified application to https://reuters-romance-arranged-bloggers.trycloudflare.com/, both network-specific application paths and the private-chain RPC and explorer. It also explains progressive workspace loading. Temporary addresses were checked against the running services; the stable homepage remains https://mengzhon001.github.io/deye-rwa-demo/.

Both languages now begin with a comparison of the shared private chain, Base Sepolia and a fresh local Docker deployment. Dedicated chapters cover private-chain lifecycle acceptance, public-chain transaction checks and future oracle preparation, and local installation, wallets, data sources, regression, shutdown and recovery. The lifecycle checklist links to the illustrated steps. Local deployment creates a separate private chain (20260922); it is not another public chain and does not reuse shared products or wallet roles by default.

两版手册均增加三种测试路径的用途对照和独立操作章节。共享私链（20261008）用于完整生命周期，Base Sepolia（84532）用于真实公链兼容性验证及后续 Oracle 接入准备，本地 Docker 部署（默认20260922）用于开发、复现和独立回归。当前版本尚未接入 Oracle。本地部署命令已与仓库脚本逐项核对；本次文档修订不代表重新执行了新机器部署或链上生命周期。

本地交付目录为项目根目录下可见的 `docs/manual/`。中英文手册已经合并私有演示链和 Base Sepolia 的说明，不需要从隐藏的 `.data` 目录寻找另一份公链手册。2026 年 10 月 30 日修订同步更新了网址、网络配置与分区加载说明。

The 22 October monthly walkthrough used authenticated browser pages and dedicated local keys signing real transactions outside the screenshot browser. It covered rejection, insufficient funds, duplicate protection and backend restart recovery. That monthly walkthrough did not constitute a new Rabby extension test. The independent 29 October Base Sepolia checks separately use the actual Rabby extension for HTTPS login, rejection, subscription and refund; they do not claim an accelerated public-chain lifecycle.

中文手册已同步增加业主月度钱包缴费、电网售电单独模拟及中介核对入池的时序和截图。两种语言的操作图均来自独立测试场景，不代表共享产品当前余额。

## Rebuilding

Install Python 3.12+ and XeLaTeX. Keep `scripts/manual/testing_paths.py` alongside `build.py`. Typography uses the macOS Songti collection at `/System/Library/Fonts/Supplemental/Songti.ttc`. Adjust the font declarations in the generator on another operating system. From the repository root, generate one language or both.

```sh
python3 scripts/manual/build.py --language both --work output/manual --public-config docs/manual/deployment.public.json --legacy-assets docs/manual/assets --example docs/manual/example.json --english-screenshots docs/manual/screenshots.en.json
cd output/manual
xelatex -interaction=nonstopmode -halt-on-error manual.zh.tex
xelatex -interaction=nonstopmode -halt-on-error manual.zh.tex
xelatex -interaction=nonstopmode -halt-on-error manual.zh.tex
xelatex -interaction=nonstopmode -halt-on-error manual.en.tex
xelatex -interaction=nonstopmode -halt-on-error manual.en.tex
xelatex -interaction=nonstopmode -halt-on-error manual.en.tex
```

The English build requires the screenshot manifest and rejects missing or untranslated captures instead of falling back to a Chinese image. The Chinese language-switch label is permitted because it identifies the alternative language.

The optional `--private-accounts` argument accepts a local ignored file mapping each role to its test address and privateKey. Use it only for a separately distributed internal copy. Never commit that generated copy or the account file. The default build contains no keys.

Public application, explorer and RPC URLs are temporary tunnel addresses. Retrieve the current application through the GitHub homepage when these endpoints change. Updating a URL does not change the Chain ID or role wallet addresses.

The 29 October update adds an independent Base Sepolia chapter with Chain ID 84532, official Circle test USDC, faucet instructions, unchanged role addresses, public transaction reconciliation and real-time restrictions. The original accelerated demonstration instructions remain applicable to its private chain. Public network details are in `base-sepolia.public.json`.
