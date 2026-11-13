# Forecasts, household electricity bills and valuation

New agreements combine household solar-electricity payments with eligible grid-export revenue. Equipment remains with the household. The household receives the rights purchase price at successful fundraising settlement and subsequently pays for its self-used solar electricity each month. The default term is 60 months from settlement, with 100% of the combined net station revenue assigned to the RWA.

The household price discount and the assigned revenue share are separate terms. By default, the household pays 80% of the grid energy price for delivered solar electricity. The vault receives 100% of the combined net receipts. The 80% factor must not be applied again as a revenue-share deduction. Both parameters are disclosed and fixed before approval and signature.

## Three valuation baselines

All three methods use the same household-payment, export-income, cost and discounting formulas below. They change modeled generation or export allocation, not the economic terms of an agreement already signed.

| Method | Modeled generation | Export allocation and review |
| --- | --- | --- |
| Long-run historical seasonal | Same-month generation mean from up to 36 complete metered months | Eligible historical export ratio; short or inconsistent evidence is labeled provisional and reviewed. |
| Recent export ratio | Still uses the long-run historical same-month generation mean | Ratio from 7 to 30 eligible complete days before capture; unavailable when the recent energy balance is inconsistent. |
| PVGIS irradiation climate baseline | Hourly power modeled from 2019–2023 historical weather, scaled by recorded or explicitly provisional station inputs | Export ratio still comes from eligible Deye history; parameter status, complete hourly records and source digest are disclosed with the report. |

As of 12 November 2026, all three applications include the third baseline. The Shanghai station can load the **provisional demonstration inputs** below for a new quote preview and review. The interface and report retain the “provisional demo estimate” label; these inputs must not be described as an operator-confirmed as-built design. Signed agreements and published products are not automatically repriced.

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

Where recent complete-day export ratios differ materially from history, reviewers must document the data reconciliation and baseline choice. The reviewed recent scenario applies the recent export ratio to historical seasonal generation, without extrapolating one day's income over five years. The first two baselines select seasonality using the starting UTC month of each service period; periods crossing calendar months are not split. The PVGIS method below instead weights each calendar month by the service time it covers.

## Third baseline: PVGIS irradiation-based climate scenario

The third valuation method uses PVGIS 5.3 ERA5 historical weather data from the European Commission's Joint Research Centre. PVGIS models hourly power for a 1 kWp installation from solar radiation, temperature and the specified array design for 2019–2023. The system checks the complete five-year hourly series and response parameters before averaging modeled specific yield by UTC calendar month. This is a seasonal climate baseline, not a prediction of actual sunlight in a future month or a Deye-metered generation record.

The intermediary records the source of each coordinate, DC capacity, panel tilt, aspect and additional first-year system-loss input, distinguishing recorded API values from scenario assumptions. PVGIS aspect uses 0° for south and negative values for east. Other example cities and the 1 MWp installation in the notebook are not inputs for this station. The server requests PVGIS power with `peakpower=1` and `loss=0`, then applies additional loss once in the calculation below.

### Provisional Shanghai station demonstration inputs

| Input | Value used | Source and status |
| --- | ---: | --- |
| Coordinates | 31.173725° N, 121.48858° E | `locationLat` and `locationLng` in the recorded Deye API replay; no independent site survey has been completed. |
| DC capacity proxy | 40 kWp | The API `installedCapacity` normalizes to 40 kW. The API does not establish whether this is a DC or AC rating, so 40 kWp is an explicit numerical proxy. |
| Fixed-panel tilt | 30° | PVGIS model-optimal fixed tilt for those coordinates, **not** the measured installation tilt. |
| Panel aspect | −2° | PVGIS model-optimal orientation, slightly east of south, **not** the measured installation aspect. |
| Additional first-year system loss | 14% | A demonstration scenario assumption, not a Deye loss measurement. The hourly PVGIS request uses `loss=0` to avoid double-counting. |

The replayed station observation was captured on 24 September 2026 China Standard Time. PVGIS 5.3 ERA5 returned the complete 43,824-hour series for 2019–2023, with a modeled five-year mean of **1,465.70 kWh/kWp per year** before additional loss. At 40 kWp, 14% additional loss and the existing model's 98% availability assumption, the illustrative first-year generation is **49,411.78 kWh**. This is a climate-and-design scenario, not a Deye meter reading or confirmation of the DC nameplate. The raw PVGIS response digest is `c2779962f6bc066525f9556b05ade82bcba9e8495c6eeb30c1cf31f20eef067c`. Any quote still needs documented export allocation, tariffs and expenses, followed by intermediary and trustee review. The [official PVGIS API guide](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en) defines the tilt, aspect and loss parameters.

```text
Modeled service-period generation = Σ[mean PVGIS kWh/kWp for each calendar month
                                     × covered days / days in that month]
                                   × station DC kWp × (1 − additional first-year loss)
                                   × availability × (1 − annual degradation)^(elapsed months/12)
Forecast exports = modeled generation × reviewed same-season Deye export ratio
```

A service period crossing calendar months uses the actual time covered in each month. Completed service time is excluded from remaining-rights valuation. Household self-use, bills, export receipts, costs and discounting still use the common cashflow formulas below. Deye observations provide the export-allocation ratio; tariffs, FX and availability remain separate reviewed assumptions. PVGIS does not forecast household demand or prove that the grid has paid export proceeds.

The server archives the raw PVGIS response and binds its SHA-256 digest, years, location and design to the valuation report. The intermediary reviews these inputs before submitting a quote, and the trustee still approves it. Refreshing the climate profile does not silently reprice a signed agreement or an older offer. A mismatched profile digest requires a new valuation. API failure, missing hours or mismatched design parameters never trigger substitution of an example city or stale profile. The [official PVGIS API guide](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en) documents `seriescalc` inputs.

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

### What the discount rate means and how to set it

The discount rate is the return required to hold this finite revenue right. It converts **expected future net collections** into a value on the valuation date. A higher rate lowers the present value of the same forecast receipts. It differs from the owner paying 80% of the grid tariff, the pool retaining 10% of initial cash at settlement, and the investor's eventual IRR. The current 10% is a demonstration pricing assumption that has not been fully calibrated against comparable transactions and realized collections. The 6% and 14% cases measure valuation sensitivity, not the probability of a return range. For the example 41.888 USDC received exactly one year later, present values at 6%, 10%, and 14% are approximately 39.52, 38.08, and 36.74 USDC.

An auditable quote can start from a low-risk rate in the valuation currency with a duration comparable to the receipts, then add compensation for risks specific to the rights and their payment sources:

```text
Required return on the rights ≈ same-currency, duration-matched benchmark
                                + household-payment and export-collection premium
                                + generation, operations and data premium
                                + enforceability, illiquidity and other residual premium
```

This is a **calibration framework, not a formula that produces one objectively correct percentage**. Premiums require evidence from the agreement, household payment history, grid settlement, equipment performance, data quality, exit restrictions and comparable transactions. A projected missed payment, generation loss or expense already deducted from expected cashflow must not be charged again in full through the discount rate. Risk components can also be correlated, so adding arbitrary percentages is not sufficient. The [legacy Centrifuge Tinlake NAV documentation](https://developer.centrifuge.io/developer/legacy/tinlake/) treats expected default loss and discounting separately; its 3% rate is explicitly an illustrative example. [Current Centrifuge documentation](https://docs.centrifuge.io/user/manager/nav/) applies each product's own valuation policy rather than a protocol-wide rate.

**Currency consistency matters.** The present model converts CNY household payments, export receipts and station costs into USDC at a fixed conversion assumption in the report, then discounts the USDC amounts at one annual rate. The rate should therefore be understood as a required return on **USDC-denominated rights cashflows**. US Treasury yields can serve as a low-risk reference, while USDC, cross-currency settlement and contractual risks still need assessment. A fixed FX assumption does not establish that future CNY/USD exchange rates will be constant. An alternative coherent method is to forecast and discount in CNY, then convert the present value at the valuation date. A CNY government-bond yield cannot simply be applied to cashflows already converted into USDC. Here, "nominal" means cashflows and rates are not adjusted for inflation; the calculation compounds as `(1 + r)^(actual days/365.25)`, rather than multiplying a simple monthly rate by 12. Nominal tariff and cost forecasts require a nominal discount rate; maturity, taxes and receipt dates must also be consistent.

Public benchmarks provide context, not an approved rate for this station. The US Treasury five-year yield was 4.81% on 10 November 2026, and the ChinaBond five-year government yield was 1.329% on 12 November 2026. Subtracting either from 10% gives arithmetical residuals of 5.19 and 8.67 percentage points respectively; the currency conventions cannot be mixed, and these differences do not validate any premium. The [US Treasury table](https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?field_tdr_date_value=2026&type=daily_treasury_yield_curve) and [ChinaBond curve](https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/more?locale=en_US) change over time. For industry context, the [IEA's 2019 sample of Chinese utility-scale solar projects](https://www.iea.org/articles/the-cost-of-capital-in-clean-energy-transitions) reported nominal after-tax weighted average costs of capital of 4.4%–5.4% for revenue-supported projects and 6.4%–6.9% for projects with merchant revenue risk. These are historical financing costs for large plants, not a 2026 market quote or the appropriate rate for this revenue right.

For each quote, the intermediary should record the valuation currency, benchmark curve and observation date, evidence for each premium, expected losses already reflected in cashflows, compounding convention and price sensitivities at 6%, 10% and 14%. The trustee reviews these assumptions. Sufficient realized household payments, export collections and comparable transaction prices can then support a product-specific recalibration. A changed rate applies to a new quote or approved revaluation; it does not silently rewrite a signed agreement.

<p class="pt-example-caption">Teaching example, not a current station quote. All 60 periods are generated by the platform valuation and pool models. The example begins on 1 January 2026. The first three months generate 1,000, 1,100 and 1,200 kWh; exports are 40% of generation and imports are 200 kWh per month. Availability is 100%, with zero degradation and price growth to make the arithmetic easy to follow. Actual quotes use their approved assumptions. Delivery is 90%; households pay 80% of CNY 0.60/kWh, exports earn CNY 0.35/kWh, station expenses are CNY 100 per month, FX is 0.14 USDC/CNY, net revenue assignment is 100%, annual discounting is 10%, and collection is delayed one month.</p>

<div data-cashflow-example="owner"></div>

Read left to right. Period 1 covers January service. The household pays CNY 259.20 and exports earn CNY 140.00. After CNY 100 of station expenses, the net receivable is 41.888 USDC, expected on 1 March. Discounting its actual receipt date back to 1 January gives 41.25 USDC. Periods 2 and 3 earn 47.4768 and 53.0656 USDC, with present values of 46.37 and 51.43 USDC. Summing all 60 present values gives the example rights value of 2,634.95 USDC.

The same column compares household bills. In period 1, buying the same supply entirely from the grid costs CNY 444.00. After selling the rights, the household pays CNY 259.20 to the project and CNY 120.00 to the grid: CNY 379.20 in total, saving CNY 64.80. Each later period uses its own energy forecast rather than copying the first month 60 times.

The application uses the same timeline with its saved valuation report, not this teaching fixture. Select a period to expand its formulas. Agreed purchase price and model value remain separate. The default purchase price equals model value, without guaranteeing forecast receipts.

## Existing agreements and approvals

The standard combined-revenue model is `household-export.2`, and the PVGIS baseline model is `pvgis-era5-irradiance.1`; both use `revenueModel: household-export`. Records without this discriminator remain `export-only`. A software upgrade cannot add household billing obligations to an existing signed agreement. An intermediary can select a new baseline for an unsigned offer, with fresh trustee approval and owner acceptance. Signed or pooled agreements retain their terms; changing signed economic terms requires a new agreement and product.

Reports bind source evidence, assumptions, model version, monthly calculations, cutoff and validity period. The owner signature also binds the assumptions hash. Refresh monthly, before dealing and after material changes. Completed service periods become receivables or cash rather than remaining rights.

Projected investor net IRR is computed from investment, payments at the product’s declared cadence and final cash. New V5 demo products use monthly distributions. It is not the 10% valuation discount rate. See [Collections, expenses and distributions](/docs/en/accounting) for the investor timeline.
