# Operating manuals / 操作说明书

The Chinese and English PDFs cover the four-role workflow, system composition, the four architecture views, wallet setup, repeated subscriptions, monthly distributions, exits and on-chain reconciliation. Repository copies omit private keys. The demonstration operator supplies account import material through an internal channel.

中文和英文 PDF 说明四角色流程、系统构成与四类架构、钱包准备、追加认购、月度分配、退出和链上核对。本仓库不包含账户私钥，测试负责人应通过内部渠道提供导入资料。

The manuals were updated on 29 October 2026. They now show bill publication, household wallet approval and USDC payment, separate simulated export funding, intermediary receipt reconciliation, and monthly distributions. The monthly sequence diagrams and nine illustrated monthly steps were refreshed from a two-month isolated walkthrough. Every illustrated English step uses the English interface; the Chinese language-switch button names the alternative language. Station display text is translated without altering recorded energy observations or collection times. Screenshots do not represent the shared product's current balances or stage.

The 22 October monthly walkthrough used authenticated browser pages and dedicated local keys signing real transactions outside the screenshot browser. It covered rejection, insufficient funds, duplicate protection and backend restart recovery. That monthly walkthrough did not constitute a new Rabby extension test. The independent 29 October Base Sepolia checks separately use the actual Rabby extension for HTTPS login, rejection, subscription and refund; they do not claim an accelerated public-chain lifecycle.

中文手册已同步增加业主月度钱包缴费、电网售电单独模拟及中介核对入池的时序和截图。两种语言的操作图均来自独立测试场景，不代表共享产品当前余额。

## Rebuilding

Install Python 3.12+ and XeLaTeX. Typography uses the macOS Songti collection at `/System/Library/Fonts/Supplemental/Songti.ttc`. Adjust the font declarations in the generator on another operating system. From the repository root, generate one language or both.

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
