# Base Sepolia workspace read performance

This investigation concerns the household workspace remaining on its loading screen after signed authentication. The backend still uses `https://sepolia.base.org`; no RPC provider has been substituted. Live probes of `eth_chainId` and `eth_blockNumber` returned successfully in approximately 310 ms and 291 ms. These probes do not establish performance for every method, but they confirm that the endpoint was reachable during the investigation.

Workspace assembly reads product terms, several accounts, subscriptions, distributions and historical events. The previous implementation required several independent read rounds and retrieved the same product list twice. The HTTP library also allowed a single request to wait for five minutes, which could block the serialized read queue when an upstream response stalled.

The update groups core contract reads, account reads and claimable distributions, and uses Multicall3 for multiple native-token balances. Published products and the product selector share one list query. Individual RPC HTTP requests are capped at ten seconds, and HTTP throttling no longer triggers implicit transport retries. Existing read-only JSON-RPC rate-limit retries remain bounded, and broadcasts are not retried by the read wrapper. The browser retains its forty-five-second workspace timeout and authenticated retry screen.

| Check | Observed response times |
| --- | --- |
| Household workspace before the change | 15.840 s, 11.160 s |
| Household workspace after the change | 12.657 s, 8.141 s |
| Investor workspace after the change | 7.599 s, 9.384 s |
| Real Rabby household sign-in and reload | 9.830 s, 8.261 s |

These are a small set of sequential measurements through the same public entry, not a latency guarantee. Initial reads can still include historical reconciliation, and public RPC responses fluctuate. No current rate-limit incident was established by these checks. A dedicated endpoint should be evaluated against the same workload rather than assumed to eliminate application-level work.

Before and after the update, contract addresses, product phase, vault cash, cumulative subscriptions, total share supply, and the four accounts' balances, eligibility, subscriptions and claims matched exactly. Public-chain checks did not submit business transactions on users' behalf.

Seven RPC and aggregation checks, thirty-eight workflow presentation checks and TypeScript validation passed. The existing four-role lifecycle regression also passed on a disposable Hardhat chain, covering nine months of receipts, distributions and claims, atomic transfers, partial redemption, distinct trustees, restart, reassessment and reset recovery. Real Rabby testing separately completed household sign-in and reload on the public Base Sepolia environment. Deployment restarted only its application container and retained the existing persistent business data and contracts.
