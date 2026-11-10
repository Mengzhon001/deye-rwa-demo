"""Bilingual diagrams for the deployed revenue-rights contract family."""


def write_contract_architecture(t, L, para, section, sub, esc, landscape, endland):
    section('智能合约整体架构与业务时序', 'Smart contract architecture and business sequence')
    para(
        '本节描述当前三种测试环境实际使用的收益权合约，而不是把源码目录中的历史原型都视为同一产品。私有演示链和原 Base Sepolia 产品使用月度账单合约 HouseholdBilling。独立的 Local Oracle on Sepolia 产品以 OracleReportRegistry 和 HouseholdBillingV2 替代该账单路径。三个环境分别部署电站凭证与资产池，互不共用产品状态；两个 Base Sepolia 环境只共用公共测试链及 Circle 测试 USDC。',
        'This section describes the revenue-rights contracts used by the three current test environments. Historical prototypes in the source tree are not combined into one product. The private demonstration and original Base Sepolia product use HouseholdBilling. The independent Local Oracle on Sepolia product replaces that billing path with OracleReportRegistry and HouseholdBillingV2. Each environment has its own station credential and vault. The two Base Sepolia environments share only the public test chain and Circle test USDC.'
    )

    landscape()
    sub('当前部署的合约整体架构图', 'Architecture of the currently deployed contracts')
    t(r'\begin{center}\begin{tikzpicture}[x=1cm,y=1cm,>=Latex,'
      r'contract/.style={draw=blue!55!black,fill=blue!5,rounded corners=2pt,align=center,text width=5.1cm,minimum height=1.35cm,inner sep=5pt},'
      r'oracle/.style={contract,draw=orange!70!black,fill=orange!7},'
      r'offchain/.style={draw=gray!65,dashed,rounded corners=2pt,align=center,text width=5.1cm,minimum height=1.15cm,inner sep=5pt},'
      r'flow/.style={->,line width=.7pt,draw=blue!60!black},'
      r'oflow/.style={->,line width=.7pt,draw=orange!75!black},'
      r'note/.style={font=\scriptsize,fill=white,inner sep=2pt,align=center}]')
    nodes = [
        ('wallet', 10, 6.0, '角色钱包与业务应用', 'Role wallets and application', 'offchain'),
        ('worker', 20, 6.0, '德业 API 与自托管 Oracle 服务', 'Deye API and self-hosted Oracle', 'offchain'),
        ('station', 2, 2.6, 'DeyeRWA\\电站 ERC-721 凭证', 'DeyeRWA\\Station ERC-721 credential', 'contract'),
        ('vault', 10, 2.6, 'RevenueShareVaultV5\\资产池与 DRS 份额', 'RevenueShareVaultV5\\Vault and DRS shares', 'contract'),
        ('registry', 20, 2.6, 'OracleReportRegistry\\签名报告与参数审批', 'OracleReportRegistry\\Signed reports and policy approval', 'oracle'),
        ('token', 2, -1.0, '支付代币\\私链 MockUSDC / 公链 Circle USDC', 'Payment token\\Private MockUSDC / public Circle USDC', 'contract'),
        ('bill1', 10, -1.0, 'HouseholdBilling\\原账单路径', 'HouseholdBilling\\Original billing path', 'contract'),
        ('bill2', 20, -1.0, 'HouseholdBillingV2\\强制核验报告的账单路径', 'HouseholdBillingV2\\Report-enforced billing path', 'oracle'),
    ]
    for name, x, y, zh, en, style in nodes:
        label = L(zh, en).replace('\\', r'\\')
        t(f'\\node[{style}] ({name}) at ({x},{y}) {{{label}}};')
    arrows = [
        (r'\draw[flow] (wallet.south) -- node[note,right]{', '角色签名与业务调用', 'Wallet calls', r'} (vault.north);'),
        (r'\draw[flow] (vault.west) -- node[note,above]{', 'ERC-721 托管', 'ERC-721 custody', r'} (station.east);'),
        (r'\draw[flow] (vault.south west) -- node[note,sloped,above]{', 'USDC 转账', 'USDC transfers', r'} (token.north east);'),
        (r'\draw[flow] (bill1.north) -- node[note,right]{', '净回款入池', 'Net receipts', r'} (vault.south);'),
        (r'\draw[oflow,dashed] (worker.south) -- node[note,right]{', '签名报告', 'Signed report', r'} (registry.north);'),
        (r'\draw[oflow] (bill2.north) -- node[note,right]{', '占用报告', 'consume(reportId)', r'} (registry.south);'),
        (r'\draw[oflow] (bill2.west) to[bend left=17] node[note,above]{', '净回款入池', 'Net receipts', r'} (vault.east);'),
    ]
    for prefix, zh, en, suffix in arrows:
        t(prefix + esc(L(zh, en)) + suffix)
    t(r'\node[font=\scriptsize,align=center,fill=white] at (11,-2.65) {' + L(
        '蓝色为两条常规路径共用的合约或调用；橙色仅用于独立 Oracle 产品。两种账单合约不会在同一产品中同时启用。',
        'Blue denotes the shared contract path; orange is used only by the independent Oracle product. A product does not activate both billing contracts.'
    ) + r'};')
    t(r'\end{tikzpicture}\end{center}')
    endland()

    sub('合约职责与部署边界', 'Contract responsibilities and deployment boundaries')
    t(r'\begin{longtable}{L{4cm}L{10.5cm}}\toprule ' + L('合约或组件 & 在当前产品中的作用', 'Contract or component & Role in the current product') + r'\\\midrule\endhead')
    rows = [
        ('DeyeRWA', 'DeyeRWA', '中介铸造电站 ERC-721 凭证。业主授权后，资产池在入池交易中接收凭证，并在募集失败或关闭后返还。凭证记录摘要，不转移设备本身的所有权。', 'The intermediary mints the station ERC-721 credential. After owner approval, the vault receives it on admission and returns it after failure or closure. Its hashes do not transfer ownership of the physical equipment.'),
        ('RevenueShareVaultV5', 'RevenueShareVaultV5', '资产池合约本身也是六位精度的 DRS ERC-20 份额合约。它管理资格、募集与托管、结算、估值、回款、费用、月度分配、转让、赎回、服务事件和到期关闭。没有另一个单独部署的 DRS 代币合约。', 'The vault is itself the six-decimal DRS ERC-20 share contract. It manages eligibility, subscription custody, settlement, valuation, receipts, fees, monthly distributions, transfers, redemption, servicing cases and closure. There is no separately deployed DRS token.'),
        ('HouseholdBilling', 'HouseholdBilling', '原私链和原 Base Sepolia 产品使用的账单合约。中介按照链下已核对的金额发布账单；业主以 USDC 缴费，独立测试资金账户提供模拟售电款；中介确认后，合约调用资产池归集净回款。它本身不检查 Oracle 报告。', 'The private and original Base Sepolia products use this bill contract. The intermediary publishes off-chain reviewed amounts. The owner pays USDC, a separate test treasury provides simulated export funding, and the intermediary confirms the net receipt into the vault. It does not verify an Oracle report.'),
        ('OracleReportRegistry', 'OracleReportRegistry', '仅用于 Oracle 产品。两位受托人分别批准计费参数，登记合约验证 Oracle 的 EIP-712 签名、产品、自然月、服务期、有效期和修订状态。它不持有业主缴费。', 'Only the Oracle product uses this registry. Two distinct trustees approve billing parameters. The registry verifies the Oracle EIP-712 signature, product, calendar month, service period, expiry and revision state. It does not hold owner payments.'),
        ('HouseholdBillingV2', 'HouseholdBillingV2', '仅用于 Oracle 产品。发布账单时，它在同一笔交易中调用登记合约的 consume，并直接使用报告中的金额。后续业主缴费、模拟售电款和中介确认仍需各自的交易。', 'Only the Oracle product uses this version. Bill publication calls consume on the registry in the same transaction and uses the amounts in the report. Owner payment, simulated export funding and intermediary confirmation remain separate transactions.'),
        ('USDC / MockUSDC', 'USDC / MockUSDC', '私链部署 MockUSDC 供测试；两个 Base Sepolia 产品使用同一个 Circle 测试 USDC 合约。支付币与 DRS 份额不同；同链共享的 USDC 余额不会使两套产品的订单和持仓共享。', 'The private chain deploys MockUSDC. Both Base Sepolia products use the same Circle test USDC contract. The payment token differs from DRS shares; a shared on-chain USDC balance does not merge product orders or holdings.'),
    ]
    for zh_name, en_name, zh_desc, en_desc in rows:
        t(esc(L(zh_name, en_name)) + ' & ' + esc(L(zh_desc, en_desc)) + r'\\\addlinespace')
    t(r'\bottomrule\end{longtable}')
    para(
        'Calendar 是编入资产池的内部日历计算库，不另行部署为可交互合约。源码目录还保留 DBondMarket、RWAVault、EnergyRevenue 等早期原型和旧版资产池，用于历史场景或兼容性核对，但它们不参与本节所示的当前收益权业务路径。合约地址应按所选环境的部署清单核对，不能只凭同一 Chain ID 判断正在操作的产品。',
        'Calendar is an internal calendar library compiled into the vault, not a separate interactive deployment. The source tree also retains earlier prototypes such as DBondMarket, RWAVault and EnergyRevenue, and older vault versions for historical scenarios or compatibility checks; they are outside the current revenue-rights path shown here. Check contract addresses against the selected environment manifest. The same Chain ID alone does not identify the product.'
    )

    def sequence_page(title_zh, title_en, rows, spacing):
        landscape()
        sub(title_zh, title_en)
        t(r'\begin{center}\begin{tikzpicture}[x=1cm,y=1cm,>=Latex,'
          r'lane/.style={draw=blue!45!black,fill=blue!5,rounded corners=2pt,minimum width=3.55cm,minimum height=.72cm,align=center,font=\scriptsize},'
          r'call/.style={->,line width=.65pt,draw=blue!60!black},'
          r'oraclecall/.style={->,line width=.75pt,draw=orange!75!black},'
          r'fund/.style={->,line width=.75pt,draw=green!45!black},'
          r'label/.style={font=\scriptsize,fill=white,inner sep=1pt,align=center}]')
        names = [
            ('参与者钱包 / 服务账户', 'Wallet / service account'),
            ('DeyeRWA\n电站 NFT', 'DeyeRWA\nStation NFT'),
            ('RevenueShareVaultV5\n资产池 / DRS', 'RevenueShareVaultV5\nVault / DRS'),
            ('USDC 或 MockUSDC', 'USDC or MockUSDC'),
            ('OracleReportRegistry', 'OracleReportRegistry'),
            ('HouseholdBilling\n或 HouseholdBillingV2', 'HouseholdBilling\nor HouseholdBillingV2'),
        ]
        xs = [0, 4.35, 8.7, 13.05, 17.4, 21.75]
        bottom = -1.1 - (len(rows)-1)*spacing - .35
        for i, (zh, en) in enumerate(names):
            label = esc(L(zh, en)).replace('\n', r'\\')
            t(f'\\node[lane] at ({xs[i]},0) {{{label}}};')
            t(f'\\draw[dashed,gray!55] ({xs[i]},-.43)--({xs[i]},{bottom});')
        for i, (source, dest, zh, en, kind) in enumerate(rows):
            y = -1.1 - i*spacing
            label = esc(L(zh, en))
            t(f'\\draw[{kind}] ({xs[source]},{y}) -- node[label,above] {{{label}}} ({xs[dest]},{y});')
        t(r'\end{tikzpicture}\end{center}')
        endland()

    sequence_page(
        '跨合约业务时序图（发行与结算）',
        'Cross-contract sequence (issuance and settlement)',
        [
            (0,1,'中介：mintFacility','Intermediary: mintFacility','call'),
            (0,1,'业主：approve(资产池)','Owner: approve(vault)','call'),
            (0,2,'中介：admit','Intermediary: admit','call'),
            (2,1,'safeTransferFrom：NFT 入池','safeTransferFrom: NFT custody','call'),
            (0,2,'中介编制、受托批准估值','Intermediary proposes; trustee approves NAV','call'),
            (0,2,'中介：publish 募集','Intermediary: publish offering','call'),
            (0,3,'投资者：approve(资产池)','Investor: approve(vault)','fund'),
            (0,2,'投资者：subscribe','Investor: subscribe','call'),
            (2,3,'transferFrom：认购款进入托管','transferFrom: subscription into custody','fund'),
            (0,2,'中介：reviewSubscription','Intermediary: reviewSubscription','call'),
            (0,2,'中介：settle','Intermediary: settle','call'),
            (2,3,'支付业主购买价','Pay owner purchase price','fund'),
            (2,0,'向投资者铸造 DRS 份额','Mint DRS shares to investors','call'),
        ], .83
    )
    para(
        '上图按交易发生顺序展示发行主路径。申请审核、协议正文、模型计算和普通钱包登录属于链下流程；只有相应的铸造、授权、托管、估值审批、认购与结算调用才产生链上状态。投资者认购款先留在资产池托管，结算后资产池支付业主购买价并在自身合约内铸造 DRS 份额。',
        'The first sequence shows the issuance path in transaction order. Application review, agreement text, model calculations and ordinary wallet sign-in are off-chain steps. Only the corresponding mint, approval, custody, valuation approval, subscription and settlement calls change on-chain state. Subscription USDC first remains in vault custody. At settlement, the vault pays the owner and mints DRS shares within the same vault contract.'
    )

    sequence_page(
        '跨合约业务时序图（账单、分配与退出）',
        'Cross-contract sequence (billing, distributions and exit)',
        [
            (0,4,'Oracle 路径：两位受托人 approvePolicy','Oracle path: two trustees approvePolicy','oraclecall'),
            (0,4,'报告签名后由独立账户 registerReport','Signed report: relayer registerReport','oraclecall'),
            (0,5,'中介：publishBill','Intermediary: publishBill','call'),
            (5,4,'仅 V2：consume(reportId)','V2 only: consume(reportId)','oraclecall'),
            (0,3,'业主：approve(账单合约)','Owner: approve(billing)','fund'),
            (0,5,'业主：payBill','Owner: payBill','call'),
            (5,3,'transferFrom：业主电费','transferFrom: owner bill','fund'),
            (0,5,'测试资金账户：fundExport','Test treasury: fundExport','call'),
            (5,3,'transferFrom：模拟售电款','transferFrom: simulated export funding','fund'),
            (0,5,'中介：confirmReceipt','Intermediary: confirmReceipt','call'),
            (5,2,'receiveRevenue：净额入池','receiveRevenue: net cash into vault','fund'),
            (2,3,'transferFrom：账单合约到资产池','transferFrom: billing to vault','fund'),
            (0,2,'受托审估值；中介计费和月度分配','Trustee NAV; intermediary fees and distribution','call'),
            (0,2,'投资者：claim；转让或赎回','Investor: claim; transfer or redeem','call'),
            (2,3,'支付分配或退出款','Pay distributions or exit proceeds','fund'),
            (0,2,'服务事件审批；到期 closeProduct','Servicing approval; closeProduct at expiry','call'),
            (2,1,'releaseStation：返还 NFT','releaseStation: return NFT','call'),
        ], .72
    )
    para(
        '第二张图延续同一产品的时间线。原账单合约的 publishBill 使用链下核对的金额，不经过 OracleReportRegistry；仅 Oracle 产品在发布账单时由 HouseholdBillingV2 调用登记合约的 consume，因此“仅验证报告”不能生成收费账单。业主缴费与模拟售电款分别转入账单合约，中介确认后才将净额归集到资产池。分配、领取、转让、赎回、服务事件和关闭均由资产池处理，USDC 的实际转账则通过支付代币合约完成。到期关闭或募集失败后的电站凭证返还属于独立交易，不代表设备产权转移。',
        'The second sequence continues the same product timeline. The original HouseholdBilling publishes off-chain reviewed amounts without calling OracleReportRegistry. Only the Oracle product has HouseholdBillingV2 consume a registered report during bill publication; a validation-only report cannot become a payable bill. Owner payments and simulated export funding enter the billing contract separately. Net cash reaches the vault only after intermediary confirmation. The vault handles distributions, claims, transfers, redemptions, servicing cases and closure, while actual USDC transfers occur through the payment-token contract. Returning the station credential after failure or closure is a separate transaction and does not transfer physical equipment title.'
    )
