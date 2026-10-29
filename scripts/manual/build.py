"""Generate matched Chinese/English LaTeX manuals. Runtime credentials are optional local inputs, never source assets."""
from pathlib import Path
import argparse,json,re,shutil,hashlib
P=argparse.ArgumentParser();P.add_argument('--work',required=True);P.add_argument('--public-config',required=True);P.add_argument('--private-accounts');P.add_argument('--legacy-assets',required=True);P.add_argument('--example',required=True);P.add_argument('--language',choices=['zh','en','both'],default='both');P.add_argument('--english-screenshots');A=P.parse_args()
ROOT=Path.cwd();D=Path(A.work).resolve();D.mkdir(parents=True,exist_ok=True);pub=json.loads(Path(A.public_config).read_text());keys=json.loads(Path(A.private_accounts).read_text()) if A.private_accounts else {};example=json.loads(Path(A.example).read_text());steps=json.loads(Path('scripts/manual/steps.zh.json').read_text());en={x.split('\t')[0]:x.split('\t')[1:]for x in Path('scripts/manual/steps.en.tsv').read_text().splitlines()if x}
legacy=Path(A.legacy_assets);capture_file=D/'captures.json' if(D/'captures.json').exists()else Path('docs/manual/captures.json');captures=json.loads(capture_file.read_text())if capture_file.exists()else[]
map_action={'B3':'apply','B5':'review','B6':'offer','B7':'approve-offer','B9':'accept','B10':'sign','C1':'mint-station','C2':'custody-consent','C3':'admit','C4':'prepare-valuation','C5':'approve-valuation','C6':'publish','D3':'apply-eligibility','D4':'eligible','D5':'subscribe','D7':'review-subscription','D8':'settle','E1':'advance','E4':'accrue-fee','E2':'book-revenue','E3':'pay-household-bill','E3a':'fund-export','E3b':'confirm-receipt','E5':'approve-valuation','E6':'distribute','E7':'claim'}
roles=[('owner','业主','Owner'),('agent','中介机构','Intermediary'),('investor','投资者 A','Investor A'),('investor2','投资者 B','Investor B'),('trustee','受托管理人 A','Trustee A'),('trustee2','受托管理人 B','Trustee B')]
def esc(s):return str(s).replace('\\',r'\textbackslash{}').replace('&',r'\&').replace('%',r'\%').replace('_',r'\_').replace('#',r'\#').replace('$',r'\$')
english_manifest=Path(A.english_screenshots) if A.english_screenshots else Path('docs/manual/screenshots.en.json')
english_shots=json.loads(english_manifest.read_text()) if english_manifest.exists() else {}
zh_manifest=(D/'screenshots.zh.json') if (D/'screenshots.zh.json').exists() else Path('docs/manual/screenshots.zh.json');zh_shots=json.loads(zh_manifest.read_text()) if zh_manifest.exists() else {}
if A.language!='zh' and not english_shots:raise RuntimeError('An explicit English screenshot manifest is required for the English manual')
if A.language!='zh':
 for step in steps:
  code=step[0];record=english_shots.get(code)
  if not record or not record.get('file','').endswith('.en.png'):raise RuntimeError('Missing English screenshot for '+code)
  if any(word!='中文' for word in record.get('chinese',[])):raise RuntimeError('Untranslated screenshot text in '+code)
for lang in (['zh','en'] if A.language=='both' else [A.language]):
 parts=[];assets=[];L=lambda z,e:z if lang=='zh'else e
 def t(s):parts.append(s+'\n')
 def para(z,e):t(esc(L(z,e))+'\n')
 def section(z,e):t(r'\clearpage\section{'+esc(L(z,e))+'}')
 def sub(z,e):t(r'\subsection{'+esc(L(z,e))+'}')
 def figure(path,caption,height='.62\\textheight'):
  path=Path(path)
  if not path.exists():raise RuntimeError('Missing manual image '+str(path))
  target=D/'assets'/path.name
  target.parent.mkdir(parents=True,exist_ok=True)
  if path.resolve()!=target.resolve():shutil.copy2(path,target)
  assets.append(target.name);t(r'\begin{center}\includegraphics[width=\linewidth,height='+height+r',keepaspectratio]{assets/'+target.name+r'}\par '+esc(caption)+r'\end{center}')
 def landscape():t(r'\clearpage\begin{landscape}')
 def endland():t(r'\end{landscape}')
 def boxes(ztitle,etitle,nodes,edges,zd,ed):
  landscape()
  if ztitle=='系统构成图':t(r'\section{'+L('系统构成与架构','System composition and architecture')+'}')
  sub(ztitle,etitle);para(zd,ed)
  t(r'\begin{center}\begin{tikzpicture}[x=1cm,y=1cm,>=Latex,box/.style={draw,align=center,text width=5.7cm,minimum height=1.6cm,inner sep=6pt},arrow/.style={->,line width=.6pt}]')
  for name,x,y,z,e in nodes:t(f'\\node[box] ({name}) at ({x},{y}) {{{esc(L(z,e)).replace(" / ",r"\\")}}};')
  for a,b in edges:t(f'\\draw[arrow] ({a}) -- ({b});')
  t(r'\end{tikzpicture}\end{center}');endland()
 def sequence(ztitle,etitle,rows):
  landscape();sub(ztitle,etitle)
  para('箭头依次表示业务交接。钱包消息签名与链下审批不等于已确认的链上交易。','Arrows show the order of handoffs. Message signatures and off-chain review are distinct from confirmed blockchain transactions.')
  t(r'\begin{center}\begin{tikzpicture}[x=1cm,y=1cm,>=Latex]')
  names=L(['业主','中介机构','受托管理人','投资者','系统与合约'],['Owner','Intermediary','Trustee','Investor','App / contracts']);xs=[0,5,10,15,20]
  for x,n in zip(xs,names):t(f'\\node[draw,minimum width=3.6cm,minimum height=.65cm] at ({x},0) {{{n}}};\\draw[dashed] ({x},-.4)--({x},{-1.2-len(rows)*1.15});')
  for i,(a,b,z,e)in enumerate(rows):
   y=-1.2-i*1.15;width=min(9,abs(xs[a]-xs[b])-.2);t(f'\\draw[->] ({xs[a]},{y})--node[above,fill=white,align=center,text width={width}cm]{{{i+1}. {esc(L(z,e))}}}({xs[b]},{y});')
  t(r'\end{tikzpicture}\end{center}');endland()
 t(r'''\documentclass[12pt,a4paper]{article}
\usepackage[margin=22mm,footskip=10mm]{geometry}
\usepackage{fontspec,xeCJK,graphicx,array,longtable,booktabs,xurl,pdflscape,tikz,titlesec,amsmath}
\usepackage[hidelinks]{hyperref}
\usetikzlibrary{arrows.meta}
\setmainfont{Songti.ttc}[Path=/System/Library/Fonts/Supplemental/,FontIndex=6,BoldFont=Songti.ttc,BoldFeatures={FontIndex=0}]
\setCJKmainfont{Songti.ttc}[Path=/System/Library/Fonts/Supplemental/,FontIndex=6,BoldFont=Songti.ttc,BoldFeatures={FontIndex=0}]
\setmonofont{Songti.ttc}[Path=/System/Library/Fonts/Supplemental/,FontIndex=6]
\renewcommand{\normalsize}{\fontsize{12}{18}\selectfont}\normalsize
\titleformat{\section}{\normalsize\bfseries}{\thesection}{1em}{}
\titleformat{\subsection}{\normalsize\bfseries}{\thesubsection}{1em}{}
\setlength{\parindent}{0pt}\setlength{\parskip}{6pt}\setlength{\emergencystretch}{3em}
\renewcommand{\arraystretch}{1.2}\urlstyle{same}
\newcolumntype{L}[1]{>{\raggedright\arraybackslash}p{#1}}
\begin{document}''')
 title=L('Deye RWA 平台产品与操作说明书','Deye RWA Platform Product and Operating Manual');t(r'\hypersetup{pdftitle={'+esc(title)+r'},pdfauthor={Deye RWA}}');t(r'\begin{center}\textbf{'+esc(title)+r'}\end{center}')
 para('内部测试版　2026年10月29日','Internal test edition, 29 October 2026')
 para('本说明书说明四类参与者如何使用钱包完成申请、估值、募集、结算、月度分配和退出。设备所有权始终由业主保留，投资者购买的是有限期限的收益权份额。所有支付均为演示资金，不存在固定票息或保证返还本金。','This manual explains how the four participant roles use wallets to complete applications, valuation, fundraising, settlement, monthly distributions and exits. Equipment remains the owner’s property. Investors acquire shares in finite revenue rights, with no fixed coupon or guaranteed repayment of their original investment. All payments use demonstration funds.')
 para('正文对应本次上线的动态引导、业主钱包月度缴费及 V5 月度分配版本。当前公网链编号为20261008。截图在隔离测试环境中采集，具体合约、余额和日期可能与同事所在的共享产品不同。操作前应核对产品名称、钱包地址和链编号。','The instructions cover the dynamic guide, household wallet payments and V5 monthly-distribution release. The public test Chain ID is 20261008. Screenshots come from isolated tests and may show different contracts, balances or dates from the shared product. Check the product, account and network before acting.')
 para('本文件保留发行、转让、赎回和到期等完整操作说明。月度缴费及确认步骤使用本次重新采集的中英文截图，其余未改变的操作沿用已核对的对应语言截图。截图不代表共享产品已经到达所示状态。','Every illustrated workflow step uses the English interface. The monthly payment and reconciliation images were captured for this release; unchanged issuance, exit and closure images retain the verified English captures. Station names use English display translations without changing energy observations. These examples do not imply that the shared product has reached the illustrated stage.')
 if keys:para('本内部文件附有专用测试钱包私钥，只应发送给测试同事，不要将这些账户用于真实资金。GitHub首页和源码不包含这些私钥。','This internal file includes dedicated test-account private keys for participating colleagues. Never use these accounts for real funds. The GitHub homepage and source repository do not contain these keys.')
 para('本次月度缴费流程在独立测试链上验证了连续两个月的业主付款、确认入池和分配。自动化浏览器使用独立测试密钥签署实际交易，不代表本次重新完成了Rabby扩展认证。高级转让、赎回、服务处置与到期说明沿用已验证的业务规则，并应结合当前窗口条件操作。当前系统是演示软件，真实电价、银行清算、生产身份合规和完整安全审计尚未完成。','The payment release is tested through two consecutive months of household payments, receipt confirmation and distributions on an isolated chain. The browser test uses dedicated test keys to sign actual transactions outside the browser and does not claim renewed Rabby extension certification. Advanced transfer, redemption, servicing and expiry instructions retain their validated business rules and must follow the current window conditions. This remains demonstration software. Real tariff settlement, bank clearing, production identity compliance and a full security audit are not complete.')
 t(r'\renewcommand{\contentsname}{'+L('目录','Contents')+r'}\clearpage\tableofcontents')
 section('产品状态与角色交接','Product states and role handoffs')
 para('产品从草稿进入募集，募集满足资金与审批条件后统一结算并发行DRS，随后进入存续期。募集失败的产品提供退款，存续产品在收益权到期后完成清理和关闭。部署合约不等于发布产品，认购款进入托管也不等于已发行份额。','A product starts as a draft, opens fundraising after approval and issues DRS only on successful settlement. It then enters servicing. Failed fundraising allows refunds, and a live product is reconciled and closed when its rights expire. Contract deployment is distinct from publication, and escrowed subscriptions are distinct from issued shares.')
 para('业主申请并签署收益权协议，并按月使用本人钱包缴费。中介负责材料审核、估值编制、发行组织和运营。受托管理人独立审核报价和资产池估值。投资者自行确认资格、认购、领取与退出。两位受托人只在规定的服务处置中需要分别批准，普通报价和估值审批不是每次都要求双人操作。','The owner applies, signs the rights agreement and pays monthly bills using their own wallet. The intermediary assesses materials, prepares valuations, organizes issuance and operates the pool. Trustees independently approve offers and pool valuations. Investors complete qualification, subscriptions, claims and exits. Two separate trustees are required for the defined servicing intervention, rather than for every ordinary valuation approval.')
 sequence('申请、入池与发行时序','Application, admission and issuance sequence',[(0,1,'提交申请与证据','Submit application'),(1,2,'编制报价并申请审核','Prepare offer for review'),(2,0,'批准后由业主接受并签署','Approve for owner acceptance'),(1,4,'铸造站点凭证','Mint station credential'),(0,4,'授权资产池托管','Authorize pool custody'),(1,4,'入池并提交估值','Admit and submit valuation'),(2,4,'批准估值','Approve valuation'),(1,3,'发布募集条款','Publish fundraising'),(3,4,'认购进入托管','Subscribe into escrow'),(1,4,'审核订单并统一结算','Review orders and settle')])
 sequence('月度账单与业主缴费时序','Monthly bills and household payment',[(1,4,'发布月度缴费账单','Publish monthly invoice'),(0,4,'授权并支付本期USDC','Approve and pay household USDC'),(1,4,'单独登记模拟售电回款','Record separate simulated export receipt'),(1,4,'核对两笔款项并确认净额入池','Reconcile both receipts and release net proceeds')])
 sequence('月度估值与投资者交接时序','Monthly valuation and investor handoff',[(1,2,'补齐计费基准估值审批','Approve opening NAV if needed'),(1,4,'计提本期费用','Accrue monthly expenses'),(1,2,'提交本期估值','Submit current valuation'),(2,4,'批准并锚定本期估值','Approve current valuation'),(1,4,'宣告月度分配','Declare monthly distribution'),(1,3,'交接至投资者查看','Hand off to investor'),(3,4,'领取已确认的分配','Claim confirmed distribution')])
 # Architecture chapter heading is printed with its first landscape figure.
 boxes('系统构成图','System composition',[('a',0,0,'GitHub Pages / 首页与文档','GitHub Pages / Homepage and docs'),('b',8,0,'业务应用 / 四角色工作台','Business application / Four role workspaces'),('c',16,0,'Rabby / 钱包签名','Rabby / Wallet signatures'),('d',0,-3,'电站 API 与证据 / 真实记录或回放','Station API and evidence / Live or recorded observations'),('e',8,-3,'Mac 后端与测试链 / 估值、账本及合约','Mac backend and test chain / Valuation, ledger, contracts'),('f',16,-3,'Blockscout / 区块、交易和事件','Blockscout / Blocks, transactions, events')],[('a','b'),('b','c'),('b','e'),('d','e'),('c','e'),('e','f')],'首页可以独立阅读。业务应用、RPC和浏览器由Mac上的独立Docker环境提供，并经HTTPS隧道供同事访问。','The homepage remains readable independently. The application, RPC and explorer run in an isolated Docker environment on the Mac and are exposed through HTTPS tunnels.')
 boxes('业务架构图','Business architecture',[('a',0,0,'业主 / 设备所有权与优惠电费','Owner / Equipment and discounted bill'),('b',8,0,'中介机构 / 审核、发行与运营','Intermediary / Assessment, issuance, servicing'),('c',16,0,'受托管理人 / 独立审核与处置','Trustees / Independent review and intervention'),('d',0,-3,'收益权协议 / 五年有限现金流','Rights agreement / Five-year finite cashflows'),('e',8,-3,'资产池 / 归集、费用与分配','Pool / Collections, expenses, distributions'),('f',16,-3,'投资者 / 出资、持有与退出','Investors / Subscribe, hold and exit')],[('a','d'),('d','e'),('b','e'),('c','e'),('f','e'),('e','f')],'业主优惠电费与合资格售电款共同形成收入来源。资金池支付约定购买价，并按协议处理费用、分配和退出，不取得设备所有权。','Discounted owner electricity payments and eligible export receipts fund the rights. The pool pays the agreed purchase price and handles expenses, distributions and exits without acquiring equipment ownership.')
 boxes('数据架构图','Data architecture',[('a',0,0,'API 观测 / 电量、设备与时间','API observations / Energy, devices, timestamps'),('b',8,0,'标准化证据 / 单位、时区与摘要','Normalized evidence / Units, time zones, hashes'),('c',16,0,'预测与估值 / 基线、假设与现金流','Forecast and valuation / Baselines and assumptions'),('d',0,-3,'协议与审核 / 链下正文和记录','Agreements and review / Off-chain records'),('e',8,-3,'财务账本 / 应收、现金、费用与持仓','Financial ledger / Receivables, cash, expenses, shares'),('f',16,-3,'链上凭证 / 摘要、事件与转账','On-chain evidence / Digests, events, transfers')],[('a','b'),('b','c'),('c','d'),('d','f'),('c','e'),('e','f')],'API电量、模型预测、审核状态与链上确认分别记录。应收转现金不是再次形成收入，原始证据也不会因摘要上链而完整公开。','Observed energy, modeled values, review status and chain confirmation are recorded separately. Collection is not another revenue recognition, and anchoring a digest does not publish the underlying raw evidence.')
 boxes('功能架构图','Functional architecture',[('a',0,0,'业主 / 电站、协议与月度缴费','Owner / Stations, agreements, monthly payments'),('b',8,0,'中介 / 队列、估值与发行','Intermediary / Queues, valuation, issuance'),('c',16,0,'受托 / 报价与估值审批','Trustee / Offer and valuation approval'),('d',0,-3,'投资者 / 资格、认购与持仓','Investor / Qualification, subscriptions, holdings'),('e',8,-3,'运营 / 回款、费用与月度分配','Servicing / Collections, fees, monthly payouts'),('f',16,-3,'退出与监督 / 转让、赎回及服务事件','Exit and oversight / Transfers, redemption, cases')],[('a','b'),('b','c'),('b','d'),('b','e'),('d','f'),('c','f')],'工作台按角色显示权限内的操作。引导由实际业务状态生成，角色选择本身不授予审批、付款或签名权限。','Workspaces show the operations permitted for each role. Guidance derives from actual state, and choosing a role does not grant approval, payment or signing authority.')
 boxes('技术架构图','Technical architecture',[('a',0,0,'前端 / TypeScript、Vite 与 Driver.js','Frontend / TypeScript, Vite, Driver.js'),('b',8,0,'后端 / Node.js 与操作意图','Backend / Node.js and operation intents'),('c',16,0,'RPC 网关 / 查询与签名交易广播','RPC gateway / Queries and signed broadcasts'),('d',0,-3,'链下存储 / 证据、模型与流程','Off-chain storage / Evidence, models, workflows'),('e',8,-3,'Anvil 与 Solidity / NFT、Vault 与账单合约','Anvil and Solidity / NFT, vault and billing'),('f',16,-3,'Blockscout 与数据库 / 索引与源码验证','Blockscout and database / Indexing and source verification')],[('a','b'),('a','c'),('b','d'),('b','e'),('c','e'),('e','f')],'钱包在客户端签名。后端核对发送者、目标合约、方法、参数、回执与事件后才推进状态。公开RPC不接受清链、冒充账户或修改余额等管理方法。','Wallets sign on the client. The backend checks sender, target, method, arguments, receipt and events before advancing workflow state. The public RPC rejects reset, impersonation and balance-editing methods.')
 section('钱包与测试账户','Wallets and test accounts')
 para('请从Rabby官网进入浏览器扩展的官方安装入口。安装后选择已有地址，再选择私钥导入，将对应测试账户导入钱包扩展并核对完整地址。私钥只应输入钱包扩展，业务网站不需要私钥。','Install the browser extension through Rabby’s official website. Choose an existing address and private-key import, then verify the resulting full address. Enter private keys only inside the wallet extension. The business website never needs them.')
 t(r'\url{https://rabby.io/}\par')
 figure(legacy/'wallet-import-3-crop.png',L('编号1表示钱包扩展中的私钥输入位置。输入框保持为空。','Marker 1 identifies the private-key field inside the wallet extension. The illustrated field is empty.'),'.42\\textheight')
 para('本次更新保留原公网业主、中介和两位受托人的地址。角色地址与网络账户不是由网页按钮临时生成的。普通钱包可以作为投资者申请资格。完整演练中的投资者A/B和受托人A/B各使用独立账户。','This release preserves the public owner, intermediary and two trustee addresses. Role bindings are not generated by clicking a role button. An ordinary wallet may apply as an investor. Investor A/B and trustee A/B use separate accounts for a full walkthrough.')
 para('两位受托人的普通登录角色相同，但钱包地址不同。服务事件达到固定快照30%支持门槛后，需要两名不同受托人分别批准收款方变更。同一地址重复操作不能替代第二名受托人。','The two trustees use the same login role but different wallets. A servicing case requires 30% support under its fixed snapshot and approval from two distinct trustees before changing the demo collection recipient. Repeating approval with one address does not replace the second trustee.')
 for i in range(0,6,2):
  landscape();sub('角色账户 '+str(i//2+1),'Role accounts '+str(i//2+1))
  for role,z,e in roles[i:i+2]:
   t(r'\textbf{'+L(z,e)+r'}\par');t(r'\nolinkurl{'+pub['accounts'][role]+r'}\par')
   if keys:para('对应的专用测试私钥如下。','The dedicated test private key is shown below.');t(r'\nolinkurl{'+keys[role]['privateKey']+r'}\par')
   else:para('私钥由演示负责人通过内部渠道提供，不包含在本源码文档中。','The demo operator supplies the private key through an internal channel. It is excluded from this source document.')
  endland()
 section('网站、网络与区块链浏览器','Website, network and blockchain explorer')
 for z,e,key,suffix in [('公开首页','Public homepage','pages',''),('业务应用','Business application','app','/app/'),('区块链浏览器','Blockchain explorer','explorer',''),('钱包 RPC','Wallet RPC','rpc','')]:
  sub(z,e);t(r'\url{'+pub[key].rstrip('/')+suffix+r'}\par')
 para('测试网络Chain ID为20261008，Gas代币为DETH。首次登录时允许添加此网络，并核对当前RPC地址。隧道地址变化时需要更新RPC，但链编号、钱包地址和原链余额不变。127.0.0.1只指向使用者自己的电脑，远程同事不应使用本机端口地址。','The test network Chain ID is 20261008 and its gas token is DETH. Check the current RPC when adding the network. A tunnel change requires a new RPC URL but does not change the chain, accounts or existing balances. The address 127.0.0.1 points to the reader’s own computer and is not a remote access address.')
 para('在业务交易确认后点击交易哈希，即可打开对应的Blockscout页面。也可以将完整交易哈希、钱包地址或合约地址粘贴到浏览器顶部的搜索框。先核对状态、发送者、目标合约和区块，再检查代币转账与事件。登录和协议消息签名属于链下步骤，不会产生交易记录。','Click a confirmed transaction hash to open its Blockscout page. Alternatively, paste a full hash, account or contract into the explorer search field. Check status, sender, target and block, followed by token transfers and events. Login and agreement message signatures are off-chain and do not create transaction records.')
 section('Base Sepolia 独立公链测试','Independent Base Sepolia public-chain testing')
 base_file=ROOT/'docs/manual/base-sepolia.public.json'
 if not base_file.exists():raise RuntimeError('Base Sepolia public configuration is required')
 base_cfg=json.loads(base_file.read_text())
 para('原公网演示继续用于完整生命周期演练。Base Sepolia 是另一个独立环境，用于检验公共链的合约和钱包交易。两者沿用同一组角色地址，但合约、余额和业务记录相互独立。后文的完整生命周期操作图以私链演示为例，公链测试应遵循本节的实际时间和资金限制。','The original public demonstration remains the environment for the full accelerated lifecycle. Base Sepolia is a separate environment for public-chain contracts and wallet transactions. Role addresses are shared, but contracts, balances and workflow records are independent. The complete lifecycle screenshots later in this manual illustrate the private-chain demonstration. Public-chain testing follows the real-time and funding restrictions in this section.')
 sub('独立入口与网络配置','Independent entry and network configuration')
 for z,e,value in [('公链测试应用','Public-chain application',base_cfg['app']+'/app/'),('公链浏览器','Public-chain explorer',base_cfg['explorer']),('钱包 RPC','Wallet RPC',base_cfg['rpc'])]:
  t(esc(L(z,e))+r'\par\url{'+value+r'}\par')
 para('Chain ID 为 84532，Gas 代币为测试 ETH，支付代币为 Circle 测试 USDC。首页的 Launch App 仍然打开原演示。请点击独立的 Base Sepolia 入口，并在钱包中核对网络后登录。','The Chain ID is 84532, gas is paid in test ETH, and payments use Circle test USDC. Launch App still opens the original demonstration. Use the separate Base Sepolia entry and verify the wallet network before signing in.')
 t(r'\nolinkurl{'+base_cfg['usdc']+r'}\par')
 para('上述地址是本环境使用的官方 Circle 测试 USDC，精度为六位。它与私链 mUSDC 不同。测试币没有货币价值，不能将其他链上的余额直接用于本链认购。','The address above identifies the official Circle test USDC used here, with six decimals. It is separate from private-chain mUSDC. Test tokens have no monetary value, and balances on another chain cannot pay for subscriptions here.')
 sub('环境构成与数据流','Environment components and data flow')
 t(r'\begin{center}\begin{tikzpicture}[>=Latex,node distance=1cm,box/.style={draw,align=center,text width=4.5cm,minimum height=1.3cm}]')
 for name,x,y,z,e in [('web',0,0,'GitHub 首页与文档','GitHub homepage and documentation'),('app',6,0,'独立 Mac 业务应用','Independent Mac application'),('wallet',6,-2.5,'Rabby 钱包','Rabby wallet'),('chain',0,-5,'Base Sepolia 公共链','Base Sepolia public chain'),('explorer',6,-5,'公共 Blockscout','Public Blockscout')]:
  t(f'\\node[box] ({name}) at ({x},{y}) {{{esc(L(z,e))}}};')
 for a,b in [('web','app'),('app','wallet'),('wallet','chain'),('app','chain'),('chain','explorer')]:t(f'\\draw[->] ({a})--({b});')
 t(r'\end{tikzpicture}\end{center}')
 para('业务页面通过 HTTPS 连接独立后端。钱包签署交易后将其广播到 Base Sepolia，后端核对回执和事件，公共浏览器随后索引记录。本环境没有部署 Anvil，也不依赖原私链的 RPC 隧道。','The HTTPS application connects to its independent backend. The wallet signs transactions for Base Sepolia, the backend checks receipts and events, and the public explorer indexes the results. This environment does not run Anvil or depend on the private-chain RPC tunnel.')
 sub('资金准备与认购操作','Funding and subscription steps')
 para('请先使用页面的测试资金入口打开官方水龙头，选择 Base Sepolia，并向当前角色地址领取测试 ETH 和 Circle 测试 USDC。领取可能需要服务方登录或受到频率限制。系统本身不能增发 Circle USDC。确认到账后，返回页面并刷新余额。私钥只应输入钱包扩展，不应输入水龙头或业务网站。','Open the official faucets from the test-funds entry, select Base Sepolia and request test ETH and Circle test USDC for the current role address. Providers may require login or limit claims. The application cannot mint Circle USDC. After confirmation, return and refresh the balance. Enter private keys only inside the wallet extension, never in a faucet or the application.')
 t(r'\url{https://portal.cdp.coinbase.com/products/faucet}\par\url{https://faucet.circle.com/}\par')
 para('投资者选择募集中产品并申请资格。中介批准资格后，投资者填写金额，先批准对应 USDC 额度，再确认认购交易。募集开放时可以追加认购，每次追加后中介必须重新审核累计金额。结算前取消认购会退回本人全部累计托管款。认购进入托管并不等于已经取得 DRS。','Select a fundraising product and apply for eligibility. After intermediary approval, enter an amount, approve the corresponding USDC allowance and confirm the subscription transaction. Additional subscriptions are allowed while fundraising remains open, and the intermediary reviews the new accumulated amount. Cancellation before settlement refunds the full accumulated escrow for that address. Escrow does not mean DRS has been issued.')
 para('结算继续要求有效估值、订单审批、募集门槛以及足够的购买款和初始留存。合约会自动留存10%，不需要用户另行转账。少量测试币可以用于检查授权、认购、审核和退款，不能据此声称已经完成需要更多资金的发行结算。','Settlement still requires a current valuation, order approvals, the fundraising threshold and sufficient purchase funding and reserve. The contract automatically retains 10%; no separate reserve transfer is needed. Small test balances support approvals, subscriptions, review and refunds, but do not establish that a larger funded settlement has completed.')
 sub('真实时间与测试范围','Real time and testing scope')
 para('公共链不能由应用提前推进时间。月度缴费需要产品已经结算，并到达对应服务期末。六个月转让锁定、赎回通知期和到期时间也保持不变。页面因此不提供重置和时间推进。完整生命周期演示仍应使用原公网私链环境。','The application cannot advance public-chain time. Monthly billing requires a settled product and the end of the relevant service period. The six-month transfer lock, redemption notice period and expiry remain unchanged. Reset and time-advance controls are therefore unavailable. Use the original public private-chain environment for the complete accelerated lifecycle.')
 para('业主月度缴费使用 Circle 测试 USDC。售电回款仍作为单独披露的经济模拟，其代币必须由独立资金账户预先持有。电站数据使用固定采集时间的真实记录回放，电价和未来现金流继续属于模型假设。本次部署未加入 Oracle，不能把报告上链解释为 API 数据已获得独立验证。','Household monthly payments use Circle test USDC. Grid-export receipts remain a separately disclosed economic simulation, funded from a prefunded independent treasury. Station observations use fixed recorded evidence; tariffs and future cashflows remain modeling assumptions. No oracle is added by this deployment, so anchoring a report does not independently validate API data.')
 t(r'\clearpage')
 sub('交易核对与恢复','Transaction checks and recovery')
 para('交易提交后，请使用其哈希在公共浏览器核对发送者、目标合约、调用方法、事件和 USDC 转移。后端和钱包使用的 RPC 可能在不同时刻查到同一笔交易。遇到等待提示时应保留原哈希，重试原操作的确认，不要再次付款。浏览器索引稍有延迟并不表示交易失败。','After submission, use the hash to check the sender, destination, method, events and USDC transfers in the public explorer. The wallet and backend RPC may see the same transaction at different times. Retain the original hash and retry confirmation rather than paying again. Explorer indexing can lag without a transaction having failed.')
 for key,label in [('station',L('电站凭证合约','Station credential')),('vault',L('收益权资产池','Revenue-rights vault')),('billing',L('月度缴费合约','Monthly billing contract'))]:
  t(esc(label)+r'\par\nolinkurl{'+base_cfg['contracts'][key]+r'}\par')
 for image_name,z,e in [('base-product','独立公链产品与网络信息。编号指向本次测试的产品、认购入口和测试资金入口。','Independent public-chain product and network. Markers identify the product, subscription navigation and test-funds entry.'),('base-wallet','钱包余额与官方水龙头说明。此页面不会通过后台增发 Circle USDC。','Wallet balances and official-faucet instructions. The backend does not mint Circle USDC.')]:
  shot=ROOT/'docs/manual/assets'/(image_name+'.'+lang+'.png')
  if shot.exists():
   landscape();figure(shot,L(z,e),'.90\\textheight');endland()
 section('动态引导与交接','Dynamic guidance and handoffs')
 para('首次进入角色时，业务介绍说明设备、收益权、资金和参与者之间的关系。右侧操作引导显示当前产品、对象、必要条件、处理人和预期结果。可以暂停或收起引导，再从顶部“操作引导”恢复。完成状态来自业务与链上记录，不由“下一步”按钮决定。','The first-entry introduction explains equipment, rights, money and participant responsibilities. The guide panel identifies the product, object, prerequisites, handler and expected result. Pause or collapse it and reopen Operation guide from the top bar. Completion comes from business and chain state rather than a Next button.')
 para('参与者模式关注本人任务及交接等待。四角色演示模式可查看其他角色的待办，并打开角色登录入口，但仍需要切换到对应钱包并重新签名。它不是代签模式，也不会让投资者钱包获得中介权限。','Participant mode focuses on the connected participant’s tasks and handoffs. Four-role demonstration mode can inspect other roles’ tasks and open their login entry. The correct wallet and a new signature are still required. It does not sign on behalf of another role or grant intermediary authority to an investor.')
 para('每次点击“定位操作”都会进入相关页面并指向按钮、字段或阻塞条件。条件不足时，弹窗应提供具体处理入口。需要他人审批时切换到所示角色，需要补齐估值时进入报告编制，需要未来日期时由中介确认受控时间推进。只读查看不会被描述为不能执行的付款。','Locate operation opens the relevant page and identifies a control, field or prerequisite. If a condition is missing, use the specific remedy shown. Switch to the named reviewer, prepare the missing report or let the intermediary confirm the controlled time advancement. A read-only inspection is not presented as a blocked payment.')
 para('月度流程中，受托尚未批准本期估值时，应先完成审批。中介宣告新分配且存在实际可领取金额后，引导才交接到投资者。已经领取完的旧分配不会继续占据当前任务。投资者可以核对历史已领取金额与本期未宣告状态，并分别查看剩余净值。','In the monthly cycle, a pending trustee approval must be completed first. The guide hands off to investors only after a new declaration creates an actual claimable amount. Fully paid earlier distributions do not remain the current task. Investors can distinguish historical payments, an undeclared current period and remaining NAV.')
 intro_path=D/'assets'/('guide-overview.'+lang+'.png')
 if not intro_path.exists():intro_path=legacy/('guide-overview.'+lang+'.png')
 if intro_path.exists():
  t(r'\clearpage');sub('业务介绍与任务入口','Product overview and task entry');figure(intro_path,L('阅读后可开始当前任务，也可选择稍后了解。引导不会替参与者签名。','Read the overview and start the current task, or choose Later. The guide does not sign for a participant.'),'.62\\textheight')
 groups={'A':('应用入口','Application entry'),'B':('申请、估值与协议','Application, valuation and agreement'),'C':('凭证、入池与发行','Credentials, admission and publication'),'D':('资格、认购与结算','Qualification, subscriptions and settlement'),'E':('月度回款、估值与分配','Monthly collections, valuation and distributions'),'F':('份额转让与季度赎回','Peer transfers and quarterly redemption'),'G':('服务事件与受托处置','Servicing cases and trustee intervention'),'H':('到期关闭与凭证返还','Expiry, closure and credential release')};last=None
 for s in steps:
  code,title,actor,where,op,result,nextrole,image,*notes=s
  new_group=code[0]!=last;last=code[0]
  landscape()
  if new_group:t(r'\section{'+esc(L(*groups[code[0]]))+'}')
  sub(code+' '+title,code+' '+en[code][0]);para('本步由'+actor+'操作。进入'+where+'后，'+op,'This step is performed by '+en[code][1]+'. '+en[code][2]);para('操作成功后，'+result+'下一步，'+nextrole+'。','After this step, '+en[code][3][0].lower()+en[code][3][1:])
  if notes and lang=='zh':para(notes[0],'')
  matches=[c for c in captures if c['action']==map_action.get(code)and c['language']==lang]
  if code.startswith('E'):matches=[c for c in matches if c['scope']=='month1']
  else:matches=[c for c in matches if c['scope']=='issuance']
  if matches:
   name=matches[0]['id']+'.'+lang+'.png';path=D/'assets'/name
   if not path.exists():path=legacy/name
   caption=L('编号1标出本步需要核对或提交的控件。','Marker 1 identifies the control to inspect or submit for this step.')
  else:path=legacy/(image+'.png');caption=L('编号标出操作位置。插图来自隔离演练，金额和状态以当前产品为准。','Numbered controls identify the action. This isolated-test illustration may show earlier Chinese labels. Use the current product amounts and status.')
  if lang=='en' and english_shots:
   if code not in english_shots:raise RuntimeError('Missing English screenshot for '+code)
   path=english_manifest.parent/'assets'/english_shots[code]['file']
   caption='Marker 1 identifies the control or information to inspect for this step. Amounts and dates refer to the isolated demonstration.'
  if lang=='zh' and code in zh_shots:
   path=zh_manifest.parent/'assets'/zh_shots[code]['file'];caption='编号1标出本期需要核对或签署的操作。截图来自隔离测试，金额和日期以当前产品为准。'
  hall=D/'assets'/('remote-hall.'+lang+'.png')
  if not hall.exists():hall=legacy/('remote-hall.'+lang+'.png')
  if code=='D1' and hall.exists() and not (lang=='en' and english_shots):
   path=hall;caption=L('当前公网产品大厅。选定产品后，点击卡片右下角的认购入口。','Current public product hall. Select the product and use Subscribe at the lower right of its card.')
  context=path.with_name(path.stem+'-context.png');detail=path.with_name(path.stem+'-detail.png')
  if context.exists() and detail.exists() and not (lang=='en' and code in ['A1','A2','B8','D2']):
   figure(context,caption,('.44\\textheight' if new_group else '.56\\textheight') if lang=='en' else '.37\\textheight');target=D/'assets'/detail.name
   if detail.resolve()!=target.resolve():shutil.copy2(detail,target)
   assets.append(target.name);t(r'\begin{center}\includegraphics[width=.7\linewidth,height=1.55cm,keepaspectratio]{assets/'+target.name+r'}\end{center}')
  else:figure(path,caption,'.68\\textheight' if lang=='en' and code in ['B8','D2'] else '.60\\textheight')
  endland()
 section('现金流计算与估值','Cashflow calculations and valuation')
 para('预测按最多36个月可用历史数据形成同月季节性基线，再按退化、可用率、上网行为和电价日程逐期调整。没有12个完整月时，报告明确标记为暂定估算，需要审核人说明原因。发电和上网不平衡的样本需要核查，不能简单把上网比例截为100%后当作正常自用量。','The forecast uses up to 36 available historical months to form calendar-month seasonal baselines, then applies degradation, availability, export behavior and tariff schedules. Fewer than 12 complete months requires a labeled provisional estimate and review. Imbalanced generation and export samples require investigation rather than silently capping export at 100% and treating the result as valid self-use.')
 t(r'\[S_t=\max(G_t-E_t,0)\,q_t,\qquad B_t=S_t\,p^{grid}_t\,d_t.\]')
 para('G表示预测发电量，E表示经核验的合资格售电量，q表示自用交付系数。S是可交付自用电量，B是业主按折扣比例d支付的电费。直接从电网购买这部分电量的比较费用为S乘电网价，优惠额为该比较费用减业主付款。这里只比较交付的光伏电量，不声称业主全部电网账单都会降低相同比例。','G denotes forecast generation, E is validated eligible export and q is the self-use delivery factor. S is delivered self-use and B is the owner’s electricity payment at discount factor d. The grid-price comparison is S times the grid tariff. The difference is the saving on this delivered solar energy, not a claim that the owner’s entire grid bill falls by the same percentage.')
 t(r'\[C_t=(B_t+E_t p^{export}_t-K_t)\,f_t\,a_t,\qquad V_0=\sum_{t=1}^{60}\frac{\widehat C_t}{(1+r)^{\tau_t/12}}.\]')
 para('K表示约定由收益权承担的站点成本，f为本币换USDC的演示汇率，a为签署协议的归集比例。新协议默认归集100%，业主通过优惠电价保留利益。现金流按预计实际收款日期贴现，τ包含回款延迟。默认10%名义年折现率是定价假设，不是承诺收益，报告同时比较6%和14%。','K represents agreed station costs borne by the rights, f is the demo FX conversion into USDC and a is the signed assignment proportion. New agreements default to 100% assignment, with the owner retaining a benefit through the discounted tariff. Discounting uses expected cash-collection dates, so tau includes receipt delays. The default 10% nominal annual discount rate is a pricing assumption, not a promised return, and 6% and 14% sensitivities are also shown.')
 landscape();sub('前三期业主现金流时间轴','Owner cashflow timeline for the first three periods');rows=example['applications'][0]['offer']['rows'][:3]
 t(r'\begin{center}\begin{tikzpicture}[>=Latex]\draw[->](0,0)--(22,0);')
 for i in range(3):t(f'\\fill({3+i*7},0)circle(2pt);\\node[above]at({3+i*7},.2){{'+L('第'+str(i+1)+'期','Period '+str(i+1))+r'};')
 t(r'\end{tikzpicture}\end{center}\begin{center}\begin{tabular}{L{10cm}rrr}\toprule '+L('计算项目 & 第1期 & 第2期 & 第3期','Calculation & Period 1 & Period 2 & Period 3')+r'\\\midrule')
 fields=[('发电量 kWh','Generation kWh',lambda r:r['generationKWh']),('售电量 kWh','Export kWh',lambda r:r['exportKWh']),('交付自用量 kWh','Delivered self-use kWh',lambda r:r['billing']['selfUseKWh']),('直接电网比较费用 CNY','Grid-price comparison CNY',lambda r:r['billing']['avoidedGridCostLocal']),('业主优惠电费 CNY','Owner electricity payment CNY',lambda r:r['billing']['householdPaymentLocal']),('业主优惠额 CNY','Owner saving CNY',lambda r:r['billing']['householdSavingLocal']),('售电收入 CNY','Export income CNY',lambda r:r['billing']['exportRevenueLocal']),('站点成本 CNY','Station costs CNY',lambda r:r['costsLocal']),('归集净应收 USDC','Assigned net receivable USDC',lambda r:int(r['assignedUSDC6'])/1e6),('折现现值 USDC','Discounted present value USDC',lambda r:int(r['presentValueUSDC6'])/1e6)]
 for z,e,get in fields:t(esc(L(z,e))+' & '+' & '.join(f'{get(r):,.2f}'for r in rows)+r'\\')
 t(r'\bottomrule\end{tabular}\end{center}');para('表中数值来自隔离产品的同一份估值报告，属于模型示例。完整报告覆盖60期，每期先分别计算业主电费、售电收入和成本，再按收款时间贴现求和。','These values come from one isolated product report and are modeled examples. The full report covers 60 periods. Owner bills, export income and costs are calculated separately and discounted at their expected collection times.');endland()
 landscape();sub('投资者前三个月现金流时间轴','Investor cashflow timeline for the first three months');periods=example['poolProjection']['periods'][:3];target=int(example['chain']['target']);scale=1000*1e6/target
 t(r'\begin{center}\begin{tikzpicture}[>=Latex]\draw[->](0,0)--(22,0);')
 for i in range(4):t(f'\\fill({1+i*6.5},0)circle(2pt);\\node[above]at({1+i*6.5},.2){{'+L(['第0期投入','第1月','第2月','第3月'][i],['Initial investment','Month 1','Month 2','Month 3'][i])+r'};')
 t(r'\end{tikzpicture}\end{center}\begin{center}\begin{tabular}{L{11cm}rrr}\toprule '+L('计算项目 & 第1月 & 第2月 & 第3月','Calculation & Month 1 & Month 2 & Month 3')+r'\\\midrule')
 for z,e,field in [('预计收到现金 USDC','Forecast cash collected USDC','receiptsUSDC6'),('计提年费部分 USDC','Accrued annual-fee portion USDC','feeUSDC6'),('必需月度池成本 USDC','Mandatory monthly pool costs USDC','mandatoryCostUSDC6'),('全池分配 USDC','Pool distribution USDC','payoutUSDC6'),('分配后池现金 USDC','Pool cash after distribution USDC','endingCashUSDC6')]:t(esc(L(z,e))+' & '+' & '.join(f'{int(r[field])/1e6:,.2f}'for r in periods)+r'\\')
 t(esc(L('每投入1,000 USDC预计回款','Forecast payout per 1,000 USDC'))+' & '+' & '.join(f'{int(r["payoutUSDC6"])/1e6*scale:,.2f}'for r in periods)+r'\\\bottomrule\end{tabular}\end{center}')
 para('初始认购款的10%自动留在资金池，其余用于购买收益权。每个月在回款、费用与估值条件满足后宣告分配，并不表示每个月保证产生正分配。投资者还需要亲自领取。月度分配不改变六个月转让锁定和季度赎回窗口。','The vault automatically retains 10% of initial subscription cash and uses the balance to purchase rights. Monthly declarations require the relevant collections, expenses and valuation conditions and do not guarantee a positive payout each month. Investors must still claim. Monthly distribution does not remove the six-month transfer lock or change quarterly redemption windows.');
 para('投资者净值由现金、可收回应收款和剩余收益权价值构成，再扣除负债及相应未来费用。已宣告分配单列，不能再作为可交易净值重复计算。年化净收益用初始投入、预计各次分配和到期剩余现金计算IRR。应同时看已领取现金、剩余NAV和总回报。','Investor NAV consists of cash, collectible receivables and remaining rights, less liabilities and applicable future costs. Declared distributions are separated from dealing NAV to prevent double counting. Projected net IRR uses the initial investment, expected distributions and final cash. Assess paid cash, remaining NAV and total return together.');endland()
 section('链上记录核对','On-chain record reconciliation')
 para('月度账单应分别核对BillPublished、HouseholdPaid、ExportFunded和ReceiptConfirmed。业主付款的发送者必须是本期业主，目标必须是该产品账单合约，金额必须等于账单应付值。确认入池交易由中介签署，并核对转给资产池的净额和一次性站点费用。已付款但未确认的资金仍在账单合约中，不能与资产池现金重复计算。','For each monthly invoice, reconcile BillPublished, HouseholdPaid, ExportFunded and ReceiptConfirmed separately. Household payment must come from the named owner to the product billing contract for the invoiced amount. The intermediary signs receipt confirmation. Check net proceeds into the vault and station costs paid once. Paid but unconfirmed amounts remain in the billing contract, separate from vault cash.')
 para('NFT铸造应核对站点Token ID和业主地址。授权应核对被授权Vault，入池应核对托管地址、协议摘要和购买价。估值审批应核对报告摘要、审批人和有效期。认购与结算应分别核对USDC转移、托管累计金额、发行DRS、业主收款和池内留存。','For NFT minting, check the station token ID and owner. For approval, check the authorized vault. For admission, check custody, agreement digest and purchase price. For valuation, check report digest, reviewer and validity. Distinguish subscription transfers from settlement, and reconcile cumulative escrow, issued DRS, owner payment and retained cash.')
 figure((english_manifest.parent/'assets'/'explorer-transaction.en.png') if lang=='en' and english_shots else legacy/'50-blockscout-transaction.png',L('区块链浏览器交易详情示例。核对执行状态、发送者、目标合约和区块。','Explorer transaction example. Check execution status, sender, target contract and block.'),'.4\\textheight')
 t(r'\clearpage');para('分配宣告与领取是不同交易。前者形成持有人的领取权，后者把USDC转给指定投资者。转让应在同一回执核对DRS与USDC两条转移。赎回应核对实际成交份额、付款、销毁和剩余托管量。服务事件应核对快照、支持权重及两名独立审批地址。','Declaration and claim are different transactions. Declaration creates an entitlement, while claiming transfers USDC to the investor. A peer settlement should contain both the DRS and USDC legs. A redemption should reconcile the fill, payment, burn and remaining escrow. A servicing case should show its snapshot, support weight and two distinct approval addresses.')
 figure((english_manifest.parent/'assets'/'explorer-events.en.png') if lang=='en' and english_shots else legacy/'51-blockscout-events.png',L('事件与代币记录示例。摘要只证明与链下资料的对应关系，不表示原始资料全部保存在链上。','Events and token-record example. A digest links the off-chain record without storing the full underlying material on-chain.'),'.42\\textheight')
 section('故障处理与测试边界','Troubleshooting and test boundaries')
 for z,e,zp,ep in [
 ('钱包或角色不匹配','Wallet or role mismatch','核对完整地址、链编号和当前角色。先在钱包切换账户，再重新选择角色并签名。不要通过反复点击角色按钮尝试获取权限。','Check the full address, Chain ID and selected role. Switch the wallet account and sign in again with the intended role. Repeated role-button clicks do not grant permissions.'),
 ('募集资金不足','Insufficient settlement funding','10%是合约自动留存的初始现金。最低募集额通常需要覆盖购买价除以90%的结果。按页面差额追加认购，再由中介重新审核，不能手动改账本绕过。','The contract automatically retains 10% as initial cash. Minimum funding typically covers the purchase price divided by 90%. Add the displayed shortfall and have the intermediary review the new total rather than editing accounting records.'),
 ('估值或计费条件不足','Missing valuation or fee prerequisites','点击定位操作进入缺失条件的具体入口。报告过期或输入变化时由中介重新编制，再由受托批准。达到日期并不会自动满足净值审批。','Use Locate operation to open the specific remedy. The intermediary reprepares an expired or changed report and the trustee approves it. Reaching the cutoff does not itself approve NAV.'),
 ('分配与余额未更新','Distribution or balance not updated','先确认是否已宣告本期分配，再检查本人可领取金额和历史已领取金额。USDC钱包余额、托管订单和投资净值分开显示。链上已确认但索引尚未完成时，保留哈希并稍后刷新。','Check whether the current period was declared, then distinguish claimable amounts from paid history. Wallet USDC, escrow and investment NAV are separate. If confirmation precedes indexing, retain the hash and refresh later.'),
 ('拒签、等待与恢复','Rejection, pending transactions and recovery','钱包拒签后可修改原操作并重试。已有交易哈希时先查询回执，不要再次支付。页面刷新和后台重启后应恢复原操作。测试链完全重建后，演示负责人需通知用户清理该测试网络的旧交易缓存。','After rejection, review and retry the original action. If a hash exists, inspect its receipt before sending another payment. Refresh and backend restart should recover the original operation. A complete test-chain rebuild requires the operator to notify users about clearing stale test-network transaction caches.'),
 ('远程入口不可用','Remote environment unavailable','GitHub静态首页仍可阅读，但业务、RPC和Blockscout依赖Mac、Docker及隧道运行。负责人使用remote:status检查，使用remote:start更新失效入口，再使用remote:publish更新公开配置。','The GitHub homepage remains readable, but the app, RPC and Blockscout depend on the Mac, Docker and tunnels. The operator checks remote:status, uses remote:start to replace failed endpoints and remote:publish to refresh the public configuration.')]:sub(z,e);para(zp,ep)
 t(r'\end{document}');source=''.join(parts);(D/('manual.'+lang+'.tex')).write_text(source);(D/('manual.'+lang+'.tex')).chmod(0o600)
 (D/('manifest.'+lang+'.json')).write_text(json.dumps({'date':'2026-10-29','language':lang,'internalTestKeys':bool(keys),'assets':sorted(set(assets)),'sourceSha256':hashlib.sha256(source.encode()).hexdigest()},indent=2))
print('Generated requested LaTeX manual(s). Private account values omitted from output.')
