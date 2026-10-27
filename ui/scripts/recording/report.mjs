import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {config,labels,roles,root} from './environment.mjs';

const run=resolve(process.argv[2]||''),out=resolve(process.argv[3]||''),c=config('recording');
const read=name=>JSON.parse(readFileSync(join(out,name),'utf8'));
const validation=read('validation.json'),edits=read('edit-index.json'),media=read('media-qa.json'),reopened=read('explorer-reopen-qa.json');
const visual=read('visual-review.json');assert(visual.passed&&visual.sceneOverviews.length===edits.length,'Complete the scene overview and detailed visual inspection before reporting');
assert(reopened.results.length>20&&reopened.results.every(r=>r.passed));
const persistence=JSON.parse(readFileSync(join(run,'persistence.json'),'utf8'));
assert(validation.checks.every(c=>c.passed)&&persistence.passed&&media.completeDecodingBothVersions);
const take=JSON.parse(readFileSync(join(run,'run.json'),'utf8'));
assert(take.record&&take.status==='complete'&&take.stage==='recording');
const seconds=Math.round(edits.at(-1).end),duration=`${Math.floor(seconds/60)} 分 ${seconds%60} 秒`;
const stamp=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s)%60).padStart(2,'0')}`;
const chapters=edits.filter((e,i)=>!i||edits[i-1].chapter!==e.chapter);
const source=validation.source[0];
const wallets=roles.map(r=>`| ${labels[r]} | \`${c.wallets[r].address}\` |`).join('\n');
const overview=`# 演示视频交付说明

本次交付的正式中文演示片长为 ${duration}，包含普通话配音和画面内中文字幕，没有背景音乐。1440p 主文件和 1080p 分享版均为 30 帧每秒。建议对外发送“Deye-RWA-演示视频与核对资料.zip”，需要查看细小字段时使用 1440p 主文件。

视频从空白业务场景连续完成了申请、估值、协议、入池、募集、退款、结算、运营、分配、转让、部分赎回、双受托人处置、到期领取和凭证返还。六个独立的测试账户使用真实 MetaMask 扩展，全部业务操作通过应用页面执行。剪辑只压缩等待与重复操作，倍速和节选在画面中标明。

## 观看顺序

| 起始时间 | 章节 |
| --- | --- |
${chapters.map(e=>`| ${stamp(e.start)} | ${e.chapter} |`).join('\n')}

## 文件用途

“Deye-RWA-完整演示-1440p.mp4”保留 2560×1440 分辨率；“Deye-RWA-完整演示-1080p.mp4”适合日常发送。“中文字幕.srt”和“中文讲稿.md”可用于重新配音或修改字幕。“分章节视频”目录另有八个可独立播放的章节文件。chapters 目录保留 ${edits.length} 段带配音和字幕的场景素材，每个目录中的 scene.mp4 可以单独播放。

“交易核对清单.html”可以直接打开，每条记录提供视频位置、业务编号、发送地址、合约、事件、转移记录和 Blockscout 链接。共有 ${validation.transactions} 笔业务交易与 ${validation.systemTransactions} 笔部署、水龙头交易。标为“章节参考”的条目保留完整证据，但成片没有逐笔停留。

## 重新查看演示环境

录制应用为 http://127.0.0.1:4176，Blockscout 为 http://127.0.0.1:4002，钱包 RPC 为 http://127.0.0.1:18547，Chain ID 为 20260924。这些地址访问本机保留的录制环境，收到视频的其他电脑不能直接访问你的 127.0.0.1。视频本身不需要连接任何服务即可播放。

在项目根目录运行以下命令可重新启动已保留的环境。不要运行 fresh 或删除数据卷，否则当前活动浏览器将不再展示这一部视频对应的链。

\`\`\`sh
node ui/scripts/recording/cli.mjs up recording
node ui/scripts/recording/cli.mjs health recording
\`\`\`

需要回到录像中的业务账户时，按“录制工具使用说明.md”中的 open-roles 命令打开已保留的独立浏览器配置。无需把测试私钥导入日常钱包。录制运行编号为 ${basename(run)}。未剪辑的原始画面保留在对应 runs 目录下的 video 文件夹中，未打包浏览器配置、助记词、环境文件或原始 API 响应。

## 数据与资金的边界

${source.name}的数据采用固定采集记录的回放。采集时间为 ${new Date(source.observedAt*1000).toISOString()}，证据摘要为 \`${source.sourceHash}\`。电价、交付系数、预测、账单及回款使用明示的演示假设。六十期业务和交易确实执行，但不代表真实电站已经完成了这六十个月的经营或收款。

设备始终归业主所有。新协议将约定的业主电费与售电收入归集到收益权产品，业主通过电费折扣保留优惠。投资者分配取决于实际归集收入，不承诺固定利息或保证返还原始本金。
`;
const report=`# 全流程录制与测试记录

本记录生成于 ${new Date().toISOString()}。最终交付使用运行 ${basename(run)} 的干净正式录像，未使用中途恢复的调试素材替代正式步骤。

## 实际运行结果

正式场景通过六套独立 Chromium 持久化配置和官方 MetaMask 13.49.0 扩展完成。页面点击与钱包确认由自动化驱动，签名由真实扩展生成，未注入替代钱包，也未增设后端代签业务入口。此结果覆盖本机受控测试配置，不等于已经验收所有用户的日常浏览器和钱包版本。

共核对 ${validation.transactions} 笔业务交易和 ${validation.systemTransactions} 笔系统交易，交易哈希没有重复。每筆业务交易均与持久化操作意图、发送者、Chain ID、目标合约、调用参数、成功回执及预期事件匹配。付款、份额发行、份额销毁和电站凭证转移还核对实际事件中的地址与金额。

两位投资者完成独立资格审批与认购，其中一位完成冷静期退款后重新认购。产品成功结算后完成六十期费用计提、账单和模拟回款。转让同时交付份额和 USDC；赎回展示部分成交、顺延及取消。服务事件达到固定快照的发起门槛，并由两名不同受托人分别批准。

到期后产品处于关闭状态。六十期回款均已收齐，应付分配、费用负债与资金池现金余额均为零。电站凭证已经返回业主钱包。财务时间推进前后的电站采集时间和来源摘要一致。

## 故障修复与复核

排错彩排后，另从空白数据卷完成了不中断的完整业务复跑。彩排实际检查了错误角色被拒绝、MetaMask 拒签后不铸造凭证、刷新后恢复，以及余额不足时提示领取测试资金。相关问题修复包括网络切换事件与登录挑战的时序、业务角色交接后的页面刷新、到期凭证返还入口、服务事件支持入口和历史估值输入的持久化。

第一轮正式拍摄发现 Blockscout 新交易尚未索引时，页面可能暂时沿用此前交易的状态。该轮拍摄停止并归档。录制工具增加了当前哈希、区块和已解码事件的索引检查，再打开实际浏览器页面。回归检查覆盖先返回 404、返回上一笔交易、缺少解码事件及最终索引完成的顺序；铸造、授权和入池页面也完成实际浏览器复核。最终交付来自修复后的全新录制场景。

业务模型、费用和现金流、收益权合约、旧版合约、页面工作流与时间轴检查均已运行。专门的链上凭证测试验证了替换交易回执及篡改历史估值输入不能通过核对。独立浏览器的电费时间轴回归包含四项通过记录。使用模拟钱包的页面测试与本次真实 MetaMask 走查分别记录，不把两者视作同一种验证。

## 持久化与可追溯性

正式录制后停止并重新启动独立录制服务，再次核对保存的业务状态摘要、区块高度、全部交易回执和 Blockscout 索引。${persistence.after.operations} 个业务操作与 ${persistence.after.receipts} 期回款保持一致。三份合约的源码和 ABI 可查询。成片中展示的 ${reopened.results.length} 个交易链接还重新在真实 Blockscout 页面中打开，检查了成功状态及解码事件。原有 4174 演示的 Chain ID、区块高度、合约地址和部署交易均与开始前的快照一致。

| 参与身份 | 正式录像使用的公开地址 |
| --- | --- |
${wallets}

## 成片检查与适用范围

两版视频均通过完整解码检查，时长为 ${duration}。字幕共 ${media.subtitles} 条，按实际逐句配音长度生成，并检查了顺序、重叠及是否超出片长。画面检查工具导出 ${media.frames} 张业务、钱包、回执与事件复核帧。已查看全部 ${visual.sceneOverviews.length} 个场景的总览图，并放大检查钱包、逐期现金流、结算、转让、赎回、双受托处置和凭证返还等关键画面。检查中发现的底部提示与字幕遮挡已修正并重新合成。音轨平均电平为 ${media.audioLevelsDb.mean} dB，峰值为 ${media.audioLevelsDb.max} dB，未检测到数字削波。音频验收采用完整解码、电平及字幕时间检查，不声称已经由真人逐句试听。

核对清单中的完整交易哈希可在保留的本地 Blockscout 重新查询。重复月度操作及领取在成片中节选，原始画面与全量交易记录继续保留。交付包采用明确文件清单，并检查文本资料没有包含测试助记词、私钥或密码。

本次验证不包括真实银行扣款、生产身份审核、公网高并发、真实设备控制、所有 MetaMask 版本或外部主网分叉。外部 RPC 依赖的分叉测试未执行，不能将其记为通过。测试网络与自动化测试账户仅用于本地演示。
`;
writeFileSync(join(out,'交付说明.md'),overview);
writeFileSync(join(out,'测试记录.md'),report.replace('每筆','每笔'));
copyFileSync(join(run,'persistence.json'),join(out,'persistence.json'));
writeFileSync(join(root,'docs/revenue/demo-recording/TEST-REPORT.zh.md'),report.replace('每筆','每笔'));
console.log('Wrote delivery guide and factual test report for '+duration);
