import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MAILBOXES,
  isMailboxConfig,
  isValidMailFolder,
  validateMailboxInput,
} from "./mailbox-config";

describe("isValidMailFolder", () => {
  test("accepts Inbox and a single subfolder under Inbox", () => {
    expect(isValidMailFolder("Inbox")).toBe(true);
    expect(isValidMailFolder("Inbox/HL7")).toBe(true);
    expect(isValidMailFolder("Inbox/HL7_linked")).toBe(true);
    expect(isValidMailFolder("Inbox/HL7 Testing")).toBe(true);
  });

  test("rejects folders outside Inbox, nested deeper, or with odd characters", () => {
    expect(isValidMailFolder("")).toBe(false);
    expect(isValidMailFolder("HL7")).toBe(false);
    expect(isValidMailFolder("Inbox/")).toBe(false);
    expect(isValidMailFolder("Inbox/HL7/sub")).toBe(false);
    expect(isValidMailFolder("Inbox/../Sent")).toBe(false);
    expect(isValidMailFolder("Inbox/HL7|x")).toBe(false);
    expect(isValidMailFolder(`Inbox/${"a".repeat(65)}`)).toBe(false);
  });
});

describe("validateMailboxInput", () => {
  const base = {
    address: "Doctor@BJCHealth.com.au",
    sourceFolder: "Inbox/HL7",
    linkedFolder: "Inbox/HL7_linked",
    enabled: true,
  };

  test("normalises the address to lowercase and uses it as the id", () => {
    const result = validateMailboxInput(base);
    expect(result).toEqual({
      ok: true,
      value: {
        id: "doctor@bjchealth.com.au",
        address: "doctor@bjchealth.com.au",
        sourceFolder: "Inbox/HL7",
        linkedFolder: "Inbox/HL7_linked",
        enabled: true,
      },
    });
  });

  test("trims folder whitespace", () => {
    const result = validateMailboxInput({ ...base, sourceFolder: "  Inbox  " });
    expect(result.ok && result.value.sourceFolder).toBe("Inbox");
  });

  test("rejects a malformed address", () => {
    expect(validateMailboxInput({ ...base, address: "not-an-email" }).ok).toBe(false);
    expect(validateMailboxInput({ ...base, address: "a b@x.com" }).ok).toBe(false);
  });

  test("rejects an invalid source or linked folder", () => {
    expect(validateMailboxInput({ ...base, sourceFolder: "Sent" }).ok).toBe(false);
    expect(validateMailboxInput({ ...base, linkedFolder: "Inbox/a/b" }).ok).toBe(false);
  });

  test("rejects a linked folder equal to the source folder", () => {
    const result = validateMailboxInput({ ...base, linkedFolder: "Inbox/HL7" });
    expect(result.ok).toBe(false);
  });

  test("rejects a missing enabled flag or wrong shape", () => {
    expect(validateMailboxInput({ ...base, enabled: "yes" }).ok).toBe(false);
    expect(validateMailboxInput(null).ok).toBe(false);
  });

  test("never carries unexpected attributes through", () => {
    const result = validateMailboxInput({ ...base, kind: "DOCTOR", extra: 1 });
    expect(result.ok && Object.keys(result.value).sort()).toEqual(
      ["address", "enabled", "id", "linkedFolder", "sourceFolder"]
    );
  });
});

describe("DEFAULT_MAILBOXES", () => {
  test("seeds the four fax mailboxes on Inbox, all enabled and valid", () => {
    expect(DEFAULT_MAILBOXES.map((m) => m.address)).toEqual([
      "gofax.par@bjchealth.com.au",
      "gofax.cht@bjchealth.com.au",
      "gofax.bon@bjchealth.com.au",
      "gofax.bow@bjchealth.com.au",
    ]);
    for (const m of DEFAULT_MAILBOXES) {
      expect(isMailboxConfig(m)).toBe(true);
      expect(m.sourceFolder).toBe("Inbox");
      expect(m.linkedFolder).toBe("Inbox/HL7_linked");
      expect(m.enabled).toBe(true);
      expect(validateMailboxInput(m).ok).toBe(true);
    }
  });
});
