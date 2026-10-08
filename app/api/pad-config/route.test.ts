import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const listMailboxesMock = mock();
const originalConsoleError = console.error;

mock.module("@/lib/reference-data-store", () => ({
  listMailboxes: listMailboxesMock,
}));

mock.module("@/lib/server/logging", () => ({
  logServerEvent: mock(),
  logOperationalError: mock(),
}));

const PAD_TOKEN = "p".repeat(32);
process.env.PAD_TOKEN = PAD_TOKEN;

const { GET } = await import("./route");

const mailboxes = [
  {
    id: "gofax.par@bjchealth.com.au",
    address: "gofax.par@bjchealth.com.au",
    sourceFolder: "Inbox",
    linkedFolder: "Inbox/HL7_linked",
    enabled: true,
  },
  {
    id: "doctor@bjchealth.com.au",
    address: "doctor@bjchealth.com.au",
    sourceFolder: "Inbox/HL7",
    linkedFolder: "Inbox/HL7_linked",
    enabled: true,
  },
  {
    id: "off@bjchealth.com.au",
    address: "off@bjchealth.com.au",
    sourceFolder: "Inbox",
    linkedFolder: "Inbox/HL7_linked",
    enabled: false,
  },
];

function makeRequest(headers: Record<string, string>, query = ""): NextRequest {
  return new NextRequest(`http://localhost:3000/api/pad-config${query}`, { headers });
}

const padHeaders = { authorization: `Bearer ${PAD_TOKEN}`, "x-source": "email" };

beforeEach(() => {
  listMailboxesMock.mockReset().mockResolvedValue(mailboxes);
  console.error = (() => {}) as typeof console.error;
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("GET /api/pad-config", () => {
  test("401 without a bearer token", async () => {
    const res = await GET(makeRequest({ "x-source": "email" }));
    expect(res.status).toBe(401);
    expect(listMailboxesMock).not.toHaveBeenCalled();
  });

  test("401 with a wrong token", async () => {
    const res = await GET(makeRequest({ authorization: "Bearer " + "x".repeat(32), "x-source": "email" }));
    expect(res.status).toBe(401);
  });

  test("401 without X-Source: email", async () => {
    const res = await GET(makeRequest({ authorization: `Bearer ${PAD_TOKEN}` }));
    expect(res.status).toBe(401);
  });

  test("returns only enabled mailboxes as JSON", async () => {
    const res = await GET(makeRequest(padHeaders));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = (await res.json()) as { mailboxes: Array<Record<string, unknown>> };
    expect(body.mailboxes).toEqual([
      { address: "gofax.par@bjchealth.com.au", sourceFolder: "Inbox", linkedFolder: "Inbox/HL7_linked" },
      { address: "doctor@bjchealth.com.au", sourceFolder: "Inbox/HL7", linkedFolder: "Inbox/HL7_linked" },
    ]);
  });

  test("format=lines returns one address|source|linked line per enabled mailbox (CRLF, for PAD)", async () => {
    const res = await GET(makeRequest(padHeaders, "?format=lines"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe(
      "gofax.par@bjchealth.com.au|Inbox|Inbox/HL7_linked\r\n" +
        "doctor@bjchealth.com.au|Inbox/HL7|Inbox/HL7_linked"
    );
  });

  test("503 when the config store is unavailable, so PAD falls back", async () => {
    listMailboxesMock.mockRejectedValue(new Error("ddb"));
    const res = await GET(makeRequest(padHeaders));
    expect(res.status).toBe(503);
  });

  test("200 with an empty list when every mailbox is disabled (an explicit 'poll nothing')", async () => {
    listMailboxesMock.mockResolvedValue([mailboxes[2]]);
    const res = await GET(makeRequest(padHeaders));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { mailboxes: unknown[] }).mailboxes).toEqual([]);
  });
});
