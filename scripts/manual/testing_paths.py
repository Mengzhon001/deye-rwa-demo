"""Paired test-path instructions, grounded in the repository's actual profiles."""


def write_overview(t, L, para, section, sub, esc):
    section('测试方式与适用范围', 'Testing approaches and their purposes')
    para('本系统提供三种使用方式，分别是通过统一网站访问共享私有演示链、访问 Base Sepolia 公链测试环境，以及在自己的电脑上部署独立本地实例。选择方式时应先确定测试目的，而不是仅根据网页能否打开判断环境是否相同。私有链用于在可控时间内验证完整业务，Base Sepolia 用于验证真实公链条件下的合约和钱包交互，并为后续 Oracle 集成建立基线；本地部署用于开发调试、独立复现和回归测试。',
         'There are three ways to use the system: the shared private demonstration, the Base Sepolia public-chain environment, and an independent deployment on your own computer. Select an approach according to the test objective rather than assuming that similar pages share the same environment. The private chain supports the complete business lifecycle under a controlled clock. Base Sepolia validates contracts and wallets under public-chain conditions and establishes a baseline for later oracle integration. A local deployment supports development, independent reproduction and regression testing.')
    para('本地部署是一种部署方式，并不是第三条公共区块链。本手册的默认本地方案会创建自己的 Anvil 私有链。共享私链和新建本地链虽然运行相同业务逻辑，但使用不同的链编号、合约、账户配置和存储。相反，在本机打开一个连接 Base Sepolia 的后端，仍然属于公链测试，不能因此使用时间推进或重置功能。',
         'Local deployment is a hosting approach, not a third public blockchain. The default local profile creates its own private Anvil chain. The shared private chain and a new local chain run the same business logic but have different Chain IDs, contracts, account configuration and storage. Conversely, a backend running on your computer but connected to Base Sepolia is still a public-chain test and cannot advance or reset that chain.')
    t(r'\begin{longtable}{L{2.5cm}L{4.2cm}L{4.5cm}L{3cm}}\toprule ' + L('测试方式 & 主要目的 & 建议验证内容 & 时间与资金', 'Approach & Main purpose & Recommended checks & Time and funding') + r'\\\midrule\endhead')
    rows = [
        ('共享私有演示链', 'Shared private demo', '完整生命周期演示及多角色业务验收。', 'Complete lifecycle demonstrations and multi-role business acceptance.', '申请、发行、月度缴费、分配、转让、赎回、处置和关闭。', 'Applications, issuance, monthly payments, distributions, transfers, redemptions, servicing and closure.', '20261008；测试 mUSDC；中介可推进演示时间。', '20261008; test mUSDC; intermediary-controlled demo time.'),
        ('Base Sepolia', 'Base Sepolia', '验证公共链兼容性，并为后续 Oracle 接入准备基线。', 'Public-chain compatibility and a baseline for later oracle integration.', '钱包、Gas、Circle USDC、授权、认购、退款、回执和恢复。', 'Wallets, gas, Circle USDC, approvals, subscriptions, refunds, receipts and recovery.', '84532；测试 ETH 与 USDC；使用真实链上时间。', '84532; test ETH and USDC; real chain time.'),
        ('独立本地部署', 'Independent local deployment', '修改代码、复现问题并执行可重复的独立回归。', 'Code changes, issue reproduction and repeatable isolated regression.', '从空白场景建立产品，并验证页面、模型、权限和业务流程。', 'Build a product from an empty scene and check the UI, model, permissions and workflow.', '默认20260922；独立测试钱包和本地测试币。', 'Default 20260922; independent wallets and local test tokens.'),
    ]
    for row in rows:
        t(' & '.join(esc(L(row[i], row[i+1])) for i in range(0, 8, 2)) + r'\\\addlinespace')
    t(r'\bottomrule\end{longtable}')
    para('共享私链与 Base Sepolia 沿用同一组业务角色地址，但一个地址在两条链上的余额、资格和持仓互不相通。新同事自行部署时，初始化工具默认生成另一组本地账户，不能直接用手册中共享环境的地址代替。每次开始测试都应记录链编号、钱包地址、产品合约和测试起始状态。',
         'The shared private chain and Base Sepolia reuse the business-role addresses, but balances, eligibility and holdings remain independent on each chain. A colleague initializing a fresh deployment receives another set of local accounts and must not substitute the shared-environment addresses. Record the Chain ID, wallet address, product contract and starting state for every test.')
    t(r'\clearpage')
    sub('测试路径选择图', 'Selecting a test path')
    t(r'\begin{center}\begin{tikzpicture}[>=Latex,box/.style={draw,align=center,text width=4.1cm,minimum height=1.5cm,inner sep=5pt}]')
    t(r'\node[box] (goal) at (5,0) {' + L('确认测试目标', 'Identify the test objective') + '};')
    for name, x, zh, en, out_zh, out_en in [
        ('private', 0, '完整业务与角色交接', 'Full lifecycle and handoffs', '共享私链与后文 A 至 H 操作图', 'Shared private chain and illustrated steps A to H'),
        ('base', 5, '真实公链与后续 Oracle 准备', 'Public-chain tests and future oracle preparation', 'Base Sepolia 小额交易与链上核对', 'Small Base Sepolia transactions and reconciliation'),
        ('local', 10, '开发、复现与独立回归', 'Development, reproduction and isolated regression', '本地 Docker、独立链与测试钱包', 'Local Docker, independent chain and test wallets'),
    ]:
        t(f'\\node[box] ({name}) at ({x},-2.8) {{{esc(L(zh,en))}}};')
        t(f'\\node[box] ({name}out) at ({x},-5.6) {{{esc(L(out_zh,out_en))}}};')
        t(f'\\draw[->] (goal.south)--({name}.north);\\draw[->] ({name}.south)--({name}out.north);')
    t(r'\end{tikzpicture}\end{center}')
    para('第一次了解产品或检查角色交接的读者，可以从共享私有链开始。需要修改代码或从零发行产品时，应使用自己的本地实例。只有在验证公共链行为或准备后续 Oracle 集成时，才需要在 Base Sepolia 上准备真实的测试 ETH 和 Circle 测试 USDC。以下章节分别说明三条路径，后面的完整操作图供私链与本地环境按当前状态使用。',
         'Readers learning the product or checking role handoffs can start with the shared private chain. Use your own local instance for code changes or an issuance from an empty scene. Prepare Base Sepolia test ETH and Circle test USDC when checking public-chain behavior or preparing the later oracle integration. Separate chapters explain each path; the subsequent full workflow illustrations apply to private and local environments according to their current state.')


def write_private(t, L, para, section, sub, esc, pub):
    section('私有演示链全流程测试', 'Full lifecycle testing on the private demonstration')
    sub('测试目的与准备条件', 'Purpose and prerequisites')
    para('共享私有演示链的目标是检查收益权业务能否在各角色之间完整流转。它使用 Anvil、演示 mUSDC 和独立的 Blockscout，允许中介在权限范围内推进财务时间，因此可以演练月度运营、六个月锁定、季度赎回和到期关闭，而不必等待真实日历走完。时间推进不会生成新的电站遥测，也不能代替实际的账单、缴费、审核和分配交易。',
         'The shared private demonstration checks the complete handoff of the revenue-rights business between roles. It uses Anvil, demo mUSDC and its own Blockscout. Authorized intermediary time advancement allows monthly operations, the six-month lock, quarterly redemption and expiry to be exercised without waiting through the real calendar. Advancing time creates no station telemetry and does not replace invoices, payments, approvals or distribution transactions.')
    para('开始前，请取得负责人提供的角色测试账户，并与其他测试者确认使用哪个产品。完整演练需要业主、中介、投资者 A/B 和受托人 A/B。只测试投资者路径时，可以使用已经发布且仍在募集的预置产品，不必再次完成业主申请和发行准备。如果产品已经存续，不能再按首次募集方式继续认购，应选择另一个募集中产品，或由负责人准备新的测试场景。',
         'Obtain the role test accounts from the operator and agree which product the group will use. A full walkthrough requires an owner, intermediary, investors A/B and trustees A/B. An investor-only check can use a prepared product that is published and still fundraising, without repeating the application and issuance preparation. If the product is already active, primary fundraising subscriptions are closed; select another fundraising product or ask the operator to prepare a new scene.')
    sub('进入环境与确认网络', 'Entry and network confirmation')
    t(r'\url{' + pub['app'].rstrip('/') + r'/app/}\par')
    para('从公开首页点击 Launch App，并在右上角选择“私有演示链”。在 Rabby 中核对 Chain ID 为20261008，然后选择角色并签名登录。登录后检查产品名称和资产池地址；钱包余额、托管订单和已发行 DRS 必须分别查看。领取测试资金只增加钱包内的测试余额，不会自动形成认购订单。',
         'Click Launch App on the public homepage and select Private demo in the upper-right network menu. Verify Chain ID 20261008 in Rabby, select the intended role and sign in. Check the product name and vault address. Wallet funds, escrowed orders and issued DRS are separate records. Claiming demo funds increases the wallet balance but does not submit a subscription.')
    sub('投资者直接测试路径', 'Direct investor testing')
    para('投资者在产品大厅选择一个募集中产品，查看现金流时间轴和风险说明，并在“投资资格”提交声明。中介批准资格后，投资者领取测试资金，填写不超过剩余额度的认购金额，先完成 mUSDC 授权，再确认认购交易。中介随后审核当前累计订单。募集仍开放且额度允许时，投资者可以继续追加，每次追加后都需要重新审核。',
         'Choose a fundraising product, inspect its cashflow timeline and risks, and submit the eligibility declarations. After intermediary approval, obtain demo funds, enter an amount within the remaining capacity, approve mUSDC and confirm the subscription transaction. The intermediary reviews the current cumulative order. Additional subscriptions are allowed while fundraising and capacity permit, and each addition requires another review.')
    para('要检查退款，可以在结算前由原投资者取消认购并领取全部累计托管款。要继续检查持仓和分配，应补足页面列明的结算资金差额，再由中介重新审核并完成结算。合约会自动留存约定的10%现金，不存在单独的“留存”转账步骤。没有完成统一结算时，不能把托管金额解释为已经发行的份额。',
         'To check refunds, the original investor can cancel before settlement and recover the entire cumulative escrow. To continue to holdings and distributions, cover the displayed settlement shortfall and have the intermediary review and settle. The contract retains the agreed 10% cash automatically; there is no separate reserve-transfer step. Until settlement completes, escrow must not be treated as issued shares.')
    t(r'\clearpage')
    sub('完整生命周期与截图索引', 'Lifecycle and illustrated-step index')
    para('下表按业务状态组织完整演练。每一阶段都必须确认页面结果与链上记录一致，再交接给下一角色。表中的编号与后文的标注截图对应，点击编号可以跳转到具体操作。已有预置产品的投资者测试从 D 组开始；空白场景则从 B 组开始。',
         'The table organizes the full walkthrough by business state. Confirm both the page result and corresponding chain record before handing off to the next role. The identifiers link to the annotated illustrations later in the manual. Investor testing on a prepared product starts with group D, while an empty scene starts with group B.')
    t(r'\begin{longtable}{L{2.8cm}L{4.6cm}L{5.1cm}L{1.7cm}}\toprule ' + L('业务阶段 & 当前处理人与操作 & 应确认的结果 & 操作图', 'Stage & Participant and action & Result to confirm & Figures') + r'\\\midrule\endhead')
    rows = [
        ('申请与协议', 'Application and agreement', '业主申请，中介审核报价，受托审批，业主接受并签署。', 'Owner applies; intermediary reviews and prices; trustee approves; owner accepts and signs.', '协议、估值与电站证据相互对应。', 'Agreement, valuation and station evidence match.', 'B3', 'B10'),
        ('入池与发布', 'Admission and publication', '中介铸造凭证，业主授权，中介入池并编制估值，受托批准后发布。', 'Intermediary mints; owner authorizes; intermediary admits and prepares NAV; trustee approves before publication.', '产品进入募集，凭证托管和发行条款可核对。', 'Fundraising opens with reconciled custody and issuance terms.', 'C1', 'C6'),
        ('认购与结算', 'Subscription and settlement', '投资者申请资格、授权认购，中介审核并结算。', 'Investors obtain eligibility and subscribe; intermediary reviews and settles.', '托管款用于购买收益权并自动留存，投资者取得 DRS。', 'Escrow pays for rights, cash is retained and investors receive DRS.', 'D3', 'D8'),
        ('月度运营', 'Monthly servicing', '中介发布账单，业主缴费，中介核对售电及入池，受托批准估值。', 'Intermediary bills; owner pays; intermediary reconciles export and receipts; trustee approves NAV.', '两类回款、费用与批准净值分别有记录。', 'Both receipt sources, expenses and approved NAV are recorded separately.', 'E1', 'E5'),
        ('宣告与领取', 'Declaration and claim', '中介宣告月度分配，投资者切换本人钱包领取。', 'Intermediary declares the monthly distribution; investors switch to their own wallets and claim.', '已宣告、可领取与已领取金额可与 USDC 转账核对。', 'Declared, claimable and paid amounts reconcile with USDC transfers.', 'E6', 'E7'),
        ('转让与赎回', 'Transfer and redemption', '满足锁定和通知条件后，由相关双方与中介处理。', 'Participants and intermediary act after lock and notice conditions are met.', '份额、付款、部分成交和剩余申请相互一致。', 'Shares, payments, partial fills and remaining requests agree.', 'F1', 'F1'),
        ('处置与关闭', 'Servicing and closure', '按条件取得快照支持与两名受托批准，并完成到期清理。', 'Obtain snapshot support and two trustee approvals where required, then reconcile expiry.', '应收款与负债结清，最终分配及凭证返还完成。', 'Receivables and liabilities are reconciled, with final distribution and credential release.', 'G1', 'H1'),
    ]
    for row in rows:
        text = ' & '.join(esc(L(row[i],row[i+1])) for i in range(0,6,2))
        refs = r'\hyperref[step:' + row[6] + ']{' + row[6] + '}'
        if row[7] != row[6]: refs += r' / \hyperref[step:' + row[7] + ']{' + row[7] + '}'
        t(text + ' & ' + refs + r'\\\addlinespace')
    t(r'\bottomrule\end{longtable}')
    sub('时间推进、共享状态与验收记录', 'Clock advancement, shared state and evidence')
    para('到达等待日期时，由中介进入“产品运营”，展开“演示工具·财务时间推进”，选择下个月度计费截止日并确认。支持该捷径的引导弹窗也可以定位到同一操作。存续期间应逐月完成账单、回款、费用及估值审批后，再推进下一个月；不能通过一次跳过多个月份把未完成账务变成已完成。',
         'When waiting for a cutoff, the intermediary opens Product operations, expands Demo tools: financial time, selects the next monthly fee cutoff and confirms. Where supported, the guide locates the same shortcut. Complete each month\'s billing, receipts, expenses and valuation approval before moving to the next month. Skipping dates does not complete the missing accounting.')
    para('共享环境中的多个产品使用同一条链的时间。推进时间可能使其他产品的募集或估值过期，因此应由同一名负责人协调。重置与重新准备预置产品也应由负责人统一执行。测试记录至少保留产品地址、角色地址、关键交易哈希、业务编号以及预期和实际结果；链下审批不应被登记成链上交易。',
         'Products in the shared environment use the same chain clock. Advancing it can expire another product\'s fundraising or valuation, so coordinate through one operator. The operator should also control resets and preparation of new sample products. Record the product and role addresses, key hashes, business identifiers, expected outcomes and actual results. Do not record off-chain review as an on-chain transaction.')


def write_base_purpose(para, sub):
    sub('测试目标与后续 Oracle 接入', 'Test objectives and later oracle integration')
    para('Base Sepolia 用于验证同一业务代码在真实公共链上能否正确完成钱包签名、Gas 支付、Circle USDC 授权与转账、合约调用、事件读取和中断恢复。它也是后续 Oracle 集成的测试基础，便于在同一条公共测试链上验证报告接收合约、报告摘要、账期绑定、权限与错误处理，而不影响私链的完整演示。',
         'Base Sepolia checks whether the business code handles wallet signatures, gas, Circle USDC approvals and transfers, contract calls, event reads and recovery on a real public chain. It also provides the foundation for later oracle integration, where report receivers, report digests, billing-period binding, permissions and failure handling can be tested on the same public test chain without disturbing the private-chain demonstration.')
    para('当前部署尚未接入 Oracle。现阶段能够验证的是公共链交易和现有报告流程，不能据此认定电站数据已获得独立 Oracle 认证。后续实施时，需要按 Oracle 方案增加链下取数与核验、报告签名或认证、链上接收与强制校验，并重新部署和测试受影响的组件。Oracle 认证本身也不能证明业主已经付款，USDC 到账仍须通过独立交易核对。',
         'The current deployment has no oracle integration. Present tests validate public-chain transactions and the existing report workflow; they do not establish independent oracle certification of station data. The later implementation must add off-chain retrieval and validation, report signatures or attestations, and on-chain receipt and enforcement, followed by deployment and testing of the affected components. An oracle attestation does not itself prove household payment; USDC receipts still require separate transaction reconciliation.')


def write_base_checks(t, L, para, sub):
    sub('公链测试步骤与完成标准', 'Public-chain checks and completion criteria')
    para('建议先用一个投资者账户完成登录、资格、USDC 授权、小额认购及退款，再由中介和受托分别验证自己的权限。每笔交易先确认所在网络与余额，再在公共浏览器核对回执、事件及代币转移。募集开放时可以追加认购，并检查中介是否需要重新审核最新累计金额。对于已经提交但读取较慢的交易，应保留原哈希并重试确认，而不是重新支付。',
         'Start with one investor account and test sign-in, eligibility, USDC approval, a small subscription and its refund. Then check the intermediary and trustee permissions using their own accounts. Verify the network and balance before each transaction, and reconcile its receipt, events and token transfers in the public explorer. While fundraising is open, add a subscription and check that the intermediary reviews the latest cumulative amount. Retain and reconfirm the original hash when a submitted transaction is slow to appear rather than paying again.')
    para('这一轮的完成标准是实际交易金额与业务记录一致、错误钱包与网络被正确拦截、刷新或重启后可以恢复原记录。若没有达到足额结算或真实月度截止日，应将结算、缴费和分配记录为“本轮未执行”，并说明原因。少量测试币和短时间观察不等于已经完成生命周期验收；完整路径应转到私有演示链或自己的本地实例。',
         'This round is complete when actual transaction amounts agree with business records, wrong wallets and networks are rejected, and records recover after refresh or restart. If settlement funding or the real monthly cutoff has not been reached, record settlement, billing and distribution as not executed in this round and explain why. Small test balances and a short observation window do not amount to lifecycle acceptance; use the private demonstration or your own local instance for that path.')


def write_local(t, L, para, section, sub, esc):
    section('本地部署与独立测试', 'Local deployment and independent testing')
    sub('部署目的与默认环境', 'Purpose and default environment')
    para('本地部署供开发人员在自己的电脑上复现问题、修改模型和合约、验证界面，并从空白场景反复演练。它不需要公网隧道，也不依赖演示负责人的 Mac 持续在线。以下命令针对从公开仓库新克隆的独立目录，不应在已经承载共享演示的工作目录中直接执行。',
         'A local deployment lets developers reproduce issues, change the model and contracts, validate the interface and repeat a walkthrough from an empty scene. It needs no public tunnel and does not depend on the demonstration operator\'s Mac staying online. The commands below assume a fresh clone in an independent directory, not a working directory already hosting the shared demonstration.')
    para('默认 Compose 项目为 deye-rwa-platform，链编号为20260922。应用、Blockscout 和钱包 RPC 使用本机4174、4000和18545端口。请先检查这些端口是否空闲；有冲突时先解决配置，不要停止其他正在使用的演示。127.0.0.1 只代表当前电脑，同事在另一台机器上不能通过你的本机网址访问服务。',
         'The default Compose project is deye-rwa-platform and its Chain ID is 20260922. The application, Blockscout and wallet RPC use local ports 4174, 4000 and 18545. Check that the ports are free before starting. Resolve a conflict without stopping someone else\'s active demonstration. The address 127.0.0.1 refers only to the current computer and does not give a colleague access from another machine.')
    para('当前维护用的4191端口和20261014链属于另一套引导回归环境，依赖单独准备的记录回放。本节的新部署不会自动复制该环境，也不会沿用共享公网钱包、预置产品或真实电站凭证。三者地址不同是环境隔离的结果，读者应以自己部署返回的网络信息为准。',
         'The existing maintenance profile on port 4191 and Chain ID 20261014 is a separate guidance regression environment with separately prepared recorded evidence. A fresh deployment does not copy that profile, shared public wallets, prepared products or real station credentials. These addresses differ because the environments are isolated; use the network information returned by your own deployment.')
    t(r'\begin{center}\begin{tikzpicture}[>=Latex,box/.style={draw,align=center,text width=4cm,minimum height=1.3cm}]')
    nodes = [('browser',0,0,'浏览器与 Rabby','Browser and Rabby'),('app',5,0,'本地应用与后端','Local application and backend'),('data',10,0,'场景与证据存储','Scene and evidence storage'),('rpc',0,-3,'受限 RPC 网关','Restricted RPC gateway'),('chain',5,-3,'独立 Anvil 链','Independent Anvil chain'),('explorer',10,-3,'Blockscout 与数据库','Blockscout and database')]
    for name,x,y,z,e in nodes:t(f'\\node[box] ({name}) at ({x},{y}) {{{esc(L(z,e))}}};')
    for a,b in [('browser','app'),('app','data'),('browser','rpc'),('rpc','chain'),('app','chain'),('chain','explorer')]:t(f'\\draw[->] ({a})--({b});')
    t(r'\end{tikzpicture}\end{center}')
    t(r'\clearpage')
    sub('安装、启动与健康检查', 'Installation, startup and health checks')
    para('准备 Node.js 22.19 或更新的22.x版本、npm，以及已启动的 Docker 和 Compose。现有脚本调用 docker-compose；只有 docker compose 命令的安装需要先提供兼容命令。完整部署主要在 Apple Silicon Mac 上验证，其他平台应核对镜像架构；源码验证服务使用 amd64 编译器，在 Apple Silicon 上需要相应模拟支持。首次安装还需要下载 npm 依赖、容器镜像和浏览器相关依赖，因此需要网络连接。',
         'Prepare Node.js 22.19 or a newer 22.x release, npm, and running Docker with Compose. The scripts call docker-compose, so installations offering only docker compose need a compatible command first. Full deployment has primarily been validated on Apple Silicon Macs. Check image architecture on other platforms; the source-verification compiler uses amd64 and needs emulation on Apple Silicon. The first installation downloads npm dependencies, container images and explorer dependencies and therefore needs an internet connection.')
    para('在新目录执行以下命令。web3:init 生成本地配置，web3:wallets 导出这一套实例的测试账户，web3:up 构建并启动应用、节点与浏览器。Blockscout 首次迁移可能较慢，应等待健康检查通过后再连接钱包。',
         'Run these commands in a new directory. web3:init creates local configuration, web3:wallets exports this instance\'s test accounts, and web3:up builds and starts the application, node and explorer. Initial Blockscout migrations may take time. Wait for the health checks before connecting a wallet.')
    t(r'''\begin{verbatim}
git clone https://github.com/Mengzhon001/deye-rwa-demo.git deye-rwa-local
cd deye-rwa-local
npm ci
DEYE_LOCAL_SOLC=1 npm run build
npm run web3:init
npm run web3:wallets
npm run web3:up
npm run web3:health
\end{verbatim}''')
    para('健康检查应分别确认 RPC 的链编号、应用接口、首页、业务页面、文档以及 Blockscout 界面和接口。检查失败时先运行 web3:status 查看容器状态，再用 web3:logs 查看启动过程；不要反复初始化钱包或删除数据卷来处理索引延迟。健康检查通过也不等于所有合约源码都已验证，仍须在 Blockscout 中检查对应合约页。',
         'Health checks cover the RPC Chain ID, application API, homepage, business page, documentation and Blockscout interface and API. If a check fails, use web3:status to inspect container status and web3:logs to inspect startup. Reinitializing wallets or deleting volumes is not a remedy for indexing delay. A healthy service does not itself prove source verification; inspect the relevant contract page in Blockscout.')
    t(r'\begin{verbatim}' + '\n' + 'npm run web3:status\nnpm run web3:logs\n' + r'\end{verbatim}')
    sub('访问入口与本地钱包', 'Local entry points and wallets')
    for z,e,url in [('品牌首页','Homepage','http://127.0.0.1:4174/'),('角色登录与应用','Role sign-in and application','http://127.0.0.1:4174/app/'),('产品文档','Product documentation','http://127.0.0.1:4174/docs/'),('区块链浏览器','Explorer','http://127.0.0.1:4000/'),('钱包 RPC','Wallet RPC','http://127.0.0.1:18545')]:
        t(esc(L(z,e))+r'\par\url{'+url+r'}\par')
    para('使用本地导入文件 .data/local-wallets/wallet-import.private.json 将六个角色账户分别导入 Rabby。该文件只保存在自己的实例中，权限为600，终端仅打印地址。进入应用后核对 Chain ID 为20260922，再选择角色并签名。本地账户默认不同于手册前面列出的共享环境地址，导入共享角色私钥并不会自动取得新实例中的权限。',
         'Import the six accounts into Rabby from .data/local-wallets/wallet-import.private.json on your own machine. The file has mode 600 and the terminal prints addresses only. Verify Chain ID 20260922, choose the role and sign in. The generated accounts differ from the shared-environment addresses listed earlier in the manual; importing a shared role key does not automatically grant its role in a new instance.')
    sub('空白场景、数据源与业务复现', 'Empty scenes, data sources and workflow reproduction')
    para('公开源码不包含真实电站原始记录、API 凭证或预先发行的产品。因此首次启动后产品大厅为空属于预期状态。中介进入“监控与证据”，在数据源选择中明确选用“合成样本”并确认；业主随后选择该样本电站提交申请。合成数据会有相应标记，只用于流程测试，不能作为真实资产的估值证明。',
         'The public source excludes raw station records, API credentials and pre-issued products. An empty product hall on first startup is therefore expected. The intermediary opens Monitoring and evidence, explicitly selects Synthetic fixture as the source and confirms. The owner then submits an application for the sample station. The synthetic label must remain visible; the fixture tests workflow and does not prove a real asset\'s value.')
    para('从 B 组截图完成申请、报价、审核和签署，按 C 组完成凭证授权、入池、估值和发布，再按 D 组完成资格、认购与结算。发布前投资者大厅不显示草稿。月度运营按 E 组完成业主实际钱包缴费、中介确认和分配，退出及到期操作按 F 至 H 组执行。本地结算仍须满足资金条件，时间推进也不会代替订单审核。',
         'Follow group B for application, quotation, review and signing, group C for credential approval, admission, valuation and publication, and group D for eligibility, subscription and settlement. Drafts do not appear in the investor hall. Group E covers actual household wallet payments, intermediary confirmation and distributions. Follow groups F to H for exits and expiry. Settlement still requires sufficient funds, and advancing time does not approve orders.')
    para('本地普通 Docker 环境的时间控制位于中介“产品运营”底部的“演示工具·财务时间推进”。逐月完成账单、缴费、确认、费用和估值后再推进，不必依赖某个维护环境专用的引导捷径。账期形成不代表款项到账，业主付款和电网售电模拟款仍须分别核对。',
         'The standard local Docker profile exposes time controls under Demo tools: financial time at the bottom of the intermediary\'s Product operations page. Complete billing, payment, confirmation, expenses and valuation month by month before advancing, without relying on a maintenance-profile-specific guide shortcut. A bill does not mean cash has arrived; household payment and simulated grid-export funding still require separate reconciliation.')
    para('需要验证真实数据接入时，另行取得授权并在服务端配置电站 API，或导入已核验的记录回放。容器必须对回放文件建立只读挂载，DEYE_REPLAY_FILE 应使用容器内路径，不能只填写宿主机文件名。实时接口失败不会自动切换成合成数据。相关字段、单位和估值适用性仍需核对，不能因为页面出现数值就视为数据认证完成。',
         'For real-data integration, obtain authorization and configure the station API on the server, or import validated recorded evidence. A container needs a read-only mount for the replay file, and DEYE_REPLAY_FILE must identify its container path rather than only a host filename. An API failure never silently selects synthetic data. Field mappings, units and suitability for valuation must still be checked; displaying numbers is not data certification.')
    sub('开发回归、停止与恢复', 'Development regression, shutdown and recovery')
    para('修改后可在仓库根目录运行以下检查。它们用于检查类型、合约和引导规则，不能替代真实钱包和浏览器流程的验收。需要真实界面验证时，应在自己的实例逐步操作，并保留交易哈希和业务记录。',
         'After a code change, run the following checks from the repository root. They test types, contracts and guidance rules and do not replace real-wallet and browser acceptance. Perform the interface walkthrough in your own instance and retain hashes and business records.')
    t(r'''\begin{verbatim}
npm run typecheck:ui
DEYE_LOCAL_SOLC=1 npm run test:onchain
npm run test:guidance
\end{verbatim}''')
    para('需要自动化完整业务回归时，可以在自己控制的本地 Docker 实例使用 web3:e2e。该工具会备份、执行签名交易、推进时间并恢复场景，过程中会停止服务；不能把它作为只读检查在共享公网环境执行。停止使用 web3:down，重新启动使用 web3:up，普通停止保留数据卷。只有明确需要完全重建时才考虑清理卷，并先保留本地钱包与部署记录。',
         'For automated lifecycle regression, web3:e2e operates on your own local Docker instance. It backs up the scene, executes signed transactions, advances time and restores the scene, stopping services in the process. It is not a read-only check for the shared public environment. Use web3:down to stop and web3:up to restart; ordinary shutdown preserves volumes. Remove volumes only for an intentional complete rebuild after preserving the local wallets and deployment records.')
    t(r'''\begin{verbatim}
npm run web3:e2e
npm run web3:down
npm run web3:up
npm run web3:health
\end{verbatim}''')
    para('本节命令来自当前仓库的部署脚本。文档修订没有重新启动或重置现有公网、Base Sepolia 或维护环境，也不将文档编译通过称作新机器部署已经通过。新设备仍需执行健康检查，并验证所用钱包、容器平台和数据源。',
         'These commands follow the current repository scripts. This documentation revision does not restart or reset the existing public, Base Sepolia or maintenance environments, and successful document compilation is not a claim that a fresh machine has been deployed and tested. A new machine still needs its health checks and validation of wallets, container platform and data source.')
