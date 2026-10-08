import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import type { AuditRow } from "@/lib/audit";

const listMailboxesMock = mock();
const putMailboxMock = mock();
const deleteMailboxMock = mock();
const recordConversionMock = mock();
const originalConsoleError = console.error;

mock.module("@/lib/reference-data-store", () => ({
  listMailboxes: listMailboxesMock,
  putMailbox: putMailboxMock,
  deleteMailbox: deleteMailboxMock,
}));

mock.module("@/lib/audit", () => ({
  recordConversion: recordConversionMock,
  buildSortKey: () => "2026-10-08T00:00:00.000Z#aaaaaa",
  monthKey: () => "2026-10",
}));

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

mock.module("@/lib/server/logging", () => ({
  logServerEvent: mock(),
  logOperationalError: mock(),
}));

const routeModule = await import("./route");
const GET = routeModule.GET as unknown as (req: NextRequest) => Promise<Response>;
const PUT = routeModule.PUT as unknown as (req: NextRequest) => Promise<Response>;
const DELETE = routeModule.DELETE as unknown as (req: NextRequest) => Promise<Response>;

const doctorAt = {
  id: "doctor@bjchealth.com.au",
  address: "doctor@bjchealth.com.au",
  sourceFolder: "Inbox/HL7",
  linkedFolder: "Inbox/HL7_linked",
  enabled: true,
};

function makeRequest(
  query: string,
  opts: { method?: "GET" | "PUT" | "DELETE"; body?: unknown; authed?: boolean } = {}
): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.authed !== false) headers["x-test-auth"] = "nicole@bjchealth.com.au";
  return new NextRequest(`http://localhost:3000/api/mailboxes${query}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(() => {
  listMailboxesMock.mockReset().mockResolvedValue([doctorAt]);
  putMailboxMock.mockReset().mockResolvedValue(undefined);
  deleteMailboxMock.mockReset().mockResolvedValue(undefined);
  recordConversionMock.mockReset().mockResolvedValue(undefined);
  console.error = (() => {}) as typeof console.error;
});

afterEach(() => {
  console.error = originalConsoleError;
});

function lastAuditRow(): AuditRow {
  return recordConversionMock.mock.calls.at(-1)![0] as AuditRow;
}

describe("GET /api/mailboxes", () => {
  test("401 without session", async () => {
    expect((await GET(makeRequest("", { authed: false }))).status).toBe(401);
  });

  test("returns all mailboxes, including disabled ones", async () => {
    listMailboxesMock.mockResolvedValue([doctorAt, { ...doctorAt, id: "b@x.au", address: "b@x.au", enabled: false }]);
    const res = await GET(makeRequest(""));
    const body = (await res.json()) as { success: boolean; mailboxes: unknown[] };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.mailboxes).toHaveLength(2);
  });

  test("500 when the store fails", async () => {
    listMailboxesMock.mockRejectedValue(new Error("ddb"));
    expect((await GET(makeRequest(""))).status).toBe(500);
  });
});

describe("PUT /api/mailboxes", () => {
  test("401 without session", async () => {
    const res = await PUT(makeRequest("", { method: "PUT", body: doctorAt, authed: false }));
    expect(res.status).toBe(401);
    expect(putMailboxMock).not.toHaveBeenCalled();
  });

  test("upserts a normalised mailbox and audits the change", async () => {
    listMailboxesMock.mockResolvedValue([{ ...doctorAt, sourceFolder: "Inbox" }]);
    const res = await PUT(
      makeRequest("", { method: "PUT", body: { ...doctorAt, address: "Doctor@BJCHealth.com.au" } })
    );
    expect(res.status).toBe(200);
    expect(putMailboxMock).toHaveBeenCalledWith(doctorAt);

    const row = lastAuditRow();
    expect(row.action).toBe("settings_updated");
    expect(row.userEmail).toBe("nicole@bjchealth.com.au");
    expect(row.warnings?.[0]).toContain("doctor@bjchealth.com.au");
    expect(row.warnings?.[0]).toContain("Inbox → Inbox/HL7");
  });

  test("audits a newly added mailbox", async () => {
    listMailboxesMock.mockResolvedValue([]);
    await PUT(makeRequest("", { method: "PUT", body: doctorAt }));
    expect(lastAuditRow().warnings?.[0]).toContain("added");
  });

  test("400 on an invalid folder, nothing persisted", async () => {
    const res = await PUT(makeRequest("", { method: "PUT", body: { ...doctorAt, sourceFolder: "Sent Items" } }));
    expect(res.status).toBe(400);
    expect(putMailboxMock).not.toHaveBeenCalled();
  });

  test("400 on invalid JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/mailboxes", {
      method: "PUT",
      headers: { "x-test-auth": "a@b.au" },
      body: "{",
    });
    expect((await PUT(req)).status).toBe(400);
  });

  test("409 when disabling the last enabled mailbox, nothing persisted", async () => {
    const res = await PUT(makeRequest("", { method: "PUT", body: { ...doctorAt, enabled: false } }));
    expect(res.status).toBe(409);
    expect(putMailboxMock).not.toHaveBeenCalled();
  });

  test("allows disabling while another mailbox stays enabled", async () => {
    listMailboxesMock.mockResolvedValue([doctorAt, { ...doctorAt, id: "x@bjchealth.com.au" }]);
    const res = await PUT(makeRequest("", { method: "PUT", body: { ...doctorAt, enabled: false } }));
    expect(res.status).toBe(200);
  });

  test("allows the save when the list read fails (no lock-out)", async () => {
    listMailboxesMock.mockRejectedValue(new Error("ddb"));
    const res = await PUT(makeRequest("", { method: "PUT", body: { ...doctorAt, enabled: false } }));
    expect(res.status).toBe(200);
  });

  test("500 when the store write fails", async () => {
    putMailboxMock.mockRejectedValue(new Error("ddb"));
    expect((await PUT(makeRequest("", { method: "PUT", body: doctorAt }))).status).toBe(500);
  });
});

describe("DELETE /api/mailboxes", () => {
  test("401 without session", async () => {
    const res = await DELETE(makeRequest("?id=doctor@bjchealth.com.au", { method: "DELETE", authed: false }));
    expect(res.status).toBe(401);
  });

  test("deletes by lowercased id and audits", async () => {
    listMailboxesMock.mockResolvedValue([doctorAt, { ...doctorAt, id: "x@bjchealth.com.au" }]);
    const res = await DELETE(makeRequest("?id=Doctor@BJCHealth.com.au", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(deleteMailboxMock).toHaveBeenCalledWith("doctor@bjchealth.com.au");
    expect(lastAuditRow().warnings?.[0]).toContain("removed");
  });

  test("400 on missing id", async () => {
    expect((await DELETE(makeRequest("", { method: "DELETE" }))).status).toBe(400);
  });

  test("409 when removing the last enabled mailbox, nothing deleted", async () => {
    const res = await DELETE(makeRequest("?id=doctor@bjchealth.com.au", { method: "DELETE" }));
    expect(res.status).toBe(409);
    expect(deleteMailboxMock).not.toHaveBeenCalled();
  });

  test("allows the delete when the list read fails (no lock-out)", async () => {
    listMailboxesMock.mockRejectedValue(new Error("ddb"));
    const res = await DELETE(makeRequest("?id=doctor@bjchealth.com.au", { method: "DELETE" }));
    expect(res.status).toBe(200);
  });
});
