# Local Oracle on Sepolia

## Environment and data boundary

The third network-menu entry is an isolated self-hosted Oracle test environment. It and the original Base Sepolia product both use Chain ID 84532, so test ETH and Circle test USDC balances in a given wallet are shared. They have separate vaults, billing contracts, business stores and sign-in sessions. A switch between them does not require a wallet chain change, but the target backend requires a new sign-in signature. The private demonstration remains the full-lifecycle environment.

The local Oracle service reads the authorized Deye read-only API. It checks daily completeness for a full calendar month and calculates six-decimal USDC amounts using approved parameters. A separate key signs an EIP-712 report, and a different account pays gas to register it on Base Sepolia. Deye has not digitally signed the observations, so the interface says that the self-hosted Oracle checked and signed the report. This is not a Chainlink-operated DON and does not rely on CRE deployment access. API, record or parameter failures stop submission; replay or synthetic data cannot replace a monthly Oracle read.

## Report, bill and payment

The report binds the chain, registry, station, vault, new billing contract, household, observation month, service period, source and parameter digests, USDC amounts, revision and expiry. Two distinct trustees approve the station, first complete observation month and parameter digest. A billable report can be registered only after settlement and after both the service period and its calendar observation month have ended. The new billing contract verifies and consumes the report in the same transaction and uses its amounts directly. A historical validation-only report cannot create a charge.

After a bill is published, the household pays Circle test USDC from its own wallet. Export receipts remain simulated funding from an independent test treasury and are labeled accordingly. The intermediary reconciles both sources before confirming pool receipt. Expenses, valuation and investor distribution follow collected cash. A report signature is neither independent Deye certification nor proof that the household or grid paid.

## Acceptance status

As of 9 November 2026, the Oracle actually read the complete August 2026 calendar month from the Deye API, signed a report and registered it as validation-only. Its ID is `0x27a8e1073e45d570c03dcd07c48efe5f655ad23f37b045ef277359c323f7a965`. The [registration transaction](https://base-sepolia.blockscout.com/tx/0x3df71ae9d301c9a5736316fac0857e9f1507549492f5c39e6a79be41cf51e411) is confirmed. The new billing contract rejects that report for billing. A billable report, household payment, intermediary confirmation and distribution require the new product to settle and reach a real month end; this sequence has not yet passed acceptance.

Select the third entry from the [public homepage](https://mengzhon001.github.io/deye-rwa-demo/), then inspect the observation month, source and parameter digests, reporter and registration transaction on the application's Oracle reports page. The [station credential](https://base-sepolia.blockscout.com/address/0x18a88350eb54FD2A98902509DF110851097c6a9b), [vault](https://base-sepolia.blockscout.com/address/0x0479eB8a2bb68D23bAa88de32B27Af63bFCf0C32), [registry](https://base-sepolia.blockscout.com/address/0x49a3b54c2972786987B24dC44490332bcb5D41c6) and [new billing contract](https://base-sepolia.blockscout.com/address/0xFa650D2619452E1763695c780F478bDeA7027D28) have distinct explorer pages.

## Local operation

The operator keeps API credentials, the reporter signing key and the gas account in restricted local configuration. `npm run oracle:dry-run` only reads and calculates. `npm run oracle:validate-report` registers a validation-only report. `npm run oracle:billable` checks two trustee approvals, product settlement and the real monthly cutoff. Run `npm run oracle:check` first to verify chain identity and balances. Keys and raw observations are excluded from public source, the browser and this manual.
