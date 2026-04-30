import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import {
  config,
  decideRoute,
  isApiPath,
  isPadRequestAuthenticated,
  isPublicPath,
} from "./middleware";

const VALID_TOKEN = "x".repeat(32);

function padRequest(
  pathname: string,
  init: { source?: string; auth?: string } = {}
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.source !== undefined) headers["x-source"] = init.source;
  if (init.auth !== undefined) headers["authorization"] = init.auth;
  return new NextRequest(`http://localhost:3000${pathname}`, {
    method: "POST",
    headers,
  });
}

describe("isPublicPath", () => {
  test("identifies the login page as public", () => {
    expect(isPublicPath("/login")).toBe(true);
  });

  test("identifies Auth.js callback paths as public", () => {
    expect(isPublicPath("/api/auth")).toBe(true);
    expect(isPublicPath("/api/auth/signin")).toBe(true);
    expect(isPublicPath("/api/auth/callback/microsoft-entra-id")).toBe(true);
  });

  test("rejects protected paths", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/log")).toBe(false);
    expect(isPublicPath("/api/convert")).toBe(false);
    expect(isPublicPath("/api/logs")).toBe(false);
    expect(isPublicPath("/api/reference-data")).toBe(false);
  });

  test("rejects paths that start with a public prefix but are not under it", () => {
    // e.g. "/loginish" must NOT be treated as public
    expect(isPublicPath("/loginish")).toBe(false);
    expect(isPublicPath("/api/authenticate")).toBe(false);
  });
});

describe("decideRoute", () => {
  test("public path passes through whether authenticated or not", () => {
    expect(decideRoute("/login", false)).toEqual({
      kind: "next",
      cacheControl: "",
    });
    expect(decideRoute("/api/auth/callback/microsoft-entra-id", false)).toEqual({
      kind: "next",
      cacheControl: "",
    });
  });

  test("authenticated user visiting /login is bounced home with no-store", () => {
    expect(decideRoute("/login", true)).toEqual({
      kind: "redirect",
      to: "/",
      cacheControl: "no-store, must-revalidate",
    });
  });

  test("unauthenticated request to a protected page redirects to /login", () => {
    expect(decideRoute("/", false)).toEqual({
      kind: "redirect",
      to: "/login",
      cacheControl: "no-store, must-revalidate",
    });
    expect(decideRoute("/log", false)).toEqual({
      kind: "redirect",
      to: "/login",
      cacheControl: "no-store, must-revalidate",
    });
  });

  test("unauthenticated request to an /api/* path returns 401, not a redirect", () => {
    // PAD pipeline + curl + fetch with redirect:follow would otherwise land
    // on the login HTML and silently parse it as the API response.
    expect(decideRoute("/api/convert", false)).toEqual({
      kind: "unauthorized",
      cacheControl: "no-store, must-revalidate",
    });
    expect(decideRoute("/api/logs", false)).toEqual({
      kind: "unauthorized",
      cacheControl: "no-store, must-revalidate",
    });
    expect(decideRoute("/api/reference-data", false)).toEqual({
      kind: "unauthorized",
      cacheControl: "no-store, must-revalidate",
    });
  });

  test("authenticated request to a protected path passes through with no-cache", () => {
    expect(decideRoute("/", true)).toEqual({
      kind: "next",
      cacheControl: "private, no-cache, no-store, must-revalidate",
    });
  });
});

describe("isApiPath", () => {
  test("matches /api/* paths", () => {
    expect(isApiPath("/api/convert")).toBe(true);
    expect(isApiPath("/api/logs")).toBe(true);
    expect(isApiPath("/api/auth/callback/microsoft-entra-id")).toBe(true);
  });

  test("rejects non-api paths", () => {
    expect(isApiPath("/")).toBe(false);
    expect(isApiPath("/login")).toBe(false);
    expect(isApiPath("/log")).toBe(false);
    // Bare "/api" with no trailing slash is not an API call — defensive.
    expect(isApiPath("/api")).toBe(false);
  });
});

describe("isPadRequestAuthenticated", () => {
  let originalToken: string | undefined;

  beforeEach(() => {
    originalToken = process.env.PAD_TOKEN;
    process.env.PAD_TOKEN = VALID_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.PAD_TOKEN;
    else process.env.PAD_TOKEN = originalToken;
  });

  test("accepts /api/convert with X-Source: email + valid bearer token", () => {
    const request = padRequest("/api/convert", {
      source: "email",
      auth: `Bearer ${VALID_TOKEN}`,
    });
    expect(isPadRequestAuthenticated(request)).toBe(true);
  });

  test("rejects /api/convert with X-Source: email + wrong token (closes the bypass)", () => {
    const request = padRequest("/api/convert", {
      source: "email",
      auth: `Bearer ${"y".repeat(32)}`,
    });
    expect(isPadRequestAuthenticated(request)).toBe(false);
  });

  test("rejects /api/convert with X-Source: email but no Authorization header", () => {
    const request = padRequest("/api/convert", { source: "email" });
    expect(isPadRequestAuthenticated(request)).toBe(false);
  });

  test("rejects PAD-shaped headers on a non-/api/convert path", () => {
    const request = padRequest("/api/logs", {
      source: "email",
      auth: `Bearer ${VALID_TOKEN}`,
    });
    expect(isPadRequestAuthenticated(request)).toBe(false);
  });

  test("rejects /api/convert without X-Source: email even with a valid token", () => {
    const request = padRequest("/api/convert", {
      auth: `Bearer ${VALID_TOKEN}`,
    });
    expect(isPadRequestAuthenticated(request)).toBe(false);
  });

  test("rejects when PAD_TOKEN is unset (no implicit pass-through)", () => {
    delete process.env.PAD_TOKEN;
    const request = padRequest("/api/convert", {
      source: "email",
      auth: `Bearer ${VALID_TOKEN}`,
    });
    expect(isPadRequestAuthenticated(request)).toBe(false);
  });
});

describe("middleware config", () => {
  test("exports the expected matcher", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
    ]);
  });
});
