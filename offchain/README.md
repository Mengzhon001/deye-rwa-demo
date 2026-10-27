# Off-chain Workspace

This workspace contains the off-chain side of the demo:

1. Facility deployment and tokenization-ready metadata generation
2. Operating-period simulation with production and cashflow outputs
3. Lifecycle event generation for broken and retired facilities
4. Reward evidence and claim-root builder
5. On-chain relay payload builder
6. Reconciliation helper

## Quick Start

```bash
cd offchain
npm install
npm run typecheck
npm run dev -- ./examples/period-input.sample.json
```

The default CLI flow reads a lifecycle-aware reward input bundle and prints an approved relay payload that can be submitted to the on-chain demo flow.
That payload now contains three contract-facing sections for the core demo:

1. `productionReport`
2. `cashflowReport`
3. `rewardFunding`

The off-chain CLI can also emit the other conductor inputs needed by the combined demo:

1. deployment submission payloads
2. lifecycle submission payloads

## Lifecycle Commands

```bash
cd offchain
npm run demo:deploy -- ./examples/facility-deployment.input.sample.json
npm run dev -- build-deployment-payload ./examples/facility-record.sample.json --admin 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
npm run demo:simulate -- ./examples/facility-deployment.input.sample.json ./examples/period-simulation.input.sample.json
npm run dev -- build-period-payload ./examples/period-input.sample.json
npm run demo:lifecycle -- ./examples/facility-deployment.input.sample.json ./examples/lifecycle-broken.input.sample.json
npm run dev -- build-lifecycle-payload ./examples/facility-record.sample.json ./examples/lifecycle-broken.sample.json
npm run dev -- ./examples/period-input.sample.json
```

Sample fixtures:

- `examples/facility-deployment.input.sample.json`: deployment request with location, cost, and technical profile
- `examples/facility-record.sample.json`: generated tokenization-ready facility record
- `examples/facility-deployment.payload.sample.json`: router-ready deployment payload for the on-chain conductor
- `examples/period-simulation.input.sample.json`: period simulation request with tariff and operating parameters
- `examples/facility-period.sample.json`: generated operating-period package with production and cashflow data
- `examples/period-payload.sample.json`: conductor-ready period payload with production, cashflow, and reward funding sections
- `examples/lifecycle-broken.input.sample.json`: broken-to-pending lifecycle event
- `examples/lifecycle-broken.sample.json`: generated broken lifecycle event
- `examples/lifecycle-broken.payload.sample.json`: router-ready broken lifecycle payload
- `examples/lifecycle-retired.input.sample.json`: retirement lifecycle event
- `examples/lifecycle-retired.sample.json`: generated retirement lifecycle event
- `examples/lifecycle-retired.payload.sample.json`: router-ready retirement lifecycle payload
- `examples/period-input.sample.json`: ready-to-run reward flow bundle for payload generation

## Conductor Handoff Notes

1. `facility-record.sample.json` can be consumed directly by the on-chain conductor, which can derive the deployment submission payload internally.
2. `facility-deployment.payload.sample.json` is useful when you want to inspect the exact `FunctionsRouter.submitDeployment` input before chain submission.
3. `period-payload.sample.json` is the conductor input for period submission and reward opening.
4. Lifecycle stages can consume either the raw lifecycle event record or the corresponding `*.payload.sample.json` file.

## Important Rules

1. Keep schema versions stable so demo artifacts stay replayable.
2. Keep the facility-based claim root aligned with on-chain claim logic.
3. Never submit period payload unless review decision is `APPROVED`.
4. Keep `periodId` at 31 characters or less before encoding to `bytes32`.
5. Prefer deterministic fake data over realistic-but-variable generators for management demos.
6. Preserve both production data and cashflow data for each operating period.
7. In the core demo, reward rights follow the current facility-token holder at claim time.
8. For local Hardhat demos, use a known local signer address when building or overriding the deployment payload `admin`.
