# On-chain Workspace

This workspace contains Solidity contracts and tests for the demo tokenization, reward, and bond flow:

1. `FunctionsRouter`
2. `DeyeRWA`
3. `EnergyRevenue`
4. `RewardDistributor`
5. `RWAVault`
6. `DBondMarket`
7. `VRWATokenTemplate` (optional ERC-20 starter; the current bond demo uses `RWAVault` shares directly)

## Quick Start

```bash
cd onchain
npm install
npm run build
npm test
```

## Fork Testing

To run the demo flow against a local Hardhat network that forks from a live chain RPC:

```bash
cd onchain
export FORK_RPC_URL=https://your-rpc-url
export FORK_BLOCK_NUMBER=12345678
export FORK_TEST_TIMEOUT_MS=180000
npm run test:fork
```

Notes:

1. `FORK_RPC_URL` is required for fork tests.
2. `FORK_BLOCK_NUMBER` is optional but recommended for deterministic replay.
3. `FORK_TEST_TIMEOUT_MS` is optional and can be increased if your RPC is slow.
4. The fork tests still deploy the demo contracts and mocks locally; the fork provides the base chain state and execution environment.
5. A dedicated archival RPC is strongly recommended. Free public RPCs often rate-limit Hardhat forking traffic.

## Local Deployment

```bash
npm run deploy:local -- --out ./examples/deployment-manifest.local.json
```

The deployment script now prints a JSON manifest and can also persist it to disk. The conductor uses that manifest to resolve:

1. deployed contract addresses
2. the local `deployer`, `oracle`, and `treasury` accounts

Checked-in manifest shape example:

- `examples/deployment-manifest.sample.json`

If you want to reuse the manifest across separate conductor commands, run against a persistent local node:

```bash
npx hardhat node
HARDHAT_NETWORK=localhost npm run deploy:local -- --out ./examples/deployment-manifest.local.json
```

## Demo Conductor

The on-chain workspace now includes a conductor script that stitches together the off-chain artifacts and the on-chain contracts:

```bash
cd onchain
npm run demo:conduct -- run-demo --branch direct --deployment ../offchain/examples/facility-record.sample.json --period ../offchain/examples/period-payload.sample.json --admin 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

Available stages:

1. `deploy-facility-onchain`
2. `submit-period`
3. `submit-lifecycle`
4. `deposit-to-vault`
5. `claim-direct`
6. `claim-via-vault`
7. `run-demo`

`run-demo` will auto-deploy the contracts when no manifest is supplied. The stage commands (`deploy-facility-onchain`, `submit-period`, `submit-lifecycle`, `deposit-to-vault`, `claim-direct`, `claim-via-vault`) are intended for a persistent node plus manifest workflow.

## Demo Notes

1. `FunctionsRouter` is the reviewed off-chain ingress for deployment, production reports, cashflow reports, and lifecycle events.
2. `DeyeRWA` now models one facility as one transferable token with explicit lifecycle status.
3. `EnergyRevenue` records stablecoin intake by facility-period and opens funding only after treasury deposit.
4. `RewardDistributor` opens claims only when production-side and cashflow-side amounts match for the same facility-period.
5. `RWAVault` custodies deposited facility tokens, mints transferable `digital_bond` shares, and claims rewards as the current holder.
6. `DBondMarket` sells vault-minted `DBOND` inventory and processes real on-chain redemptions against a seeded mock-USDC reserve.
7. The first bond issuance rule is NAV-based using each deposited facility's `acquisitionCostUSDC6` as book value.
8. Claim rights follow the current facility-token holder at claim time.
9. Use `MockUSDC` and local deployment only for demonstration and testing.
10. For browser-based MetaMask buy or redeem flows, run the UI and contracts against `HARDHAT_NETWORK=localhost` with `npx hardhat node`.
11. The conductor accepts either raw off-chain records or the checked-in payload artifacts under `../offchain/examples`.
