# Smart contracts and public source

The revenue-right scenario uses station credentials, a revenue-share vault and a test payment token. Project-owned contracts are distributed under MIT. Dependencies retain their own licenses; the package includes the OpenZeppelin license. This version has not undergone an independent security audit.

## Contract responsibilities

| Contract | Responsibility and principal interfaces |
| --- | --- |
| DeyeRWA | Station NFT and facility metadata hashes. The intermediary calls mintFacility; the owner calls approve for custody. |
| RevenueShareVaultV5 | Custodies rights and manages valuations, eligibility, fundraising, shares, distributions and exits. |
| HouseholdBilling | Publishes bill-specific invoices. The designated household calls payBill, the separate system treasury calls fundExport, and the intermediary calls confirmReceipt to release reconciled net cash into the vault. |
| MockUSDC | Six-decimal demo payment token minted only by authorized system roles. It is not Circle USDC. |
| Calendar | Calendar-month calculations for terms, fees and quarterly windows. |

Principal business interfaces include admit, proposeValuation, approveValuation, publish, subscribe, reviewSubscription, withdrawSubscription, settle, receiveRevenue, distribute, claim, peerTransfer, requestRedemption, processRedemptions, openCase, supportCase, approveCase and closeProduct. The ABI below contains full parameters and events.

## State and permissions

The lifecycle runs from Draft through Fundraising to Active, with Failed or Closed terminal paths. Publication does not mint investor shares; successful settlement does. MANAGER controls management actions, TRUSTEE independently approves valuations and cases, and TREASURY authorizes vault collections. HouseholdBilling transfers reconciled net proceeds after intermediary confirmation, while a separate system account simulates only the grid-export leg. The contract also checks eligibility, order approvals, locks, current valuation and duplicate events.

The station NFT is not an equipment-title transfer document. Contracts check submitted hashes and workflow authority; they cannot prove an offchain agreement is enforceable or an API reading is true. Documents and evidence still require offchain governance.

## Source and deployment correspondence

The panel reads current-scenario addresses and compares the published build's runtime code and immutable values. A match is not a security audit. Check source verification separately on the Blockscout contract page; an unindexed or unverified contract must not be described as verified.

The download contains Solidity sources, required dependency sources and licenses, ABI, standard compiler input, a pinned dependency lock, revenue-contract tests and a deployment template. It excludes project credentials, wallet keys and raw station evidence.

```sh
# Run inside the extracted package
npm ci
npm run compile
npm test
npm run reproduce
```

The reproduce command checks that standard compiler input produces the runtime code and ABI in the release manifest. The deployment template requires your own system signer and role addresses. Do not test with real assets. Downloading the package does not redeploy the current demo.

<div id="contract-runtime">Loading source and deployment manifests…</div>

RevenueShareVaultV4 supports repeated additions during fundraising. Every addition updates cumulative escrow and its review nonce, invalidating prior approval. The intermediary reviews the updated total, and refunds return all cumulative escrow. Earlier RevenueShareVaultV3 deployments do not support additions; RevenueShareVault retains its original cooling rules. Historical deployments and transactions remain unchanged by website updates.


New local and remote V5 demo pools declare distributions every calendar month. Quarterly redemption windows remain independent. Original V4 deployments retain quarterly distributions. The UI reads the current contract cadence. Preserving positions on the existing local Anvil pool required runtime-code maintenance, not a proxy-upgrade transaction. Blockscout retains the original creation transaction and marks the historical verified code as changed. The deployment endpoint separately matches the current V5 runtime against its source. Fresh V5 deployments use normal source verification.
