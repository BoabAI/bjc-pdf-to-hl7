import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MAILBOXES,
  describeMailboxChange,
  isMailboxConfig,
  leavesNoEnabledMailbox,
  mailboxWarnings,
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

const fax = DEFAULT_MAILBOXES[0];
const doctorAt = {
  id: "doctor@bjchealth.com.au",
  address: "doctor@bjchealth.com.au",
  sourceFolder: "Inbox/HL7",
  linkedFolder: "Inbox/HL7_linked",
  enabled: true,
};

describe("describeMailboxChange", () => {
  test("describes an added mailbox", () => {
    expect(describeMailboxChange(undefined, doctorAt)).toBe(
      "mailbox doctor@bjchealth.com.au added (source Inbox/HL7, linked Inbox/HL7_linked, enabled)"
    );
  });

  test("lists each changed field", () => {
    const next = { ...fax, sourceFolder: "Inbox/HL7", linkedFolder: "Inbox/Done", enabled: false };
    expect(describeMailboxChange(fax, next)).toBe(
      "mailbox gofax.par@bjchealth.com.au: source Inbox → Inbox/HL7, linked Inbox/HL7_linked → Inbox/Done, disabled"
    );
  });

  test("says no change when nothing differs", () => {
    expect(describeMailboxChange(fax, { ...fax })).toBe("mailbox gofax.par@bjchealth.com.au: no change");
  });
});

describe("leavesNoEnabledMailbox", () => {
  const other = { ...doctorAt, id: "x@bjchealth.com.au", address: "x@bjchealth.com.au", enabled: false };

  test("true when disabling the only enabled mailbox", () => {
    expect(
      leavesNoEnabledMailbox([doctorAt, other], { type: "put", value: { ...doctorAt, enabled: false } })
    ).toBe(true);
  });

  test("true when removing the only enabled mailbox", () => {
    expect(leavesNoEnabledMailbox([doctorAt, other], { type: "delete", id: doctorAt.id })).toBe(true);
  });

  test("false while another mailbox stays enabled", () => {
    expect(
      leavesNoEnabledMailbox([doctorAt, fax], { type: "put", value: { ...doctorAt, enabled: false } })
    ).toBe(false);
    expect(leavesNoEnabledMailbox([doctorAt, fax], { type: "delete", id: doctorAt.id })).toBe(false);
  });

  test("false when the change enables or adds an enabled mailbox", () => {
    expect(leavesNoEnabledMailbox([other], { type: "put", value: { ...other, enabled: true } })).toBe(false);
    expect(leavesNoEnabledMailbox([], { type: "put", value: doctorAt })).toBe(false);
  });

  test("false when the list already had nothing enabled (change doesn't make it worse)", () => {
    expect(leavesNoEnabledMailbox([other], { type: "delete", id: other.id })).toBe(false);
  });
});

describe("mailboxWarnings", () => {
  test("no warnings for an unchanged fax mailbox", () => {
    expect(mailboxWarnings(fax, { ...fax })).toEqual([]);
  });

  test("warns when a non-fax mailbox is polled from the Inbox", () => {
    const w = mailboxWarnings(doctorAt, { ...doctorAt, sourceFolder: "Inbox" });
    expect(w.some((m) => m.includes("Every email with a PDF"))).toBe(true);
  });

  test("warns when a fax mailbox moves off the Inbox", () => {
    const w = mailboxWarnings(fax, { ...fax, sourceFolder: "Inbox/HL7" });
    expect(w.some((m) => m.includes("Faxes arrive in the Inbox"))).toBe(true);
  });

  test("warns about a non-BJC address", () => {
    const ext = { ...doctorAt, id: "a@gmail.com", address: "a@gmail.com" };
    expect(mailboxWarnings(undefined, ext).some((m) => m.includes("isn't a BJC Health address"))).toBe(true);
  });

  test("warns when a mailbox is disabled, not when it already was", () => {
    expect(mailboxWarnings(fax, { ...fax, enabled: false }).some((m) => m.includes("stop checking"))).toBe(true);
    const off = { ...fax, enabled: false };
    expect(mailboxWarnings(off, { ...off })).toEqual([]);
  });

  test("asks to check changed folders exist, naming each folder", () => {
    const w = mailboxWarnings(doctorAt, { ...doctorAt, linkedFolder: "Inbox/Done" });
    expect(w.some((m) => m.includes("Inbox/Done") && m.includes("exists"))).toBe(true);
    const added = mailboxWarnings(undefined, doctorAt);
    expect(added.some((m) => m.includes("Inbox/HL7") && m.includes("exists"))).toBe(true);
  });

  test("never asks to check that the Inbox itself exists", () => {
    const addr = "gofax.new@bjchealth.com.au";
    const w = mailboxWarnings(undefined, { ...fax, id: addr, address: addr });
    expect(w.some((m) => m.includes("Check Inbox exists"))).toBe(false);
  });
});
