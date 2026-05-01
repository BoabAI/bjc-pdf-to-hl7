import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildLogPayload,
  logAuditFailure,
  logAuthRejection,
  logOperationalError,
  logServerEvent,
} from "./logging";

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;
const originalLogDebug = process.env.LOG_DEBUG;

interface CapturedCall {
  level: "error" | "warn" | "log";
  args: unknown[];
}

function installSpy(): CapturedCall[] {
  const calls: CapturedCall[] = [];
  console.error = ((...args: unknown[]) => {
    calls.push({ level: "error", args });
  }) as typeof console.error;
  console.warn = ((...args: unknown[]) => {
    calls.push({ level: "warn", args });
  }) as typeof console.warn;
  console.log = ((...args: unknown[]) => {
    calls.push({ level: "log", args });
  }) as typeof console.log;
  return calls;
}

function restoreConsole(): void {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
}

afterEach(() => {
  restoreConsole();
  if (originalLogDebug === undefined) {
    delete process.env.LOG_DEBUG;
  } else {
    process.env.LOG_DEBUG = originalLogDebug;
  }
});

describe("buildLogPayload", () => {
  test("builds the wire shape for an info event", () => {
    const payload = buildLogPayload("info", "test", "hello");
    expect(payload.level).toBe("info");
    expect(payload.category).toBe("test");
    expect(payload.message).toBe("hello");
    expect(typeof payload.ts).toBe("string");
    expect(payload.context).toBeUndefined();
    // ts must look like an ISO 8601 string
    expect(typeof payload.ts === "string" && !Number.isNaN(Date.parse(payload.ts))).toBe(true);
  });

  test("redacts top-level sensitive keys, leaves benign keys", () => {
    const payload = buildLogPayload("error", "test", "boom", {
      secret: "abc",
      note: "ok",
    });
    expect(payload.context).toEqual({ secret: "[redacted]", note: "ok" });
  });

  test("redacts nested object keys recursively", () => {
    const payload = buildLogPayload("error", "test", "x", {
      outer: { password: "x", id: "y" },
    });
    expect(payload.context).toEqual({
      outer: { password: "[redacted]", id: "y" },
    });
  });

  test("redacts inside arrays of objects", () => {
    const payload = buildLogPayload("info", "test", "x", {
      items: [{ token: "a" }, { token: "b" }],
    });
    expect(payload.context).toEqual({
      items: [{ token: "[redacted]" }, { token: "[redacted]" }],
    });
  });

  test("substring match catches apiKey and access_token", () => {
    const payload = buildLogPayload("info", "test", "x", {
      apiKey: "k",
      access_token: "t",
      regular: "v",
    });
    expect(payload.context).toEqual({
      apiKey: "[redacted]",
      access_token: "[redacted]",
      regular: "v",
    });
  });

  test("medicare-related keys are redacted", () => {
    const payload = buildLogPayload("info", "test", "x", {
      medicareNo: "1234",
      medicareRef: "1",
      medicare_card: "abc",
    });
    expect(payload.context).toEqual({
      medicareNo: "[redacted]",
      medicareRef: "[redacted]",
      medicare_card: "[redacted]",
    });
  });

  test("PHI-adjacent fields are redacted (firstName, lastName, dob, phone, address)", () => {
    const payload = buildLogPayload("info", "test", "x", {
      firstName: "Jane",
      lastName: "Doe",
      dob: "1990-01-01",
      phone: "0400000000",
      address: "1 Main St",
      patientName: "Jane Doe",
    });
    expect(payload.context).toEqual({
      firstName: "[redacted]",
      lastName: "[redacted]",
      dob: "[redacted]",
      phone: "[redacted]",
      address: "[redacted]",
      patientName: "[redacted]",
    });
  });

  test("circular references do not crash; replaced with [circular]", () => {
    const a: Record<string, unknown> = { id: "a" };
    const b: Record<string, unknown> = { id: "b", a };
    a.b = b;
    const payload = buildLogPayload("info", "test", "x", { root: a });
    // Should not throw.
    const ctx = payload.context as Record<string, unknown>;
    expect(ctx).toBeDefined();
    // Walk down: root.id stays, root.b.id stays, root.b.a is circular ref to root
    const root = ctx.root as Record<string, unknown>;
    expect(root.id).toBe("a");
    const innerB = root.b as Record<string, unknown>;
    expect(innerB.id).toBe("b");
    expect(innerB.a).toBe("[circular]");
  });

  test("depth cap truncates with [depth-limit] sentinel", () => {
    // Build an 8-level deep object: root.a.a.a.a.a.a.a.a = "deep"
    const deep: Record<string, unknown> = { value: "deep" };
    let current = deep;
    for (let i = 0; i < 8; i++) {
      const next: Record<string, unknown> = { value: `level-${i}` };
      current.next = next;
      current = next;
    }
    const payload = buildLogPayload("info", "test", "x", { root: deep });
    // Walk down counting levels until we hit [depth-limit]
    let cursor: unknown = payload.context;
    let foundLimit = false;
    for (let i = 0; i < 20; i++) {
      if (cursor === "[depth-limit]") {
        foundLimit = true;
        break;
      }
      if (typeof cursor !== "object" || cursor === null) break;
      const obj = cursor as Record<string, unknown>;
      if (obj.next !== undefined) {
        cursor = obj.next;
      } else if (obj.root !== undefined) {
        cursor = obj.root;
      } else {
        break;
      }
    }
    expect(foundLimit).toBe(true);
  });

  test("primitive context values pass through unchanged", () => {
    const payload = buildLogPayload("info", "test", "x", {
      count: 42,
      flag: true,
      nothing: null,
    });
    expect(payload.context).toEqual({ count: 42, flag: true, nothing: null });
  });
});

describe("logOperationalError error extraction", () => {
  test("extracts name and message; omits stack by default", () => {
    delete process.env.LOG_DEBUG;
    const calls = installSpy();
    const err = new Error("boom");
    err.name = "TestError";
    logOperationalError("test", err);
    expect(calls).toHaveLength(1);
    expect(calls[0].level).toBe("error");
    const [line] = calls[0].args;
    const payload = JSON.parse(line as string) as Record<string, unknown>;
    const errorPayload = payload.error as Record<string, unknown>;
    expect(errorPayload.name).toBe("TestError");
    expect(errorPayload.message).toBe("boom");
    expect(errorPayload.stack).toBeUndefined();
  });

  test("includes stack when LOG_DEBUG=1", () => {
    process.env.LOG_DEBUG = "1";
    const calls = installSpy();
    const err = new Error("boom");
    logOperationalError("test", err);
    const payload = JSON.parse(calls[0].args[0] as string) as Record<string, unknown>;
    const errorPayload = payload.error as Record<string, unknown>;
    expect(typeof errorPayload.stack).toBe("string");
  });

  test("non-Error inputs become NonError payloads", () => {
    const calls = installSpy();
    logOperationalError("test", "string failure");
    const payload = JSON.parse(calls[0].args[0] as string) as Record<string, unknown>;
    const errorPayload = payload.error as Record<string, unknown>;
    expect(errorPayload.name).toBe("NonError");
    expect(errorPayload.message).toBe("string failure");
  });

  test("context is redacted; error fields cannot bypass redaction", () => {
    const calls = installSpy();
    const err = new Error("nope");
    logOperationalError("test", err, { token: "leak", op: "ok" });
    const payload = JSON.parse(calls[0].args[0] as string) as Record<string, unknown>;
    expect(payload.context).toEqual({ token: "[redacted]", op: "ok" });
  });
});

describe("logAuditFailure", () => {
  test("logs under the audit category", () => {
    const calls = installSpy();
    logAuditFailure(new Error("ddb timeout"));
    const payload = JSON.parse(calls[0].args[0] as string) as Record<string, unknown>;
    expect(payload.category).toBe("audit");
    expect(payload.level).toBe("error");
  });
});

describe("logAuthRejection", () => {
  test("redacts claims.email but keeps UPN", () => {
    const calls = installSpy();
    logAuthRejection("domain-not-allowed", {
      claims: { email: "a@b.com", upn: "c@d.com" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].level).toBe("warn");
    const payload = JSON.parse(calls[0].args[0] as string) as Record<string, unknown>;
    const ctx = payload.context as Record<string, unknown>;
    const claims = ctx.claims as Record<string, unknown>;
    expect(claims.email).toBe("[redacted]");
    expect(claims.upn).toBe("c@d.com");
  });

  test("category is 'auth' and message includes reason", () => {
    const calls = installSpy();
    logAuthRejection("missing-upn", { claims: {} });
    const payload = JSON.parse(calls[0].args[0] as string) as Record<string, unknown>;
    expect(payload.category).toBe("auth");
    expect(payload.message).toBe("sign-in rejected: missing-upn");
  });
});

describe("logServerEvent wire format", () => {
  test("emits a single JSON line per call", () => {
    const calls = installSpy();
    logServerEvent("info", "boundary", "ok", { foo: "bar" });
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toHaveLength(1);
    const line = calls[0].args[0];
    expect(typeof line).toBe("string");
    // Must round-trip through JSON.parse on a single line
    expect(typeof line === "string" && !line.includes("\n")).toBe(true);
    const parsed = JSON.parse(line as string) as Record<string, unknown>;
    expect(parsed.level).toBe("info");
    expect(parsed.category).toBe("boundary");
    expect(parsed.message).toBe("ok");
    expect(parsed.context).toEqual({ foo: "bar" });
  });

  let originalConsoleErrorLocal: typeof console.error;
  beforeEach(() => {
    originalConsoleErrorLocal = console.error;
  });

  test("error level routes to console.error, warn to console.warn, info to console.log", () => {
    const calls = installSpy();
    logServerEvent("error", "x", "e");
    logServerEvent("warn", "x", "w");
    logServerEvent("info", "x", "i");
    expect(calls.map((c) => c.level)).toEqual(["error", "warn", "log"]);
  });

  test("does not interfere with restoring console", () => {
    expect(typeof originalConsoleErrorLocal).toBe("function");
  });
});
