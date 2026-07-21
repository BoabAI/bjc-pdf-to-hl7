import { describe, expect, test } from "bun:test";
import {
  MAX_PROVIDER_NUMBER_LEN,
  cleanProviderNumber,
  computeProviderCheckChar,
  isValidMedicareProviderNumber,
  validateProviderNumberForStorage,
} from "./provider-number";

// `2426621B` is an independently-known-valid Australian Medicare provider
// number (stem 242662, location char 1, check char B). It anchors the
// check-digit algorithm against ground truth so a refactor can't silently
// drift to a self-consistent-but-wrong formula.
const KNOWN_VALID = "2426621B";

describe("cleanProviderNumber", () => {
  test("passes a valid provider number through verbatim", () => {
    expect(cleanProviderNumber("123456 7Y")).toBe("123456 7Y");
    expect(cleanProviderNumber("9000001Z")).toBe("9000001Z");
    expect(cleanProviderNumber("9876-543T")).toBe("9876-543T");
  });

  test("trims surrounding whitespace", () => {
    expect(cleanProviderNumber("  123456 7Y  ")).toBe("123456 7Y");
  });

  test("drops values carrying HL7 separators or control chars", () => {
    expect(cleanProviderNumber("1234567|EVIL")).toBeUndefined();
    expect(cleanProviderNumber("ABC^DEF")).toBeUndefined();
    expect(cleanProviderNumber("XX&YY")).toBeUndefined();
    expect(cleanProviderNumber("A~B")).toBeUndefined();
    expect(cleanProviderNumber("PATH\\BAD")).toBeUndefined();
    expect(cleanProviderNumber("line\nbreak")).toBeUndefined();
  });

  test("drops over-length, empty, and non-string values", () => {
    expect(cleanProviderNumber("X".repeat(MAX_PROVIDER_NUMBER_LEN + 1))).toBeUndefined();
    expect(cleanProviderNumber("")).toBeUndefined();
    expect(cleanProviderNumber("   ")).toBeUndefined();
    expect(cleanProviderNumber(null)).toBeUndefined();
    expect(cleanProviderNumber(undefined)).toBeUndefined();
    expect(cleanProviderNumber(123)).toBeUndefined();
  });
});

describe("computeProviderCheckChar", () => {
  test("reproduces the check char of a known-valid number", () => {
    expect(computeProviderCheckChar("2426621")).toBe("B");
  });

  test("is case-insensitive on the location character", () => {
    // location char is a digit here, but a lowercase letter must not change it
    expect(computeProviderCheckChar("041790a")).toBe(
      computeProviderCheckChar("041790A")
    );
  });

  test("returns undefined for a malformed stem", () => {
    expect(computeProviderCheckChar("12345")).toBeUndefined(); // too short
    expect(computeProviderCheckChar("12345I7")).toBeUndefined(); // I is not a valid location char
    expect(computeProviderCheckChar("abcdef1")).toBeUndefined(); // non-digit stem
  });
});

describe("isValidMedicareProviderNumber", () => {
  test("accepts a fully-well-formed number with a correct check digit", () => {
    expect(isValidMedicareProviderNumber(KNOWN_VALID)).toBe(true);
    expect(isValidMedicareProviderNumber(KNOWN_VALID.toLowerCase())).toBe(true);
  });

  test("rejects a well-formed number with a wrong check digit", () => {
    expect(isValidMedicareProviderNumber("2426621A")).toBe(false);
    expect(isValidMedicareProviderNumber("2426621X")).toBe(false);
  });

  test("rejects numbers outside the standard 8-char shape", () => {
    expect(isValidMedicareProviderNumber("123456 7Y")).toBe(false); // spaced
    expect(isValidMedicareProviderNumber("9876-543T")).toBe(false); // hyphenated
    expect(isValidMedicareProviderNumber("2426621")).toBe(false); // no check char
  });

  test("rejects a check char outside the YXWTLKJHFBA set", () => {
    expect(isValidMedicareProviderNumber("9000001Z")).toBe(false); // seed placeholder
  });
});

describe("validateProviderNumberForStorage", () => {
  test("accepts an empty provider number (optional field)", () => {
    expect(validateProviderNumberForStorage("")).toEqual({ ok: true });
  });

  test("accepts a fully-valid Medicare provider number", () => {
    expect(validateProviderNumberForStorage(KNOWN_VALID)).toEqual({ ok: true });
  });

  test("rejects a well-formed number with a bad check digit", () => {
    const result = validateProviderNumberForStorage("2426621A");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/check digit/i);
  });

  test("lets placeholder/seed and legacy formats through (length cap only)", () => {
    // Seed numbers end in Z (invalid check char set) so they are NOT treated
    // as standard Medicare numbers and are not check-digit verified.
    expect(validateProviderNumberForStorage("9000001Z")).toEqual({ ok: true });
    expect(validateProviderNumberForStorage("123456 7Y")).toEqual({ ok: true });
    expect(validateProviderNumberForStorage("9876-543T")).toEqual({ ok: true });
  });

  test("rejects an over-length provider number", () => {
    const result = validateProviderNumberForStorage("9".repeat(MAX_PROVIDER_NUMBER_LEN + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/20 characters or fewer/);
  });
});
