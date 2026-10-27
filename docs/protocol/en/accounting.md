# Collections, fees and distributions

Energy production does not prove receipt of cash. After publication of a monthly bill, the household pays test USDC from its own wallet. The intermediary reconciles that payment with the separately recorded export receipt before releasing net cash into the vault. Only the grid-export component is simulated by a separate system account; it cannot substitute for the household payment. Amounts are recognized from confirmed receipts. An arbitrary successful transaction hash is insufficient to advance a workflow.

## Accounting boundaries

Completed service awaiting payment may be a collectible receivable; unperformed future service remains in the rights valuation. Collection reduces the relevant receivable and increases cash. Paying an expense reduces cash and the liability. Declaring a distribution creates a liability; claiming it reduces both cash and that liability.

```text
Active NAV = cash + collectible receivables + remaining rights PV
             − declared unpaid distributions − accrued liabilities − applicable future pool fees
```

Recognize each receipt, expense and distribution once. Protected reserves and redemption cash are designations within cash, not additional assets or an additional deduction from NAV.

## Monthly fees

The combined intermediary/platform fee is 0.5% annually, accrued monthly against the preceding approved month-end NAV. The current monthly formula is `fee-basis NAV × 50 / 120000`, rounded down in token base units. Accrual requires a valuation refresh. Do not deduct the same fee as both a future expense and an accrued liability.

The demo also configures mandatory fixed monthly expenses for monthly payment in V5 and the six-month reserve requirement. Compare station-level costs and pool expenses to avoid charging the same cost in both layers.

## Monthly distributions

Complete monthly accruals and obtain current approved valuation, pay the agreed expenses and protect six months of mandatory costs. Allocate 75% of distributable collected receipts to investors and 25% to redemption liquidity. Existing redemption cash and previously declared distributions are not distributed again.

Declaration snapshots economic holdings. Investors then claim through their own wallets. Later transfers or redemptions do not give the same declared entitlement to a new holder. Escrowed redemption shares retain distribution rights until paid and burned.

## Investor reporting

Positions show capital invested, cumulative cash distributions, unclaimed distributions, remaining NAV and total return separately. Payments can realize the value of a finite asset over time. A high distribution amount does not necessarily mean a high return or an unchanged principal value.

## Two collection sources

New agreements record household solar-electricity payments and eligible export revenue separately for each period. Agreed station costs and the assigned share determine the receivable. The household's utility import bill stays outside the vault. Simulated bills and forecasts use the same calculation and bind the historical month, both tariffs, delivery factor, discount, costs, FX and assigned share. Replaying a historical energy month for a demo financial period does not make it future live telemetry.

A modeled bill is not proof of payment. Publishing a bill binds its service month, energy evidence, agreement, tariffs and FX. The household pays only the agreed discounted solar electricity bill. It does not fund export revenue or pay deducted station costs a second time. Any separate payment to the utility remains outside this system.

Under Funds & monthly bills, the household uses the bill-specific payment button, approves its exact amount and signs the transfer. The billing contract binds payment to the designated household, bill and product. A plain token transfer, or payment of another bill, does not settle it. If funds are insufficient, the household must explicitly claim test funds first. Payment never silently mints replacement household money.

Payments stay in the billing contract pending reconciliation. Under Monitoring & evidence, the intermediary records the separately labelled simulated grid-export payment, checks both amounts, and signs Reconcile and confirm receipt into pool. That transaction transfers assigned net revenue into the vault, pays agreed station expenses once, and returns any unassigned portion of older agreements to the household. Before confirmation, funds remain outside vault cash and within collectible receivables. Confirmation clears that receivable and recognizes net vault cash once.

These are actual token transfers on the test chain, using mUSDC with no real monetary value. Bills still depend on approved demo tariffs, delivery factors and FX; there is no utility settlement or fiat debit integration. Completed historical simulated receipts are not charged to the household again. The intermediary can convert an unpaid older receivable into a wallet-payment bill.

## Investor cashflow timeline

<p class="pt-example-caption">Teaching example, not a current station quote. All 60 periods are generated by the platform valuation and pool models. The example begins on 1 January 2026. The first three months generate 1,000, 1,100 and 1,200 kWh; exports are 40% of generation and imports are 200 kWh per month. Availability is 100%, with zero degradation and price growth to make the arithmetic easy to follow. Actual quotes use their approved assumptions. Delivery is 90%; households pay 80% of CNY 0.60/kWh, exports earn CNY 0.35/kWh, station expenses are CNY 100 per month, FX is 0.14 USDC/CNY, net revenue assignment is 100%, annual discounting is 10%, and collection is delayed one month.</p>

<div data-cashflow-example="investor"></div>

For an illustrative proportional subscription of 1,000 USDC, successful settlement uses 900 USDC to purchase rights and retains 100 USDC as vault cash. Retained cash remains an asset and cannot be added again as extra income. Actual fundraising must satisfy acquisition funding, retention, the fundraising threshold and intermediary order-review conditions.

Collect actual assigned receipts monthly and accrue the combined 0.5% annual pool fee plus mandatory expenses. Monthly, pay costs and protect six months of mandatory expenses before distributing 75% of surplus receipts and reserving 25% for redemptions. Previously declared distributions and reserved redemption liquidity cannot be distributed again.

This timeline uses the same station example as the valuation page, plus mandatory pool expenses of 1 USDC per month and the 0.5% annual fee. It assumes holding until expiry with no early redemptions. Energy and cashflow rows show the whole pool; only the green payout row is scaled to each 1,000 USDC invested. Do not add amounts from these different scales.

Period 1 earns a receivable of 41.888 USDC but collects no cash under this example’s one-month collection delay, so its payout is zero. Period 2 collects that receivable and pays monthly costs before protecting reserves and distributing 10.17 USDC per 1,000 USDC invested. Period 3 collects 47.4768 USDC and similarly distributes 11.60 USDC per 1,000 USDC invested. Period-3 revenue is collected in period 4. Monthly distribution dates do not guarantee positive monthly cash.

Scroll to the final column to see collection of the last receivable and distribution of remaining cash, with no additional generation. A final monthly payment and liquidation may share a date, but they are shown separately and each counted once. The application reads its current pool projection; during the active phase, normalization uses opening asset value and represents the remaining term, not a holder's original subscription performance.

```text
0 = −initial investment + Σ[monthly payout / (1 + net IRR)^years since opening]
                        + final cash / (1 + net IRR)^years since opening
```

The 10% discount rate values rights; it is not a promised investor yield. Net IRR reflects purchase price, costs, reserves and receipt dates. There is no guaranteed coupon or original-principal repayment. Expired reports keep their charts for reconciliation but cannot advertise a current dealing return.


New V5 products in the local and remote demos distribute monthly. After declaration, hand off to an investor to inspect or claim; claiming does not wait for another NAV approval. Staff may explicitly defer this viewing step. Missed months are caught up in one declaration with outstanding accrued expenses charged once, while previously declared claims remain intact. Original V4 deployments continue under their quarterly rules.
