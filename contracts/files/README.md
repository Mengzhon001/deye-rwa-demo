# Deye RWA contracts

Local revenue-rights demonstration. Project code is MIT; see LICENSE and licenses/. This code has not been independently audited.

## Reproduce and test

Use Node.js 22.19 or later. Run npm ci, npm run compile, npm test, and npm run reproduce. Solidity is pinned to 0.8.26 with Cancun and optimizer runs 200; the local solc package avoids compiler downloads. Tests use disposable in-process Hardhat accounts.

compiler-input.json contains the exact standard compiler input; vendor/ includes the transitive OpenZeppelin sources used. build-manifest.json records compiler output and ABI. npm run reproduce checks both. The outer source manifest identifies the archive by SHA-256.

## Optional local deployment

Set LOCAL_RPC_URL (default http://127.0.0.1:18545), DEPLOYER_PRIVATE_KEY for a funded local system wallet, MANAGER_ADDRESS, TRUSTEE_A_ADDRESS, TRUSTEE_B_ADDRESS, and TREASURY_ADDRESS. Run npm run deploy. This explicitly deploys a NEW set of contracts and does not update an existing application's deployment manifest. Do not use real-money accounts. No secrets are included in this package.

Equipment remains with its owner. No guaranteed coupon or principal repayment is provided. One station NFT identifies defined rights; investor shares mint only at successful settlement.
