import { describe, expect, test } from "bun:test";
import {
  cleanMedicareNumber,
  cleanPhone,
  cleanStringArray,
  convertDateToHL7,
  emptyPatientData,
  inferStateFromPostcode,
  normalizeDocumentType,
  normalizeSex,
  normalizeVisionToolInput,
  nullableString,
} from "./normalize";

describe("convertDateToHL7", () => {
  test("converts DD/MM/YYYY to YYYYMMDD", () => {
    expect(convertDateToHL7("08/11/1985")).toBe("19851108");
  });

  test("zero-pads single digit day and month", () => {
    expect(convertDateToHL7("5/6/1984")).toBe("19840605");
  });

  test("falls back to 19000101 when format is unrecognized", () => {
    expect(convertDateToHL7("not-a-date")).toBe("19000101");
  });
});

describe("normalizeDocumentType", () => {
  test("returns the value when it is a known document type", () => {
    expect(normalizeDocumentType("referral_letter")).toBe("referral_letter");
    expect(normalizeDocumentType("pathology_result")).toBe("pathology_result");
  });

  test("falls back to generic by default for unknown values", () => {
    expect(normalizeDocumentType("unknown")).toBe("generic");
    expect(normalizeDocumentType(undefined)).toBe("generic");
  });

  test("uses the provided fallback when the value is unknown", () => {
    expect(normalizeDocumentType("unknown", "consent_form")).toBe("consent_form");
  });
});

describe("normalizeSex", () => {
  test("preserves valid HL7 sex codes", () => {
    expect(normalizeSex("M")).toBe("M");
    expect(normalizeSex("F")).toBe("F");
    expect(normalizeSex("U")).toBe("U");
  });

  test("falls back to U for unknown or lowercase values", () => {
    expect(normalizeSex("m")).toBe("U");
    expect(normalizeSex("X")).toBe("U");
    expect(normalizeSex(null)).toBe("U");
  });
});

describe("nullableString", () => {
  test("returns trimmed string for non-empty inputs", () => {
    expect(nullableString("  hello  ")).toBe("hello");
  });

  test("returns undefined for empty / whitespace / non-string", () => {
    expect(nullableString("")).toBeUndefined();
    expect(nullableString("   ")).toBeUndefined();
    expect(nullableString(null)).toBeUndefined();
    expect(nullableString(42)).toBeUndefined();
  });
});

describe("cleanPhone", () => {
  test("strips brackets but keeps spaces and digits", () => {
    expect(cleanPhone("(0412) 345 678")).toBe("0412 345 678");
  });

  test("returns undefined for non-string input", () => {
    expect(cleanPhone(null)).toBeUndefined();
    expect(cleanPhone(undefined)).toBeUndefined();
  });

  test("returns undefined when nothing remains after cleaning", () => {
    expect(cleanPhone("()")).toBeUndefined();
  });
});

describe("cleanMedicareNumber", () => {
  test("strips spaces and returns digits-only", () => {
    expect(cleanMedicareNumber("1234 56789 0")).toBe("1234567890");
  });

  test("returns undefined for non-string input", () => {
    expect(cleanMedicareNumber(null)).toBeUndefined();
  });
});

describe("cleanStringArray", () => {
  test("trims each entry and drops empty/whitespace items", () => {
    expect(cleanStringArray(["  Dr A ", "", "Dr B", "  "])).toEqual([
      "Dr A",
      "Dr B",
    ]);
  });

  test("returns undefined for empty arrays", () => {
    expect(cleanStringArray([])).toBeUndefined();
    expect(cleanStringArray(["", " "])).toBeUndefined();
  });

  test("returns undefined for non-array input", () => {
    expect(cleanStringArray("not-an-array")).toBeUndefined();
  });
});

describe("inferStateFromPostcode", () => {
  test("maps NSW postcodes (1xxx and 2xxx)", () => {
    expect(inferStateFromPostcode("2000")).toBe("NSW");
    expect(inferStateFromPostcode("1234")).toBe("NSW");
  });

  test("maps VIC postcodes (3xxx)", () => {
    expect(inferStateFromPostcode("3000")).toBe("VIC");
  });

  test("maps QLD postcodes (4xxx)", () => {
    expect(inferStateFromPostcode("4000")).toBe("QLD");
  });

  test("returns undefined for non-4-digit postcodes", () => {
    expect(inferStateFromPostcode("99")).toBeUndefined();
    expect(inferStateFromPostcode("")).toBeUndefined();
  });
});

describe("emptyPatientData", () => {
  test("returns a fresh placeholder object", () => {
    expect(emptyPatientData()).toEqual({
      firstName: "UNKNOWN",
      lastName: "PATIENT",
      dob: "19000101",
      sex: "U",
    });
  });
});

describe("normalizeVisionToolInput — happy path", () => {
  test("returns a fully populated PatientData and ReferralInfo", () => {
    const result = normalizeVisionToolInput({
      documentType: "gp_referral",
      firstName: "  Jane  ",
      lastName: " Smith ",
      dob: "08/11/1985",
      sex: "F",
      phone: "(0412) 345 678",
      address: " 10 Collins St ",
      suburb: " Melbourne ",
      state: "VIC",
      postcode: "3000",
      medicareNo: "1234 56789 0",
      medicareRef: " 2 ",
      senderName: " Dr Sarah Jones ",
      senderClinic: " Springfield Medical ",
      senderProviderNumber: " 1234567A ",
      addresseeName: " Dr Michael Brown ",
      addresseeClinic: " BJC Health ",
      ccNames: ["Dr A. Maundrell", "Dr Lawrence Ong"],
    });

    expect(result.documentType).toBe("gp_referral");
    expect(result.data).toEqual({
      firstName: "Jane",
      lastName: "Smith",
      dob: "19851108",
      sex: "F",
      phone: "0412 345 678",
      address: "10 Collins St",
      suburb: "Melbourne",
      state: "VIC",
      postcode: "3000",
      medicareNo: "1234567890",
      medicareRef: "2",
    });
    expect(result.referralInfo).toEqual({
      senderName: "Dr Sarah Jones",
      senderClinic: "Springfield Medical",
      senderProviderNumber: "1234567A",
      addresseeName: "Dr Michael Brown",
      addresseeClinic: "BJC Health",
      ccNames: ["Dr A. Maundrell", "Dr Lawrence Ong"],
    });
    expect(result.warnings).toEqual([]);
  });
});

describe("normalizeVisionToolInput — postcode state inference", () => {
  test("infers state from postcode when state is missing", () => {
    const result = normalizeVisionToolInput({
      documentType: "generic",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
      state: null,
      postcode: "2000",
    });
    expect(result.data.state).toBe("NSW");
  });

  test("does not overwrite an explicit state with postcode inference", () => {
    const result = normalizeVisionToolInput({
      documentType: "generic",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
      state: "VIC",
      postcode: "2000",
    });
    expect(result.data.state).toBe("VIC");
  });
});

describe("normalizeVisionToolInput — invalid documentType", () => {
  test("emits a warning and falls back to provided default", () => {
    const result = normalizeVisionToolInput(
      {
        documentType: "not_real",
        firstName: "Jane",
        lastName: "Smith",
        dob: "08/11/1985",
        sex: "F",
      },
      "gp_referral"
    );
    expect(result.documentType).toBe("gp_referral");
    expect(result.warnings).toContain(
      "Vision extraction returned an invalid document type; defaulted to gp_referral"
    );
  });
});

describe("normalizeVisionToolInput — missing patient name and DOB", () => {
  test("returns UNKNOWN/PATIENT placeholders and warnings", () => {
    const result = normalizeVisionToolInput({
      documentType: "generic",
      firstName: null,
      lastName: " ",
      dob: "not-a-date",
      sex: "F",
    });

    expect(result.data.firstName).toBe("UNKNOWN");
    expect(result.data.lastName).toBe("PATIENT");
    expect(result.data.dob).toBe("19000101");
    expect(result.warnings).toContain(
      "Vision extraction could not determine patient name"
    );
    expect(result.warnings).toContain(
      "Vision extraction could not determine date of birth"
    );
  });
});

describe("normalizeVisionToolInput — sex normalization", () => {
  test("lowercase sex codes fall back to U", () => {
    const result = normalizeVisionToolInput({
      documentType: "generic",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "m",
    });
    expect(result.data.sex).toBe("U");
  });

  test("unknown sex value falls back to U", () => {
    const result = normalizeVisionToolInput({
      documentType: "generic",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "X",
    });
    expect(result.data.sex).toBe("U");
  });
});

describe("normalizeVisionToolInput — referral fields", () => {
  test("returns undefined referralInfo when no referral fields are populated", () => {
    const result = normalizeVisionToolInput({
      documentType: "consent_form",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
    });
    expect(result.referralInfo).toBeUndefined();
  });

  test("omits empty ccNames array from referralInfo", () => {
    const result = normalizeVisionToolInput({
      documentType: "gp_referral",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
      addresseeName: "Dr Michael Brown",
      ccNames: [],
    });
    expect(result.referralInfo?.ccNames).toBeUndefined();
    expect(result.referralInfo?.addresseeName).toBe("Dr Michael Brown");
  });

  test("trims and de-empties ccNames entries", () => {
    const result = normalizeVisionToolInput({
      documentType: "gp_referral",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
      ccNames: ["  Dr A. Maundrell ", "", "Dr Lawrence Ong"],
    });
    expect(result.referralInfo?.ccNames).toEqual([
      "Dr A. Maundrell",
      "Dr Lawrence Ong",
    ]);
  });
});

describe("normalizeVisionToolInput — senderProviderNumber validation", () => {
  test("preserves a valid alphanumeric provider number", () => {
    const result = normalizeVisionToolInput({
      documentType: "gp_referral",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
      senderName: "Dr Sarah Jones",
      senderProviderNumber: "1234567Z",
    });
    expect(result.referralInfo?.senderProviderNumber).toBe("1234567Z");
  });

  test("drops a provider number containing HL7 separators", () => {
    const result = normalizeVisionToolInput({
      documentType: "gp_referral",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
      senderName: "Dr Sarah Jones",
      senderProviderNumber: "1234567|EVIL",
    });
    expect(result.referralInfo?.senderProviderNumber).toBeUndefined();
  });

  test("trims whitespace around a valid provider number", () => {
    const result = normalizeVisionToolInput({
      documentType: "gp_referral",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
      senderName: "Dr Sarah Jones",
      senderProviderNumber: "  9000001A  ",
    });
    expect(result.referralInfo?.senderProviderNumber).toBe("9000001A");
  });

  test("drops an empty-string provider number", () => {
    const result = normalizeVisionToolInput({
      documentType: "gp_referral",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
      senderName: "Dr Sarah Jones",
      senderProviderNumber: "",
    });
    expect(result.referralInfo?.senderProviderNumber).toBeUndefined();
  });

  test("drops a non-string provider number", () => {
    const result = normalizeVisionToolInput({
      documentType: "gp_referral",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
      senderName: "Dr Sarah Jones",
      senderProviderNumber: 12345,
    });
    expect(result.referralInfo?.senderProviderNumber).toBeUndefined();
  });
});

describe("normalizeVisionToolInput — bad input", () => {
  test("returns empty patient data when raw input is not a record", () => {
    const result = normalizeVisionToolInput(null, "consent_form");
    expect(result.documentType).toBe("consent_form");
    expect(result.data).toEqual(emptyPatientData());
    expect(result.warnings).toEqual([]);
    expect(result.referralInfo).toBeUndefined();
  });
});

const basePatient = {
  firstName: "Jane",
  lastName: "Smith",
  dob: "08/11/1985",
  sex: "F",
} as const;

describe("normalizeVisionToolInput — heuristic promotion from result → referral", () => {
  test("promotes pathology_result with sender + addressee to referral_letter", () => {
    const result = normalizeVisionToolInput({
      documentType: "pathology_result",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Michael Brown",
    });
    expect(result.documentType).toBe("referral_letter");
    expect(
      result.warnings.some((w) =>
        w.startsWith("classification promoted: pathology_result → referral_letter")
      )
    ).toBe(true);
  });

  test("promotes radiology_result with Medicare-style sender provider number to gp_referral", () => {
    const result = normalizeVisionToolInput({
      documentType: "radiology_result",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      senderProviderNumber: "1234567X",
      addresseeName: "Dr Michael Brown",
    });
    expect(result.documentType).toBe("gp_referral");
    expect(
      result.warnings.some((w) =>
        w.startsWith("classification promoted: radiology_result → gp_referral")
      )
    ).toBe(true);
  });

  test("does not promote when only addressee is populated (no sender)", () => {
    const result = normalizeVisionToolInput({
      documentType: "pathology_result",
      ...basePatient,
      senderName: null,
      addresseeName: "Dr Michael Brown",
    });
    expect(result.documentType).toBe("pathology_result");
    expect(
      result.warnings.some((w) => w.startsWith("classification promoted"))
    ).toBe(false);
  });

  test("does not promote a pathology_result with empty referralInfo", () => {
    const result = normalizeVisionToolInput({
      documentType: "pathology_result",
      ...basePatient,
    });
    expect(result.documentType).toBe("pathology_result");
    expect(
      result.warnings.some((w) => w.startsWith("classification promoted"))
    ).toBe(false);
  });

  test("does not promote when sender and addressee names are identical", () => {
    const result = normalizeVisionToolInput({
      documentType: "pathology_result",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Sarah Jones",
    });
    expect(result.documentType).toBe("pathology_result");
    expect(
      result.warnings.some((w) => w.startsWith("classification promoted"))
    ).toBe(false);
  });

  test("does not promote when either name is suspiciously short", () => {
    const result = normalizeVisionToolInput({
      documentType: "pathology_result",
      ...basePatient,
      senderName: "Dr",
      addresseeName: "Dr Michael Brown",
    });
    expect(result.documentType).toBe("pathology_result");
    expect(
      result.warnings.some((w) => w.startsWith("classification promoted"))
    ).toBe(false);
  });

  test("promotes to referral_letter (not gp_referral) when sender provider number is not Medicare-style", () => {
    const result = normalizeVisionToolInput({
      documentType: "radiology_result",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      senderProviderNumber: "ABC123",
      addresseeName: "Dr Michael Brown",
    });
    expect(result.documentType).toBe("referral_letter");
  });

  test("does not promote non-result document types (e.g. consent_form)", () => {
    const result = normalizeVisionToolInput({
      documentType: "consent_form",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Michael Brown",
    });
    expect(result.documentType).toBe("consent_form");
  });

  test("preserves promotion when letterSubtype is undefined (back-compat)", () => {
    // Older fixtures and earlier model outputs omit letterSubtype entirely.
    // Promotion must still apply on the basis of sender+addressee signals.
    const result = normalizeVisionToolInput({
      documentType: "pathology_result",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Michael Brown",
    });
    expect(result.documentType).toBe("referral_letter");
  });

  test("preserves promotion when letterSubtype is 'referral'", () => {
    const result = normalizeVisionToolInput({
      documentType: "pathology_result",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Michael Brown",
      letterSubtype: "referral",
    });
    expect(result.documentType).toBe("referral_letter");
  });

  test("does NOT promote when letterSubtype is 'result_commentary' (gates promotion)", () => {
    const result = normalizeVisionToolInput({
      documentType: "pathology_result",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Michael Brown",
      letterSubtype: "result_commentary",
    });
    expect(result.documentType).toBe("pathology_result");
    expect(
      result.warnings.some((w) => w.startsWith("classification promoted"))
    ).toBe(false);
  });

  test("does NOT promote when letterSubtype is 'follow_up'", () => {
    const result = normalizeVisionToolInput({
      documentType: "radiology_result",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Michael Brown",
      letterSubtype: "follow_up",
    });
    expect(result.documentType).toBe("radiology_result");
    expect(
      result.warnings.some((w) => w.startsWith("classification promoted"))
    ).toBe(false);
  });
});

describe("normalizeVisionToolInput — letterSubtype demotion (referral → generic)", () => {
  test("demotes referral_letter to generic when letterSubtype is 'follow_up'", () => {
    const result = normalizeVisionToolInput({
      documentType: "referral_letter",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Michael Brown",
      letterSubtype: "follow_up",
    });
    expect(result.documentType).toBe("generic");
    expect(
      result.warnings.some(
        (w) => w.startsWith("classification demoted") && w.includes("follow_up")
      )
    ).toBe(true);
  });

  test("demotes referral_letter to generic when letterSubtype is 'discharge'", () => {
    const result = normalizeVisionToolInput({
      documentType: "referral_letter",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Michael Brown",
      letterSubtype: "discharge",
    });
    expect(result.documentType).toBe("generic");
    expect(
      result.warnings.some(
        (w) => w.startsWith("classification demoted") && w.includes("discharge")
      )
    ).toBe(true);
  });

  test("demotes referral_letter to generic when letterSubtype is 'result_commentary'", () => {
    const result = normalizeVisionToolInput({
      documentType: "referral_letter",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Michael Brown",
      letterSubtype: "result_commentary",
    });
    expect(result.documentType).toBe("generic");
    expect(
      result.warnings.some(
        (w) =>
          w.startsWith("classification demoted") &&
          w.includes("result_commentary")
      )
    ).toBe(true);
  });

  test("demotes gp_referral to generic when letterSubtype is 'other'", () => {
    const result = normalizeVisionToolInput({
      documentType: "gp_referral",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Michael Brown",
      letterSubtype: "other",
    });
    expect(result.documentType).toBe("generic");
    expect(
      result.warnings.some(
        (w) => w.startsWith("classification demoted") && w.includes("other")
      )
    ).toBe(true);
  });

  test("does NOT demote when letterSubtype is 'referral' (true referral)", () => {
    const result = normalizeVisionToolInput({
      documentType: "referral_letter",
      ...basePatient,
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Michael Brown",
      letterSubtype: "referral",
    });
    expect(result.documentType).toBe("referral_letter");
    expect(
      result.warnings.some((w) => w.startsWith("classification demoted"))
    ).toBe(false);
  });

  test("does NOT demote when letterSubtype is 'not_a_letter'", () => {
    // A non-letter classified as referral is implausible, but if it happens
    // we don't demote — let the operator see the original LLM verdict.
    const result = normalizeVisionToolInput({
      documentType: "referral_letter",
      ...basePatient,
      letterSubtype: "not_a_letter",
    });
    expect(result.documentType).toBe("referral_letter");
    expect(
      result.warnings.some((w) => w.startsWith("classification demoted"))
    ).toBe(false);
  });

  test("does NOT demote non-referral types even when letterSubtype is non-referral", () => {
    // pathology_result with letterSubtype: 'result_commentary' is plausible
    // (a lab report with a commentary letter cover) — but pathology_result is
    // not a referral type, so the demotion rule doesn't apply.
    const result = normalizeVisionToolInput({
      documentType: "pathology_result",
      ...basePatient,
      letterSubtype: "result_commentary",
    });
    expect(result.documentType).toBe("pathology_result");
    expect(
      result.warnings.some((w) => w.startsWith("classification demoted"))
    ).toBe(false);
  });
});

describe("normalizeVisionToolInput — letterSubtype propagation", () => {
  test("exposes letterSubtype on the normalized result", () => {
    const result = normalizeVisionToolInput({
      documentType: "referral_letter",
      ...basePatient,
      letterSubtype: "referral",
    });
    expect(result.letterSubtype).toBe("referral");
  });

  test("returns undefined letterSubtype when missing", () => {
    const result = normalizeVisionToolInput({
      documentType: "referral_letter",
      ...basePatient,
    });
    expect(result.letterSubtype).toBeUndefined();
  });

  test("drops an unknown letterSubtype value", () => {
    const result = normalizeVisionToolInput({
      documentType: "referral_letter",
      ...basePatient,
      letterSubtype: "nonsense",
    });
    expect(result.letterSubtype).toBeUndefined();
  });
});
