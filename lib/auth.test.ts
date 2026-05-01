import { describe, expect, test } from "bun:test";
import { isAllowedDomain, trustedDomainFromProfile } from "./auth";

describe("trustedDomainFromProfile", () => {
  test("extracts domain from preferred_username (UPN)", () => {
    expect(
      trustedDomainFromProfile({
        preferred_username: "alice@bjchealth.com.au",
      })
    ).toBe("bjchealth.com.au");
  });

  test("extracts domain case-insensitively", () => {
    expect(
      trustedDomainFromProfile({
        preferred_username: "Alice@BJCHealth.Com.AU",
      })
    ).toBe("bjchealth.com.au");
  });

  test("falls back to upn claim when preferred_username missing", () => {
    expect(
      trustedDomainFromProfile({ upn: "bob@smecai.au" })
    ).toBe("smecai.au");
  });

  test("ignores email claim when UPN claims are missing", () => {
    // The email claim is self-asserted and must never be used as the trust
    // anchor — only preferred_username/upn are administratively controlled.
    expect(
      trustedDomainFromProfile({ email: "carol@smecai.au" })
    ).toBeNull();
  });

  test("UPN wins over a spoofed email claim", () => {
    // An attacker in another tenant could set email=victim@trusted.domain,
    // but their UPN is from their own tenant. The UPN domain must win.
    expect(
      trustedDomainFromProfile({
        email: "attacker@bjchealth.com.au",
        upn: "attacker@evil.com",
      })
    ).toBe("evil.com");
  });

  test("returns null for empty profile object", () => {
    expect(trustedDomainFromProfile({})).toBeNull();
  });

  test("returns null for missing profile", () => {
    expect(trustedDomainFromProfile(null)).toBeNull();
    expect(trustedDomainFromProfile(undefined)).toBeNull();
  });

  test("returns null for empty UPN", () => {
    expect(trustedDomainFromProfile({ preferred_username: "" })).toBeNull();
  });

  test("returns null for malformed UPN (no @)", () => {
    expect(
      trustedDomainFromProfile({ preferred_username: "alicebjchealth.com.au" })
    ).toBeNull();
  });

  test("returns null when @ is the last character", () => {
    expect(
      trustedDomainFromProfile({ preferred_username: "alice@" })
    ).toBeNull();
  });

  test("ignores non-string claim values", () => {
    expect(
      trustedDomainFromProfile({ preferred_username: 12345 as unknown })
    ).toBeNull();
  });
});

describe("isAllowedDomain", () => {
  const allowed = ["bjchealth.com.au", "smecai.au"];

  test("allows exact match", () => {
    expect(isAllowedDomain("bjchealth.com.au", allowed)).toBe(true);
    expect(isAllowedDomain("smecai.au", allowed)).toBe(true);
  });

  test("rejects unknown domain", () => {
    expect(isAllowedDomain("gmail.com", allowed)).toBe(false);
    expect(isAllowedDomain("attacker.com", allowed)).toBe(false);
  });

  test("rejects null domain", () => {
    expect(isAllowedDomain(null, allowed)).toBe(false);
  });

  test("rejects when allowlist is empty", () => {
    expect(isAllowedDomain("bjchealth.com.au", [])).toBe(false);
  });

  test("does not allow subdomain spoofing", () => {
    // "evil.bjchealth.com.au" must NOT match "bjchealth.com.au" via substring
    expect(isAllowedDomain("evil.bjchealth.com.au", allowed)).toBe(false);
    // and "bjchealth.com.au.evil.com" must NOT match either
    expect(isAllowedDomain("bjchealth.com.au.evil.com", allowed)).toBe(false);
  });
});
