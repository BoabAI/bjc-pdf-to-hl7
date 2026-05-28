import { describe, expect, test } from "bun:test";
import { evaluateAutoRouteEligibility } from "./eligibility";
import type { ExtractionResult } from "../pdf-parser";
import type { DocumentType } from "../domain/types";

const baseSettings = { minClassificationConfidence: 75 };

function makeExtraction(
  overrides: Partial<ExtractionResult> = {}
): ExtractionResult {
  return {
    success: true,
    data: {
      firstName: "Jane",
      lastName: "Smith",
      dob: "19850608",
      sex: "F",
    },
    warnings: [],
    documentType: ("referral" as DocumentType),
    extractionMethod: "vision",
    classificationConfidence: 85,
    isUrgent: false,
    referralInfo: { senderName: "Dr GP", addresseeName: "Dr Irwin Lim" },
    ...overrides,
  };
}

describe("evaluateAutoRouteEligibility — happy paths", () => {
  test("referral_letter from letters mailbox is eligible", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction(),
      mailboxCategory: "letters",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test("consult_letter from letters mailbox is eligible", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({ documentType: "consult_letter" }),
      mailboxCategory: "letters",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(true);
  });

  test("pathology_result from results mailbox with addressee is eligible", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({ documentType: "pathology_result" }),
      mailboxCategory: "results",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(true);
  });

  test("any supported doc type passes when mailbox is 'none'", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({ documentType: "pathology_result" }),
      mailboxCategory: "none",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(true);
  });
});

describe("evaluateAutoRouteEligibility — extraction failure", () => {
  test("extractionFailed when patient name is missing", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        success: false,
        data: {
          firstName: "UNKNOWN",
          lastName: "PATIENT",
          dob: "19000101",
          sex: "U",
        },
      }),
      mailboxCategory: "letters",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("extraction_failed");
    expect(result.suggestedCategory).toContain("Extraction failed");
  });

  test("extractionFailed when DOB is missing", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        data: {
          firstName: "Jane",
          lastName: "Smith",
          dob: "19000101",
          sex: "F",
        },
      }),
      mailboxCategory: "letters",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("extraction_failed");
  });
});

describe("evaluateAutoRouteEligibility — unknown doc type", () => {
  test("generic doc type fails as unknown_doc_type", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({ documentType: "generic" }),
      mailboxCategory: "none",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("unknown_doc_type");
  });

  test("consent_form is never auto-routed when mailbox is constrained to letters", () => {
    // consent_form is not in the letters allowed set
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({ documentType: "consent_form" }),
      mailboxCategory: "letters",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    // Either mailbox_mismatch (in our taxonomy) or unknown_doc_type — we
    // check the cheaper-to-fail `unknown_doc_type` was NOT triggered first
    // since consent_form is a known doc type.
    expect(result.reason).toBe("mailbox_mismatch");
  });
});

describe("evaluateAutoRouteEligibility — mailbox mismatch", () => {
  test("pathology_result from letters mailbox fails as mailbox_mismatch", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({ documentType: "pathology_result" }),
      mailboxCategory: "letters",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("mailbox_mismatch");
  });

  test("referral_letter from results mailbox fails as mailbox_mismatch", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({ documentType: "referral" }),
      mailboxCategory: "results",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("mailbox_mismatch");
  });

  test("does not fail mailbox_mismatch when mailbox is 'none'", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({ documentType: "referral" }),
      mailboxCategory: "none",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(true);
  });
});

describe("evaluateAutoRouteEligibility — missing required fields", () => {
  test("pathology_result without addressee fails as missing_fields", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        documentType: "pathology_result",
        referralInfo: { senderName: "Lab" },
      }),
      mailboxCategory: "results",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("missing_fields");
  });

  test("radiology_result without addressee fails as missing_fields", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        documentType: "radiology_result",
        referralInfo: undefined,
      }),
      mailboxCategory: "results",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("missing_fields");
  });

  test("referral letters don't require an addressee for the missing_fields check", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        documentType: "referral",
        referralInfo: undefined,
      }),
      mailboxCategory: "letters",
      settings: baseSettings,
    });
    // referral_letter has no per-type required-field rule today
    expect(result.eligible).toBe(true);
  });
});

describe("evaluateAutoRouteEligibility — confidence floor", () => {
  test("confidence below the floor fails as low_confidence", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({ classificationConfidence: 60 }),
      mailboxCategory: "letters",
      settings: { minClassificationConfidence: 75 },
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("low_confidence");
  });

  test("confidence equal to the floor passes", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({ classificationConfidence: 75 }),
      mailboxCategory: "letters",
      settings: { minClassificationConfidence: 75 },
    });
    expect(result.eligible).toBe(true);
  });

  test("a settings-driven floor of 0 lets every confidence pass", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({ classificationConfidence: 5 }),
      mailboxCategory: "letters",
      settings: { minClassificationConfidence: 0 },
    });
    expect(result.eligible).toBe(true);
  });
});

describe("evaluateAutoRouteEligibility — urgent documents", () => {
  test("urgent pathology_result (results mailbox, addressee present) fails as urgent_result", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        documentType: "pathology_result",
        isUrgent: true,
      }),
      mailboxCategory: "results",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("urgent_result");
    expect(result.suggestedCategory).toContain("Urgent");
  });

  test("urgent radiology_result fails as urgent_result", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        documentType: "radiology_result",
        isUrgent: true,
      }),
      mailboxCategory: "results",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("urgent_result");
  });

  test("urgent pathology_result WITHOUT addressee still fails as urgent_result (precedence over missing_fields)", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        documentType: "pathology_result",
        isUrgent: true,
        referralInfo: { senderName: "Lab" },
      }),
      mailboxCategory: "results",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("urgent_result");
  });

  test("urgent pathology_result with UNREADABLE patient still fails as urgent_result (precedence over extraction_failed)", () => {
    // Mirrors Nicole's de-identified example: URGENT stamp present but the
    // patient block is blacked out, so extraction can't read name/DOB. Urgent
    // is checked before extraction, so the doc is labelled urgent, not failed.
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        documentType: "pathology_result",
        isUrgent: true,
        success: false,
        data: { firstName: "UNKNOWN", lastName: "PATIENT", dob: "19000101", sex: "U" },
        referralInfo: { addresseeName: "Dr Cellina Ching" },
      }),
      mailboxCategory: "results",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("urgent_result");
  });

  test("urgent referral (letters mailbox) IS urgent-blocked (all doc types)", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        documentType: "referral",
        isUrgent: true,
      }),
      mailboxCategory: "letters",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("urgent_result");
  });

  test("urgent consult_letter IS urgent-blocked", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        documentType: "consult_letter",
        isUrgent: true,
      }),
      mailboxCategory: "letters",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("urgent_result");
  });

  test("urgent generic doc is urgent-blocked before unknown_doc_type (precedence)", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        documentType: "generic",
        isUrgent: true,
      }),
      mailboxCategory: "none",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("urgent_result");
  });

  test("non-urgent pathology_result with addressee is eligible (regression)", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        documentType: "pathology_result",
        isUrgent: false,
      }),
      mailboxCategory: "results",
      settings: baseSettings,
    });
    expect(result.eligible).toBe(true);
  });
});

describe("evaluateAutoRouteEligibility — failure ordering", () => {
  test("extraction_failed wins over every other failure", () => {
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({
        success: false,
        data: {
          firstName: "UNKNOWN",
          lastName: "PATIENT",
          dob: "19000101",
          sex: "U",
        },
        documentType: "pathology_result", // would also fail mailbox_mismatch on letters
        classificationConfidence: 5, // would also fail low_confidence
      }),
      mailboxCategory: "letters",
      settings: baseSettings,
    });
    expect(result.reason).toBe("extraction_failed");
  });

  test("unknown_doc_type beats mailbox_mismatch when doc type is generic", () => {
    // generic is in the "none" allowed set so technically not a mailbox
    // mismatch — make sure unknown_doc_type still triggers first.
    const result = evaluateAutoRouteEligibility({
      extraction: makeExtraction({ documentType: "generic" }),
      mailboxCategory: "none",
      settings: baseSettings,
    });
    expect(result.reason).toBe("unknown_doc_type");
  });
});
