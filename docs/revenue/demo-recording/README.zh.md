# 四角色演示录制工具

录制使用独立的 Anvil、Blockscout 和应用数据。现有演示的 4174、4000 和 18545 端口不受影响。录制站点位于 4176，录制浏览器位于 4002，钱包 RPC 位于 18547，Chain ID 为 20260924。

## 准备和启动

在项目根目录运行以下命令。录制环境仅用于本机测试，不承载真实资金。

```sh
node ui/scripts/recording/cli.mjs setup
node ui/scripts/recording/cli.mjs prepare rehearsal
node ui/scripts/recording/cli.mjs wallets rehearsal
node ui/scripts/recording/cli.mjs up rehearsal
node ui/scripts/recording/cli.mjs health rehearsal
node ui/scripts/recording/cli.mjs rehearse rehearsal
```

`setup` 检查官方 MetaMask 13.49.0 的 SHA-256、FFmpeg 9.0.2 和本机 Tingting 语音。依赖版本记录在 `ui/scripts/recording/versions.json`。浏览器使用项目内 Playwright 1.58.2 所安装的 Chromium。

真实电站的原始采集记录位于 `.data/demo-recording/source/station.json`。工具不会在采集失败后替换成合成电站。生成的公开环境摘要记录采集文件的 SHA-256。录制应用明确使用记录回放，电价、交付系数、账单、未来收益与模拟回款另行标注。

六套独立的 MetaMask 配置分别属于业主、中介、投资者 A/B 和受托人 A/B。钱包初始化在录制前完成。助记词和密码仅存在于 Git 忽略的 `.data/demo-recording/<场景>/private.json` 与扩展配置中，不写入视频、日志或交付包。后端仅保存部署和模拟回款所需的系统账户，不保存业务参与者的私钥。

## 彩排与正式录制

浏览器工具通过页面按钮和真实 MetaMask 确认操作。它不注入替代钱包，也不通过后台接口代办业务。对后台的额外调用仅用于读取状态和核对交易凭证。

彩排与正式录制使用不同的数据卷和钱包。因为它们使用相同的录制端口，切换前应停止彩排服务。

```sh
node ui/scripts/recording/cli.mjs down rehearsal
node ui/scripts/recording/cli.mjs prepare recording
node ui/scripts/recording/cli.mjs wallets recording
node ui/scripts/recording/cli.mjs up recording
node ui/scripts/recording/cli.mjs record recording
```

普通停止不会删除区块链或业务记录。正式录制结束后保留 recording 服务及数据卷，视频里的交易可以继续通过 Blockscout 查询。再次打开可运行 `node ui/scripts/recording/cli.mjs open recording`。查看健康情况和后台日志分别使用 `health recording` 和 `logs recording`。

如果需要用录像中的测试账户重新查看业务页面，可在停止录制后运行以下命令。它会打开已保留的独立 Chromium 与 MetaMask 配置，不导出私钥，也不自动办理业务。会话过期时，在页面中重新选择该账户的角色并签名即可。省略角色参数会打开全部六个窗口。

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.data/playwright-browsers" \
  node ui/scripts/recording/open-roles.mjs recording owner agent investor trustee
```

录制进度保存在各场景的 `progress.json`。彩排恢复运行时跳过已确认的步骤，不重复认购、付款或发行。正式录制禁止从非空进度继续，必须通过 `fresh recording` 创建新一轮干净场景。修复问题后的正式交付必须使用一个完整、干净的录制场景；分次恢复的调试素材不直接当作正式成片。

## 画面与证据

导播工具从独立 Chromium 窗口采集真实画面。业务操作时突出当前参与者，并保留另外三类参与者的小窗口。投资者 B 和受托人 B 的身份有独立标注。钱包阶段展示真实 MetaMask 界面，链上核对阶段并排展示业务凭证与 Blockscout。这里没有共享登录的 iframe。

每笔操作的只读凭证由 `/api/recording/operations/<操作编号>` 提供，必须经过钱包会话鉴权，而且仅在开启录制功能的环境可用。交易核对包括持久化意图、发送地址、链编号、目标合约、完整调用数据、回执状态与已解码事件。涉及付款时另外核对 USDC 转移，涉及份额时核对铸造、转移或销毁。费用等操作还可显示前后区块中的状态。接口没有签名或执行交易的权限。

在交易日志中点击“核对业务与链上记录”可以重新打开凭证。Blockscout 的索引状态与链上确认分开记录。消息签名和链下审核不会显示成虚构交易。链上的摘要只证明对应关系，不等于链上保存了完整原始材料。

## 合成成片

每次运行将原始画面、剪辑时间标记和核对结果保存在 `.data/demo-recording/<场景>/runs/<运行时间>/`。正式运行必须完成到期关闭并通过核对，才可合成成片。

```sh
node ui/scripts/recording/validate.mjs recording \
  .data/demo-recording/recording/runs/<正式运行时间>
node ui/scripts/recording/render.mjs \
  .data/demo-recording/recording/runs/<正式运行时间> \
  .data/demo-recording/delivery
```

讲稿位于 `story.mjs`，采用完整中文句子。工具逐句生成 Tingting 语音，以实际音频长度生成字幕时间；不加入背景音乐。FFmpeg 合成 2560×1440、30fps 的 H.264/AAC 主文件和 1080p 分享版，并保留中文讲稿、SRT、章节素材及交易核对清单。

### 使用自然中文配音替换原音轨

初版的 Tingting 音轨保留为原始版本。新版使用本地 Qwen3-TTS 的 Serena 普通话预设声音，按完整段落生成，并用自然讲解的语气指令控制停顿和重音。这仍然是合成语音，不是实际参与者的录音，也不克隆任何人的声音。运行环境为 Apple Silicon、Python 3.12 和 MLX Audio 0.5.5。

下面的命令只读取已经验证的视频和公开交付资料，不连接钱包，不发送交易，不改变演示链。模型下载使用固定修订版本，并核对权重的 SHA-256。讲稿与音频均在本机处理，不上传到语音服务。

```sh
python3.12 -m venv .data/demo-recording/tts-venv
.data/demo-recording/tts-venv/bin/python -m pip install -r ui/scripts/recording/narration-requirements.txt
node ui/scripts/recording/prepare-natural-narration.mjs .data/demo-recording/delivery
HF_HUB_DISABLE_XET=1 .data/demo-recording/tts-venv/bin/python ui/scripts/recording/download-narration-models.py
.data/demo-recording/tts-venv/bin/python ui/scripts/recording/natural-narration.py
.data/demo-recording/tts-venv/bin/python ui/scripts/recording/check-natural-narration.py
.data/demo-recording/tts-venv/bin/python ui/scripts/recording/revoice.py
```

配音缓存位于 `.data/demo-recording/natural-voice/Serena/`。工具记录模型、声音、语气指令、讲稿摘要和生成参数。转写结果保存在各段的 `.asr.json` 中，需要检查术语、数字和句子完整性。强制对齐结果用于重建字幕，不能单独用作“没有漏读”的证明。对齐和转写完成后才运行合成。

新版默认写入 `.data/demo-recording/delivery-natural/`。画面剪辑点、交易说明和交易清单时间点保持原样，只替换底部字幕和音轨。只在需要时使用不超过 1.18 倍的轻微提速；超过限制的段落需要重新生成，不能强行挤进画面或截断语音。`audio-revision.json` 记录每段的处理和原素材摘要。重新运行 `qa-media.mjs` 并查看导出的关键帧，再生成新版交付包。原有链上验证报告属于原录制记录，配音更新不冒充一次新的业务录制。

重复月份和重复领取操作采用明确标注的节选，并适度压缩等待时间。画面与讲稿明确说明演示财务时间推进，不把剪掉的等待当作操作没有发生，也不把失败步骤剪成成功。未逐笔停留的交易仍保存在完整清单和原始录像中。

## 资料保留

可交付内容采用明确清单，包括 MP4、字幕、讲稿、章节、交易核对表和测试记录。不要把整个 `.data`、浏览器配置、环境文件或原始 API 文件打包发送。保留本机录制环境，供后续复核和补录。

## 从干净场景重跑

`fresh` 会停止所选录制场景，并归档配置、钱包浏览器和素材。已有 Docker 数据卷继续保留。新场景使用新的 Compose 项目、数据卷和独立钱包，因此不会混入上一轮交易。该命令只作用于指定录制场景，不操作原有演示。

```sh
node ui/scripts/recording/cli.mjs fresh rehearsal
node ui/scripts/recording/cli.mjs wallets rehearsal
node ui/scripts/recording/cli.mjs up rehearsal
node ui/scripts/recording/cli.mjs rehearse rehearsal
```

正式录像也可以使用 `fresh recording` 开始新的一轮。不要在需要复核旧录像时替换当前活动链。此前的 Compose 文件及钱包配置位于 `.data/demo-recording/archives/`，可用其完整路径启动相应的已保留数据卷；同一时刻只能启动一套使用 4176、4002 和 18547 的录制场景。

## 验收

可先生成中文配音并检查计划时长，再录制。正式验收会重新读取视频中每笔交易的节点回执与 Blockscout 记录，并检查关闭状态、六十期回款、两名不同受托人、费用结清、最终领取和凭证返还。

```sh
node ui/scripts/recording/prepare-narration.mjs .data/demo-recording/delivery
node ui/scripts/recording/validate.mjs recording \
  .data/demo-recording/recording/runs/<正式运行时间> \
  .data/demo-recording/delivery
node ui/scripts/recording/qa-media.mjs \
  .data/demo-recording/recording/runs/<正式运行时间> \
  .data/demo-recording/delivery
```

完成服务重启验证后，可运行 `recheck-explorer.mjs .data/demo-recording/delivery` 逐个重新打开成片中的交易页面。它使用真实 Blockscout 网页检查交易哈希、成功状态和解码事件，不只检查接口是否返回 200。

`rehearse` 额外执行真实钱包的错误角色拦截、拒签后恢复和余额不足检查。这些故障场景不会进入正式录像。站点回归中的模拟钱包测试另外记录，只用于检查页面状态和登录时序，不能代替真实 MetaMask 的业务走查。

## 重启复核与交付包

录制进程完全退出后，先保存业务状态，再停止和重新启动同一套录制服务。这里不要使用 `fresh`，因为本步骤需要验证既有链的持久化。将下面的运行时间替换为本次 `runs` 目录的名称。

```sh
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.data/playwright-browsers"
recording_run=".data/demo-recording/recording/runs/<正式运行时间>"
recording_delivery=".data/demo-recording/delivery"
node ui/scripts/recording/persistence.mjs before recording "$recording_run"
node ui/scripts/recording/cli.mjs down recording
node ui/scripts/recording/cli.mjs up recording
node ui/scripts/recording/cli.mjs health recording
node ui/scripts/recording/persistence.mjs after recording "$recording_run"
node ui/scripts/recording/validate.mjs recording "$recording_run" "$recording_delivery"
node ui/scripts/recording/qa-media.mjs "$recording_run" "$recording_delivery"
node ui/scripts/recording/recheck-explorer.mjs "$recording_delivery"
```

`qa-media` 会完整解码两版视频，检查字幕顺序和音频电平，并在 `visual-qa` 中导出逐场景复核帧。仍需实际查看钱包、时间轴、交易摘要、解码事件和结尾画面，检查是否清晰、遮挡或误用账户；自动检查不能代替这一步。字幕调整只作用于成片，原始业务画面保持不变。

实际查看后，将复核结果保存为交付目录中的 `visual-review.json`，记录 `passed`、已检查的 `sceneOverviews` 场景名称、`detailedFrames` 关键帧及 `checks` 检查说明。可参考本次随附的同名文件。只有实际完成检查后才填写通过，不能直接复制上一轮的结论。

全部检查通过后，可以生成测试记录和交付包。报告会读取本轮实际验收结果，不会在验收未完成时生成通过报告。

```sh
node ui/scripts/recording/report.mjs "$recording_run" "$recording_delivery"
node ui/scripts/recording/package.mjs "$recording_run" "$recording_delivery"
```

“Deye-RWA-演示视频与核对资料.zip”包含 1080p 视频、字幕、讲稿、交易清单与测试说明。“Deye-RWA-录制工具源码.zip”单独提供工具。1440p 主文件和八个独立章节保留在交付目录中。文件校验清单记录 SHA-256；浏览器配置、钱包材料和原始电站接口响应均不进入压缩包。原始录像和录制链继续保留在本机。
