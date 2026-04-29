import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const { DELETE, POST } = await import("./route");

const originalAppPassword = process.env.APP_PASSWORD;
const originalNodeEnv = process.env.NODE_ENV;
const originalConsoleError = console.error;
type MutableProcessEnv = Omit<NodeJS.ProcessEnv, "NODE_ENV"> & {
  NODE_ENV?: string;
};
const mutableEnv = process.env as MutableProcessEnv;

beforeEach(() => {
  process.env.APP_PASSWORD = "secret";
  mutableEnv.NODE_ENV = "test";
  console.error = (() => {}) as typeof console.error;
});

afterEach(() => {
  if (originalAppPassword === undefined) {
    delete process.env.APP_PASSWORD;
  } else {
    process.env.APP_PASSWORD = originalAppPassword;
  }

  if (originalNodeEnv === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = originalNodeEnv;
  }

  console.error = originalConsoleError;
});

function createAuthRequest(body: string): Request {
  return new Request("http://localhost:3000/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("POST /api/auth", () => {
  test("authenticates successfully and sets the auth cookie", async () => {
    const response = await POST(
      createAuthRequest(JSON.stringify({ password: "secret" }))
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(response.cookies.get("app_authenticated")?.value).toBe("true");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=604800");
  });

  test("sets a secure cookie in production", async () => {
    mutableEnv.NODE_ENV = "production";

    const response = await POST(
      createAuthRequest(JSON.stringify({ password: "secret" }))
    );

    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  test("rejects an invalid password", async () => {
    const response = await POST(
      createAuthRequest(JSON.stringify({ password: "wrong" }))
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({
      success: false,
      error: "Invalid password",
    });
    expect(response.cookies.get("app_authenticated")).toBeUndefined();
  });

  test("returns a server configuration error when APP_PASSWORD is missing", async () => {
    delete process.env.APP_PASSWORD;

    const response = await POST(
      createAuthRequest(JSON.stringify({ password: "secret" }))
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      success: false,
      error: "Server configuration error",
    });
  });

  test("returns a bad request response for invalid JSON", async () => {
    const response = await POST(createAuthRequest("{invalid"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      success: false,
      error: "Invalid request",
    });
  });
});

describe("DELETE /api/auth", () => {
  test("clears the auth cookie", async () => {
    const response = await DELETE();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(response.cookies.get("app_authenticated")?.value).toBe("");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
