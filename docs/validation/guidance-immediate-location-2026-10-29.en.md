# Separating operation location from business-state refresh

Clicking the intermediary’s “Locate the operation” previously requested the complete `/api/state` response before opening the relevant page. That response includes products, accounts, subscriptions, balances and valuations. Consequently, locating a page control incurred the full workspace read latency. The earlier RPC aggregation improvements reduced read time but did not remove this unnecessary dependency.

Location now uses the business data already displayed. The guide shows when that data was read and provides a separate “Refresh business status” button. “Retry locating” only reopens the page and finds the control. After another participant completes an action, users can refresh business status to obtain its latest result. Business submissions still pass backend transaction preparation and contract checks. Approval, funding and cash-retention requirements have not been relaxed.

Hidden-browser checks against the unified public origin covered investor location on both chains and intermediary settlement location on Base Sepolia. When prerequisites are missing, settlement remains disabled. The dialog identifies missing conditions and offers concrete routes such as subscription order review. Eligibility and subscription fixtures were confined to intercepted browser responses and were never written to the backend.

Six browser configurations covered Chinese and English, desktop and mobile, repeated location, script and stylesheet failure recovery, failed state-query recovery, and locating while a state request remains pending. Location generated no additional `/api/state` request. Page navigation did not falsely update the displayed data-read time. A late response re-resolves the highlighted DOM and does not reopen a dismissed query dialog.

The checks also exposed a mobile cleanup race. Closing a tour before its first paint could leave the custom panel-hiding class behind because Driver.js did not invoke its completion callback. Closing now explicitly clears the highlight and restores focus. Repeated-location checks passed after this correction.

Normal eligibility location took 117 and 121 milliseconds in the controlled browser checks. Blocked settlement location took 91 and 102 milliseconds. A separate check using an existing isolated account and the real Rabby 0.94.11 extension on Base Sepolia verified the cashflow timeline, subscription amount and subscription button tips. Its first location took 839 milliseconds. These are individual measurements, not latency guarantees, and do not imply equally fast state queries or transaction confirmation.

The 29 existing guidance-rule checks and the gateway regression check passed. This update did not reset products, advance financial time or submit public-chain business transactions. A complete lifecycle was not rerun for this frontend change. Raw screenshots and results remain locally under `.data/unified-app/validation/guidance-resources/` without wallet keys.

The repeatable browser checks are `scripts/test-unified-guidance.mjs` and `scripts/test-unified-guidance-rabby.mjs`. The former uses real signed sessions and read-only browser-response fixtures; the latter uses an existing isolated real Rabby profile. Both run headlessly and require explicit local test configuration paths.
