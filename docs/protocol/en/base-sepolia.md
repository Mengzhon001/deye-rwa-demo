# Independent Base Sepolia test environment

## Purpose and entry points

This environment checks deployment, wallet authentication, permissions and stablecoin transactions on a public EVM testnet. The existing public private-chain demonstration remains available for the complete lifecycle. Its products, balances and financial clock are unaffected by these tests. Launch App continues to open that demonstration. The separate Base Sepolia button opens the public-chain application.

Base Sepolia uses Chain ID 84532 and test ETH for gas. The application backend still runs on the Mac, while external services provide the public chain and explorer. This environment does not run Anvil or use the original demonstration RPC tunnel. Confirmed transactions remain accessible through [Base Sepolia Blockscout](https://base-sepolia.blockscout.com) when the application is offline.

## Wallets and test funds

The owner, intermediary, two trustees and two dedicated investor accounts retain their existing public-demo addresses. An address remains the same when the wallet switches networks, but ETH, USDC and deployed products are separate on each chain. Ordinary wallets must apply for investor eligibility and receive intermediary approval. Selecting a role does not grant authority.

Open the independent application with Rabby, select the role, connect its wallet, check the network and sign the login message. Login establishes a session without transferring tokens. Token approvals, subscriptions, refunds and on-chain decisions require their own transaction confirmations. Check the Chain ID, sending account, destination contract and amount before confirming.

Payments use [Circle's official Base Sepolia test USDC](https://developers.circle.com/stablecoins/usdc-contract-addresses) at `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, with six decimals. This is separate from the private-chain mUSDC. Test tokens have no monetary value. The test-funds entry links to the [ETH faucet](https://portal.cdp.coinbase.com/products/faucet) and [Circle USDC faucet](https://faucet.circle.com/). The application cannot mint Circle USDC. Select Base Sepolia at the faucet and refresh the application balance after confirmation. Faucet providers may require login or apply claim limits.

## Workflow and real-time restrictions

Issuance follows the existing owner application, intermediary valuation, trustee review, owner agreement, station credential minting, owner custody authorization, pool admission, pool valuation approval and fundraising publication workflow. Eligible investors can subscribe repeatedly while fundraising remains open. Every addition invalidates the previous order approval, requiring the intermediary to review the latest accumulated amount. Cancellation before settlement refunds the address's entire accumulated subscription.

Subscription money enters escrow. DRS is issued only after order approvals, fundraising thresholds, purchase funding, the initial reserve and current valuation requirements are satisfied. The contract automatically retains 10% of settlement proceeds; users do not make a separate reserve transfer. A shortage of test tokens does not justify changing fair value, bypassing funding checks or presenting an incomplete settlement as successful.

Public-chain time applies. The application cannot advance monthly cutoffs, the six-month transfer lock, redemption notice periods or rights expiry. Monthly billing requires an active settled product and a completed service period. After the intermediary publishes an invoice, the owner approves and pays Circle test USDC. The intermediary then reconciles this payment with the separately recorded simulated grid-export receipt before releasing net proceeds to the pool. The grid receipt remains an economic simulation, funded by an independently prefunded treasury without minting USDC. Fees, valuation approval, monthly distributions and investor claims follow the existing contract rules.

This environment therefore validates public-chain operation rather than compressing five years into one meeting. Use the original demonstration for the complete accelerated lifecycle. Reset and time-advance controls are unavailable on Base Sepolia.

## Reconciliation and evidence boundaries

Open a confirmed transaction hash in Blockscout. Check the network, receipt status, sender, destination, method, decoded events and USDC transfers against the application record. Wallet submission, chain confirmation and explorer indexing are separate states. An indexing delay does not reverse a successful transaction.

Station inputs are a fixed replay of previously collected real evidence. Tariffs, expenses, exchange rates, delivery factors and future cashflows remain disclosed modeling assumptions. Anchoring a digest does not turn a forecast into collected cash or establish that API observations are correct. This deployment does not include Chainlink or another oracle. Independent trustee review remains part of the current approval process.

## Deployment and recovery

The source provides `base:init`, `base:check`, `base:deploy`, `base:build`, `base:start`, `base:tunnel`, `base:status` and `base:stop`. Initialization needs local ignored role configuration and station evidence files. Never commit keys to GitHub. The application uses port 4194 and Compose project `deye-base-sepolia-test`, running the application without a private node or database.

Deployment is explicit. Signed deployment intents are persisted before broadcast, so retries reuse the same transaction. Normal startup stops if its manifest is missing instead of spending ETH on replacement contracts. Back up application state and deployment journals. Restoring a local file cannot undo a public-chain transaction. Check addresses and receipts before accepting new operations after recovery, and never delete an intent journal to resolve a pending transaction.

Public RPC services may rate-limit requests. Events are fetched in pages of at most 200 blocks and cached for replay. Retain the original order and hash after a timeout, inspect the receipt and retry the original operation rather than paying twice. Source-verification status must reflect the actual explorer or source-match result. Circle's external token must not be identified as this project's MockUSDC deployment.
