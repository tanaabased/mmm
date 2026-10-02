import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { configSchema, parseConfig } from '../lib/config.mts';

const examples = new URL('../examples/', import.meta.url);
const base = () => JSON.parse(readFileSync(new URL('us-vwap.json', examples), 'utf8'));

describe('analytics/lib/config', () => {
  it('should normalize every YAML and JSON example into one schema', () => {
    const files = readdirSync(examples).filter((file) => file.endsWith('.json'));
    assert.equal(files.length, 4);
    for (const file of files)
      assert.deepEqual(
        parseConfig(readFileSync(new URL(file, examples), 'utf8'), 'json'),
        parseConfig(
          readFileSync(new URL(file.replace('.json', '.yaml'), examples), 'utf8'),
          'yaml',
        ),
      );
  });
  it('should reject unknown fields, versions, strategies, and invalid numerical parameters', () => {
    for (const patch of [
      { schemaVersion: 2 },
      { eval: 'process.exit()' },
      { strategy: { type: 'script', code: 'buy()' } },
      {
        strategy: {
          type: 'vwap-mean-reversion',
          parameters: { entrySigma: 1, exitSigma: 2 },
        },
      },
      { warmup: { minPositiveVolumeBars: 0, scope: 'since-reset' } },
    ])
      assert.equal(configSchema.safeParse({ ...base(), ...patch }).success, false);
    const config = base();
    config.instrument.tickSize = Infinity;
    assert.equal(configSchema.safeParse(config).success, false);
  });
  it('should reject invalid timezone, contradictory windows, futures ambiguity, and unit mismatches', () => {
    const invalidZone = base();
    invalidZone.session.timezone = 'ET';
    const reversed = base();
    reversed.session.window.end.time = '09:00';
    const reset = base();
    reset.session.vwapReset.time = '10:00';
    const future = base();
    future.instrument.assetClass = 'future';
    const unit = base();
    unit.marketData.volumeUnit = 'contracts';
    for (const value of [invalidZone, reversed, reset, future, unit])
      assert.equal(configSchema.safeParse(value).success, false);
  });
  it('should reject YAML aliases, duplicate keys, custom executable tags, and multiple documents', () => {
    const text = readFileSync(new URL('us-vwap.yaml', examples), 'utf8');
    for (const invalid of [
      `${text}\nid: duplicate\n`,
      `${text}\nx: &x hello\ny: *x\n`,
      `${text}\nx: !!js/function 'function() {}'\n`,
      `${text}\n---\n${text}`,
    ])
      assert.throws(() => parseConfig(invalid, 'yaml'));
  });
});
