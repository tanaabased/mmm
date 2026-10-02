# Equities, futures, and Jev integration boundaries

Research date: **2026-09-29**. Status: **recommended for the next integration milestone; no adapters implemented or account access verified**.

Direction update, **2026-10-02**: proceed with **equities first through Alpaca**, beginning with paper execution in later integration work. Futures provider selection, accounts, data subscriptions, and implementation are deferred until explicitly revisited. The futures comparison below is retained as research reference, not an active delivery commitment or an equities blocker.

This decision addresses [#7](https://github.com/tanaabased/mmm/issues/7). The foundation remains credential-free. [#2](https://github.com/tanaabased/mmm/issues/2) owns the package/runtime baseline and root validation, [#8](https://github.com/tanaabased/mmm/issues/8) owns analytics and strategy configuration, and [#9](https://github.com/tanaabased/mmm/issues/9) is pirog's manual Alpaca/TypeSafe access task. Research stays under `docs/decisions/`; the Python/QuantConnect setup is retired.

## Decision

- **Equities:** use the official `@alpacahq/alpaca-trade-api` SDK through separate MMM market-data and execution adapters. Use consolidated SIP for market-wide VWAP evaluation when entitled; IEX is a clearly labelled development mode. Start with paper execution.
- **Futures:** deferred. No futures provider is selected for implementation. Retain the original Tradovate/IBKR/Databento comparison for a later decision; recheck the shortlist, access requirements, and data quality if futures work resumes.
- **Jev:** use the official `@typesafe-ai/sdk` behind an optional decision interface, initially disabled. Pin the model and evaluate whether it adds anything to a deterministic strategy. A model does not earn a place in the order path by returning a confident number.
- **Ownership:** the server owns connections, recovery, feature calculation, risk checks, and order reconciliation. CLI/TUI clients consume the shared application API. Provider SDK types do not become application contracts.

These are engineering recommendations, not a purchase or account-provisioning decision. Public documentation establishes available surfaces; authenticated access, latency, data completeness, and trading usefulness remain unmeasured.

## Evidence and version boundary

Official documentation, exchange references, SDK source, and npm metadata were inspected on the research date. Mutable pages must be rechecked before implementation or purchase.

| Component                | Inspected version / revision                                                             | Compatibility evidence                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alpaca SDK               | npm `4.0.4`; published `gitHead` `32ae035d2e4eca1e01362b08bdf51356b6b8b1f7`              | Apache-2.0; Node `>=20`; ESM/CJS; streaming on Node/Bun. [Package][alpaca-package], [runtime guide][alpaca-runtime]                                            |
| Alpaca source inspection | `f72dbc84d95a05581d624f61afdca011c8f53b03`                                               | Compared with the published revision: only `docs/package-lock.json` differs. The inspected runtime files match the release. [Comparison][alpaca-compare]       |
| TypeSafe SDK             | npm `0.6.0`; source `66880ccded6cb642dc1809620c2b108c33730214` declares the same version | MIT; Node `>=20`; ESM/CJS. npm metadata supplied no `gitHead`, so source inspection is not a tarball-equivalence claim. [Package][jev-package], [SDK][jev-sdk] |

No SDK was installed or executed. The SDK minimum Node version is a compatibility floor, not a recommendation to select that runtime; #2 owns the supported consumer runtime.

## Equities: official SDK versus direct API

| Requirement            | Official SDK 4.0.4 evidence                                                                                                                                                                           | Direct REST/WebSocket adapter                                                                | MMM responsibility either way                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Streaming/reconnect    | Authentication, ping/pong, bounded reconnect/backoff and resubscription dispatch; reconnect event does not prove subscription acknowledgement. [Lifecycle][alpaca-streaming], [source][alpaca-socket] | Build and maintain that transport lifecycle, framing, error handling and subscription state. | Observe acknowledged subscriptions; expose degraded state; stop decisions until recovery completes.            |
| Historical backfill    | Lazy `iterateStockBars` and collection helpers traverse page tokens. [Pagination][alpaca-pagination]                                                                                                  | Request `/v2/stocks/bars` and follow every `next_page_token`.                                | Track per-instrument coverage, overlap backfill with buffered live data, deduplicate and bound memory.         |
| Updated/corrected data | `subscribeForUpdatedBars`, `onUpdatedBar`, `onCorrection`, `onCancelError` are present in the stock stream. [Source][alpaca-market-stream]                                                            | Consume the corresponding protocol channels directly.                                        | Replace aggregates; invalidate affected features; distinguish late bars from trade corrections/cancels.        |
| Paper orders           | Paper client, order methods, trade-update stream and client-order-ID lookup; placement POSTs are not automatically retried. [Trading][alpaca-trading], [resilience][alpaca-resilience]                | Call the paper Trading API and implement status/reconciliation handling.                     | Validate intent, persist correlation IDs, reconcile ambiguous outcomes, distinguish acknowledgement from fill. |
| Maintenance            | Official typed transport, upstream fixes and release changes.                                                                                                                                         | Fewer SDK dependencies, but MMM owns protocol drift and all transport tests.                 | Pin versions, contract-test upgrades, preserve provider-neutral interfaces.                                    |

**Choose the SDK.** The inspected release covers the required wire features; a parallel HTTP/WebSocket implementation would buy maintenance work without a demonstrated benefit. Use direct access only for a narrowly identified missing endpoint or confirmed SDK defect, after documenting the reason. Avoid mixing SDK and direct streams for the same feed.

The SDK's upstream tests cover resubscription and updated-bar/correction dispatch; this is source evidence, not a test run by MMM. [Tests][alpaca-tests] Neither SDK reconnect nor a successful history request proves lossless recovery. A pagination cycle guard can end traversal without establishing completeness; compare expected coverage before marking the adapter ready.

### Feed, volume and paper semantics

Alpaca's individual Trading API plans currently advertise the following equity coverage. These are published plan limits, not this operator's entitlements. [Plans][alpaca-plans]

| Property            | Basic                                                   | Algo Trader Plus                          |
| ------------------- | ------------------------------------------------------- | ----------------------------------------- |
| Price               | Free                                                    | $99/month                                 |
| Real-time coverage  | IEX only                                                | All US stock exchanges / consolidated SIP |
| WebSocket symbols   | 30                                                      | Unlimited                                 |
| Historical requests | 200/minute                                              | 10,000/minute                             |
| Published history   | Since 2016; recent SIP requires entitlement (see below) | Since 2016; no 15-minute restriction      |

Without a SIP subscription, historical SIP queries must set `end` at least 15 minutes in the past; this does not mean the IEX live feed is delayed. [Market-data FAQ][alpaca-faq] Always set `feed`, `start`, `end`, `timeframe`, `adjustment` and symbol/as-of policy explicitly. The historical endpoint's range boundaries are inclusive; results are ordered by symbol before time, and the page limit spans all symbols. Use raw intraday bars for the initial live/replay comparison. Never backfill an IEX stream with silently defaulted SIP data, or splice adjusted history into raw live bars. [Historical API][alpaca-history]

IEX volume is venue-specific. A VWAP computed from it answers a different question from a consolidated-feed VWAP. Require SIP entitlement for conclusions labelled market-wide; keep feed identity in caches, features, logs and evaluation reports. Do not silently downgrade after an entitlement error. Overnight BOATS/derived feeds are distinct sources, not an automatic extension of SIP or IEX. [Stock stream][alpaca-stock-stream]

Many Alpaca subscriptions permit only one connection per endpoint. Share a server connection across strategies and clients; do not create one socket per instrument or terminal. The authenticated `FAKEPACA` test stream can check connectivity later, but cannot validate equity feed coverage. [Stream protocol][alpaca-protocol]

Paper execution uses a separate endpoint and credentials. Paper fills use NBBO even for paper-only users whose data access is IEX; the simulator does not enforce displayed liquidity against order size. Consequently paper P&L is not a clean measurement of an IEX-only signal or realistic execution costs. [Paper trading][alpaca-paper]

### Correction and recovery policy

Published facts: minute bars include pre/post-market trades and arrive after the minute ends. `updatedBars` can revise the previous minute after a late trade; trade subscriptions also deliver separate correction/cancel messages. The reviewed stock-stream page does not establish that every later trade correction produces a replacement aggregate. [Stock stream][alpaca-stock-stream]

MMM's proposed policy for the later adapter:

1. Key bars by provider, feed, concrete instrument, interval, start instant and adjustment policy. Preserve receive time and a local revision sequence; do not invent a provider revision number.
2. Subscribe to bars and updated bars. If trade-level correction fidelity is required, also ingest trades/corrections/cancels and retain exact trade IDs. Preserve the SDK's raw timestamp and ID strings where supplied; numeric IDs can lose precision. [Precision][alpaca-streaming]
3. On disconnect, mark the stream unready. Reauthenticate, confirm subscription state, buffer new events, and backfill the missing interval with an overlap covering the active session/warmup requirement.
4. Reconcile overlap by identity and known revision/observation order. A later-arriving HTTP response is not automatically newer than a buffered correction. If ordering cannot be established, remain unready and obtain a consistent snapshot; do not claim completeness.
5. Replace a revised bar rather than adding its volume again. Replay affected analytics from the relevant session anchor or checkpoint. Retain the original as-observed decision record; a correction cannot retroactively create an executable trade.
6. A missing interval is unknown until classified as closed session, no eligible trades, halt or transport loss. Never manufacture volume. If the necessary correction history or backfill is unavailable, mark the range unsuitable for causal evaluation.

## Futures: bounded comparison

Alpaca's documented stream inventory does not establish ES/MES/NQ/MNQ support. A crypto-perpetual API in its SDK is not evidence for CME equity-index futures. [Inventory][alpaca-protocol], [SDK tree][alpaca-tree]

The table separates product coverage from data access and execution. “Documented” means a vendor/exchange source supports the capability; no row implies that pirog has access.

| Candidate     | ES / MES / NQ / MNQ coverage                                                                       | Data and history                                                                                                                                                                            | Execution / paper                                                                                                                                            | Node path and decision                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tradovate** | All four listed in its product fee schedule. [Products][tradovate-products]                        | Quote/DOM/chart WebSocket API; `md/getChart` accepts a time range. Historical depth and correction guarantees still need verification. [API][tradovate-api]                                 | REST order entry; separate demo simulation and live services. [Environments][tradovate-environments]                                                         | JSON REST/WebSocket with official JS examples. First candidate: one vendor can serve both roles, without making them one interface.         |
| **IBKR**      | All four appear in its CME product schedule. [Products][ibkr-products]                             | Web API history plus streaming market data; the historical WebSocket request responds once, not continuously revised candles. [History][ibkr-history], [WebSocket history][ibkr-ws-history] | Trading API and associated paper account; account permissions remain required. [Access][ibkr-access]                                                         | HTTP/WebSocket can be called from Node. Fallback: resolve authentication for this account before choosing it for an unattended server.      |
| **Databento** | Official instrument example includes all four under CME data. [Instruments][databento-instruments] | Live/historical CME Globex `GLBX.MDP3`, definitions and continuous-symbol mapping. [Getting started][databento-start], [symbology][databento-symbols]                                       | No order-entry or broker paper account in the reviewed offering. Pair with a broker; data replay is not paper execution. [CME vendor listing][databento-cme] | Historical HTTP; live raw protocol. Official quickstart lists Python/C++/Rust libraries, not Node. Defer the extra live integration burden. |

### Access, contracts and sessions

| Candidate | Account/data gate                                                                                                                                                                                                                                      | Contract metadata and rollover                                                                                                                                                 | Session/correction limitation                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tradovate | Published API-key requirements: live account with **greater than $1,000**, CME Information License Agreement, and API Access add-on. Confirm exact API data/non-display rights, fees and demo access before purchase. [Requirements][tradovate-access] | Contract, product and maturity lookup surfaces exist. Resolve an expiring contract, its tick/multiplier and provider ID; retain an explicit roll mapping. [API][tradovate-api] | Demo access is not proof of entitled real-time data. Verify history retention, timestamp/bucket meaning, updates to closed bars, trade breaks and reconnect overlap.                                              |
| IBKR      | Individual access documentation specifies an open/funded IBKR Pro account, including use of its paper account. Confirm market-data subscriptions and futures trading permissions. [Access][ibkr-access]                                                | `/trsrv/futures` resolves futures by root into concrete `conid`/expiry records. [Discovery][ibkr-discovery]                                                                    | One brokerage session per username; permissions follow that username. [Sessions][ibkr-sessions] History exposes an outside-regular-hours option; correction parity still needs a fixture. [History][ibkr-history] |
| Databento | API key, data plan and applicable exchange licensing; live and historical services have different commercial terms. Budget and redistribution/non-display use need operator review. [Getting started][databento-start]                                 | Definitions plus raw/instrument/parent/continuous symbology. Continuous prices are unadjusted; mappings change contracts. [Symbology][databento-symbols]                       | OHLCV buckets use receive-time aggregation; empty buckets are omitted and daily bars use UTC dates. These are not exchange-session candles. [OHLCV][databento-bars]                                               |

Tradovate partner documentation corroborates endpoints only; it does not grant a retail account partner privileges. IBKR's newer introduction describes OAuth 2.0 while the individual-access guide describes different onboarding paths. Resolve the applicable flow, approvals, reauthentication and paper behavior with the operator/provider before promising unattended operation. [IBKR introduction][ibkr-intro]

**Deferred research recommendation:** the original comparison favored a bounded Tradovate data-and-paper qualification, with IBKR as fallback and Databento only for a demonstrated broker-data limitation. The 2026-10-02 equities-first decision postpones that qualification and any provider commitment. Reopen the comparison before acting; no futures account, subscription, or implementation is part of #9 or the next equities integration.

### Instrument and calendar facts for #8

These are outright futures, not options or calendar spreads. Dollar tick values below are multiplier × tick size. [CME comparison][cme-specs]

| Root | Index      | USD per index point | Tick in index points | USD per tick |
| ---- | ---------- | ------------------- | -------------------- | ------------ |
| ES   | S&P 500    | 50                  | 0.25                 | 12.50        |
| MES  | S&P 500    | 5                   | 0.25                 | 1.25         |
| NQ   | Nasdaq-100 | 20                  | 0.25                 | 5.00         |
| MNQ  | Nasdaq-100 | 2                   | 0.25                 | 0.50         |

Use concrete contract metadata, not these root-level values alone, to validate later orders. Store venue, currency, expiry/last-trade instant, multiplier, tick, provider ID and effective dates. ES volume and MES volume are different series; any cross-instrument signal must be declared explicitly.

CME describes the micro futures session as Sunday–Friday 17:00–16:00 Chicago time; its FAQ also lists a 15:15–15:30 Chicago halt. The one-hour daily closure and intraday halts must be represented separately, with current exchange schedules overriding generic hours. Holidays and expiry can change the schedule: CME's 2026 roll table, for example, lists June expiration on June 18 rather than the third Friday. Do not generate exchange calendars from weekday arithmetic alone. [Micro fact card][cme-micro], [FAQ][cme-faq], [roll dates][cme-roll]

MMM should use `America/Chicago` for the exchange calendar, retain UTC instants, and assign an explicit exchange trading date to overnight events. Strategy windows in US, European or Asian timezones are independent filters; they cannot turn a closed exchange into an open one. #8 owns the configurable reset anchor and window semantics.

CME's customary equity roll is the Monday before expiration Friday, but participants can roll at another time. Version the chosen roll policy, record the actual outgoing/incoming contracts and effective instant, and reset or explicitly migrate analytics. Never submit a continuous alias as an execution contract. Databento volume/open-interest mappings use the previous day's information; do not replace them with hindsight from the day's final volume. [Roll dates][cme-roll], [symbology][databento-symbols]

## Shared data and decision boundaries

These are design requirements for #2/#8 and later adapters, not new source interfaces in this PR.

| Boundary             | Minimum responsibility                                                                                                | Must not own                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Market data          | History, subscriptions, instrument metadata, feed identity, health/gaps and bar upserts/revisions                     | Orders or strategy decisions                             |
| Analytics / strategy | Session selection, feature calculation, warmup, deterministic candidate generation and replay                         | Provider authentication or model transport               |
| Decision             | Evaluate a versioned feature snapshot and narrow criteria; return candidate disposition or abstention with provenance | Arithmetic, calendars, sizing or direct order submission |
| Execution            | Validate approved order intent against current controls; submit/cancel/query/reconcile; report order/fill state       | Inferring a signal from market data or Jev confidence    |

Illustrative application payload shapes:

```text
BarUpsert = { schemaVersion, provider, feed, instrumentId, interval,
  startUtc, endUtc, observedAtUtc, revision, adjustment, aggregationBasis,
  ohlc, volume, volumeUnit, vwap?, quality, provenance }
FeatureSnapshot = { schemaVersion, snapshotId, asOfUtc, observedAtUtc,
  instrumentId, feed, sessionId, tradingDate, analyticsVersion,
  inputRevisionSet, warmupReady, quality, computedFeatures, candidate }
DecisionResult = { snapshotId, outcome: allow_candidate | abstain,
  reasonCode, criteriaVersion, requestedModel, returnedModel?,
  confidence?, optionProbabilities?, receivedAtUtc, expiresAtUtc,
  requestId?, usage?, latencyMs }
```

The exact schema belongs to #2/#8. Preserve precision through explicit decimal/scaled representations where needed. Provider timestamps and IDs must survive normalization. Application revision numbers describe observation order, not exchange truth.

For #8, the essential facts are: feed-specific volume; provider VWAP versus an OHLC price proxy; event-time versus receive-time buckets; replaceable bars; missing/duplicate/out-of-order data; raw versus adjusted history; exchange calendars versus strategy windows; contract rolls; and the difference between final historical data and what was known at a decision instant. A session VWAP assembled from compatible bar VWAPs weights each bar by its volume; an OHLC proxy is an approximation and must be labelled. Dispersion needs its own definition and sufficient statistics; OHLCV alone does not reconstruct trade-level variance.

## Jev: contract and operating policy

Use `TypeSafeClient.systemOne({ model, state, questions }, options)` on the server. It calls `POST /v1/systemone` with Bearer authentication using `TYPESAFE_API_KEY`; responses contain typed answers, the returned model and token usage. [Client source][jev-client], [types][jev-types]

| Concern       | Published/inspected behavior                                                                                                                                                                                           | MMM decision                                                                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model         | Docs list `jev-1.13.0`; `jev-latest` and `jev-preview` currently resolve to it and may move. [Models][jev-models]                                                                                                      | Pin `jev-1.13.0` for the initial experiment. Record requested/returned ID, SDK version, feature schema and criteria hash. A change requires reevaluation.                                                               |
| Cost / limits | $0.042 per million input tokens; output free; 64k total context, 32k state plus longest question; advertised 250k tokens/sec and 1,200 requests/min, explicitly changeable. [Models][jev-models]                       | Operator sets the budget; log usage and cap requests. Example calculation: 10,000 calls × 2,000 input tokens costs $0.84 at this rate before retries or other charges. This is an estimate, not a budget authorization. |
| Latency       | Vendor launch post advertises 70–500 ms end-to-end. No MMM measurement or workload-specific guarantee was established. [Launch post][jev-latency]                                                                      | Measure p50/p95/p99, timeout fraction and feature age for the actual payload and region. No latency-sensitive enablement from marketing figures.                                                                        |
| Timeout       | SDK default is 10,000 ms **per attempt**, not a total retry deadline. [Configuration][jev-config]                                                                                                                      | Proposed minute-bar experiment: 2,000 ms total deadline, also bounded by candidate expiry. Abort at that deadline and discard late results. This is a test policy, not a proven suitable latency budget.                |
| Retry         | Default two retries; connection/timeouts, HTTP 408/429/5xx; 500 ms initial backoff, 5 s cap, subtractive jitter up to 25%; honors retry headers up to 60 s, otherwise falls back to backoff. [Retry source][jev-retry] | Set `maxRetries: 0` in time-sensitive decisions. Any offline retry must preserve snapshot/model identity, obey a total budget and report duplicate cost. Never let transport retries outlive a candidate.               |
| Confidence    | TypeSafe distinguishes confidence from the answer's probability. [Confidence][jev-confidence]                                                                                                                          | Neither is a measured probability of trading profit. Tune any threshold only on development data and test calibration against explicitly defined outcomes.                                                              |

Arithmetic, dates, time comparisons and numeric thresholds stay in code; TypeSafe itself documents weaknesses in these areas. [Limitations][jev-limitations] Pass a compact computed snapshot, including named conditions and data-quality flags. Ask a narrow semantic question only where #8 identifies a judgment not already settled by deterministic logic. Do not enlarge scope by fetching news or other external context here.

The initial experiment permits Jev to **veto a deterministic candidate**, not invent a trade or enlarge exposure. Include an explicit `abstain` choice. MMM maps missing features, failed warmup, unresolved gaps/corrections, stale inputs, exhausted budget, API errors, invalid answer shape, model mismatch, insufficient calibrated evidence and expired responses to `abstain/no-trade` without submitting an order. Unavailable Jev must not silently turn a configured Jev-gated strategy into its ungated baseline.

Even an `allow_candidate` result is advisory: deterministic code rechecks the session, candidate expiry, current position, order limits and feature revision before execution. A correction invalidates a pending response tied to an older snapshot. Keep credentials out of tracked files; log provenance and sanitized metrics, not secrets or full request bodies by default.

### Evaluation required before enabling Jev

This is a later experiment specification, not a claim that evaluation has run.

1. Implement and validate the deterministic versions of VWAP mean reversion, bounded reversal and opening-range breakout under #8's definitions. Fix the instrument, feed, session, features and execution assumptions before comparing variants.
2. Split chronologically into development, validation and untouched test periods across multiple sessions/regimes. Purge overlapping feature/holding windows across splits. Tune rules, prompts and confidence thresholds only before the held-out test; record every tried variant.
3. Compare the deterministic baseline with the same candidates plus Jev's veto/abstention. Include an all-abstain control and, where useful, a deterministic filter matched for trade frequency so fewer trades do not masquerade as better judgment.
4. Replay observations in availability order. Final corrected history supports final-data research only; it cannot establish causal live behavior without the original update/arrival history. Capture prospective shadow data if that history is unavailable. Exclude future bars, later corrections, future roll knowledge and outcome labels from model inputs; note that model training-data leakage for historical periods is unknown.
5. Use identical fills, spread, slippage, fees, capital, exposure and exit assumptions. Apply Jev latency before the earliest eligible fill; never fill at a price that disappeared while awaiting the answer. Cache actual model responses for reproducible replay, while separately measuring repeat-call variance and failures.
6. Report net expectancy/P&L, drawdown, trade count, turnover, exposure, abstention/coverage, session/regime breakdowns, decision latency and API cost. Use paired session-level uncertainty estimates; do not declare success from a few profitable trades or a confidence threshold alone.
7. Before opening the test set, specify the minimum economic improvement, tolerable drawdown, sample size and latency/failure budgets with pirog. If benefit remains indistinguishable from noise after costs, keep Jev disabled. A passing replay qualifies only for a later paper/shadow trial, not live deployment.

## Blockers and handoff

These block particular integrations or conclusions, **not completion of this research decision**.

F1-F3 are dormant research questions while futures are deferred; they require no action for the foundation or equities integration. Contract-roll and futures-session fixtures remain reference coverage, not a commitment to ship futures support.

| ID  | Unresolved fact / risk                                                                    | Owner and next evidence                                                                                                                                             | Blocks                                                 |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| E1  | Actual Alpaca feed entitlement and paper access                                           | Pirog, #9: sanitized account/test-stream checks; record IEX/SIP and approved data plan.                                                                             | Authenticated integration and market-wide VWAP claims. |
| E2  | Full correction/reconnect fidelity, including bars affected by trade breaks               | Later equities adapter: captured stream + history fixtures, subscription acknowledgement, overlap and replacement tests.                                            | Lossless/causal replay claims.                         |
| F1  | Tradovate account, API/demo eligibility, data rights and cost                             | Pirog: accept or decline the documented requirements and confirm the exact API data license. A futures setup task is separate from #9's current scope.              | Futures adapter activation.                            |
| F2  | Futures retention, session schedule, timestamp semantics, corrected bars and roll mapping | Later futures adapter: resolve all four roots/contracts, capture a full session/roll boundary, reconcile history/live/corrections and check current CME exceptions. | Futures feature validity and execution qualification.  |
| F3  | IBKR authentication route or Databento live Node integration if fallback is needed        | Later integration owner: prove account-specific unattended/paper auth or estimate/test raw-feed/bridge burden before adoption.                                      | Fallback selection becoming operational.               |
| J1  | TypeSafe access, available pinned model, budget and measured latency                      | Pirog, #9: model/access check and one bounded paid request if authorized there.                                                                                     | Live model calls; not fake decision fixtures.          |
| J2  | Jev adds useful judgment beyond computed rules                                            | Later strategy evaluation: frozen criteria and held-out/prospective comparison above.                                                                               | Enabling Jev in any trading decision path.             |

The next scaffold needs only deterministic fakes and the separation of responsibilities above. Future adapter tests should cover duplicate/replaced bars, disconnect during backfill, rejected entitlement, ambiguous order submission, contract roll, DST/holiday/overnight boundaries, stale model response and timeout-to-abstain. Production adapters, account setup, a backtesting engine and strategy execution are outside this change.

## Validation of this decision

Acceptance coverage: the SDK/direct comparison and feed sections address equities; the futures matrices and blockers address provider selection; the Jev contract and evaluation address model integration; the shared boundaries distinguish scaffold work from later adapters. Sources were read without credentials for provider services. GitHub/npm metadata inspection does not establish service availability.

At authoring time this branch contains no package manifest, Markdown checker or application tests. Document references/code fences and Git whitespace were checked. Of 47 source URLs, 41 resolved through direct HTTP; the Tradovate access article and five CME links returned HTTP 403 to that checker but were readable through web research. Source/version review covered the claims above. Provider calls, order submission, SDK execution and strategy evaluation were deliberately not performed. Recheck commercial terms and mutable documentation before spending or implementation.

[alpaca-package]: https://github.com/alpacahq/alpaca-trade-api-js/blob/32ae035d2e4eca1e01362b08bdf51356b6b8b1f7/package.json
[alpaca-runtime]: https://github.com/alpacahq/alpaca-trade-api-js/blob/32ae035d2e4eca1e01362b08bdf51356b6b8b1f7/docs/docs/runtime-compatibility.md
[alpaca-compare]: https://github.com/alpacahq/alpaca-trade-api-js/compare/32ae035d2e4eca1e01362b08bdf51356b6b8b1f7...f72dbc84d95a05581d624f61afdca011c8f53b03
[alpaca-streaming]: https://github.com/alpacahq/alpaca-trade-api-js/blob/32ae035d2e4eca1e01362b08bdf51356b6b8b1f7/docs/docs/streaming.md
[alpaca-socket]: https://github.com/alpacahq/alpaca-trade-api-js/blob/32ae035d2e4eca1e01362b08bdf51356b6b8b1f7/src/streaming/websocket.ts
[alpaca-pagination]: https://github.com/alpacahq/alpaca-trade-api-js/blob/32ae035d2e4eca1e01362b08bdf51356b6b8b1f7/docs/docs/pagination.md
[alpaca-market-stream]: https://github.com/alpacahq/alpaca-trade-api-js/blob/32ae035d2e4eca1e01362b08bdf51356b6b8b1f7/src/streaming/marketDataStream.ts
[alpaca-trading]: https://github.com/alpacahq/alpaca-trade-api-js/blob/32ae035d2e4eca1e01362b08bdf51356b6b8b1f7/docs/docs/trading.md
[alpaca-resilience]: https://github.com/alpacahq/alpaca-trade-api-js/blob/32ae035d2e4eca1e01362b08bdf51356b6b8b1f7/docs/docs/resilience.md
[alpaca-tests]: https://github.com/alpacahq/alpaca-trade-api-js/blob/32ae035d2e4eca1e01362b08bdf51356b6b8b1f7/test/streaming.test.ts
[alpaca-tree]: https://github.com/alpacahq/alpaca-trade-api-js/tree/32ae035d2e4eca1e01362b08bdf51356b6b8b1f7/src/market-data/apis
[alpaca-plans]: https://docs.alpaca.markets/us/docs/about-market-data-api
[alpaca-history]: https://docs.alpaca.markets/us/reference/stockbars
[alpaca-faq]: https://docs.alpaca.markets/us/docs/market-data-faq
[alpaca-stock-stream]: https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data
[alpaca-protocol]: https://docs.alpaca.markets/us/docs/streaming-market-data
[alpaca-paper]: https://docs.alpaca.markets/us/docs/paper-trading
[tradovate-products]: https://www.tradovate.com/TradovateAllInRates120625.pdf
[tradovate-api]: https://api.tradovate.com/
[tradovate-environments]: https://partner.tradovate.com/resources/reference/api-cheat-sheet
[tradovate-access]: https://tradovate.zendesk.com/hc/en-us/articles/4403105829523-How-Do-I-Get-Access-to-the-Tradovate-API
[ibkr-products]: https://www.interactivebrokers.com/en/accounts/fees/CME.php
[ibkr-access]: https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/
[ibkr-intro]: https://www.interactivebrokers.com/docs/web-api/introduction
[ibkr-sessions]: https://www.interactivebrokers.com/docs/web-api/authentication/trading
[ibkr-history]: https://www.interactivebrokers.com/docs/web-api/api-reference/trading/trading-market-data/get-md-history
[ibkr-ws-history]: https://www.interactivebrokers.com/docs/web-api/v1/ws/market-data/historical-market-data-request
[ibkr-discovery]: https://www.interactivebrokers.com/campus/ibkr-api-page/web-api-staging/
[databento-instruments]: https://databento.com/docs/examples/instrument-definitions/liquid-universe
[databento-start]: https://databento.com/docs/getting-started/build-first-app?historical=http&live=http
[databento-cme]: https://www.cmegroup.com/solutions/market-tech-and-data-services/technology-vendor-services/databento.html
[databento-symbols]: https://databento.com/docs/standards-and-conventions/symbology
[databento-bars]: https://databento.com/docs/schemas-and-data-formats/ohlcv
[cme-specs]: https://www.cmegroup.com/articles/faqs/faq-e-nano-equity-index-futures.html
[cme-micro]: https://www.cmegroup.com/trading/equity-index/files/cme-micro-e-mini-futures-fact-card.pdf
[cme-faq]: https://www.cmegroup.com/articles/faqs/micro-e-mini-equity-index-futures-frequently-asked-questions.html
[cme-roll]: https://www.cmegroup.com/trading/equity-index/rolldates.html
[jev-package]: https://github.com/typesafe-ai/typesafe-sdk-js/blob/66880ccded6cb642dc1809620c2b108c33730214/package.json
[jev-sdk]: https://docs.typesafe.ai/sdk/javascript
[jev-client]: https://github.com/typesafe-ai/typesafe-sdk-js/blob/66880ccded6cb642dc1809620c2b108c33730214/src/client.ts
[jev-types]: https://github.com/typesafe-ai/typesafe-sdk-js/blob/66880ccded6cb642dc1809620c2b108c33730214/src/types.ts
[jev-models]: https://docs.typesafe.ai/models
[jev-config]: https://docs.typesafe.ai/sdk/javascript/api/interfaces/TypeSafeClientConfig
[jev-retry]: https://github.com/typesafe-ai/typesafe-sdk-js/blob/66880ccded6cb642dc1809620c2b108c33730214/src/retry.ts
[jev-latency]: https://typesafe.ai/blog/introducing-system-one-models-and-jev
[jev-confidence]: https://docs.typesafe.ai/confidence
[jev-limitations]: https://docs.typesafe.ai/model-jaggedness/jev-1.13
