# Station data and evidence

The server-side Deye adapter retrieves station discovery, details, devices, current readings, historical energy and alerts. Region, AppId, AppSecret and account credentials are read from server configuration and never sent to the browser.

## Energy semantics

Generation, exports, imports, self-consumption and battery charging or discharging are different measures. Power is measured in kW; energy in kWh. Multiply MWh by 1,000 before using it in a kWh calculation. Inverters measure device data while cloud services may aggregate station data. Do not substitute or sum them without checking the aggregation rules.

The adapter retains station time zones and normalizes query windows, pagination, units and missing values. Missing readings remain missing rather than becoming zero. Incomplete calendar months are not complete historical samples. Advancing financial demo time does not alter actual telemetry capture times.

## Three data modes

| Mode | Meaning |
| --- | --- |
| live | Observations captured from the actual API. Check capture time; cached observations are not a fresh live refresh. |
| replay | Previously archived API evidence used to reproduce a calculation. |
| synthetic | Explicitly labelled generated samples for local workflow tests. |

API failures never silently switch to synthetic data. Connected stations have telemetry records; admitted stations have completed onchain rights admission. These counts can differ.

## Current monitoring and valuation evidence

Remote monitoring retrieves the real API every 15 minutes. Every role can also request a refresh from station details, subject to a shared one-minute cooldown. Capture time and device reading time are shown separately. `ALL_OFFLINE` describes the all-offline status of that response; `PARTIAL_OFFLINE` means partially offline. A status from an old replay is not a current connectivity check. Failed refreshes preserve the last successful observation and its timestamp, with an explicit error rather than invented zero generation.

Monitoring updates do not overwrite a product's frozen valuation evidence. New applications use the latest available capture, followed by intermediary and trustee review. Existing pricing changes go through reassessment so that the original quotation remains reproducible.

## Identity and evidence

Station identity is derived from the data-centre region and station ID. Multiple associated devices do not create additional station NFTs. Raw responses and normalized evidence remain in the backend. Valuations reference evidence hashes and model versions. A hash identifies content; it does not establish that a sensor is accurate.

## Revenue-data boundary

Deye Cloud revenue and tariff APIs are not currently available to this project. Energy figures may come from the API, while tariffs, costs, FX and payment receipts remain explicitly labelled demo assumptions. Estimated export income is neither an official Deye settlement amount nor collected cash.

Compare cloud and API discrepancies using the same station, date, time zone, endpoint and field name. Unresolved aggregation differences must not be hidden by manually adjusting values.


## Self-use and billing assumptions

Monthly evidence retains API import and consumption energy with null for missing fields. These support reconciliation and bill illustrations but do not establish solar origin. Billable self-use is a disclosed delivered-energy proxy based on generation less eligible exports and a delivery factor. Battery charge/discharge differences are not assumed to be arbitrage income. Purchase and export tariffs are separate demo inputs, not prices obtained from unavailable Deye income endpoints. Forecasts and demonstration bills use the same arithmetic. The household pays test USDC from its own wallet. Only the grid-export receipt is simulated by a separate system account, and it cannot replace the household payment.
