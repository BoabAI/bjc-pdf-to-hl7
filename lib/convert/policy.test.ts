import { describe, expect, test } from "bun:test";
import {
  messageTypeDisplayLabel,
  messageTypeForDocumentType,
} from "./policy";

describe("messageTypeForDocumentType", () => {
  test("referral_letter → REF^I12", () => {
    expect(messageTypeForDocumentType("referral")).toBe("REF^I12");
  });

  test("gp_referral → REF^I12", () => {
    expect(messageTypeForDocumentType("referral")).toBe("REF^I12");
  });

  test("consult_letter → REF^I12 (routes to Incoming Letters)", () => {
    expect(messageTypeForDocumentType("consult_letter")).toBe("REF^I12");
  });

  test("pathology_result → ORU^R01", () => {
    expect(messageTypeForDocumentType("pathology_result")).toBe("ORU^R01");
  });

  test("radiology_result → ORU^R01", () => {
    expect(messageTypeForDocumentType("radiology_result")).toBe("ORU^R01");
  });

  test("consent_form → ORU^R01", () => {
    expect(messageTypeForDocumentType("consent_form")).toBe("ORU^R01");
  });

  test("generic → ORU^R01", () => {
    expect(messageTypeForDocumentType("generic")).toBe("ORU^R01");
  });
});

describe("messageTypeDisplayLabel", () => {
  test("REF^I12 → 'REF (Referral)'", () => {
    expect(messageTypeDisplayLabel("REF^I12")).toBe("REF (Referral)");
  });

  test("ORU^R01 → 'ORU (Result)'", () => {
    expect(messageTypeDisplayLabel("ORU^R01")).toBe("ORU (Result)");
  });
});
