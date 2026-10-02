# Streaming analytics and session-aware strategy configuration

Decision date: 2026-09-29. Scope: [MMM #8](https://github.com/tanaabased/mmm/issues/8).
Status: recommended foundation research contract; no trading runtime is implemented.

Direction update, 2026-10-02: the first integration will use Alpaca equities,
beginning with paper execution. Futures provider selection, access setup, and
implementation are deferred until explicitly revisited. Keep the existing
overnight/futures examples and rollover proofs as research reference; they do not
commit the foundation or the first equities integration to shipping futures.

## Decision

Own the small session calculations and correction policy. Use Luxon for timezone
conversion, Zod for one internal configuration schema, and `yaml` for YAML input.
Keep `trading-signals` as a later option for conventional indicators, not the owner
of MMM's session VWAP. Keep `simple-statistics` as a research cross-check, not a
runtime dependency for these three strategies. No application dependencies are
added by this decision.

The decisive requirements are corrected history, named sessions, and a precisely
named price statistic. An indicator catalogue does not settle those requirements.
The accompanying executable proofs are deliberately small enough to inspect.
They neither place orders nor establish that any proposed strategy is profitable.

## Package evidence

Exact evaluated candidate distributions are pinned as root development dependencies
in [package.json](../../package.json) and [bun.lock](../../bun.lock).
Registry metadata was inspected on the decision date. The modification dates
below are registry activity signals, not proof of maintenance quality or support.

| Candidate                  | Updates, corrections, warmup                                                                                                                                                                          | Numeric and replay behavior                                                                                                                                                       | Compatibility, license, maintenance                                                                                                                               | Verdict                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `trading-signals` 8.3.0    | `add` streams inputs; `replace` replaces the last contribution, with no timestamp lookup. VWAP needs one positive-volume input; SMA(2) needs two. Instantiate anew at reset.                          | JavaScript numbers; VWAP uses HLC/3. A zero-volume replacement returns null without removing the old contribution. Older corrections require rebuilding in canonical order.       | ESM, shipped TS declarations, MIT, no declared Node engine in this distribution. Registry modified 2026-08-11; active monorepo includes a much broader bot stack. | Defer for conventional indicators. Reject its VWAP as the session accumulator for v1.             |
| `simple-statistics` 7.12.1 | The evaluated `variance` function consumes an array; replacement means replacing input and recomputing. Nonempty input required. Other online helpers do not establish a session/correction contract. | Number-based population variance; `[10,12,12,12]` supplies an independent tiny integer-weight oracle. Do not expand real volumes into repeated arrays.                            | ESM/CJS, shipped TS declarations, ISC, Node `*`. Registry modified 2026-09-27.                                                                                    | Research-only oracle; no benefit over a small weighted calculation here.                          |
| Luxon 3.7.2                | Immutable dates; no indicator warmup. Convert explicit dates and IANA zones; inspect possible offsets and reject normalized nonexistent boundaries.                                                   | Epoch milliseconds plus host Intl/ICU timezone data. Replay needs the same calendar revision and runtime timezone data. It supplies no exchange calendar.                         | ESM/CJS, MIT, Node >=12; separate `@types/luxon`. Registry modified 2025-09-05, older than the other candidates.                                                  | Recommend for session boundary conversion, with explicit DST tests and runtime provenance.        |
| Local bounded calculation  | Canonicalize revisions; rebuild the retained session in event-time order for each observation. Warmup counts positive-volume completed bars since reset.                                              | Shifted, two-pass weighted population moments avoid subtracting two huge squared totals. O(n) computation per observation, with a 1,440-minute span cap; sorting adds O(n log n). | Small TypeScript fixture, repository MIT license; maintenance and numerical limits belong to MMM.                                                                 | Recommend the semantics and this reference oracle; optimize only after measuring a later runtime. |

Primary package sources: [Trading Signals](https://github.com/bennycode/trading-signals),
[8.3.0 VWAP implementation](https://unpkg.com/trading-signals@8.3.0/dist/trend/VWAP/VWAP.js),
[Simple Statistics](https://github.com/simple-statistics/simple-statistics),
[variance API](https://simple-statistics.github.io/docs/#variance), and
[Luxon API](https://moment.github.io/luxon/api-docs/index.html).
The published tarball and executable assertions take precedence over moving
repository examples. Tests intentionally pin candidate limitations: a future
version changing them should prompt review of the recommendation.

Contract tools are `zod` 4.6.5 (MIT, shipped TS types) and `yaml` 2.9.1
(ISC, Node >=14.6, shipped TS types). They parse and validate data, not prices or
exchange schedules. [Zod documentation](https://zod.dev/), [YAML documentation](https://eemeli.org/yaml/)

## Input identity and correction semantics

The later provider adapter owns a series identity containing instrument, actual
futures contract where applicable, provider, feed, interval, adjustment, and price
basis. Session/trading-date identity is an additional state partition. A ticker
alone is insufficient. v1 uses raw, completed one-minute bars and integer share or
contract volume; fractional-volume products need a new, reviewed contract.

Each research bar has a start instant, observation/availability instant, revision,
representative price, high, low, close, and volume. Offsets are mandatory. Bar time
denotes `[start, start + 60 seconds)`. No bar is available before its end. The fixture
uses millisecond instants; an adapter must preserve raw provider timestamps and
sequence information when greater precision matters.

`revision` is an adapter-owned monotone ordering, **not a claimed Alpaca field**.
The same identity and revision with the same price/volume payload is a duplicate;
different payload is an error. A greater revision replaces that bar's entire
contribution. Lower revisions are stale. Reordered delivery converges to the same
materialized session, independently of arrival order, given the same revisions.
The adapter must durably record revision assignment and earliest availability;
an ambiguous reconnect/backfill conflict requires reconciliation, not guesswork.

Retain one bounded session, with an explicit upper bound on revision/event storage
in the later runtime. The fixture limits time span, not raw event-log memory.
Out-of-session corrections throw here; production must mark the affected partition
unavailable and rebuild it from authoritative history. Never quietly apply an old
correction to the current session. A new futures contract creates a new partition.
Neither continuous-contract back-adjustment nor automatic roll selection is v1.

There are two replay questions: what the system knew at a past observation time,
and what the corrected history now says. `asOf` filters availability before choosing
revisions, so those answers can differ without rewriting a past decision. Replaying
only final historical bars cannot establish a causal strategy result.
If a correction creates a previously absent reversal, its confirmation time is
no earlier than the availability of every supporting revision; it is not backdated
to the original recovery candle.
A retrospective pattern match is not current trade eligibility: a correction
received after the strategy window closes cannot revive an expired opportunity.

Missing expected bars produce `incomplete`; too few positive-volume bars produce
`warming`; unsafe or conflicting values throw. A zero-volume completed bar carries
no VWAP weight and does not count toward warmup. It is distinct from no observation.
Never fill a gap with invented price or volume. The fixture's calculation scope is
a contiguous minute grid. In a later runtime, derive the expected grid from the
calendar's eligible intervals; scheduled closures are not missing data. The
separate session proof demonstrates this exclusion without building that runtime.

## Calculations and hand-checkable evidence

For representative price `p` and volume `w`, define session mean
`mu = sum(w*p)/sum(w)` and **volume-weighted population variance of bar prices**
`variance = sum(w*(p-mu)^2)/sum(w)`. Standard deviation is its square root.
The fixture centers differences on the first positive-volume price to reduce
cancellation. It rejects nonfinite results and unsafe cumulative integer volume.
All executable examples use exactly representable values. Later floating-point
comparisons need declared absolute/relative tolerances and precision envelopes;
these tests do not prove accuracy for every instrument scale.

| Observation                            | Expected result                                         |
| -------------------------------------- | ------------------------------------------------------- |
| Price 10, volume 1; price 12, volume 3 | Mean 11.5; variance 0.75; volume 4                      |
| Replace the second price with 14       | Mean 13; variance 3; volume remains 4                   |
| Replace the first price with 14        | Mean 12.5; variance 0.75                                |
| Replace the second volume with zero    | Mean 10 if one-bar warmup is allowed; otherwise warming |
| Equal volumes at 10^12 and 10^12 + 2   | Variance 1                                              |
| Start a new session with price 20      | Mean 20, with no old-session contribution               |

Choose `bar-vwap` when the provider supplies it with a compatible volume population.
Weighting those bar means reconstructs that population's session mean subject to
provider rounding and eligibility rules. HLC/3 is an explicit approximation, never
an implicit fallback. OHLCV plus bar VWAP cannot reconstruct trade-level variance:
the within-bar second moment is missing. The dispersion defined above measures
between-bar representative prices and must be labelled accordingly.

Opening range is the high/low of completed eligible bars in the half-open interval
starting at the configured trading window start, for `rangeMinutes`. No breakout
is eligible until the range closes. The tiny test uses `[09:30,09:32)`; a 09:32 bar
is outside it. Missing/zero-volume range bars make this conservative proof
incomplete. Corrections can revise range extrema; past decisions remain recorded.

The reversal proof anchors to the first completed close in its configured window,
tracks the earliest minimum, requires a decline fraction from that anchor, then a
later close recovering the configured fraction of the decline. Prices
`100,96,98,100` on successive minutes with decline `0.04` and recovery `0.5` confirm
at the third bar's availability. A two-minute window ends before that recovery.
The trough is not selected using future data. `windowMinutes` is elapsed time from
the start of the chosen evaluation window, not a count of received bars. Repeated
window scheduling, entry/exit rules, and trading performance belong to the later
strategy milestone.

## Versioned configuration

[config.mts](analytics/lib/config.mts) is the single executable internal schema.
YAML and JSON pass through it without numeric coercion or defaults. Strict objects
reject unknown fields; strategy variants constrain their own parameters. The YAML
reader rejects duplicate keys, aliases, unknown tags, and multiple documents.
Inputs are capped at 32 KiB. JSON follows `JSON.parse` semantics; authors must use
unique keys. There is no expression evaluator, callback, module path, or script
field. Jev criterion text is data, never executable code.

Equivalent examples cover [US VWAP](analytics/examples/us-vwap.yaml),
[European opening range](analytics/examples/europe-opening-range.yaml),
[Asian reversal](analytics/examples/asia-reversal.yaml), and
[overnight futures VWAP](analytics/examples/overnight-vwap.yaml); each has a `.json`
counterpart. Europe/Asia use synthetic instruments and feeds. The futures example
explicitly names an unresolved provider. None proves access or product support.

The schema records instrument/tick size, provider/feed, price/volume semantics,
strategy type/parameters, named session/IANA zone, calendar identity/version,
trading window, VWAP reset boundary, warmup, correction policy, and optional Jev
criteria. Day offsets are relative to the exchange calendar's trading-date label.
The overnight example's reset occurs on day `-1`; UTC midnight does not reset it.
Reset must precede or equal the trading window, and the retained span is bounded.
Warmup may begin before trading eligibility. Unknown schema versions fail rather
than silently migrate. Later extensions need an explicit migration/version policy.

## Session and exchange availability

Strategy windows express operator intent. An injected, versioned exchange calendar
expresses market availability. Their intersection determines eligible complete
bars; a bar straddling the close is excluded. A known holiday has an empty interval
list (`closed`); missing or mismatched calendar evidence is `unavailable`.
The test calendars are explicit synthetic fixtures, not an exchange calendar
distribution or a claim of current holiday coverage.

The session fixtures prove New York's March DST change, London's different
transition week, Tokyo's offset, rejection of nonexistent spring and ambiguous
autumn boundaries, early-close clipping, overnight trading-date preservation,
and exclusion of a synthetic maintenance break. Local boundaries are rejected
when Luxon would normalize them or offer multiple offsets. Incoming bar timestamps
already carry offsets and therefore identify an instant unambiguously.

Pin calendar revisions and record runtime/ICU/timezone-data versions in replay
provenance; otherwise a future timezone-database update can change old conversions.
Futures maintenance, product-specific hours, expiry, and roll mapping come from
the selected provider/exchange contract. A regional session label does not supply
them. CME's [roll-date guidance](https://www.cmegroup.com/trading/equity-index/rolldates.html)
distinguishes customary lead-month changes from a participant's choice of when to
roll; do not turn the customary date into an automatic execution instruction.

## Reconciliation with #7 and ownership with #2

The provider recommendation in [PR #10](https://github.com/tanaabased/mmm/pull/10)
selects Alpaca equities and optional Jev evaluation, with futures deferred by the
2026-10-02 direction update. This research preserves its separation of market
data, execution, and decisions:

- Alpaca's [stock stream](https://docs.alpaca.markets/us/docs/real-time-stock-pricing-data)
  exposes late-trade updated bars and separate trade correction/cancel messages.
  An updated aggregate replaces a minute; it is not additional volume. Raw trade
  correction processing is adapter work, outside these proofs.
- [IEX and SIP](https://docs.alpaca.markets/us/docs/market-data-faq) cover different
  trade populations. Explicit feed identity must survive historical backfill and
  live replay. Never blend feeds or call IEX VWAP a consolidated-market VWAP.
- Futures data/execution support, entitlements, authoritative calendars, contract
  metadata, and live correction guarantees remain deferred research questions.
  They do not block equities work. No unsupported provider is implied by a
  configurable futures example.
- Jev sees already computed features and bounded, source-grounded context.
  Arithmetic, ordering, session eligibility, missing-data gates, and execution
  limits remain code. Invalid/unavailable input or model failure means abstain.
  [TypeSafe's Jev guidance](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
  supports this division. The SDK, timeout/retry/cost policy, and actual model
  availability remain #7's responsibility. Model confidence is not profit odds.

The calculations can be recommended now because they do not depend on the final
SDK choice. Before adapter implementation, validate these specific input fields
and availability rules against the selected Alpaca SDK and feed. Revisit the
futures questions only if that work is explicitly resumed.

[#2](https://github.com/tanaabased/mmm/issues/2) still owns the single application
package, supported Node runtime, repository checks, and source layout. Accordingly,
all proof code, examples, and tests live under this decision's `analytics/` scope.
The root package owns installation, lint, formatting, type checking, and the
`test:research` command. Its Linux/macOS test workflow runs the proofs under Bun
and the declared Node consumer runtime. There is no research package, application
export, or build entrypoint. Promote schema/calculation modules only when a later
runtime actually consumes them.
Keep the proofs and their tests together if that ownership moves.

## Run and interpret the proofs

From the repository root, with Bun and Node on PATH:

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test:research
```

The root frozen install supplies Mocha and the evaluated candidate packages.
`test:research` runs all three proof files under Bun and Node 26 and prints Node
runtime timezone provenance. Tests themselves need neither credentials nor network;
uncached dependency installation may need network access. Root ESLint, standalone
Prettier, and strict TypeScript checks cover the research alongside application
source, without a second formatter policy or toolchain lock.

The three test files map to the acceptance criteria: `analytics.spec.mts` covers
hand calculations, streaming observations, candidate mismatches, correction
replay, range/reversal windows and rollover partitioning; `config.spec.mts` covers
equivalent formats and invalid inputs; `sessions.spec.mts` covers regional clocks
and calendar behavior. These are research proofs, not a server, live adapter,
strategy engine, backtester, or order simulator.

## Later strategy milestone

Evaluate each deterministic strategy first on held-out, causally replayed data,
including feed coverage, corrections, missing bars, session changes, costs,
slippage, liquidity, and contract rolls. Then compare the same baseline and data
with Jev's optional contextual judgment. Record abstentions, latency, failures,
decision changes, and out-of-sample outcomes; avoid tuning on the held-out set.
Test warmup versus trade eligibility, zero dispersion, tick rounding, correction
retention limits, cross-process replay, runtime timezone drift, and revised inputs
after a decision. Measure memory and update latency before replacing this small
oracle with an optimized streaming implementation.
