import { describe, expect, test } from "bun:test";
import { config, decideRoute, isPublicPath } from "./middleware";

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

  test("unauthenticated request to a protected path redirects to /login", () => {
    expect(decideRoute("/", false)).toEqual({
      kind: "redirect",
      to: "/login",
      cacheControl: "no-store, must-revalidate",
    });
    expect(decideRoute("/api/convert", false)).toEqual({
      kind: "redirect",
      to: "/login",
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

describe("middleware config", () => {
  test("exports the expected matcher", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
    ]);
  });
});
