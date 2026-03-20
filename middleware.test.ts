import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

function createRequest(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe("middleware", () => {
  test("allows unauthenticated access to login and auth routes", () => {
    const loginResponse = middleware(createRequest("/login"));
    const authResponse = middleware(createRequest("/api/auth"));

    expect(loginResponse.status).toBe(200);
    expect(authResponse.status).toBe(200);
  });

  test("redirects authenticated users away from the login page", () => {
    const response = middleware(
      createRequest("/login", "app_authenticated=true")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  test("redirects unauthenticated users to login with no-store caching", () => {
    const response = middleware(createRequest("/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login"
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, must-revalidate"
    );
  });

  test("allows authenticated requests through and disables page caching", () => {
    const response = middleware(createRequest("/", "app_authenticated=true"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate"
    );
  });

  test("exports the expected matcher configuration", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
    ]);
  });
});
