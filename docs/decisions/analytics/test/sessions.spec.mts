import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { localBoundary, parseConfig } from "../lib/config.mts";
import { containsBar, instant, sessionWindow } from "../lib/sessions.mts";
import type { CalendarDay } from "../lib/sessions.mts";

const example = (id = "us-vwap") =>
  parseConfig(
    readFileSync(new URL(`../examples/${id}.json`, import.meta.url), "utf8"),
    "json",
  );
const calendar = (
  date: string,
  intervals: CalendarDay["intervals"],
  id = "fixture-us",
): CalendarDay => ({ id, version: "2026-09-29", tradingDate: date, intervals });
const full = (date: string, id = "fixture-us") =>
  calendar(
    date,
    [{ start: `${date}T00:00:00Z`, end: `${date}T23:59:00Z` }],
    id,
  );

describe("analytics/lib/sessions", () => {
  it("should resolve US DST and regional transition mismatches independently", () => {
    const us = example();
    const europe = example("europe-opening-range");
    const before = sessionWindow(us, "2026-03-06", full("2026-03-06"));
    const after = sessionWindow(us, "2026-03-09", full("2026-03-09"));
    assert.equal(
      before.status === "open" && before.start,
      instant("2026-03-06T14:30:00Z"),
    );
    assert.equal(
      after.status === "open" && after.start,
      instant("2026-03-09T13:30:00Z"),
    );
    const london = sessionWindow(
      europe,
      "2026-03-09",
      full("2026-03-09", "fixture-europe"),
    );
    assert.equal(
      london.status === "open" && london.start,
      instant("2026-03-09T08:00:00Z"),
    );
    const summer = sessionWindow(
      europe,
      "2026-03-30",
      full("2026-03-30", "fixture-europe"),
    );
    assert.equal(
      summer.status === "open" && summer.start,
      instant("2026-03-30T07:00:00Z"),
    );
  });
  it("should resolve Asia without US DST and include only complete bars in half-open windows", () => {
    const asia = sessionWindow(
      example("asia-reversal"),
      "2026-03-09",
      full("2026-03-09", "fixture-asia"),
    );
    assert.equal(containsBar(asia, "2026-03-09T00:00:00Z"), true);
    assert.equal(containsBar(asia, "2026-03-09T01:59:00Z"), true);
    assert.equal(containsBar(asia, "2026-03-09T01:59:30Z"), false);
    assert.equal(containsBar(asia, "2026-03-09T02:00:00Z"), false);
  });
  it("should reject nonexistent and ambiguous boundaries instead of silently selecting an offset", () => {
    assert.throws(() =>
      localBoundary("2026-03-08", "America/New_York", {
        time: "02:30",
        dayOffset: 0,
      }),
    );
    assert.throws(() =>
      localBoundary("2026-11-01", "America/New_York", {
        time: "01:30",
        dayOffset: 0,
      }),
    );
    assert.equal(
      localBoundary("2026-11-01", "America/New_York", {
        time: "03:30",
        dayOffset: 0,
      })
        .toUTC()
        .toISO(),
      "2026-11-01T08:30:00.000Z",
    );
    assert.throws(() =>
      localBoundary("2026-02-30", "UTC", { time: "09:00", dayOffset: 0 }),
    );
  });
  it("should distinguish holiday, missing calendar, early close, and a strategy window", () => {
    const config = example();
    config.session.window.end.time = "16:00";
    assert.equal(
      sessionWindow(config, "2026-12-25", calendar("2026-12-25", [])).status,
      "closed",
    );
    assert.equal(
      sessionWindow(config, "2026-12-25", null).status,
      "unavailable",
    );
    assert.equal(
      sessionWindow(config, "2026-12-25", {
        ...full("2026-12-25"),
        version: "stale",
      }).status,
      "unavailable",
    );
    const early = sessionWindow(
      config,
      "2026-11-27",
      calendar("2026-11-27", [
        { start: "2026-11-27T14:30:00Z", end: "2026-11-27T18:00:00Z" },
      ]),
    );
    assert.equal(containsBar(early, "2026-11-27T17:59:00Z"), true);
    assert.equal(containsBar(early, "2026-11-27T18:00:00Z"), false);
    const morningOnly = sessionWindow(
      example(),
      "2026-11-27",
      full("2026-11-27"),
    );
    assert.equal(containsBar(morningOnly, "2026-11-27T17:00:00Z"), false);
  });
  it("should preserve the supplied overnight trading-date label across midnight and maintenance", () => {
    const config = example("overnight-vwap");
    const day = calendar(
      "2026-09-29",
      [
        { start: "2026-09-28T23:00:00Z", end: "2026-09-29T10:00:00Z" },
        { start: "2026-09-29T10:15:00Z", end: "2026-09-29T21:00:00Z" },
      ],
      "fixture-overnight",
    );
    const window = sessionWindow(config, day.tradingDate, day);
    assert.equal(
      window.status !== "unavailable" && window.tradingDate,
      "2026-09-29",
    );
    assert.equal(
      window.status !== "unavailable" && window.reset,
      instant("2026-09-28T23:00:00Z"),
    );
    assert.equal(containsBar(window, "2026-09-28T23:00:00Z"), true);
    assert.equal(containsBar(window, "2026-09-29T09:59:00Z"), true);
    assert.equal(containsBar(window, "2026-09-29T10:00:00Z"), false);
    assert.equal(containsBar(window, "2026-09-29T10:15:00Z"), true);
    assert.equal(containsBar(window, "2026-09-29T21:00:00Z"), false);
    assert.throws(() =>
      sessionWindow(config, day.tradingDate, {
        ...day,
        intervals: [day.intervals[0]!, day.intervals[0]!],
      }),
    );
  });
});
