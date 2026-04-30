import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const listConversionsMock = mock();
const originalConsoleError = console.error;

mock.module("@/lib/audit", () => ({
  listConversions: listConversionsMock,
}));

// Mock Auth.js so auth() becomes a passthrough that injects request.auth from
// a test header. Lets us cover the unauthed branch without a real Auth.js session.
mock.module("@/lib/auth", () => ({
  auth: (handler: (req: NextRequest & { auth: unknown }) => unknown) =>
    async (req: NextRequest) => {
      const email = req.headers.get("x-test-auth");
      const augmented = Object.assign(req, {
        auth: email ? { user: { email } } : null,
      });
      return handler(augmented as NextRequest & { auth: unknown });
    },
}));

const routeModule = await import("./route");
// auth() wraps handlers with a complex Next.js-compatible signature; in tests
// the mocked auth() is a single-arg passthrough, so cast for ergonomics.
const GET = routeModule.GET as unknown as (req: NextRequest) => Promise<Response>;

function makeRequest(query: string, opts?: { authed?: boolean }): NextRequest {
  const url = `http://localhost:3000/api/logs${query}`;
  const headers: Record<string, string> = {};
  if (opts?.authed !== false) {
    headers["x-test-auth"] = "alice@bjchealth.com.au";
  }
  return new NextRequest(url, { headers });
}

beforeEach(() => {
  listConversionsMock.mockReset();
  listConversionsMock.mockResolvedValue([]);
  console.error = (() => {}) as typeof console.error;
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("GET /api/logs", () => {
  test("returns 401 when no session", async () => {
    const response = await GET(makeRequest("?month=2026-04", { authed: false }));
    expect(response.status).toBe(401);
  });

  test("returns 200 with rows for a valid month", async () => {
    const rows = [
      {
        month: "2026-04",
        ts: "2026-04-29T12:00:00.000Z#abc123",
        outcome: "ok" as const,
        source: "web" as const,
        filenameHash: "deadbeef0123",
        filenameExt: ".pdf",
        fileSizeBytes: 100,
        durationMs: 200,
        warningCount: 0,
      },
    ];
    listConversionsMock.mockResolvedValue(rows);

    const response = await GET(makeRequest("?month=2026-04"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      month: "2026-04",
      rows,
    });
    expect(listConversionsMock).toHaveBeenCalledWith("2026-04");
  });

  test("returns 400 for an invalid month format", async () => {
    const response = await GET(makeRequest("?month=garbage"));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test("rejects month with wrong digit count", async () => {
    const response = await GET(makeRequest("?month=2026-4"));
    expect(response.status).toBe(400);
  });

  test("defaults to current month in Australia/Sydney when missing", async () => {
    const response = await GET(makeRequest(""));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.month).toMatch(/^\d{4}-\d{2}$/);

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Sydney",
      year: "numeric",
      month: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    expect(data.month).toBe(`${year}-${month}`);
  });
});
