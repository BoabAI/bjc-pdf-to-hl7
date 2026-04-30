import { describe, expect, test } from "bun:test";
import { segment } from "./segment";

describe("segment helper", () => {
  test("sparse map produces correctly padded output up to max key", () => {
    expect(segment("OBR", { 1: "1", 7: "ts" })).toBe("OBR|1||||||ts");
  });

  test("skipped intermediate keys padded with empty strings", () => {
    // Max key = 5, so we produce 5 fields: 1,2,3,4,5
    expect(segment("PID", { 1: "1", 5: "Smith^John" })).toBe("PID|1||||Smith^John");
  });

  test("max key determines output length (segment name + max fields)", () => {
    const out = segment("PV1", { 1: "1", 2: "O", 9: "1234567A^^^AUSHICPR" });
    // Expect: PV1|1|O|||||||1234567A^^^AUSHICPR  (segment + 9 fields = 10 parts)
    expect(out.split("|")).toHaveLength(10);
  });

  test("undefined values become empty strings", () => {
    expect(segment("FOO", { 1: undefined, 2: "x" })).toBe("FOO||x");
  });

  test("MSH-style usage produces MSH|^~\\&|APP", () => {
    expect(segment("MSH", { 2: "^~\\&", 3: "APP" })).toBe("MSH|^~\\&|APP");
  });

  test("field 0 is ignored if accidentally passed", () => {
    // Even if someone passes "0" as a key, it should be ignored entirely
    // and not affect the output length or content.
    expect(segment("FOO", { 0: "BAR", 1: "x" })).toBe("FOO|x");
  });

  test("empty fields map returns just the segment name", () => {
    expect(segment("FOO", {})).toBe("FOO");
  });

  test("preserves component separators within field values (no escaping)", () => {
    // The helper does not escape — caller controls all field content.
    expect(segment("OBX", { 1: "1", 5: "^application^pdf^Base64^abc" })).toBe(
      "OBX|1||||^application^pdf^Base64^abc",
    );
  });

  test("non-contiguous keys produce correct length", () => {
    const out = segment("TST", { 1: "a", 3: "c", 6: "f" });
    // Max=6 -> TST|a||c|||f  (7 parts)
    expect(out).toBe("TST|a||c|||f");
    expect(out.split("|")).toHaveLength(7);
  });
});
