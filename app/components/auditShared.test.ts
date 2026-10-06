import { describe, expect, test } from "bun:test";
import { mailboxDisplay, type AuditRow } from "./auditShared";

const base: AuditRow = {
  month: "2026-08",
  ts: "2026-08-26T00:00:00.000Z#abc123",
  outcome: "ok",
  source: "email",
  filenameHash: "abcdef012345",
  filenameExt: ".pdf",
  fileSizeBytes: 1024,
  durationMs: 250,
  warningCount: 0,
};

describe("mailboxDisplay", () => {
  test("shows the fax mailbox local part when the source address is known", () => {
    expect(
      mailboxDisplay({ ...base, mailboxAddress: "gofax.par@bjchealth.com.au" })
    ).toBe("Fax · gofax.par");
  });

  test("labels letters-category mailboxes as Admin", () => {
    expect(
      mailboxDisplay({
        ...base,
        mailboxAddress: "admin@bjchealth.com.au",
        mailboxCategory: "letters",
      })
    ).toBe("Admin · admin");
  });

  test("falls back to the legacy category labels when no address was stored", () => {
    expect(mailboxDisplay({ ...base, mailboxCategory: "results" })).toBe(
      "Fax (results)"
    );
    expect(mailboxDisplay({ ...base, mailboxCategory: "letters" })).toBe(
      "Admin (letters)"
    );
  });

  test("falls back to Email / Web when nothing else is known", () => {
    expect(mailboxDisplay(base)).toBe("Email");
    expect(mailboxDisplay({ ...base, source: "web" })).toBe("Web");
  });
});
