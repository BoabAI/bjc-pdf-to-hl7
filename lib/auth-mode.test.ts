import { describe, expect, test } from "bun:test";
import {
  constantTimeEqual,
  getAuthMode,
  isValidAppPassword,
  signPasswordCookie,
  verifyPasswordCookie,
} from "./auth-mode";

describe("getAuthMode", () => {
  test("defaults to oauth when nothing is set", () => {
    expect(getAuthMode({})).toBe("oauth");
  });

  test("AUTH_MODE=password selects password", () => {
    expect(getAuthMode({ AUTH_MODE: "password" })).toBe(
      "password"
    );
  });

  test("AUTH_MODE=both selects both", () => {
    expect(getAuthMode({ AUTH_MODE: "both" })).toBe("both");
  });

  test("AUTH_MODE=password+oauth alias selects both", () => {
    expect(getAuthMode({ AUTH_MODE: "password+oauth" })).toBe("both");
    expect(getAuthMode({ AUTH_MODE: "oauth+password" })).toBe("both");
    expect(getAuthMode({ AUTH_MODE: "any" })).toBe("both");
  });

  test("AUTH_MODE=disabled selects disabled", () => {
    expect(getAuthMode({ AUTH_MODE: "disabled" })).toBe(
      "disabled"
    );
  });

  test("legacy AUTH_ENABLED=false forces disabled", () => {
    expect(
      getAuthMode({
        AUTH_ENABLED: "false",
        AUTH_MODE: "password",
      })
    ).toBe("disabled");
  });

  test("legacy TEST_MODE=true forces disabled in non-prod only", () => {
    expect(
      getAuthMode({ TEST_MODE: "true", NODE_ENV: "development" })
    ).toBe("disabled");
    expect(
      getAuthMode({ TEST_MODE: "true", NODE_ENV: "production" })
    ).toBe("oauth");
  });

  test("unknown AUTH_MODE values fall back to oauth", () => {
    expect(getAuthMode({ AUTH_MODE: "lol" })).toBe("oauth");
  });
});

describe("constantTimeEqual", () => {
  test("matches identical strings", () => {
    expect(constantTimeEqual("abcdef", "abcdef")).toBe(true);
  });
  test("rejects different lengths without leaking", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
  test("rejects same-length mismatches", () => {
    expect(constantTimeEqual("abcd", "abce")).toBe(false);
  });
});

describe("isValidAppPassword", () => {
  const env = { APP_PASSWORD: "correct-horse-battery" };
  test("accepts correct password", () => {
    expect(isValidAppPassword("correct-horse-battery", env)).toBe(true);
  });
  test("rejects wrong password", () => {
    expect(isValidAppPassword("wrong", env)).toBe(false);
  });
  test("rejects when configured password is too short", () => {
    expect(
      isValidAppPassword("short", { APP_PASSWORD: "short" })
    ).toBe(false);
  });
  test("rejects empty/null candidates", () => {
    expect(isValidAppPassword("", env)).toBe(false);
    expect(isValidAppPassword(null, env)).toBe(false);
    expect(isValidAppPassword(undefined, env)).toBe(false);
  });
});

describe("password cookie sign/verify", () => {
  const env = { AUTH_SECRET: "test-secret-do-not-use-in-prod" };
  const future = Math.floor(Date.now() / 1000) + 3600;

  test("round-trips a valid cookie", async () => {
    const cookie = await signPasswordCookie(future, env);
    const verified = await verifyPasswordCookie(cookie, env);
    expect(verified?.expires).toBe(future);
  });

  test("rejects expired cookies", async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const cookie = await signPasswordCookie(past, env);
    const verified = await verifyPasswordCookie(cookie, env);
    expect(verified).toBeNull();
  });

  test("rejects tampered payload", async () => {
    const cookie = await signPasswordCookie(future, env);
    const [, sig] = cookie.split(".");
    const tampered = `${future + 9999}.${sig}`;
    expect(await verifyPasswordCookie(tampered, env)).toBeNull();
  });

  test("rejects cookies signed with a different secret", async () => {
    const cookie = await signPasswordCookie(future, env);
    const verified = await verifyPasswordCookie(cookie, {
      AUTH_SECRET: "other-secret",
    });
    expect(verified).toBeNull();
  });

  test("rejects malformed input", async () => {
    expect(await verifyPasswordCookie("", env)).toBeNull();
    expect(await verifyPasswordCookie("no-dot", env)).toBeNull();
    expect(await verifyPasswordCookie(".sig-only", env)).toBeNull();
    expect(await verifyPasswordCookie("payload.", env)).toBeNull();
    expect(await verifyPasswordCookie(null, env)).toBeNull();
  });
});
