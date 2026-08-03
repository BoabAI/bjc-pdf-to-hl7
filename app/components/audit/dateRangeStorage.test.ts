import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  AUDIT_LOG_RANGE_KEY,
  loadPersistedDateRange,
  persistDateRangeField,
  resolveRestoredRange,
} from "./dateRangeStorage";

const KEY = AUDIT_LOG_RANGE_KEY;

// bun test has no DOM — install a minimal window.localStorage so the
// helpers exercise their real read/write paths, and remove it afterwards
// so other test files still see a server-like environment.
let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

describe("loadPersistedDateRange", () => {
  test("returns empty object when nothing is stored", () => {
    expect(loadPersistedDateRange(KEY)).toEqual({});
  });

  test("returns stored from/to fields", () => {
    store.set(KEY, JSON.stringify({ from: "2026-07-01", to: "2026-07-15" }));
    expect(loadPersistedDateRange(KEY)).toEqual({
      from: "2026-07-01",
      to: "2026-07-15",
    });
  });

  test("drops fields that are not YYYY-MM-DD strings", () => {
    store.set(
      KEY,
      JSON.stringify({ from: "not-a-date", to: "2026-07-15", junk: 1 })
    );
    expect(loadPersistedDateRange(KEY)).toEqual({ to: "2026-07-15" });
  });

  test("returns empty object for corrupt JSON", () => {
    store.set(KEY, "{nope");
    expect(loadPersistedDateRange(KEY)).toEqual({});
  });

  test("returns empty object for non-object JSON", () => {
    store.set(KEY, JSON.stringify("2026-07-01"));
    expect(loadPersistedDateRange(KEY)).toEqual({});
  });

  test("returns empty object when window is undefined (SSR)", () => {
    delete (globalThis as Record<string, unknown>).window;
    expect(loadPersistedDateRange(KEY)).toEqual({});
  });
});

describe("persistDateRangeField", () => {
  test("stores only the changed field", () => {
    persistDateRangeField(KEY, "from", "2026-07-01");
    expect(loadPersistedDateRange(KEY)).toEqual({ from: "2026-07-01" });
  });

  test("preserves the other field when updating one", () => {
    persistDateRangeField(KEY, "from", "2026-07-01");
    persistDateRangeField(KEY, "to", "2026-07-15");
    expect(loadPersistedDateRange(KEY)).toEqual({
      from: "2026-07-01",
      to: "2026-07-15",
    });
  });

  test("clearing a field (empty value) removes it from storage", () => {
    persistDateRangeField(KEY, "from", "2026-07-01");
    persistDateRangeField(KEY, "from", "");
    expect(loadPersistedDateRange(KEY)).toEqual({});
  });

  test("is a no-op when window is undefined (SSR)", () => {
    delete (globalThis as Record<string, unknown>).window;
    expect(() => persistDateRangeField(KEY, "from", "2026-07-01")).not.toThrow();
  });

  test("swallows storage errors (private browsing)", () => {
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      },
    };
    expect(() => persistDateRangeField(KEY, "from", "2026-07-01")).not.toThrow();
    expect(loadPersistedDateRange(KEY)).toEqual({});
  });
});

describe("resolveRestoredRange", () => {
  test("falls back to defaults for unset fields", () => {
    expect(resolveRestoredRange({}, "2026-08-01", "2026-08-03")).toEqual({
      from: "2026-08-01",
      to: "2026-08-03",
    });
  });

  test("uses stored from with default to", () => {
    expect(
      resolveRestoredRange({ from: "2026-05-01" }, "2026-08-01", "2026-08-03")
    ).toEqual({ from: "2026-05-01", to: "2026-08-03" });
  });

  test("uses both stored fields when present", () => {
    expect(
      resolveRestoredRange(
        { from: "2026-06-01", to: "2026-06-30" },
        "2026-08-01",
        "2026-08-03"
      )
    ).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  test("ignores stored values that produce an inverted range", () => {
    // Stored from is after the default to — composing them would yield
    // from > to, so the whole restore is discarded in favour of defaults.
    expect(
      resolveRestoredRange({ from: "2026-09-01" }, "2026-08-01", "2026-08-03")
    ).toEqual({ from: "2026-08-01", to: "2026-08-03" });
  });
});
