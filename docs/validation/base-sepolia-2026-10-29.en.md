# Independent Base Sepolia deployment validation

Validation took place on 29 October 2026. The independent `deye-base-sepolia-test` application uses Chain ID 84532 and Circle's official test USDC. The existing public private-chain demonstration remains on 20261008. Role addresses are reused, while contracts and application state are separate.

## Public-chain results

The station credential, RevenueShareVaultV5 and HouseholdBilling contracts are deployed on Base Sepolia. All three received Sourcify `exact_match` results and verified source status on Blockscout. Circle USDC is an external contract and is not represented as code deployed by this project.

Actual transactions cover station minting, owner custody authorization, admission, valuation submission and trustee approval, fundraising publication and both investors' eligibility approvals. The associated application, offer review and agreement message-signing workflow also completed. Each investor made a 1 USDC subscription, added 2 USDC, received order review and reclaimed the full amount. The addition invalidated the earlier approval and required review of the latest cumulative order.

Actual Rabby 0.94.11 ran in six isolated, hidden Chromium profiles. All six role accounts completed message-signature authentication through the independent HTTPS entry. The investor also used actual application controls and Rabby for rejection, retry, USDC approval, subscription, browser refresh and refund. The entered amount survived rejection. All additional test escrow was refunded.

Reconciliation covers 31 successful business operations, comprising 23 operations with chain transactions and eight explicitly off-chain steps. Thirty business transactions matched their persisted intents, sender, Chain ID, target, calldata, successful receipt, expected events and relevant USDC transfers. The accompanying `base-sepolia-transactions-2026-10-29.json` contains reviewed public evidence without private keys, message signatures, raw station evidence or API credentials.

The delivered product is fundraising, with zero cumulative escrow and zero DRS supply. Each dedicated investor has 20 Circle test USDC and sufficient remaining test ETH for transactions of the tested scale. The other role addresses have also been funded.

## Fixes and regression

Real testing exposed a propagation delay between the wallet's broadcast RPC and the backend RPC. Registration now retries the original hash within a limit, and the browser persists a broadcast hash before registration. The original station mint was reconciled after recovery without another mint.

The anonymous RPC's 25-requests-per-second limit and 200-block log-window limit were observed. The application now uses read-only Multicall3 aggregation, throttling, bounded retries and restartable event caching. Multicall3 is used only through eth_call and neither signs nor holds application funds. A rejected request previously reset the subscription input; the fix passed an actual wallet retry. Test-funds dialog layout and token labeling were also inspected.

The model/data suite passed 27 tests, and the revenue-rights contract suite passed 15. The complete contract suite passed 31, with one existing optional fork test skipped because that mode was not enabled. Workflow tests passed 38, guidance tests passed 29, and the new RPC, policy and event-cache tests passed three. The local four-role regression still covers settlement, nine monthly periods, claims, atomic transfers, partial redemptions, distinct trustees and restart recovery. Type checks and website builds passed.

## Preservation and limits

The original demonstration's five runtime configuration fingerprints, container identities, scenario, contract addresses, admitted-station count and share supply match the pre-implementation baseline. Its containers, tunnels and business state were not reset or redeployed. The GitHub website adds a separate Base Sepolia button while Launch App and remote.json retain the original destination.

A fully funded settlement and the subsequent monthly payment, distribution, six-month transfer, redemption and expiry paths were not accelerated on the public chain. These remain subject to actual funding and block dates. The complete lifecycle was exercised in local regression and remains available in the original demonstration. HouseholdBilling is deployed with verified token, vault and role bindings; a positive Base Sepolia monthly-payment test still requires actual settlement and completion of its service period.

Station data is fixed recorded evidence; tariffs and forecasts remain disclosed assumptions. No oracle was added. Actual extension testing used Rabby and does not establish MetaMask security classification or extension compatibility for the new hostname. The Mac application and tunnel must remain running, while public-chain records remain available independently of the Mac.

Post-publication checks passed against the actual GitHub Pages site. The homepage opens the original demonstration and Base Sepolia separately, bilingual documentation supports direct links and refresh, and mobile layout has no horizontal overflow. Both live PDF downloads have SHA-256 hashes identical to the reviewed files.
