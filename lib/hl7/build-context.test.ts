import { describe, expect, test } from "bun:test";
import {
  createHL7BuildContext,
  formatHL7Timestamp,
} from "./build-context";

describe("formatHL7Timestamp", () => {
  test("formats a date as YYYYMMDDHHMMSS in local time", () => {
    // Construct a date using the local-time constructor so the test is
    // timezone-independent — formatHL7Timestamp uses local-time getters
    // (matches the pre-refactor builder behaviour).
    const d = new Date(2026, 0, 1, 12, 34, 56); // 2026-01-01 12:34:56 local
    expect(formatHL7Timestamp(d)).toBe("20260101123456");
  });

  test("zero-pads month, day, hour, minute, second", () => {
    const d = new Date(2026, 8, 9, 8, 5, 4); // 2026-09-09 08:05:04 local
    expect(formatHL7Timestamp(d)).toBe("20260909080504");
  });
});

describe("createHL7BuildContext", () => {
  test("with no overrides produces a 14-char timestamp and MSG-prefixed ID", () => {
    const ctx = createHL7BuildContext();
    expect(ctx.timestamp).toMatch(/^\d{14}$/);
    // MSG + 14 timestamp chars + 4-char base36-uppercase suffix = 21 chars
    expect(ctx.messageId).toMatch(/^MSG\d{14}[A-Z0-9]{4}$/);
    expect(ctx.messageId.length).toBe(21);
  });

  test("propagates explicit timestamp into the message ID", () => {
    const ctx = createHL7BuildContext({ timestamp: "20260101120000" });
    expect(ctx.timestamp).toBe("20260101120000");
    expect(ctx.messageId).toMatch(/^MSG20260101120000[A-Z0-9]{4}$/);
  });

  test("propagates explicit messageId untouched", () => {
    const ctx = createHL7BuildContext({ messageId: "MSGFOO" });
    expect(ctx.messageId).toBe("MSGFOO");
    // timestamp still derived from new Date() — just sanity-check the format
    expect(ctx.timestamp).toMatch(/^\d{14}$/);
  });

  test("both overrides at once preserve both fields verbatim", () => {
    const ctx = createHL7BuildContext({
      timestamp: "20260101120000",
      messageId: "MSG20260101120000ABCD",
    });
    expect(ctx.timestamp).toBe("20260101120000");
    expect(ctx.messageId).toBe("MSG20260101120000ABCD");
  });

  test("two consecutive calls with no overrides produce different message IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      ids.add(createHL7BuildContext().messageId);
    }
    expect(ids.size).toBe(5);
  });
});
