# Access and complete walkthrough

Remote testers open the GitHub homepage and do not need to install or start a backend on their own computers. The local deployment section is for the operator who runs the services.

## Remote testing with colleagues

If the address bar shows `127.0.0.1:4174` or `localhost`, the browser is contacting your own computer rather than the shared test environment. Reopen the GitHub homepage and select Launch App instead of using a local deployment address. After signing in, the address bar must remain on the public HTTPS application domain.

If opening a connected site in Rabby leads to `127.0.0.1`, disconnect that old site and enter the correct application from GitHub before reconnecting. Do not delete wallet accounts or reimport private keys.

Open the [GitHub homepage](https://mengzhon001.github.io/deye-rwa-demo/) and select Launch App. This redirects to the HTTPS application hosted on the operator's Mac. Choose a role, select Rabby, then connect and sign in. Public pages and documentation do not request a wallet. Launch is enabled only after the current HTTPS domain passes real-wallet checks; otherwise it explains why access is pending. The application, RPC and Blockscout use Cloudflare tunnels.

Install the wallet from the [official Rabby website](https://rabby.io/). If MetaMask is also installed, explicitly select Rabby at login; requests are sent to the selected wallet. Public MetaMask access has not passed verification. Local MetaMask support remains available.

Rabby may show ordinary notices for a new, unlisted or low-traffic site. Read Risk Detail and check the exact address supplied by the operator. A malicious-site classification is not an ordinary new-site notice: do not continue or disable safety checks. The website never asks for recovery phrases or private keys. Dedicated test accounts are shared privately.

The remote scenario uses its own Chain ID, `20261008`. Use the application's Add network button and check its current RPC, Blockscout and contract addresses instead of the parameters in the local deployment section. Tunnel addresses may change after a restart; ordinary stops and starts retain chain and business data.

The operator supplies separate test accounts to the household, intermediary and two trustees. Investors can use their own test wallets, apply for eligibility and explicitly claim test funds. Do not use real funds on this network. Monitoring periodically fetches real API readings and displays the capture time. Signed offers retain the evidence reviewed when approved. Tariffs, forecasts and receipts remain separately labelled assumptions or simulations.

### Investor access and another issuance

The remote environment includes “Solar Rights · Investor Experience”. Its agreement, custody, valuation approval and fundraising publication are complete. Investor shares have not been issued: they are minted only at settlement. Open this product in the hall, claim its test funds and subscribe. The two dedicated investor accounts have already passed this product's eligibility review. Other wallets must still apply and obtain intermediary approval. There is no cooling period. The intermediary can review immediately, and investors can cancel for a full refund before settlement.

“Solar Rights · Issuance 01” remains an empty draft. Staff can select it at the top of the application and begin with the household application. The intermediary can also select “New issuance product” to deploy another set of contracts. Drafts stay out of the investor hall until valuation approval and fundraising publication.

Each product has its own test USDC, eligibility, orders and holdings. Check its name, contracts and balance after switching, then claim that product's test funds. A normal reset affects only the selected product. Reusing station evidence is a demonstration convenience and does not permit real revenue rights to be sold twice.

All products share the test chain's financial clock. Advancing it changes every product's fundraising deadlines and valuation validity. Coordinate this action during shared testing. API capture timestamps remain unchanged.

The operator manages this environment from the source project using `npm run remote:start`, `npm run remote:status`, `npm run remote:stop` and `npm run remote:publish`. The Mac must remain powered on and connected, with Docker and the tunnels running. Visitors to the public GitHub pages do not need these commands or a backend installation.

## Local deployment and access (operator computer only)

```sh
npm ci
npm run web3:init
npm run web3:check
npm run web3:up
npm run web3:health
```

The homepage is at `http://127.0.0.1:4174/`, the application at `/app/` and docs at `/docs/`. Blockscout uses `http://127.0.0.1:4000/`. MetaMask uses RPC `http://127.0.0.1:18545`, Chain ID `20260922` and native test currency DETH. Double-clicking an HTML file cannot start the system.

## Prepare role wallets

Use wallets reserved for local testing. The maintainer configures the household, intermediary and two trustee addresses and supplies the corresponding local test accounts to participants. Never enter a real wallet seed into project configuration or documentation. Launch App selects a role before requesting connection and a signature. An ordinary unassigned wallet can apply as an investor.

Use the explicit faucet for Gas and subscription funds. Check available wallet funds rather than the order amount. If the wallet displays old mUSDC after reset, add the current token through the application.

## Complete walkthrough

1. The household applies; the intermediary reviews documents and prepares an offer.
2. A trustee approves the offer; the household accepts and signs the agreement.
3. The intermediary mints the credential, the owner authorizes custody, and the intermediary admits the rights.
4. The intermediary submits the pool valuation, a trustee approves it, and fundraising is published.
5. Two investors apply for eligibility; the intermediary approves each onchain.
6. Investors approve and subscribe; demonstrate cancellation and re-subscription, then intermediary order approval.
7. Approve every order and settle immediately once funding conditions are met; no financial-time advancement is needed for subscriptions.
8. After the service month ends, the intermediary publishes its bill under Monitoring & evidence. The household switches to its own wallet and approves and pays the USDC bill under Funds & monthly bills. The intermediary separately records the simulated grid-export payment, reconciles both amounts and confirms net cash into the pool. It then accrues fees, refreshes approved valuations and declares a monthly distribution. Use the guide’s investor handoff to inspect and claim.
9. After six months, demonstrate a negotiated transfer, deviation review, partial redemption and cancellation of unfilled shares.
10. Open a servicing case, obtain snapshot-holder support, then secure two distinct trustee approvals.
11. At expiry, settle receivables and liabilities, approve final valuation, close and claim remaining cash.

At each step check the actor, prerequisites, wallet confirmation, chain result and next action. Inspect receipts during explorer delays rather than submitting duplicates.

## Reset and maintenance

Application reset archives the scenario and deploys a new product while retaining station evidence and historical chain records. Stopping and restarting containers also preserves volumes.

```sh
npm run web3:status
npm run web3:logs
npm run web3:down
npm run web3:up
npm run web3:backup -- .data/web3-backups/demo-1
npm run web3:restore -- .data/web3-backups/demo-1 --confirm
```

`web3:clean -- --confirm` deletes the chain and databases. It is a maintenance command, not a business-page action. Back up first.

## Automated validation

`npm run web3:e2e` backs up the environment, runs the wallet and five-year lifecycle, and restores the prior state afterward. Stop manual business activity while it runs. Test funds and synthetic samples must not be left in the actual API demonstration scenario.


Download the illustrated operating manual in [English (PDF)](https://mengzhon001.github.io/deye-rwa-demo/manual/manual.en.pdf) or [Chinese (PDF)](https://mengzhon001.github.io/deye-rwa-demo/manual/manual.zh.pdf). Public copies contain no private keys.
