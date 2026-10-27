# Forecasts, household electricity bills and valuation

New agreements combine household solar-electricity payments with eligible grid-export revenue. Equipment remains with the household. The household receives the rights purchase price at successful fundraising settlement and subsequently pays for its self-used solar electricity each month. The default term is 60 months from settlement, with 100% of the combined net station revenue assigned to the RWA.

The household price discount and the assigned revenue share are separate terms. By default, the household pays 80% of the grid energy price for delivered solar electricity. The vault receives 100% of the combined net receipts. The 80% factor must not be applied again as a revenue-share deduction. Both parameters are disclosed and fixed before approval and signature.

## From history to future energy

The model uses up to 36 complete historical months before the evidence cutoff. It averages observations for the same calendar month. Missing seasons use the available monthly mean and receive a provisional flag. A full baseline requires at least 12 complete months with seasonal coverage. Short records, missing fields and reconciliation differences require explicit review.

```text
Generation G = seasonal historical mean × (1 − annual degradation)^(elapsed months/12)
             × availability × remaining service fraction
Exports E = seasonal historical generation mean × comparable export-to-generation ratio × the same adjustment factors
Eligible solar exports X = E, requiring 0 ≤ E ≤ G
Billable self-used solar energy S = max(0, G − X) × delivery factor
```

Defaults are 0.7% annual degradation, 98% availability and a 90% residual-solar delivery factor. These are configurable demo assumptions. The delivery factor discounts losses, storage inventory changes and other undelivered energy. It is not a verified efficiency or settlement meter. Because a verified solar self-use billing field is unavailable, combined-model reports are always provisional and require explicit trustee acceptance.

Consumption minus imports is not automatically treated as solar self-use: batteries may have been charged from the grid. Exports above generation cannot establish solar self-use. Such recent records disable the recent-ratio method. Historical estimates exclude inconsistent export samples and apply the comparable same-month export-to-generation ratio to seasonal generation. If no comparable samples remain, the reviewed demo ratio is explicitly used. Raw API readings are preserved and the estimate remains provisional. The same energy cannot simultaneously count as self-use and exports. No storage arbitrage revenue is assumed.

Where recent complete-day export ratios differ materially from history, reviewers must document the data reconciliation and baseline choice. The reviewed recent scenario applies the recent export ratio to historical seasonal generation, without extrapolating one day's income over five years. Seasonal selection uses the starting UTC month of each service period; periods crossing calendar months are not split into daily forecasts.

## Monthly bills and project cashflow

Retail purchase rates and grid-export rates are configured separately. Each supports a full 60-month schedule or an initial price with annual escalation. Retail rates mean variable energy charges. Monthly energy totals cannot reproduce a detailed time-of-use bill without interval data and matching tariffs.

```text
Household payment H = S × grid energy price B × household payment factor d
Export revenue F = X × export price T
Gross project cashflow = H + F
Assigned cashflow C = max(0, H + F − agreed station costs) × assigned share × FX
```

For new agreements, d defaults to 80% and the assigned share to 100%. FX means USDC per unit of station currency. Maintenance, insurance, tax, collection and replacement costs must identify their payer. Only revenue-paid station expenses are deducted here. A zero assigned cashflow does not mean a station-cost shortfall has been funded; such periods are flagged for review.

Electricity actually imported from the grid remains payable by the household to the utility. It is neither vault revenue nor a second vault expense. Pool fees, reserves and scheduled distributions are modeled separately and must not be duplicated as station costs.

## Why the energy bill is below an all-grid alternative

Compare the same supplied energy at the same tariff. With imported energy I:

```text
All-grid energy bill = (S + I) × B
Energy bill after the rights sale = S × B × d + I × B
Energy-charge difference = S × B × (1 − d)
```

This difference is positive when S and B are positive and d is below 100%. A 20% discount applies only to the self-used solar portion, not the entire household bill. Fixed charges, demand charges, taxes and other household-paid costs are excluded.

When imports are missing, the page compares only the solar portion and leaves the full bill unavailable. Missing imports are never zero-filled. Where available, seasonal mean historical imports provide an illustrative bill, not a definitive household-demand forecast.

The comparison is against all-grid supply, not the free self-use available to an existing equipment owner before selling rights. The sale introduces a monthly payment obligation and transfers the agreed export receipts, compensated by the upfront purchase price. The owner should consider these obligations and maintenance responsibilities alongside the purchase price.

## Worked monthly example

The following is an arithmetic example, not the current station's bill. Assume generation of 1,000 kWh, exports of 400 kWh and imports of 200 kWh. The delivery factor is 90%, retail price CNY 0.60/kWh, export price CNY 0.35/kWh and household payment factor 80%.

| Item | Calculation | Result |
|---|---|---|
| Billable solar self-use | (1,000 − 400) × 90% | 540 kWh |
| Equivalent solar portion at grid price | 540 × 0.60 | CNY 324 |
| Household payment to project | 324 × 80% | CNY 259.20 |
| Separate utility payment | 200 × 0.60 | CNY 120 |
| All-grid energy bill | (540 + 200) × 0.60 | CNY 444 |
| Post-sale energy bill | 259.20 + 120 | CNY 379.20 |
| Energy-charge reduction | 444 − 379.20 | CNY 64.80 |
| Export revenue | 400 × 0.35 | CNY 140 |
| Combined gross project receipts | 259.20 + 140 | CNY 399.20 |
| Net of station expenses | 399.20 − 100 | CNY 299.20 |
| 100% assigned, converted at 0.14 USDC/CNY | 299.20 × 0.14 | 41.888 USDC |

## Discounting future receipts into today's offer

Each energy forecast belongs to a service period. Its receipt date is the period end plus the configured delay, defaulting to one month. Discount each receipt individually; undiscounted five-year revenue is not the offer value.

```text
Period present value = C_m / (1 + annual discount rate)^((receipt date − valuation date) / 365.25 days)
Rights value = sum of present values for all remaining service periods
```

The default nominal annual discount rate is 10%, with 6% and 14% sensitivities. If the example's 41.888 USDC arrives exactly 365.25 days later, its value at 10% is 38.08 USDC. The application uses actual date intervals. Downside and upside scenarios scale assigned cashflows to 80% and 110%; these are not calibrated probability estimates.

<p class="pt-example-caption">Teaching example, not a current station quote. All 60 periods are generated by the platform valuation and pool models. The example begins on 1 January 2026. The first three months generate 1,000, 1,100 and 1,200 kWh; exports are 40% of generation and imports are 200 kWh per month. Availability is 100%, with zero degradation and price growth to make the arithmetic easy to follow. Actual quotes use their approved assumptions. Delivery is 90%; households pay 80% of CNY 0.60/kWh, exports earn CNY 0.35/kWh, station expenses are CNY 100 per month, FX is 0.14 USDC/CNY, net revenue assignment is 100%, annual discounting is 10%, and collection is delayed one month.</p>

<div data-cashflow-example="owner"></div>

Read left to right. Period 1 covers January service. The household pays CNY 259.20 and exports earn CNY 140.00. After CNY 100 of station expenses, the net receivable is 41.888 USDC, expected on 1 March. Discounting its actual receipt date back to 1 January gives 41.25 USDC. Periods 2 and 3 earn 47.4768 and 53.0656 USDC, with present values of 46.37 and 51.43 USDC. Summing all 60 present values gives the example rights value of 2,634.95 USDC.

The same column compares household bills. In period 1, buying the same supply entirely from the grid costs CNY 444.00. After selling the rights, the household pays CNY 259.20 to the project and CNY 120.00 to the grid: CNY 379.20 in total, saving CNY 64.80. Each later period uses its own energy forecast rather than copying the first month 60 times.

The application uses the same timeline with its saved valuation report, not this teaching fixture. Select a period to expand its formulas. Agreed purchase price and model value remain separate. The default purchase price equals model value, without guaranteeing forecast receipts.

## Existing agreements and approvals

The model is identified as `household-export.1`, with `revenueModel: household-export`. Records without this discriminator remain `export-only`. A software upgrade cannot add household billing obligations to an existing signed agreement. An intermediary can explicitly switch an unsigned offer to the combined model and obtain fresh trustee approval and owner acceptance. Signed or pooled agreements retain their terms; use a new agreement or reset scenario to demonstrate the new economics.

Reports bind source evidence, assumptions, model version, monthly calculations, cutoff and validity period. The owner signature also binds the assumptions hash. Refresh monthly, before dealing and after material changes. Completed service periods become receivables or cash rather than remaining rights.

Projected investor net IRR is computed from investment, payments at the product’s declared cadence and final cash. New V5 demo products use monthly distributions. It is not the 10% valuation discount rate. See [Collections, expenses and distributions](/docs/en/accounting) for the investor timeline.
