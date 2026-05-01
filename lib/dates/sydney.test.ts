import { describe, expect, test } from "bun:test";
import {
  formatSydneyTimestamp,
  monthsInRange,
  sydneyDateOnly,
} from "./sydney";

describe("sydneyDateOnly", () => {
  test("converts UTC midnight to Sydney calendar date", () => {
    // 2026-04-30T00:00:00Z is 2026-04-30 10:00 in Sydney (AEST UTC+10)
    expect(sydneyDateOnly("2026-04-30T00:00:00Z")).toBe("2026-04-30");
  });

  test("strips sort-key suffix", () => {
    expect(sydneyDateOnly("2026-04-30T00:00:00Z#abc123")).toBe("2026-04-30");
  });

  test("returns empty string on invalid timestamp", () => {
    expect(sydneyDateOnly("not-a-date")).toBe("");
  });

  test("crosses Sydney day boundary correctly", () => {
    // 2026-04-29T15:00:00Z = 2026-04-30 01:00 Sydney (UTC+10)
    expect(sydneyDateOnly("2026-04-29T15:00:00Z")).toBe("2026-04-30");
  });
});

describe("formatSydneyTimestamp", () => {
  test("returns the original string on invalid input", () => {
    expect(formatSydneyTimestamp("not-a-date")).toBe("not-a-date");
  });

  test("formats valid timestamp without crashing", () => {
    const out = formatSydneyTimestamp("2026-04-30T00:00:00Z");
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toBe("2026-04-30T00:00:00Z");
  });
});

describe("monthsInRange", () => {
  test("single month", () => {
    expect(monthsInRange("2026-04-01", "2026-04-30")).toEqual(["2026-04"]);
  });

  test("spans across years", () => {
    expect(monthsInRange("2025-11-15", "2026-02-03")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  test("returns empty for malformed input", () => {
    expect(monthsInRange("nope", "nope")).toEqual([]);
  });
});
