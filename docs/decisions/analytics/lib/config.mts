import { DateTime, IANAZone } from 'luxon';
import { parseDocument } from 'yaml';
import { z } from 'zod';

const positive = z.number().finite().positive();
const name = z.string().min(1).max(128);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const boundary = z.strictObject({
  time: clock,
  dayOffset: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});
const minute = (value: z.infer<typeof boundary>) =>
  value.dayOffset * 1440 + Number(value.time.slice(0, 2)) * 60 + Number(value.time.slice(3));
const strategy = z.discriminatedUnion('type', [
  z
    .strictObject({
      type: z.literal('vwap-mean-reversion'),
      parameters: z.strictObject({
        entrySigma: positive,
        exitSigma: z.number().finite().nonnegative(),
      }),
    })
    .refine(
      (value) => value.parameters.exitSigma < value.parameters.entrySigma,
      'exitSigma must be below entrySigma',
    ),
  z.strictObject({
    type: z.literal('v-reversal'),
    parameters: z.strictObject({
      declineFraction: positive.max(1),
      recoveryFraction: positive.max(1),
      windowMinutes: z.number().int().positive().max(1440),
    }),
  }),
  z.strictObject({
    type: z.literal('opening-range-breakout'),
    parameters: z.strictObject({
      rangeMinutes: z.number().int().positive().max(1440),
      breakoutBufferTicks: z.number().int().nonnegative(),
    }),
  }),
]);

/** Research contract v1; not yet a public MMM runtime API. */
export const configSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: name,
    instrument: z.strictObject({
      assetClass: z.enum(['equity', 'future']),
      symbol: name,
      contract: name.optional(),
      tickSize: positive,
    }),
    marketData: z.strictObject({
      provider: name,
      feed: name,
      intervalSeconds: z.literal(60),
      adjustment: z.literal('raw'),
      volumeUnit: z.enum(['shares', 'contracts']),
      priceBasis: z.enum(['bar-vwap', 'hlc3']),
    }),
    strategy,
    session: z.strictObject({
      name,
      timezone: z.string().refine((value) => IANAZone.isValidZone(value), 'IANA timezone required'),
      calendar: name,
      calendarVersion: name,
      tradingDate: z.literal('calendar-label'),
      window: z.strictObject({ start: boundary, end: boundary }),
      vwapReset: boundary,
      dstPolicy: z.literal('reject-ambiguous-or-nonexistent'),
    }),
    warmup: z.strictObject({
      minPositiveVolumeBars: z.number().int().positive().max(1440),
      scope: z.literal('since-reset'),
    }),
    dataPolicy: z.strictObject({
      missing: z.literal('unavailable'),
      corrections: z.literal('replay-retained-session'),
      duplicates: z.literal('ignore-identical'),
      maxSessionBars: z.literal(1440),
    }),
    decision: z
      .strictObject({
        provider: z.literal('jev'),
        model: name,
        criterion: z.string().min(1).max(2000),
        outcomes: z.tuple([z.literal('allow'), z.literal('abstain')]),
        unavailable: z.literal('abstain'),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    const { session, instrument, marketData } = value;
    const start = minute(session.window.start);
    const end = minute(session.window.end);
    const reset = minute(session.vwapReset);
    if (!(reset <= start && start < end && end - reset <= 1440))
      context.addIssue({
        code: 'custom',
        message: 'Require reset <= start < end within 24 local hours',
      });
    if (
      instrument.assetClass === 'future' &&
      (!instrument.contract || marketData.volumeUnit !== 'contracts')
    )
      context.addIssue({
        code: 'custom',
        message: 'Futures require an explicit contract and contract volume',
      });
    if (
      instrument.assetClass === 'equity' &&
      (instrument.contract || marketData.volumeUnit !== 'shares')
    )
      context.addIssue({
        code: 'custom',
        message: 'Equities require share volume and no futures contract',
      });
    if (
      value.strategy.type === 'opening-range-breakout' &&
      value.strategy.parameters.rangeMinutes >= end - start
    )
      context.addIssue({
        code: 'custom',
        message: 'Opening range must leave a breakout window',
      });
  });

export type StrategyConfig = z.infer<typeof configSchema>;

/** YAML is data only: one document, unique keys, no aliases or custom tags. */
export function parseConfig(text: string, format: 'json' | 'yaml'): StrategyConfig {
  if (text.length > 32_768) throw new Error('Configuration too large');
  if (format === 'json') return configSchema.parse(JSON.parse(text));
  const document = parseDocument(text, { schema: 'core', uniqueKeys: true });
  if (document.errors.length || document.warnings.length) throw new Error('Invalid YAML');
  return configSchema.parse(document.toJS({ maxAliasCount: 0 }));
}

/** Reject timezone normalization rather than silently moving a requested boundary. */
export function localBoundary(
  date: string,
  zone: string,
  boundaryValue: z.infer<typeof boundary>,
): DateTime {
  const base = DateTime.fromISO(date, { zone: 'UTC' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !base.isValid) throw new Error('Invalid trading date');
  const day = base.plus({ days: boundaryValue.dayOffset }).toISODate();
  const requested = `${day}T${boundaryValue.time}`;
  const result = DateTime.fromISO(requested, { zone });
  if (
    !result.isValid ||
    result.toFormat("yyyy-MM-dd'T'HH:mm") !== requested ||
    result.getPossibleOffsets().length !== 1
  )
    throw new Error('Ambiguous or nonexistent local boundary');
  return result;
}
