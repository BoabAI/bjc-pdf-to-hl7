import { describe, expect, test } from "bun:test";

import { snapAddressee } from "./addressee-snap";
import type { ReferralInfo } from "../domain/types";

/** Genie-format roster as it will live in the reference data. */
const ROSTER = ["Dr I Lim", "Dr H Lau", "Dr A Maundrell", "Dr P Habib"];

/** Real CC line shape from production: name followed by address + phones. */
const LAU_CC_WITH_ADDRESS =
  "Dr Herman Lau Level 1, 17-21 Hunter Street, PARRAMATTA NSW 2150 0283826809, 0298907655";
const SUBBIAH_CC =
  "cc: Prof Rajesh Subbiah St Vincent's Clinic, Suite 802, DARLINGHURST NSW 2010";

describe("snapAddressee", () => {
  describe("format snap (issue 1 — radiology result full name)", () => {
    test("snaps a full document name onto the Genie-format roster entry", () => {
      const result = snapAddressee(
        { addresseeName: "Dr Irwin Geok San Lim" },
        ROSTER
      );
      expect(result.referralInfo?.addresseeName).toBe("Dr I Lim");
      expect(result.warnings).toEqual([]);
    });

    test("leaves an exact roster match untouched with no warnings", () => {
      const result = snapAddressee({ addresseeName: "Dr I Lim" }, ROSTER);
      expect(result.referralInfo?.addresseeName).toBe("Dr I Lim");
      expect(result.warnings).toEqual([]);
    });

    test("normalises casing of a case-insensitive exact match to the roster string", () => {
      const result = snapAddressee({ addresseeName: "dr i lim" }, ROSTER);
      expect(result.referralInfo?.addresseeName).toBe("Dr I Lim");
      expect(result.warnings).toEqual([]);
    });

    test("matches dotted initials", () => {
      expect(
        snapAddressee({ addresseeName: "Dr I. Lim" }, ROSTER).referralInfo
          ?.addresseeName
      ).toBe("Dr I Lim");
      expect(
        snapAddressee({ addresseeName: "Dr I.G.S. Lim" }, ROSTER).referralInfo
          ?.addresseeName
      ).toBe("Dr I Lim");
    });

    test("matches a surname-only mention when it is unambiguous", () => {
      const result = snapAddressee({ addresseeName: "Dr Lim" }, ROSTER);
      expect(result.referralInfo?.addresseeName).toBe("Dr I Lim");
    });

    test("does NOT snap a different given name onto a roster doctor", () => {
      const result = snapAddressee({ addresseeName: "Dr John Lim" }, ROSTER);
      expect(result.referralInfo?.addresseeName).toBe("Dr John Lim");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("not matched");
    });
  });

  describe("CC promotion (issue 2 — external primary, BJC doctor on CC)", () => {
    test("promotes the CC'd BJC doctor over an external primary, tolerating address junk", () => {
      const input: ReferralInfo = {
        senderName: "Dr Sarah Chen",
        senderClinic: "Darlinghurst Specialist Centre",
        addresseeName: "Dr Brendan Cantwell",
        addresseeClinic: "St Vincent's Clinic",
        ccNames: [SUBBIAH_CC, LAU_CC_WITH_ADDRESS],
      };
      const result = snapAddressee(input, ROSTER);

      expect(result.referralInfo?.addresseeName).toBe("Dr H Lau");
      // The clinic described the demoted external primary — must not survive.
      expect(result.referralInfo?.addresseeClinic).toBeUndefined();
      // Sender fields and the CC list itself are never rewritten.
      expect(result.referralInfo?.senderName).toBe("Dr Sarah Chen");
      expect(result.referralInfo?.senderClinic).toBe(
        "Darlinghurst Specialist Centre"
      );
      expect(result.referralInfo?.ccNames).toEqual([
        SUBBIAH_CC,
        LAU_CC_WITH_ADDRESS,
      ]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("promoted from CC");
      expect(result.warnings[0]).toContain("Dr H Lau");
    });

    test("promotes from CC when the addressee is absent entirely", () => {
      const result = snapAddressee({ ccNames: ["Dr H Lau"] }, ROSTER);
      expect(result.referralInfo?.addresseeName).toBe("Dr H Lau");
      expect(result.warnings[0]).toContain("promoted from CC");
    });

    test("does not promote when the primary addressee already matched the roster", () => {
      const result = snapAddressee(
        { addresseeName: "Dr Irwin Lim", ccNames: ["Dr H Lau"] },
        ROSTER
      );
      expect(result.referralInfo?.addresseeName).toBe("Dr I Lim");
      expect(result.warnings).toEqual([]);
    });
  });

  describe("ambiguity and no-match", () => {
    test("never snaps when two roster doctors share the surname", () => {
      const twoLims = ["Dr I Lim", "Dr J Lim"];
      const result = snapAddressee(
        { addresseeName: "Dr Lim", ccNames: ["Dr J Lim"] },
        twoLims
      );
      // Ambiguous stays as extracted AND does not fall through to CC promotion.
      expect(result.referralInfo?.addresseeName).toBe("Dr Lim");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("multiple");
    });

    test("passes an unresolvable addressee through verbatim with a warning", () => {
      const result = snapAddressee(
        { addresseeName: "Dear Rheumatologist" },
        ROSTER
      );
      expect(result.referralInfo?.addresseeName).toBe("Dear Rheumatologist");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("not matched");
    });

    test("emits no warning when neither addressee nor CC exists", () => {
      const result = snapAddressee({ senderName: "Dr Sarah Chen" }, ROSTER);
      expect(result.referralInfo?.addresseeName).toBeUndefined();
      expect(result.warnings).toEqual([]);
    });
  });

  describe("pass-through and safety", () => {
    test("passes through untouched with an empty roster", () => {
      const input: ReferralInfo = { addresseeName: "Dr Irwin Geok San Lim" };
      const result = snapAddressee(input, []);
      expect(result.referralInfo).toBe(input);
      expect(result.warnings).toEqual([]);
    });

    test("passes through undefined referralInfo", () => {
      const result = snapAddressee(undefined, ROSTER);
      expect(result.referralInfo).toBeUndefined();
      expect(result.warnings).toEqual([]);
    });

    test("never mutates the input object", () => {
      const input: ReferralInfo = {
        addresseeName: "Dr Brendan Cantwell",
        addresseeClinic: "St Vincent's Clinic",
        ccNames: [LAU_CC_WITH_ADDRESS],
      };
      snapAddressee(input, ROSTER);
      expect(input.addresseeName).toBe("Dr Brendan Cantwell");
      expect(input.addresseeClinic).toBe("St Vincent's Clinic");
      expect(input.ccNames).toEqual([LAU_CC_WITH_ADDRESS]);
    });

    test("warnings contain no digits (audit redaction canary)", () => {
      const promoted = snapAddressee(
        { addresseeName: "Dr Brendan Cantwell", ccNames: [LAU_CC_WITH_ADDRESS] },
        ROSTER
      );
      const unmatched = snapAddressee(
        { addresseeName: "Dear Rheumatologist" },
        ROSTER
      );
      for (const warning of [...promoted.warnings, ...unmatched.warnings]) {
        expect(warning).not.toMatch(/\d/);
      }
    });
  });
});
