import { describe, expect, test } from "bun:test";
import {
  cleanMedicareNumber,
  cleanPhone,
  cleanProviderNumber,
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
    expect(normalizeDocumentType("referral")).toBe("referral");
    expect(normalizeDocumentType("pathology_result")).toBe("pathology_result");
    expect(normalizeDocumentType("consult_letter")).toBe("consult_letter");
  });

  test("maps legacy gp_referral and referral_letter to the canonical referral", () => {
    // Pre-collapse model outputs (or older fixtures) used `gp_referral` and
    // `referral_letter`. They must alias forward to `referral` rather than
    // falling through to the `generic` fallback.
    expect(normalizeDocumentType("gp_referral")).toBe("referral");
    expect(normalizeDocumentType("referral_letter")).toBe("referral");
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

describe("cleanProviderNumber", () => {
  test("accepts the canonical Medicare format with a space", () => {
    // Real Medicare provider numbers are usually displayed as "123456 7Y"
    // (6 digits + space + check digit + 1-char location). PDFs often carry
    // them in that shape and must survive extraction unchanged.
    expect(cleanProviderNumber("123456 7Y")).toBe("123456 7Y");
  });

  test("accepts seed-style 8-char alphanumeric", () => {
    expect(cleanProviderNumber("9000001Z")).toBe("9000001Z");
  });

  test("accepts hyphenated variants seen in some sender footers", () => {
    expect(cleanProviderNumber("9876-543T")).toBe("9876-543T");
  });

  test("trims surrounding whitespace but preserves interior spaces", () => {
    expect(cleanProviderNumber("  123456 7Y  ")).toBe("123456 7Y");
  });

  test("returns undefined when the value contains an HL7 separator", () => {
    expect(cleanProviderNumber("1234567|EVIL")).toBeUndefined();
    expect(cleanProviderNumber("ABC^DEF")).toBeUndefined();
    expect(cleanProviderNumber("XX&YY")).toBeUndefined();
    expect(cleanProviderNumber("A~B")).toBeUndefined();
    expect(cleanProviderNumber("PATH\\BAD")).toBeUndefined();
  });

  test("returns undefined when the value contains an ASCII control char", () => {
    expect(cleanProviderNumber("123456")).toBeUndefined();
  });

  test("returns undefined for empty / whitespace-only / non-string inputs", () => {
    expect(cleanProviderNumber("")).toBeUndefined();
    expect(cleanProviderNumber("   ")).toBeUndefined();
    expect(cleanProviderNumber(null)).toBeUndefined();
    expect(cleanProviderNumber(undefined)).toBeUndefined();
    expect(cleanProviderNumber(123)).toBeUndefined();
  });

  test("rejects absurdly long values", () => {
    expect(cleanProviderNumber("X".repeat(50))).toBeUndefined();
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
  test("returns a fully populated PatientData and ReferralInfo (legacy gp_referral aliases to referral)", () => {
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

    // Legacy `gp_referral` model output aliases forward to canonical `referral`.
    expect(result.documentType).toBe("referral");
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

  test("accepts the new consult_letter doc type", () => {
    const result = normalizeVisionToolInput({
      documentType: "consult_letter",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
      senderName: "Dr Irwin Lim",
      addresseeName: "Dr Mark Stevenson",
    });
    expect(result.documentType).toBe("consult_letter");
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
      "referral"
    );
    expect(result.documentType).toBe("referral");
    expect(result.warnings).toContain(
      "Vision extraction returned an invalid document type; defaulted to referral"
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

describe("normalizeVisionToolInput — no letterSubtype promote/demote", () => {
  // The previous heuristic promoted pathology_result with sender+addressee
  // to referral_letter. After the mailbox-classification refactor the mailbox
  // category prior subsumes that signal and normalize is no longer the place
  // to coerce a doc type. The eligibility gate flags the disagreement
  // instead.
  test("does NOT promote pathology_result with sender + addressee", () => {
    const result = normalizeVisionToolInput({
      documentType: "pathology_result",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Michael Brown",
    });
    expect(result.documentType).toBe("pathology_result");
    expect(result.warnings.some((w) => w.startsWith("classification promoted"))).toBe(
      false
    );
  });

  test("does NOT emit a classification-demoted warning (legacy referral_letter aliases to referral)", () => {
    const result = normalizeVisionToolInput({
      documentType: "referral_letter",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
      senderName: "Dr Sarah Jones",
      addresseeName: "Dr Michael Brown",
    });
    expect(result.documentType).toBe("referral");
    expect(result.warnings.some((w) => w.startsWith("classification demoted"))).toBe(
      false
    );
  });
});

describe("normalizeVisionToolInput — classificationConfidence", () => {
  test("returns the model's reported confidence as an integer", () => {
    const result = normalizeVisionToolInput({
      documentType: "referral_letter",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
      classificationConfidence: 87,
    });
    expect(result.classificationConfidence).toBe(87);
  });

  test("defaults to 100 when the model omits the field", () => {
    const result = normalizeVisionToolInput({
      documentType: "referral_letter",
      firstName: "Jane",
      lastName: "Smith",
      dob: "08/11/1985",
      sex: "F",
    });
    expect(result.classificationConfidence).toBe(100);
  });

  test("clamps out-of-range values to 0-100", () => {
    expect(
      normalizeVisionToolInput({
        documentType: "generic",
        firstName: "X",
        lastName: "Y",
        dob: "08/11/1985",
        sex: "F",
        classificationConfidence: 250,
      }).classificationConfidence
    ).toBe(100);
    expect(
      normalizeVisionToolInput({
        documentType: "generic",
        firstName: "X",
        lastName: "Y",
        dob: "08/11/1985",
        sex: "F",
        classificationConfidence: -5,
      }).classificationConfidence
    ).toBe(0);
  });
});
