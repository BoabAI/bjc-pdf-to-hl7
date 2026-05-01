/**
 * @jest-environment node
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  deleteCarrier,
  deleteDoctor,
  getReferenceData,
  putCarrier,
  putDoctor,
} from "./referenceDataClient";

interface MockResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  body?: unknown;
}

function mockFetch(response: MockResponse) {
  return mock(async (_input: unknown, _init?: unknown) => {
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText ?? "",
      json: async () => response.body,
    } as unknown as Response;
  });
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("getReferenceData", () => {
  test("returns parsed doctors and carriers on 200 OK", async () => {
    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      body: {
        success: true,
        doctors: [{ id: "d1", name: "Dr X", providerNumber: "9000001Z" }],
        carriers: [{ id: "c1", value: "SMECAI", label: "SMEC AI", isDefault: true }],
      },
    }) as unknown as typeof fetch;

    const result = await getReferenceData();
    expect(result.doctors).toHaveLength(1);
    expect(result.carriers).toHaveLength(1);
    expect(result.doctors[0].name).toBe("Dr X");
  });

  test("throws on non-2xx response with body error", async () => {
    globalThis.fetch = mockFetch({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      body: { success: false, error: "boom" },
    }) as unknown as typeof fetch;

    await expect(getReferenceData()).rejects.toThrow("boom");
  });

  test("throws on non-2xx response with no JSON body", async () => {
    const fakeFetch = mock(async () => {
      return {
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response;
    });
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    await expect(getReferenceData()).rejects.toThrow("Bad Gateway");
  });

  test("throws when payload fails runtime validation", async () => {
    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      body: { success: true, doctors: "not-an-array" },
    }) as unknown as typeof fetch;

    await expect(getReferenceData()).rejects.toThrow("Malformed");
  });

  test("throws when success is false", async () => {
    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      body: { success: false, error: "denied" },
    }) as unknown as typeof fetch;

    await expect(getReferenceData()).rejects.toThrow("denied");
  });
});

describe("putDoctor / putCarrier", () => {
  test("PUTs JSON with content-type header", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = (async (input: unknown, init: unknown) => {
      captured = { url: String(input), init: (init ?? {}) as RequestInit };
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ success: true }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await putDoctor({ id: "d1", name: "Dr X", providerNumber: "9000001Z" });

    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("/api/reference-data");
    expect(captured!.init.method).toBe("PUT");
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(String(captured!.init.body));
    expect(body.kind).toBe("DOCTOR");
    expect(body.item.name).toBe("Dr X");
  });

  test("putCarrier emits CARRIER kind", async () => {
    let kindSeen = "";
    globalThis.fetch = (async (_input: unknown, init: unknown) => {
      const i = (init ?? {}) as RequestInit;
      kindSeen = JSON.parse(String(i.body)).kind;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ success: true }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await putCarrier({ id: "c1", value: "X", label: "X" });
    expect(kindSeen).toBe("CARRIER");
  });

  test("throws when server returns 500", async () => {
    globalThis.fetch = mockFetch({
      ok: false,
      status: 500,
      statusText: "Server Error",
      body: { success: false, error: "db unavailable" },
    }) as unknown as typeof fetch;

    await expect(
      putDoctor({ id: "d1", name: "x", providerNumber: "x" })
    ).rejects.toThrow("db unavailable");
  });
});

describe("deleteDoctor / deleteCarrier", () => {
  test("encodes id in query string", async () => {
    let urlSeen = "";
    globalThis.fetch = (async (input: unknown) => {
      urlSeen = String(input);
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ success: true }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await deleteDoctor("d 1+");
    expect(urlSeen).toContain("kind=DOCTOR");
    expect(urlSeen).toContain("id=d+1%2B"); // URLSearchParams encodes space as + and + as %2B
  });

  test("throws on 500 with body error", async () => {
    globalThis.fetch = mockFetch({
      ok: false,
      status: 500,
      statusText: "Server Error",
      body: { error: "boom" },
    }) as unknown as typeof fetch;

    await expect(deleteCarrier("c1")).rejects.toThrow("boom");
  });
});
