import { describe, expect, test } from "bun:test";
import {
  constantTimeEqual,
  extractBearerToken,
  isPadAuthenticated,
  isValidPadToken,
} from "./pad-auth";

const VALID_TOKEN = "x".repeat(32);

describe("constantTimeEqual", () => {
  test("matches identical strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  test("rejects different strings of equal length", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });

  test("rejects strings of different lengths", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "a")).toBe(false);
  });

  test("is case-sensitive", () => {
    expect(constantTimeEqual("ABC", "abc")).toBe(false);
  });
});

describe("extractBearerToken", () => {
  test("extracts a well-formed bearer token", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  test("is case-insensitive on the scheme", () => {
    expect(extractBearerToken("bearer abc")).toBe("abc");
    expect(extractBearerToken("BEARER abc")).toBe("abc");
  });

  test("strips surrounding whitespace from the token", () => {
    expect(extractBearerToken("Bearer   abc   ")).toBe("abc");
  });

  test("returns null for missing or unrelated schemes", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("BearerNoSpace")).toBeNull();
  });
});

describe("isValidPadToken", () => {
  test("accepts a matching token of sufficient length", () => {
    expect(isValidPadToken(VALID_TOKEN, VALID_TOKEN)).toBe(true);
  });

  test("rejects a wrong token", () => {
    expect(isValidPadToken("y".repeat(32), VALID_TOKEN)).toBe(false);
  });

  test("rejects when expected token is missing", () => {
    expect(isValidPadToken(VALID_TOKEN, undefined)).toBe(false);
    expect(isValidPadToken(VALID_TOKEN, "")).toBe(false);
  });

  test("rejects a configured token shorter than 16 chars (guardrail)", () => {
    const weak = "short";
    expect(isValidPadToken(weak, weak)).toBe(false);
  });

  test("rejects when supplied token is empty / null", () => {
    expect(isValidPadToken(null, VALID_TOKEN)).toBe(false);
    expect(isValidPadToken(undefined, VALID_TOKEN)).toBe(false);
    expect(isValidPadToken("", VALID_TOKEN)).toBe(false);
  });
});

describe("isPadAuthenticated", () => {
  function headers(init: Record<string, string>): Headers {
    return new Headers(init);
  }

  test("accepts X-Source: email + valid bearer token", () => {
    expect(
      isPadAuthenticated(
        headers({
          "x-source": "email",
          authorization: `Bearer ${VALID_TOKEN}`,
        }),
        VALID_TOKEN
      )
    ).toBe(true);
  });

  test("rejects when X-Source is missing", () => {
    expect(
      isPadAuthenticated(
        headers({ authorization: `Bearer ${VALID_TOKEN}` }),
        VALID_TOKEN
      )
    ).toBe(false);
  });

  test("rejects when X-Source is not 'email'", () => {
    expect(
      isPadAuthenticated(
        headers({
          "x-source": "web",
          authorization: `Bearer ${VALID_TOKEN}`,
        }),
        VALID_TOKEN
      )
    ).toBe(false);
  });

  test("rejects when bearer token is wrong", () => {
    expect(
      isPadAuthenticated(
        headers({
          "x-source": "email",
          authorization: `Bearer ${"y".repeat(32)}`,
        }),
        VALID_TOKEN
      )
    ).toBe(false);
  });

  test("rejects when Authorization header is missing", () => {
    expect(
      isPadAuthenticated(headers({ "x-source": "email" }), VALID_TOKEN)
    ).toBe(false);
  });

  test("rejects when expected token is not configured", () => {
    expect(
      isPadAuthenticated(
        headers({
          "x-source": "email",
          authorization: `Bearer ${VALID_TOKEN}`,
        }),
        undefined
      )
    ).toBe(false);
  });
});
