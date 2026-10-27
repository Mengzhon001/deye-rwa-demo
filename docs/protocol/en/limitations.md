# Risks, limitations and troubleshooting

This platform demonstrates verifiable workflows; it is not production-ready financial infrastructure. It supports multiple independent test products on a local private chain using demo payment assets. Contracts, demo USDC, eligibility, subscriptions and holdings are isolated per product. Reusing station evidence is only a test convenience, not another assignment of real rights; production requires cross-product rights uniqueness and legal registration. Contracts have not been independently audited. Access control, custody, legal agreements, personal-data handling and long-term operations need production-specific assessment.

## Model and collection risk

Historical seasonality does not guarantee future energy. Equipment faults, weather, export policy, tariffs and collection delays can change outcomes. Short records, missing exports and baseline changes require disclosure. Deye Cloud revenue APIs are unavailable, so this project does not claim to reproduce its official revenue model.

Redemption cannot be guaranteed without liquidity. Finite revenue rights have no equipment residual-value or principal guarantee. Actual assignment, enforcement, tax and settlement depend on final valid agreements and applicable local requirements.

## Common issues

| Issue | What to check |
| --- | --- |
| Empty product hall | Expected for Draft. Complete admission, valuation approval and fundraising publication. |
| Wallet keeps connecting | Check Docker health, Chain ID and pending prompts. Use RPC 18545 locally or the current HTTPS RPC supplied by the remote app. Select an installed wallet; embedded browsers may lack extensions. |
| Faucet worked but order is zero | Check available wallet funds. Orders grow after subscription; DRS appears only after settlement. |
| Cannot enter a privileged role | Use the configured address shown in the dialog. Selecting a role does not grant it. |
| Offer requires reassessment | Review baseline changes, input hashes and validity; obtain a new intermediary assessment and trustee approval. Do not bypass checks. |
| Explorer has no transaction | Check the chain receipt before the indexer. Confirmation and indexing are different states. |
| Network unavailable | The homepage and docs should remain readable. Restore API/node access before using the app; never substitute invented statistics. |

## Remote demonstrations

Another computer's 127.0.0.1 points to itself, not this machine. Remote use requires reachable website, filtered RPC and explorer endpoints with HTTPS, allowed origins, sign-in domain and network URLs configured accordingly. Expose only the filtered gateway, not the internal node's management methods.

## Before real-money use

Complete independent contract auditing, threat modelling, authority management, data and financial reconciliation, key custody, backup drills and legal review. The MIT license enables use and review; it is not a security assurance or an investment-return promise.


## Household billing boundaries

The demo supports actual test-USDC household wallet payments and intermediary reconciliation. There is no verified solar self-use settlement meter, production household invoice, fiat debit channel or production collection mechanism. Self-use, discounts and modeled bills are reviewed demo assumptions, not instructions for real billing. Monthly retail rates exclude fixed and demand charges and do not reproduce time-of-use tariffs or complete taxes. An all-grid comparison does not establish that selling rights is cheaper than retaining free self-use. Unpaid household bills and unremitted exports are collection risks; forecast bills are not collected cash.
