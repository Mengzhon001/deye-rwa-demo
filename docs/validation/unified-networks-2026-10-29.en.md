# Unified network entry validation

This update provides one HTTPS application for the private demonstration and Base Sepolia. The existing backends retain their data directories, contracts and role configuration. The gateway serves static pages and fixed network routes. It does not sign transactions, deploy, reset products or expose chain administration. Existing business records were neither migrated nor cleared.

## Results

All six configured business accounts signed in on each chain and read the corresponding state. Checks verified the actual application origin, role and Chain ID in the login message, and distinct product contract addresses. A private-chain session could not authenticate to Base Sepolia, and authentication without an explicit network path was rejected.

An isolated real Rabby 0.94.11 profile in a hidden browser switched from Base Sepolia to the private demonstration and back. Each destination required a new login signature. Returning to Base preserved the product and the test wallet's 20 USDC balance. The browser then subscribed with 1 USDC, reloaded the page and obtained a full refund. The final token balance matched the original balance. No business transaction was submitted to the private chain, and neither chain was reset or time-advanced.

Browser checks covered a declined wallet switch, unresolved operations, an unavailable destination, bilingual network descriptions and the mobile dialog. Rejection and destination failure retained the original application context. Pending operations stayed with their own chain and were not resubmitted on the other network. Testing identified and fixed dialog alignment and an English text-replacement defect.

Proxy checks verified exact request-body forwarding, fixed upstreams, the actual request Origin, chain-specific session cookies, CORS restricted to public metadata and rejection of unscoped business requests. The existing 38 UI workflow tests and 29 guidance tests passed.

## Funding the actual investor address

Earlier funding covered the two dedicated test investors but omitted the account actually used, `0xE145d449f54551c235dfA30663D730B85fA3eAaa`. The dedicated test treasury has now transferred 0.002 Base Sepolia ETH and 20 Circle test USDC to that address. Sender, recipient, amount, successful receipt and the token Transfer event were verified. This was neither a bridge of private-chain balances nor application minting.

The ETH transaction is `0x6589c49e5523f45da20f333e1ff2ee2fa2b02ca440ca9efff6ae018effe58ba4`. The USDC transaction is `0x1ebd30850940140c5f8551376c8deea79cf4134602b3e82f432986494d391efc`. Checked balances were 0.002 ETH and 20 USDC.

## Scope

This validation covers the unified entry, network switching, authentication and data isolation, and Base USDC subscription/refund. It does not repeat the entire private-chain lifecycle or claim fully funded settlement and monthly distributions on the public chain. Funding, eligibility and products remain chain-specific. Real public-chain time and Circle token supply restrictions are unchanged.

## Live publication checks

After GitHub Pages deployment, a hidden browser selected each network from the homepage and opened the shared application. Checks passed for English documentation deep links and reload, both PDF checksums, mobile layout and static documentation with the backend unavailable. The business API returned 20000000 smallest units, or 20 USDC, for the actual investor account, matching its on-chain balance.

## Network picker visual update

The homepage native select has been replaced with an icon-based rounded button and a custom popover. The popover identifies the selected chain, describes each environment and explains that switching does not move funds. The interaction takes inspiration from Aave’s icon-based selection and popover list, using this site’s dark and mint palette. Checks cover arrow keys, Enter, Escape, outside dismissal, focus restoration, mobile layout and both application entries. Selecting a network refreshes metadata without remounting the homepage animation.

## Feedback while loading an authenticated workspace

A real Rabby test confirmed that product, balance and transaction reads can take about ten seconds after the Base Sepolia login signature has already been verified. The application now immediately identifies the signed-in wallet and shows a loading indicator and the selected network. After eight seconds it explains that the network is responding slowly, and a query exceeding forty-five seconds offers a retry. Retrying a failed data read does not require another signature; an expired session still requires sign-in.

Hidden browser checks cover first sign-in, slow responses, session restoration, both languages, mobile layout, timeouts, failed-read recovery, duplicate clicks and wallet changes during loading. Delays and failed responses are browser fixtures, while authentication uses real signatures and backend sessions. The actual Rabby extension separately passed public Base Sepolia sign-in and session restoration, with visible loading before the workspace appears. These checks perform authentication and reads only; they do not submit business transactions or reset scenarios.

## Guide resources at the unified entry

The unified gateway previously omitted the static aliases for `/guidance-driver.js` and `/guidance-driver.css`, causing resource errors when signed-in users selected “Locate the operation”. Both URLs now serve the locally bundled, fixed Driver.js version. The loader checks both script and stylesheet completion, cleans up failed resources for retry, and outlines the business control already located if the spotlight cannot load.

Gateway regression checks cover GET, HEAD and content types for both resources while retaining network, cookie and origin isolation checks. Public browser checks cover the eligibility-application target on both chains, both languages, repeated location, and recovery from simulated script or stylesheet failures. Eligibility is adjusted only in browser response fixtures; no actual eligibility or application is changed.

The real Rabby extension separately verified the public Base Sepolia page, highlighting the cashflow timeline, subscription amount field and subscription button in sequence. Both resources returned 200, no JavaScript exceptions occurred, and no subscription transaction was submitted.
