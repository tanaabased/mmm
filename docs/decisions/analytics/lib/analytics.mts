import { instant } from "./sessions.mts";

export type Bar = {
  series: string;
  start: string;
  availableAt: string;
  revision: number;
  price: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type Scope = {
  series: string;
  start: string;
  end: string;
  asOf: string;
  minBars: number;
};

/** Bounded research replay oracle. Revisions are adapter-owned, not assumed provider fields. */
export function materialize(events: readonly Bar[], scope: Scope): Bar[] {
  const start = instant(scope.start);
  const end = instant(scope.end);
  const asOf = instant(scope.asOf);
  if (
    !scope.series ||
    end <= start ||
    (end - start) % 60_000 ||
    end - start > 1440 * 60_000 ||
    !Number.isInteger(scope.minBars) ||
    scope.minBars <= 0
  )
    throw new Error("Invalid scope");
  const revisions = new Map<string, Bar>();
  for (const event of events) {
    const time = instant(event.start);
    const available = instant(event.availableAt);
    if (
      event.series !== scope.series ||
      time < start ||
      time >= end ||
      (time - start) % 60_000
    )
      throw new Error("Bar outside series/session/grid");
    if (
      !Number.isSafeInteger(event.revision) ||
      event.revision < 0 ||
      !Number.isSafeInteger(event.volume) ||
      event.volume < 0 ||
      ![event.price, event.high, event.low, event.close].every(
        Number.isFinite,
      ) ||
      event.low > event.high ||
      event.price < event.low ||
      event.price > event.high ||
      event.close < event.low ||
      event.close > event.high ||
      available < time + 60_000
    )
      throw new Error("Invalid completed bar");
    if (available > asOf) continue;
    const normalized = {
      ...event,
      start: new Date(time).toISOString(),
      availableAt: new Date(available).toISOString(),
    };
    const key = `${time}:${event.revision}`;
    const previous = revisions.get(key);
    if (
      previous &&
      ["price", "high", "low", "close", "volume"].some(
        (field) => previous[field as keyof Bar] !== event[field as keyof Bar],
      )
    )
      throw new Error("Conflicting revision");
    // An identical redelivery may have a later receive time; retain the earliest observation.
    if (!previous || available < instant(previous.availableAt))
      revisions.set(key, normalized);
  }
  const latest = new Map<number, Bar>();
  for (const event of revisions.values()) {
    const time = instant(event.start);
    if (!latest.has(time) || latest.get(time)!.revision < event.revision)
      latest.set(time, event);
  }
  return [...latest.values()].sort(
    (a, b) => instant(a.start) - instant(b.start),
  );
}

/** Volume-weighted population variance of representative bar prices, not individual trades. */
export function summarize(events: readonly Bar[], scope: Scope) {
  const bars = materialize(events, scope);
  const expected = Math.floor(
    (Math.min(instant(scope.end), instant(scope.asOf)) - instant(scope.start)) /
      60_000,
  );
  if (expected <= 0 || bars.length !== expected)
    return { status: "incomplete" as const };
  const positive = bars.filter((bar) => bar.volume > 0);
  if (positive.length < scope.minBars) return { status: "warming" as const };
  const weight = positive.reduce((sum, bar) => sum + bar.volume, 0);
  if (!Number.isSafeInteger(weight))
    throw new Error("Unsafe cumulative volume");
  const origin = positive[0]!.price;
  const offset = positive.reduce(
    (sum, bar) => sum + (bar.price - origin) * (bar.volume / weight),
    0,
  );
  const mean = origin + offset;
  const variance = positive.reduce(
    (sum, bar) =>
      sum + (bar.price - origin - offset) ** 2 * (bar.volume / weight),
    0,
  );
  if (![mean, variance].every(Number.isFinite))
    throw new Error("Numeric overflow");
  return {
    status: "ready" as const,
    mean,
    variance,
    deviation: Math.sqrt(variance),
    volume: weight,
  };
}

export function openingRange(events: readonly Bar[], scope: Scope) {
  const bars = materialize(events, scope);
  if (
    instant(scope.asOf) < instant(scope.end) ||
    bars.length !== (instant(scope.end) - instant(scope.start)) / 60_000 ||
    bars.some((bar) => bar.volume === 0)
  )
    return { status: "incomplete" as const };
  return {
    status: "ready" as const,
    high: Math.max(...bars.map((bar) => bar.high)),
    low: Math.min(...bars.map((bar) => bar.low)),
  };
}

/** Fixed initial close, earliest minimum, and first qualifying recovery observed by asOf. */
export function reversal(
  events: readonly Bar[],
  scope: Scope,
  declineFraction: number,
  recoveryFraction: number,
) {
  if (
    ![declineFraction, recoveryFraction].every(
      (value) => Number.isFinite(value) && value > 0 && value <= 1,
    )
  )
    throw new Error("Invalid reversal fractions");
  const bars = materialize(events, scope);
  if (
    summarize(events, scope).status !== "ready" ||
    bars.some((bar) => bar.volume === 0)
  )
    return { status: "unavailable" as const };
  const first = bars[0]!;
  if (first.close <= 0)
    throw new Error("Reversal requires positive anchor price");
  let trough = first;
  let observedAt = instant(first.availableAt);
  for (const bar of bars.slice(1)) {
    observedAt = Math.max(observedAt, instant(bar.availableAt));
    if (bar.close < trough.close) trough = bar;
    const drop = first.close - trough.close;
    if (
      drop / first.close >= declineFraction &&
      instant(bar.start) > instant(trough.start) &&
      bar.close >= trough.close + recoveryFraction * drop
    )
      return {
        status: "matched" as const,
        trough: trough.start,
        confirmedAt: new Date(observedAt).toISOString(),
      };
  }
  return { status: "unmatched" as const };
}
