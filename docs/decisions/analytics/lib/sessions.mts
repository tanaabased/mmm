import { DateTime } from "luxon";

import { configSchema, localBoundary } from "./config.mts";
import type { StrategyConfig } from "./config.mts";

export type CalendarDay = {
  id: string;
  version: string;
  tradingDate: string;
  intervals: readonly { start: string; end: string }[];
};

export function instant(value: string): number {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new Error("Instant requires an explicit offset");
  const parsed = DateTime.fromISO(value, { setZone: true });
  if (!parsed.isValid) throw new Error("Invalid instant");
  return parsed.toMillis();
}

/** Calendar intervals are injected authoritative availability, not inferred from weekdays. */
export function sessionWindow(
  raw: StrategyConfig,
  tradingDate: string,
  calendar: CalendarDay | null,
) {
  const config = configSchema.parse(raw);
  if (
    !calendar ||
    calendar.id !== config.session.calendar ||
    calendar.version !== config.session.calendarVersion ||
    calendar.tradingDate !== tradingDate
  )
    return { status: "unavailable" as const };
  const { session } = config;
  const reset = localBoundary(
    tradingDate,
    session.timezone,
    session.vwapReset,
  ).toMillis();
  const start = localBoundary(
    tradingDate,
    session.timezone,
    session.window.start,
  ).toMillis();
  const end = localBoundary(
    tradingDate,
    session.timezone,
    session.window.end,
  ).toMillis();
  const intervals = calendar.intervals
    .map((value) => ({ start: instant(value.start), end: instant(value.end) }))
    .sort((a, b) => a.start - b.start);
  if (
    intervals.some(
      (value, index) =>
        value.start >= value.end ||
        (index > 0 && intervals[index - 1]!.end > value.start),
    )
  )
    throw new Error("Invalid calendar intervals");
  if (end <= start || end - reset > 1440 * 60_000)
    throw new Error("Session exceeds retained bar limit");
  const active = intervals
    .map((value) => ({
      start: Math.max(start, value.start),
      end: Math.min(end, value.end),
    }))
    .filter((value) => value.start < value.end);
  return {
    status: active.length ? ("open" as const) : ("closed" as const),
    tradingDate,
    reset,
    start,
    end,
    intervals: active,
  };
}

/** A complete bar must fit in one tradable interval; boundary-straddling bars are excluded. */
export function containsBar(
  window: ReturnType<typeof sessionWindow>,
  start: string,
  intervalSeconds = 60,
): boolean {
  if (!Number.isInteger(intervalSeconds) || intervalSeconds <= 0)
    throw new Error("Invalid interval");
  if (window.status !== "open") return false;
  const value = instant(start);
  return window.intervals.some(
    (interval) =>
      value >= interval.start && value + intervalSeconds * 1000 <= interval.end,
  );
}
