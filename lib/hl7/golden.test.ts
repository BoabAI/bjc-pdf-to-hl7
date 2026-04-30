/**
 * Golden-fixture test — pins full ORU and REF messages with a fixed
 * deterministic context. This is the payoff of HL7BuildContext: one
 * test, one literal expected string, easy to read against the spec.
 *
 * If a future change adjusts segment order, separators, or default
 * field content, the literal will diff loudly and the change can be
 * reviewed in one place.
 */

import { describe, expect, test } from "bun:test";
import { buildHL7Message } from "../hl7-builder";
import type { HL7BuildContext } from "./build-context";
import type { PatientData } from "../domain/types";

const FIXED_CONTEXT: HL7BuildContext = {
  timestamp: "20260101120000",
  messageId: "MSG20260101120000ABCD",
};

const PATIENT: PatientData = {
  firstName: "Alpha",
  lastName: "Synthetic",
  dob: "19800101",
  sex: "F",
  address: "1 Test Street",
  suburb: "Sydney",
  state: "NSW",
  postcode: "2000",
  phone: "0400000000",
};

const TINY_PDF = Buffer.from("x"); // 1 byte → base64 "eA=="

describe("golden HL7 fixtures (deterministic context)", () => {
  test("ORU^R01 full message is byte-identical to expected fixture", () => {
    const hl7 = buildHL7Message(
      PATIENT,
      TINY_PDF,
      {
        sendingApplication: "FAX",
        documentTitle: "Pathology Result",
        diagnosticServiceSection: "LAB",
        resultStatus: "F",
        messageType: "ORU^R01",
      },
      FIXED_CONTEXT,
    );

    const expected =
      "MSH|^~\\&|FAX|BJCHEALTH|GENIE|CLINIC|20260101120000||ORU^R01|MSG20260101120000ABCD|P|2.4|||AL|NE|AUS|8859/1\r" +
      "PID|1||||Synthetic^Alpha||19800101|F|||1 Test Street^^Sydney^NSW^2000^AUS||0400000000\r" +
      "PV1|1|O\r" +
      "OBR|1||RPT20260101120000^FAX|PDF^Pathology Result^L|||20260101120000|||||||||||||||20260101120000||LAB|F\r" +
      "OBX|1|ED|PDF^Display format in PDF^AUSPDI||^application^pdf^Base64^eA==||||||F\r";

    expect(hl7).toBe(expected);
  });

  test("REF^I12 full message is byte-identical to expected fixture", () => {
    const hl7 = buildHL7Message(
      PATIENT,
      TINY_PDF,
      {
        sendingApplication: "FAX",
        documentTitle: "Referral",
        diagnosticServiceSection: "PHY",
        resultStatus: "F",
        messageType: "REF^I12",
        referralInfo: {
          senderName: "Dr Test Sender",
          senderProviderNumber: "1234567A",
          addresseeName: "Dr Test Addressee",
        },
      },
      FIXED_CONTEXT,
    );

    const expected =
      "MSH|^~\\&|FAX|BJCHEALTH|GENIE|CLINIC|20260101120000||REF^I12|MSG20260101120000ABCD|P|2.4^AUS&Australia&ISO3166_1^HL7AU-OO-REF-SIMPLIFIED-201706&&L|||AL|NE|AUS|8859/1\r" +
      "RF1|||||||20260101120000\r" +
      "PRD|RP~AP|Sender^Test^^^DR|||||1234567A^AUSHICPR^UPIN\r" +
      "PRD|RT~IR|Addressee^Test^^^DR|||||\r" +
      "PID|1||||Synthetic^Alpha||19800101|F|||1 Test Street^^Sydney^NSW^2000^AUS||0400000000\r" +
      "OBR|1||RPT20260101120000^FAX|PDF^Referral^L|||20260101120000|||||||||1234567A^Sender^Test^^^DR^^^AUSHICPR||||||20260101120000||PHY|F\r" +
      "OBX|1|ED|PDF^Display format in PDF^AUSPDI||^application^pdf^Base64^eA==||||||F\r" +
      "PV1|1|O|||||||^Addressee^Test^^^DR\r";

    expect(hl7).toBe(expected);
  });
});
