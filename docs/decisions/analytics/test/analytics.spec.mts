import assert from 'node:assert/strict';

import { variance } from 'simple-statistics';
import { SMA, VWAP } from 'trading-signals';

import {
  materialize,
  openingRange,
  reversal,
  summarize,
  type Bar,
  type Scope,
} from '../lib/analytics.mts';

const time = (minute: number) => new Date(Date.UTC(2026, 8, 29, 13, 30 + minute)).toISOString();
const scope = (minutes = 2): Scope => ({
  series: 'SPY:alpaca:sip:raw:60:bar-vwap',
  start: time(0),
  end: time(minutes),
  asOf: time(minutes),
  minBars: 2,
});
const bar = (
  minute: number,
  price: number,
  volume: number,
  revision = 0,
  available = minute + 1,
): Bar => ({
  series: scope().series,
  start: time(minute),
  availableAt: time(available),
  revision,
  price,
  high: price,
  low: price,
  close: price,
  volume,
});
const initial = [bar(0, 10, 1), bar(1, 12, 3)];
const candle = (price: number, volume: number) => ({
  high: price,
  low: price,
  close: price,
  volume,
});

describe('analytics/lib/analytics', () => {
  it('should produce hand-computable weighted population moments', () => {
    assert.deepEqual(summarize(initial, scope()), {
      status: 'ready',
      mean: 11.5,
      variance: 0.75,
      deviation: Math.sqrt(0.75),
      volume: 4,
    });
    assert.equal(variance([10, 12, 12, 12]), 0.75);
  });
  it('should expose incremental observations without using a future bar', () => {
    const stream = [...initial, bar(1, 14, 3, 1, 3)];
    const outputs = [1, 2, 3].map((minute) =>
      summarize(stream, { ...scope(), asOf: time(minute) }),
    );
    assert.deepEqual(
      outputs.map((output) => output.status),
      ['warming', 'ready', 'ready'],
    );
    assert.deepEqual(
      outputs.map((output) => output.mean),
      [undefined, 11.5, 13],
    );
  });
  it('should converge after duplicates, reordered arrivals, and older-bar corrections', () => {
    const correction = bar(0, 14, 1, 1, 3);
    const input = [...initial, correction, initial[1]!];
    const correctedScope = { ...scope(), asOf: time(3) };
    assert.deepEqual(
      summarize(input, correctedScope),
      summarize([...input].reverse(), correctedScope),
    );
    assert.equal(summarize(input, correctedScope).mean, 12.5);
    assert.equal(summarize(input, scope()).mean, 11.5);
    assert.equal(materialize(input, correctedScope).length, 2);
    assert.deepEqual(summarize([...initial, bar(1, 14, 3, 1, 3)], correctedScope), {
      status: 'ready',
      mean: 13,
      variance: 3,
      deviation: Math.sqrt(3),
      volume: 4,
    });
  });
  it('should remove a contribution replaced by zero volume and distinguish warmup from missing data', () => {
    const input = [...initial, bar(1, 12, 0, 1, 3)];
    assert.equal(summarize(input, { ...scope(), asOf: time(3) }).status, 'warming');
    assert.equal(summarize(input, { ...scope(), asOf: time(3), minBars: 1 }).mean, 10);
    assert.equal(summarize([initial[0]!], scope()).status, 'incomplete');
    assert.equal(summarize([bar(0, 10, 0)], { ...scope(1), minBars: 1 }).status, 'warming');
  });
  it('should avoid cancellation for large prices and small dispersion', () => {
    assert.equal(summarize([bar(0, 1e12, 1), bar(1, 1e12 + 2, 1)], scope()).variance, 1);
  });
  it('should reject conflicting revisions, invalid values, grid errors, and mixed feeds or contracts', () => {
    for (const change of [
      { price: NaN },
      { volume: -1 },
      { volume: 0.5 },
      { revision: -1 },
      { high: 9 },
      { series: 'SPY:alpaca:iex' },
      { series: 'ES:ESZ26' },
      { start: time(3) },
      { start: time(0).replace(':00.000', ':30.000') },
      { availableAt: time(0) },
    ])
      assert.throws(() => summarize([{ ...initial[0]!, ...change }], scope()));
    assert.throws(() => summarize([...initial, bar(0, 11, 1)], scope()));
    assert.throws(() => summarize([bar(0, 10, Number.MAX_SAFE_INTEGER), bar(1, 12, 1)], scope()));
  });
  it('should reset explicitly and reject a prior-session correction in a new session', () => {
    const next = {
      ...scope(1),
      start: time(10),
      end: time(11),
      asOf: time(11),
      minBars: 1,
    };
    assert.equal(summarize([bar(10, 20, 2)], next).mean, 20);
    assert.throws(() => summarize([...initial, bar(10, 20, 2)], next));
  });
  it('should begin a new futures contract partition without blending roll prices', () => {
    const december = 'ES:ESZ26:fixture:raw:60:bar-vwap';
    const march = 'ES:ESH27:fixture:raw:60:bar-vwap';
    const oldBar = { ...bar(0, 100, 1), series: december };
    const newBar = { ...bar(0, 120, 1), series: march };
    const next = { ...scope(1), minBars: 1, series: march };
    assert.throws(() => summarize([oldBar, newBar], next));
    assert.equal(summarize([newBar], next).mean, 120);
  });
  it('should include the opening minute and exclude the exact range end', () => {
    assert.deepEqual(openingRange(initial, scope()), {
      status: 'ready',
      high: 12,
      low: 10,
    });
    assert.equal(openingRange(initial, { ...scope(), asOf: time(1) }).status, 'incomplete');
    assert.equal(openingRange([initial[1]!], scope()).status, 'incomplete');
    assert.throws(() => openingRange([...initial, bar(2, 100, 1)], scope()));
    assert.equal(
      openingRange([...initial, bar(0, 14, 1, 1, 3)], {
        ...scope(),
        asOf: time(3),
      }).high,
      14,
    );
  });
  it('should not backdate a reversal introduced by a later correction', () => {
    const input = [bar(0, 100, 1), bar(1, 99, 1), bar(2, 98, 1), bar(1, 96, 1, 1, 5)];
    assert.equal(reversal(input, scope(3), 0.04, 0.5).status, 'unmatched');
    assert.deepEqual(reversal(input, { ...scope(3), asOf: time(5) }, 0.04, 0.5), {
      status: 'matched',
      trough: time(1),
      confirmedAt: time(5),
    });
  });
  it('should confirm a defined reversal causally and respect the half-open deadline', () => {
    const input = [bar(0, 100, 1), bar(1, 96, 1), bar(2, 98, 1), bar(3, 100, 1)];
    assert.equal(reversal(input, { ...scope(4), asOf: time(2) }, 0.04, 0.5).status, 'unmatched');
    assert.deepEqual(reversal(input, { ...scope(4), asOf: time(3) }, 0.04, 0.5), {
      status: 'matched',
      trough: time(1),
      confirmedAt: time(3),
    });
    assert.equal(reversal(input.slice(0, 2), scope(2), 0.04, 0.5).status, 'unmatched');
    assert.throws(() => reversal(input, scope(2), 0.04, 0.5));
    assert.equal(reversal([input[0]!, input[2]!], scope(3), 0.04, 0.5).status, 'unavailable');
  });
});

describe('analytics/candidate compatibility', () => {
  it('should demonstrate trading-signals warmup and last-value replacement', () => {
    const sma = new SMA(2);
    assert.equal(sma.getResult(), null);
    sma.add(10);
    assert.equal(sma.isStable, false);
    sma.add(12);
    assert.equal(sma.getResult(), 11);
    sma.replace(14);
    assert.equal(sma.getResult(), 12);
    const vwap = new VWAP();
    for (const value of initial) vwap.add(candle(value.price, value.volume));
    assert.equal(vwap.getResult(), 11.5);
    vwap.replace(candle(14, 3));
    assert.equal(vwap.getResult(), 13);
  });
  it('should expose HLC3 semantics and zero-volume replacement limitation in 8.3.0', () => {
    const vwap = new VWAP();
    vwap.add({ high: 16, low: 10, close: 10, volume: 1 });
    assert.equal(vwap.getResult(), 12); // Provider bar VWAP could be 11: a different input statistic.
    vwap.add(candle(14, 3));
    assert.equal(vwap.replace(candle(14, 0)), null);
    assert.equal(vwap.getResult(), 13.5); // Old contribution remains; correct removal would return 12.
    assert.equal(new VWAP().getResult(), null);
  });
});
