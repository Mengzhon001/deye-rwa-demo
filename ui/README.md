# UI Demo Dashboard

This workspace serves the presentation layer for the management demo. It combines:

1. A manager dashboard for deploying facilities, tracking lifecycle events, watching automated revenue ticks, and monitoring contracts plus bond inventory
2. An investor portal for MetaMask connection, real `digital_bond` balance reads, demo USDC funding, and real on-chain buy or redeem actions
3. A lightweight backend that wraps the existing off-chain simulator and on-chain demo conductor
4. A bilingual UI layer with an `EN` / `中文` switch in the top header for live management demos

## Quick Start

```bash
cd ui
HOME=/tmp npm run dev
```

Open:

1. `http://localhost:4173/manager`
2. `http://localhost:4173/investor`

The dashboard defaults to English and lets operators switch to Simplified Chinese from the header. The selected language is stored in the browser and reused across refreshes.

For real MetaMask buy and redeem transactions in the browser:

```bash
cd ../onchain
npx hardhat node
```

In a second terminal from the repo root:

```bash
HOME=/tmp HARDHAT_NETWORK=localhost npm run dev:ui:local
```

## Demo State Model

The UI intentionally separates two kinds of state:

1. Real chain-backed state:
   `DeyeRWA` facility status, `RWAVault` supply and NAV, `DBondMarket` inventory and reserve, contract addresses, and connected-wallet `digital_bond` balances
2. Simulated demo-market state:
   scheduler annotations, compressed-cadence labels, and presentation-focused transaction metadata

## Validation

```bash
npm run typecheck
HOME=/tmp npm run test:demo-ui
```

## Notes

1. `HARDHAT_CONFIG=../onchain/hardhat.config.ts` is baked into the UI scripts so the backend can reuse the existing local demo contracts and scripts.
2. MetaMask connection is real, and investor buy and redeem actions are real on-chain transactions when the UI is pointed at `HARDHAT_NETWORK=localhost`.
3. The manager dashboard no longer requires a manual period trigger. Active facilities auto-generate one demo settlement tick every 30 seconds.
4. Localization is presentation-only. It does not modify on-chain interfaces, off-chain schemas, Merkle leaf definitions, or replay-sensitive handoff artifacts.
5. This change currently supports English and Simplified Chinese (`zh-CN`).
