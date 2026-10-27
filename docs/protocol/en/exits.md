# Transfers, redemptions and expiry

Shares are locked for six calendar months after settlement. The current contract restricts ordinary ERC-20 transfers to prevent bypassing eligibility, lock and atomic-payment requirements. Exits use the protocol's peer-transfer or redemption flow.

## Peer transfers

Buyer and seller agree on shares, mUSDC consideration and expiry. The buyer must be eligible, approve payment and consent to the trade. The seller then atomically exchanges shares for mUSDC. If any payment condition fails, the entire exchange reverts.

NAV is a reference, not a guaranteed execution price. A deviation greater than 10% requires intermediary approval of that trade's hash. Approval binds parties, shares, consideration, expiry and nonce; it cannot authorize another trade.

## Quarterly redemptions

Investors request redemption before cutoff, providing at least 30 days' notice. Requested shares enter escrow but are not burned before payment, and retain snapshot distribution rights. Execution uses current dealing-date NAV. Declared distributions are already deducted as liabilities and cannot be paid twice.

```text
Window payment limit = min(available redemption cash, pool NAV × 5%)
```

Eligible requests fill proportionally, with integer rounding and unfilled shares carried forward. Liquidity shortages do not trigger hidden funding from new subscriptions. Unfilled portions may be cancelled before the next cutoff. Requests past cutoff follow window rules, and an intermediary carries a missed window forward.

## Expiry and closure

After the five-year rights term, equipment residual value remains outside the pool and remaining future rights are valued at zero. Collect receivables and settle expenses and liabilities before closing the product and declaring remaining cash proportionally to economic holdings. Closure does not guarantee recovery of the original investment.
