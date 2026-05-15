import { describe, expect, test } from "bun:test";
import {
  DOCUMENT_TYPES,
  MAILBOX_CATEGORIES,
  allowedDocTypesForCategory,
  diagnosticServiceSectionFor,
  documentTypeLabel,
  isDocumentType,
  isReferralDocumentType,
  isResultDocumentType,
  mailboxCategoryFor,
  parseDocumentTypeOption,
} from "./conversion-config";

describe("DOCUMENT_TYPES whitelist", () => {
  test("includes the seven doc types including consult_letter", () => {
    expect(DOCUMENT_TYPES).toContain("consent_form");
    expect(DOCUMENT_TYPES).toContain("referral_letter");
    expect(DOCUMENT_TYPES).toContain("gp_referral");
    expect(DOCUMENT_TYPES).toContain("consult_letter");
    expect(DOCUMENT_TYPES).toContain("generic");
    expect(DOCUMENT_TYPES).toContain("pathology_result");
    expect(DOCUMENT_TYPES).toContain("radiology_result");
  });
});

describe("isDocumentType", () => {
  test("accepts pathology_result and radiology_result", () => {
    expect(isDocumentType("pathology_result")).toBe(true);
    expect(isDocumentType("radiology_result")).toBe(true);
  });

  test("rejects unknown values", () => {
    expect(isDocumentType("not_real")).toBe(false);
    expect(isDocumentType(null)).toBe(false);
    expect(isDocumentType(undefined)).toBe(false);
    expect(isDocumentType(42)).toBe(false);
  });
});

describe("parseDocumentTypeOption", () => {
  test("accepts pathology_result", () => {
    expect(parseDocumentTypeOption("pathology_result")).toBe("pathology_result");
  });

  test("accepts radiology_result", () => {
    expect(parseDocumentTypeOption("radiology_result")).toBe("radiology_result");
  });

  test("falls back to auto for unknown values", () => {
    expect(parseDocumentTypeOption("not_real")).toBe("auto");
    expect(parseDocumentTypeOption(null)).toBe("auto");
  });
});

describe("isReferralDocumentType", () => {
  test("returns true for referral_letter and gp_referral", () => {
    expect(isReferralDocumentType("referral_letter")).toBe(true);
    expect(isReferralDocumentType("gp_referral")).toBe(true);
  });

  test("returns true for consult_letter (routes to Incoming Letters)", () => {
    expect(isReferralDocumentType("consult_letter")).toBe(true);
  });

  test("returns false for result types", () => {
    expect(isReferralDocumentType("pathology_result")).toBe(false);
    expect(isReferralDocumentType("radiology_result")).toBe(false);
  });

  test("returns false for consent_form and generic", () => {
    expect(isReferralDocumentType("consent_form")).toBe(false);
    expect(isReferralDocumentType("generic")).toBe(false);
  });
});

describe("isResultDocumentType", () => {
  test("returns true for pathology_result", () => {
    expect(isResultDocumentType("pathology_result")).toBe(true);
  });

  test("returns true for radiology_result", () => {
    expect(isResultDocumentType("radiology_result")).toBe(true);
  });

  test("returns false for referral types", () => {
    expect(isResultDocumentType("referral_letter")).toBe(false);
    expect(isResultDocumentType("gp_referral")).toBe(false);
  });

  test("returns false for consent_form and generic", () => {
    expect(isResultDocumentType("consent_form")).toBe(false);
    expect(isResultDocumentType("generic")).toBe(false);
  });
});

describe("documentTypeLabel", () => {
  test("returns 'Pathology Result' for pathology_result", () => {
    expect(documentTypeLabel("pathology_result")).toBe("Pathology Result");
  });

  test("returns 'Radiology Result' for radiology_result", () => {
    expect(documentTypeLabel("radiology_result")).toBe("Radiology Result");
  });

  test("returns 'Referral' for referral_letter", () => {
    expect(documentTypeLabel("referral_letter")).toBe("Referral");
  });

  test("returns 'Referral' for gp_referral", () => {
    expect(documentTypeLabel("gp_referral")).toBe("Referral");
  });

  test("returns 'Consult Letter' for consult_letter", () => {
    expect(documentTypeLabel("consult_letter")).toBe("Consult Letter");
  });

  test("returns 'Correspondence' for consent_form", () => {
    expect(documentTypeLabel("consent_form")).toBe("Correspondence");
  });

  test("returns 'Correspondence' for generic", () => {
    expect(documentTypeLabel("generic")).toBe("Correspondence");
  });
});

describe("diagnosticServiceSectionFor", () => {
  test("returns LAB for pathology_result", () => {
    expect(diagnosticServiceSectionFor("pathology_result")).toBe("LAB");
  });

  test("returns RAD for radiology_result", () => {
    expect(diagnosticServiceSectionFor("radiology_result")).toBe("RAD");
  });

  test("returns PHY for referral_letter", () => {
    expect(diagnosticServiceSectionFor("referral_letter")).toBe("PHY");
  });

  test("returns PHY for gp_referral", () => {
    expect(diagnosticServiceSectionFor("gp_referral")).toBe("PHY");
  });

  test("returns PHY for consult_letter (routes to Incoming Letters)", () => {
    expect(diagnosticServiceSectionFor("consult_letter")).toBe("PHY");
  });

  test("returns undefined for consent_form", () => {
    expect(diagnosticServiceSectionFor("consent_form")).toBeUndefined();
  });

  test("returns undefined for generic", () => {
    expect(diagnosticServiceSectionFor("generic")).toBeUndefined();
  });
});

describe("mailboxCategoryFor", () => {
  test("returns 'results' for fax mailboxes", () => {
    expect(mailboxCategoryFor("fax-pathology@bjchealth.com.au")).toBe("results");
    expect(mailboxCategoryFor("fax-radiology@bjchealth.com.au")).toBe("results");
    expect(mailboxCategoryFor("fax-vascular@bjchealth.com.au")).toBe("results");
  });

  test("returns 'letters' for the admin mailbox", () => {
    expect(mailboxCategoryFor("admin@bjchealth.com.au")).toBe("letters");
  });

  test("recognises the simulated:fax / simulated:admin sentinels", () => {
    expect(mailboxCategoryFor("simulated:fax")).toBe("results");
    expect(mailboxCategoryFor("simulated:admin")).toBe("letters");
  });

  test("is case-insensitive and trims whitespace", () => {
    expect(mailboxCategoryFor("  ADMIN@BJCHEALTH.COM.AU  ")).toBe("letters");
  });

  test("returns 'none' for unknown / missing hints", () => {
    expect(mailboxCategoryFor(undefined)).toBe("none");
    expect(mailboxCategoryFor(null)).toBe("none");
    expect(mailboxCategoryFor("")).toBe("none");
    expect(mailboxCategoryFor("unknown@example.com")).toBe("none");
  });

  test("MAILBOX_CATEGORIES seed contains the documented mailboxes", () => {
    expect(Object.keys(MAILBOX_CATEGORIES)).toEqual(
      expect.arrayContaining([
        "fax-pathology@bjchealth.com.au",
        "admin@bjchealth.com.au",
        "simulated:fax",
        "simulated:admin",
      ])
    );
  });
});

describe("allowedDocTypesForCategory", () => {
  test("results → pathology + radiology", () => {
    const allowed = allowedDocTypesForCategory("results");
    expect(allowed).toEqual(["pathology_result", "radiology_result"]);
  });

  test("letters → referral + gp_referral + consult_letter", () => {
    const allowed = allowedDocTypesForCategory("letters");
    expect(allowed).toEqual([
      "referral_letter",
      "gp_referral",
      "consult_letter",
    ]);
  });

  test("none → all DOCUMENT_TYPES (free classification)", () => {
    const allowed = allowedDocTypesForCategory("none");
    expect(allowed).toEqual([...DOCUMENT_TYPES]);
  });
});
