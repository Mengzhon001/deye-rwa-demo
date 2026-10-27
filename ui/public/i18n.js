export const DEFAULT_LOCALE = "en";

export const SUPPORTED_LOCALES = ["en", "zh-CN"];

export const LOCALE_LABELS = {
  en: "EN",
  "zh-CN": "中文"
};

export const translations = {
  en: {
    meta: {
      title: "Deye Demo Control Room"
    },
    common: {
      language: "Language",
      notAvailable: "n/a",
      walletNotConnected: "Wallet not connected",
      connected: "Connected: {wallet}",
      processingStep: "Processing: {step}"
    },
    hero: {
      eyebrow: "Green Energy RWA Demo",
      title: "Deye Control Room",
      copy:
        "A management-facing operating view for facilities, revenue flow, smart contracts, and investor-facing `digital_bond` activity."
    },
    nav: {
      manager: "Manager",
      investor: "Investor"
    },
    manager: {
      eyebrow: "Manager Dashboard",
      title: "Operate the full demo workflow",
      refresh: "Refresh State",
      panels: {
        deploy: "Deploy Facility",
        engine: "Automated Revenue Engine",
        lifecycle: "Lifecycle Update",
        facilityRegistry: "Facility Registry",
        revenueFlow: "Revenue and Reward Flow",
        contractHealth: "Contract Health",
        bondOperations: "Bond Operations",
        activityFeed: "Activity Feed"
      },
      form: {
        facilityName: "Facility Name",
        siteName: "Site Name",
        region: "Region",
        acquisitionCostUSDC6: "Acquisition Cost USDC6",
        capacityKw: "Capacity kW",
        deploy: "Deploy Facility",
        facilityAssetId: "Facility Asset ID",
        facilityAssetPlaceholder: "Select from facility table",
        eventType: "Event Type",
        eventBroken: "Broken to Pending",
        eventRetired: "Retire Facility",
        reason: "Reason",
        reasonDefault: "Management demo lifecycle event",
        submitLifecycle: "Submit Lifecycle Event"
      },
      engine: {
        cadence: "Cadence",
        cadenceValue: "Every 1 minute",
        mode: "Mode",
        modeValue: "Vault-first auto-claim",
        behavior: "Behavior",
        behaviorValue: "Only ACTIVE facilities produce new periods",
        disclosure:
          "Each 1-minute tick represents a compressed demo settlement interval. The UI refreshes automatically and the vault claims rewards as new periods are processed."
      }
    },
    investor: {
      eyebrow: "Investor Portal",
      title: "Track and request `digital_bond` exposure",
      connectWallet: "Connect MetaMask",
      panels: {
        bondOverview: "Bond Overview",
        buyAllocation: "Buy Demo Allocation",
        redeem: "Redeem DBOND",
        faucet: "Demo USDC Faucet",
        balance: "Your Balance",
        history: "Purchase and Redemption History"
      },
      form: {
        dbondUnits: "DBOND Units",
        buy: "Buy On-Chain",
        redeem: "Redeem On-Chain",
        requestFaucet: "Request Demo USDC"
      },
      buyDisclosure:
        "Buy uses real MetaMask transactions against the `DBondMarket` contract. If approval is needed, the UI will prompt for it first.",
      faucetDisclosure:
        "This mints mock USDC on the local demo chain so you can test buy and redeem flows."
    },
    metrics: {
      manager: {
        facilities: "Facilities",
        activeCaption: "{count} active",
        claimedPeriods: "Claimed Periods",
        nextTickCaption: "Next tick {time}",
        rewards: "Rewards",
        rewardsCaption: "USDC6 claimed into vault",
        marketReserve: "Market Reserve",
        inventoryCaption: "{amount} DBOND inventory"
      },
      investor: {
        totalSupply: "Total DBOND Supply",
        totalSupplyCaption: "Vault-issued shares",
        inventoryLeft: "Inventory Left",
        inventoryLeftCaption: "Sellable on-chain inventory",
        navPerShare: "NAV / Share",
        navPerShareCaption: "Vault-backed reference",
        simulatedApy: "Simulated APY",
        simulatedApyCaption: "Based on demo settlement ticks"
      }
    },
    tables: {
      facility: {
        facility: "Facility",
        assetId: "Asset ID",
        status: "Status",
        holder: "Holder",
        facilityValue: "Facility Value",
        rewarded: "Rewarded",
        nextTick: "Next Tick"
      },
      period: {
        facility: "Facility",
        period: "Period",
        reward: "Reward",
        status: "Status",
        claimMode: "Claim Mode"
      },
      activity: {
        time: "Time",
        source: "Source",
        kind: "Kind",
        summary: "Summary",
        ref: "Ref"
      },
      history: {
        type: "Type",
        dbond: "DBOND",
        usdc6: "USDC6",
        status: "Status",
        reference: "Reference"
      }
    },
    summary: {
      contract: {
        network: "Network",
        functionsRouter: "FunctionsRouter",
        dbondMarket: "DBondMarket",
        rwaVaultNavPerShare: "RWAVault NAV/share",
        vaultAssets: "Vault Assets"
      },
      bond: {
        onchainSupply: "On-chain DBOND Supply",
        marketInventory: "Market Inventory",
        marketReserve: "Market Reserve",
        pricePerShare: "Price / Share",
        totalReturn: "Total Return",
        simulatedApy: "Simulated APY"
      },
      notices: {
        marketNotice: "Market Notice",
        cadenceNotice: "Cadence Notice",
        networkMode: "Network Mode"
      },
      wallet: {
        connectedWallet: "Connected Wallet",
        onchainDbondBalance: "On-chain DBOND Balance",
        demoUsdcBalance: "Demo USDC Balance",
        demoEthBalance: "Demo ETH Balance"
      }
    },
    status: {
      ACTIVE: "Active",
      PENDING: "Pending",
      RETIRED: "Retired",
      OPENED: "Opened",
      CLAIMED: "Claimed",
      MINED: "Mined",
      INFO: "Info"
    },
    claimMode: {
      VAULT: "Vault"
    },
    activity: {
      source: {
        onchain: "On-chain",
        scheduler: "Scheduler",
        system: "System"
      },
      kind: {
        DEPLOYMENT: "Deployment",
        VAULT_DEPOSIT: "Vault Deposit",
        PERIOD_SUBMISSION: "Period Submission",
        VAULT_CLAIM: "Vault Claim",
        LIFECYCLE: "Lifecycle",
        MARKET_BUY: "Market Buy",
        MARKET_REDEEM: "Market Redeem",
        TOKEN_APPROVAL: "Token Approval",
        DEMO_USDC_FAUCET: "Demo USDC Faucet",
        DEMO_ETH_FAUCET: "Demo ETH Top-Up",
        SCHEDULER_TICK: "Scheduler Tick",
        SCHEDULER_SKIP: "Scheduler Skip"
      }
    },
    trade: {
      kind: {
        BUY: "Buy",
        REDEEM: "Redeem",
        APPROVAL: "Approval",
        FAUCET: "Faucet"
      }
    },
    messages: {
      notice: {
        marketStateRealOnchainDemoUsdc:
          "Investor buy and redeem use real on-chain transactions against the DBondMarket contract. Demo USDC is still a mock test asset.",
        simulationDisclosure:
          "Revenue cadence is compressed for the management demo: one automated tick every 1 minute represents one settlement interval in the story.",
        networkModeLocalhost:
          "MetaMask buy and redeem flow is available on the local JSON-RPC network.",
        networkModeNonLocalhost:
          "For real MetaMask trading in the browser, run the UI against HARDHAT_NETWORK=localhost with a persistent local node."
      },
      activity: {
        schedulerTickSettled: "Auto-settled {periodId} for {facilityName}",
        periodSubmission: "Submitted production, cashflow, and funding for {periodId}",
        vaultClaim: "Vault claimed {amountUSDC6} USDC6 for {periodId}",
        schedulerTickPaused: "Auto-settlement paused for {periodId}: {reason}",
        schedulerSkipStatus:
          "Skipped auto-period for {facilityName} because status is {status}",
        schedulerSkipIneligible:
          "Skipped auto-period because the facility is not reward eligible on-chain",
        deployment: "Deployed {facilityName} and minted its facility RWA",
        vaultDeposit:
          "Deposited {facilityName} into RWAVault and minted DBOND inventory to the market",
        lifecycle: "Lifecycle update moved {facilityName} to {status}",
        demoUsdcFaucet: "Minted demo USDC to {wallet}",
        demoEthFaucet: "Topped up demo ETH for {wallet}",
        marketBuy: "Investor bought DBOND on-chain",
        marketRedeem: "Investor redeemed DBOND on-chain",
        tokenApproval: "Investor submitted a token approval transaction"
      },
      tx: {
        approveDemoUsdc: "Approve demo USDC",
        buyDbond: "Buy DBOND",
        approveDbond: "Approve DBOND",
        redeemDbond: "Redeem DBOND"
      },
      legacy: {
        text: "{text}"
      }
    },
    errors: {
      metamaskNotDetected: "MetaMask was not detected.",
      connectWalletFirst: "Connect MetaMask first.",
      requestFailed: "request failed",
      refreshFailed: "failed to refresh UI state",
      facilityDeploymentFailed: "facility deployment failed",
      lifecycleUpdateFailed: "lifecycle update failed",
      buyFailed: "buy transaction failed",
      redeemFailed: "redeem transaction failed",
      faucetFailed: "demo USDC faucet failed",
      walletConnectionFailed: "wallet connection failed",
      publicMetricsWithoutWallet:
        "MetaMask was not detected. You can still view the public bond metrics without connecting.",
      providerUnavailableForNativeBalanceFunding:
        "provider unavailable for native balance funding",
      facilityNotFoundInDemoStore: "facility not found in demo store",
      missingRequestUrl: "missing request url",
      notFound: "not found",
      unknownError: "unknown error"
    }
  },
  "zh-CN": {
    meta: {
      title: "Deye 演示控制台"
    },
    common: {
      language: "语言",
      notAvailable: "无",
      walletNotConnected: "钱包未连接",
      connected: "已连接：{wallet}",
      processingStep: "处理中：{step}"
    },
    hero: {
      eyebrow: "绿色能源 RWA 演示",
      title: "Deye 控制室",
      copy:
        "面向管理层的运营视图，用于查看设备、收益流、智能合约，以及面向投资者的 `digital_bond` 活动。"
    },
    nav: {
      manager: "管理方",
      investor: "投资者"
    },
    manager: {
      eyebrow: "管理看板",
      title: "管理完整演示流程",
      refresh: "刷新状态",
      panels: {
        deploy: "部署设备",
        engine: "自动收益引擎",
        lifecycle: "生命周期更新",
        facilityRegistry: "设备注册表",
        revenueFlow: "收益与奖励流",
        contractHealth: "合约状态",
        bondOperations: "债券运营",
        activityFeed: "活动记录"
      },
      form: {
        facilityName: "设备名称",
        siteName: "站点名称",
        region: "区域",
        acquisitionCostUSDC6: "购置成本 USDC6",
        capacityKw: "容量 kW",
        deploy: "部署设备",
        facilityAssetId: "设备资产 ID",
        facilityAssetPlaceholder: "从设备表中选择",
        eventType: "事件类型",
        eventBroken: "故障转待处理",
        eventRetired: "退役设备",
        reason: "原因",
        reasonDefault: "管理演示生命周期事件",
        submitLifecycle: "提交生命周期事件"
      },
      engine: {
        cadence: "频率",
        cadenceValue: "每 1 分钟",
        mode: "模式",
        modeValue: "Vault 优先自动领取",
        behavior: "行为",
        behaviorValue: "仅 ACTIVE 状态设备会生成新周期",
        disclosure:
          "每个 1 分钟 tick 代表故事中的一个压缩结算周期。UI 会自动刷新，Vault 会在新周期处理后自动领取奖励。"
      }
    },
    investor: {
      eyebrow: "投资者门户",
      title: "跟踪并申请 `digital_bond` 敞口",
      connectWallet: "连接 MetaMask",
      panels: {
        bondOverview: "债券概览",
        buyAllocation: "购买演示份额",
        redeem: "赎回 DBOND",
        faucet: "演示 USDC 水龙头",
        balance: "你的余额",
        history: "购买与赎回历史"
      },
      form: {
        dbondUnits: "DBOND 数量",
        buy: "链上购买",
        redeem: "链上赎回",
        requestFaucet: "申请演示 USDC"
      },
      buyDisclosure:
        "购买会通过真实的 MetaMask 交易调用 `DBondMarket` 合约。如需授权，UI 会先提示你完成授权。",
      faucetDisclosure:
        "这会在本地演示链上铸造模拟 USDC，方便你测试购买和赎回流程。"
    },
    metrics: {
      manager: {
        facilities: "设备数量",
        activeCaption: "{count} 个活跃",
        claimedPeriods: "已领取周期",
        nextTickCaption: "下次 tick {time}",
        rewards: "奖励",
        rewardsCaption: "已领取到 Vault 的 USDC6",
        marketReserve: "市场储备",
        inventoryCaption: "{amount} DBOND 库存"
      },
      investor: {
        totalSupply: "DBOND 总供应量",
        totalSupplyCaption: "Vault 铸造份额",
        inventoryLeft: "剩余库存",
        inventoryLeftCaption: "可售链上库存",
        navPerShare: "每份 NAV",
        navPerShareCaption: "由 Vault 支撑的参考值",
        simulatedApy: "模拟 APY",
        simulatedApyCaption: "基于演示结算 tick 计算"
      }
    },
    tables: {
      facility: {
        facility: "设备",
        assetId: "资产 ID",
        status: "状态",
        holder: "持有人",
        facilityValue: "设备价值",
        rewarded: "已奖励",
        nextTick: "下次 Tick"
      },
      period: {
        facility: "设备",
        period: "周期",
        reward: "奖励",
        status: "状态",
        claimMode: "领取模式"
      },
      activity: {
        time: "时间",
        source: "来源",
        kind: "类型",
        summary: "摘要",
        ref: "引用"
      },
      history: {
        type: "类型",
        dbond: "DBOND",
        usdc6: "USDC6",
        status: "状态",
        reference: "参考"
      }
    },
    summary: {
      contract: {
        network: "网络",
        functionsRouter: "FunctionsRouter",
        dbondMarket: "DBondMarket",
        rwaVaultNavPerShare: "RWAVault 每份 NAV",
        vaultAssets: "Vault 资产"
      },
      bond: {
        onchainSupply: "链上 DBOND 供应量",
        marketInventory: "市场库存",
        marketReserve: "市场储备",
        pricePerShare: "每份价格",
        totalReturn: "总回报",
        simulatedApy: "模拟 APY"
      },
      notices: {
        marketNotice: "市场提示",
        cadenceNotice: "节奏提示",
        networkMode: "网络模式"
      },
      wallet: {
        connectedWallet: "已连接钱包",
        onchainDbondBalance: "链上 DBOND 余额",
        demoUsdcBalance: "演示 USDC 余额",
        demoEthBalance: "演示 ETH 余额"
      }
    },
    status: {
      ACTIVE: "活跃",
      PENDING: "待处理",
      RETIRED: "已退役",
      OPENED: "已开启",
      CLAIMED: "已领取",
      MINED: "已确认",
      INFO: "信息"
    },
    claimMode: {
      VAULT: "Vault"
    },
    activity: {
      source: {
        onchain: "链上",
        scheduler: "调度器",
        system: "系统"
      },
      kind: {
        DEPLOYMENT: "部署",
        VAULT_DEPOSIT: "Vault 存入",
        PERIOD_SUBMISSION: "周期提交",
        VAULT_CLAIM: "Vault 领取",
        LIFECYCLE: "生命周期",
        MARKET_BUY: "市场买入",
        MARKET_REDEEM: "市场赎回",
        TOKEN_APPROVAL: "代币授权",
        DEMO_USDC_FAUCET: "演示 USDC 发放",
        DEMO_ETH_FAUCET: "演示 ETH 充值",
        SCHEDULER_TICK: "调度 Tick",
        SCHEDULER_SKIP: "调度跳过"
      }
    },
    trade: {
      kind: {
        BUY: "买入",
        REDEEM: "赎回",
        APPROVAL: "授权",
        FAUCET: "水龙头"
      }
    },
    messages: {
      notice: {
        marketStateRealOnchainDemoUsdc:
          "投资者买入与赎回使用针对 DBondMarket 合约的真实链上交易。演示 USDC 仍是模拟测试资产。",
        simulationDisclosure:
          "收益节奏已为管理演示压缩：每 1 分钟自动 tick 一次，代表故事中的一个结算周期。",
        networkModeLocalhost:
          "本地 JSON-RPC 网络已支持 MetaMask 买入与赎回流程。",
        networkModeNonLocalhost:
          "如需在浏览器中使用真实的 MetaMask 交易，请在持久化本地节点下以 HARDHAT_NETWORK=localhost 运行 UI。"
      },
      activity: {
        schedulerTickSettled: "已为 {facilityName} 自动结算 {periodId}",
        periodSubmission: "已提交 {periodId} 的发电、现金流和资金数据",
        vaultClaim: "Vault 已为 {periodId} 领取 {amountUSDC6} USDC6",
        schedulerTickPaused: "{periodId} 的自动结算已暂停：{reason}",
        schedulerSkipStatus: "已跳过 {facilityName} 的自动周期，因为状态为 {status}",
        schedulerSkipIneligible: "已跳过自动周期，因为该设备在链上不具备奖励资格",
        deployment: "已部署 {facilityName} 并铸造其设施 RWA",
        vaultDeposit: "已将 {facilityName} 存入 RWAVault，并向市场铸造 DBOND 库存",
        lifecycle: "生命周期更新已将 {facilityName} 变更为 {status}",
        demoUsdcFaucet: "已向 {wallet} 铸造演示 USDC",
        demoEthFaucet: "已为 {wallet} 补充演示 ETH",
        marketBuy: "投资者已在链上买入 DBOND",
        marketRedeem: "投资者已在链上赎回 DBOND",
        tokenApproval: "投资者已提交代币授权交易"
      },
      tx: {
        approveDemoUsdc: "授权演示 USDC",
        buyDbond: "买入 DBOND",
        approveDbond: "授权 DBOND",
        redeemDbond: "赎回 DBOND"
      },
      legacy: {
        text: "{text}"
      }
    },
    errors: {
      metamaskNotDetected: "未检测到 MetaMask。",
      connectWalletFirst: "请先连接 MetaMask。",
      requestFailed: "请求失败",
      refreshFailed: "刷新 UI 状态失败",
      facilityDeploymentFailed: "设备部署失败",
      lifecycleUpdateFailed: "生命周期更新失败",
      buyFailed: "购买交易失败",
      redeemFailed: "赎回交易失败",
      faucetFailed: "演示 USDC 水龙头请求失败",
      walletConnectionFailed: "钱包连接失败",
      publicMetricsWithoutWallet:
        "未检测到 MetaMask。即使不连接钱包，你仍然可以查看公开的债券指标。",
      providerUnavailableForNativeBalanceFunding: "原生代币余额充值的 provider 不可用",
      facilityNotFoundInDemoStore: "在演示存储中找不到设备",
      missingRequestUrl: "缺少请求 URL",
      notFound: "未找到",
      unknownError: "未知错误"
    }
  }
};
