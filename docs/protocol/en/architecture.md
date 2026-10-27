# Architecture, APIs and recovery

The local environment runs Anvil, a filtered RPC gateway, Blockscout, a backend and a frontend. Hardhat compiles and tests contracts. The homepage, docs and app share one HTTP service. Static pages do not depend on successful wallet or RPC responses.

## Four kinds of state

API observations, model results, backend reviews and chain confirmations are separate. Document approval is not a successful transaction, wallet submission is not confirmation, and Blockscout indexing does not determine whether a transaction succeeded.

## Principal HTTP endpoints

| Endpoint | Purpose |
| --- | --- |
| GET /api/network | Chain ID, wallet RPC, explorer and public role configuration. |
| GET /api/public/overview | Curated station and product counts, provenance and availability; no raw business state. |
| GET /api/public/deployment | Current deployment addresses, transactions and source-build correspondence. |
| GET /api/products?status=current | Authenticated published-product listing. history selects failed/closed products; drafts are always excluded. |
| POST /api/auth/challenge | Submit address and requestedRole for a one-time role-bound challenge. |
| POST /api/auth/verify | Submit nonce and signature; successful verification creates an HttpOnly session. |
| GET /api/session/current | Inspect the session; still check wallet account and chain ID. |
| POST /api/auth/logout | Clear the session. |
| GET /api/state | Authenticated business, observation and confirmed chain state. |
| POST /api/actions | Execute business actions with role and idempotency checks. |
| POST /api/wallet/prepare | Persist intent and return transactions for wallet signing. |
| POST /api/wallet/submitted / confirm / reject | Register submission, verify receipts or record rejection. |
| POST /api/faucet | Explicitly request test funds for the current wallet. |

Wallet-mode writes require a signed session and same-origin JSON. Requests bind expectedVault to prevent using an old scenario after reset. Public responses exclude secrets, credentials, raw signed transactions and review documents.

## Transaction recovery

The backend saves an operation intent before wallet signing and serializes operations. Receipt verification checks sender, chain, target, method, arguments, value and expected events. A transaction hash alone does not prove completion.

Refresh recovers from persisted intents, receipts and contract state. Rejection has an explicit status; reverted transactions do not advance the workflow. Pending or replaced transactions and indexing delays should be inspected in the transaction log, not hidden by creating a second payment.

## RPC boundary

Wallets use the port 18545 gateway. It allows queries and broadcasting signed transactions, but blocks node signing, impersonation, balance changes, chain resets and arbitrary time advancement. Never expose internal Anvil directly. Controlled financial-time advancement is a demo feature and does not produce real telemetry.


## Monthly invoices and fund movement

The intermediary publishes an invoice and the household approves and pays its test USDC into HouseholdBilling. A separate system account records the grid-export receipt. Both components remain in the billing contract until the intermediary signs reconciliation. The contract then handles station expenses once and transfers assigned net proceeds to the vault. The backend retains separate invoice, household-payment, export-funding and confirmation records, preventing receivable and cash double counting. Restart recovery reads contract state and events. Previously confirmed historical collections are not invoiced again.
