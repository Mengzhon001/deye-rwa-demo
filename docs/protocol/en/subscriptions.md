# Eligibility, subscription and settlement

Connecting an ordinary wallet does not grant subscription eligibility. Investors first accept the risk and demo declarations and submit an application. The intermediary reviews it and signs an onchain eligibility approval before subscriptions are allowed.

## Test funds and payment

The faucet explicitly issues demo DETH and mUSDC. Available wallet funds and escrowed subscriptions are separate balances; receiving tokens is not placing an order. mUSDC uses six decimals, and UI amounts are converted to integer units. A demo reset creates a new token address; use the current product's token.

Subscription has two steps: approve the vault to spend mUSDC, then sign subscribe to place funds into escrow. Share balances correctly remain zero before settlement.

## Order review and refunds

RevenueShareVaultV4 and V5 have no cooling period and allows repeated subscriptions while fundraising, approved pricing, eligibility and remaining capacity permit. Each transaction charges only its additional amount and increases cumulative escrow. Payments of 100, 200 and 300 USDC therefore result in 600 USDC of escrow and total wallet spending of 600 USDC.

Every addition advances the review nonce and clears prior approval. The intermediary reviews the updated cumulative amount in Product operations, signing a decision bound to the investor, nonce, total amount, issuance terms and evidence hash. An earlier approval or prepared review transaction cannot cover subsequently added funds. The application lists each confirmed payment and refund with its amount, time and explorer link.

Rejection refunds the full cumulative escrow to its investor in the same transaction. Investor cancellation also refunds the entire cumulative amount; cancelling only one addition is not supported. Approval alone does not issue shares: all pool settlement conditions must be met. Primary subscriptions close at successful settlement, after which exits follow transfer and redemption rules.

Already deployed legacy contracts cannot be rewritten. Existing orders retain their original refund terms. If the earlier campaign is explicitly authorized to end, investors can claim full refunds. The application links to original orders and does not automatically terminate campaigns or move funds. Historical transactions remain in Blockscout.

## Successful settlement conditions

| Condition | Requirement |
| --- | --- |
| Phase | Published and not already settled or failed. |
| Order review | Every active order is approved by the intermediary and its investor remains eligible. No three-day wait applies. |
| Funding threshold | Subscriptions reach at least 70% of the target. |
| Acquisition funding | After retaining 10% of proceeds, funds cover every signed purchase. |
| Valuation and terms | Approved current pricing and the fixed issuance terms apply. |

Reaching 70% alone does not guarantee settlement. More funding is required if that amount cannot cover purchases plus retained cash. Settlement pays the purchase prices, allocates shares proportionally at the issue price, and retains 10% of initial proceeds in the vault.

The current contract fixes the initial issue price at 1 mUSDC per share, with six decimals. Investor projections reflect the resulting financing arrangement. Editing a display value cannot override contract rules.

## Failure and duplicate actions

Campaigns that do not meet conditions can follow the deadline failure path, after which investors claim refunds. Primary issuance closes after successful settlement. Redemptions do not rely on new subscriptions. Persistent operation intents and idempotency keys prevent repeated clicks from duplicating payment or minting.


The private demonstration faucet issues DETH and mUSDC on that chain. Base Sepolia uses Circle test USDC and test ETH; the application links to official faucets and cannot mint either asset. Check the selected chain and the actual wallet address. Funds on another chain or at another address cannot pay for this subscription.
