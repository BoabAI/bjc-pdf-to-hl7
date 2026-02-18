import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { extractPatientData, formatExtractedData } from "./pdf-parser";

// =============================================================================
// Test PDF Paths (nested directory structure)
// =============================================================================

const PDF_DIR = join(import.meta.dir, "../docs/input PDF");

// Original real-world PDFs
const CONSENT_FORM_PATH = join(
  PDF_DIR,
  "originals/Patient_Information_and_Consent_Form_2025-12-10T14-09-58_29503708_0 (1).pdf"
);
const REFERRAL_DUMMY_PATH = join(PDF_DIR, "originals/Referral_dummy.pdf");
const GP_REFERRAL_PATH = join(PDF_DIR, "originals/BP2026012137327.pdf");

// Generated test PDFs - Specialist Referrals
const TEST_SPECIALIST = join(PDF_DIR, "specialist-referrals/test_specialist_referral.pdf");
const TEST_SPECIALIST_REVERSE = join(PDF_DIR, "specialist-referrals/test_specialist_referral_reverse_name.pdf");

// Generated test PDFs - GP Referrals
const TEST_GP = join(PDF_DIR, "gp-referrals/test_gp_referral.pdf");
const TEST_GP_MALE = join(PDF_DIR, "gp-referrals/test_gp_referral_male.pdf");
const TEST_GP_MISS = join(PDF_DIR, "gp-referrals/test_gp_referral_miss.pdf");

// Generated test PDFs - Consent Forms
const TEST_CONSENT = join(PDF_DIR, "consent-forms/test_consent_form.pdf");
const TEST_CONSENT_FEMALE = join(PDF_DIR, "consent-forms/test_consent_form_female.pdf");

// Generated test PDFs - Edge Cases (Minimal)
const TEST_EDGE_MINIMAL = join(PDF_DIR, "edge-cases/minimal/test_edge_minimal_referral.pdf");
const TEST_EDGE_SPECIAL_CHARS = join(PDF_DIR, "edge-cases/minimal/test_edge_special_chars.pdf");
const TEST_EDGE_SINGLE_DIGIT_DATES = join(PDF_DIR, "edge-cases/minimal/test_edge_single_digit_dates.pdf");
const TEST_EDGE_NO_MEDICARE = join(PDF_DIR, "edge-cases/minimal/test_edge_no_medicare.pdf");
const TEST_EDGE_EMPTY = join(PDF_DIR, "edge-cases/minimal/test_edge_empty.pdf");
const TEST_EDGE_LONG_NAMES = join(PDF_DIR, "edge-cases/minimal/test_edge_long_names.pdf");
const TEST_EDGE_DEAR_NAME = join(PDF_DIR, "edge-cases/minimal/test_edge_dear_name.pdf");

// Generated test PDFs - Edge Cases (States)
const TEST_EDGE_QLD = join(PDF_DIR, "edge-cases/states/test_edge_qld_patient.pdf");
const TEST_EDGE_VIC = join(PDF_DIR, "edge-cases/states/test_edge_vic_patient.pdf");
const TEST_EDGE_WA = join(PDF_DIR, "edge-cases/states/test_edge_wa_patient.pdf");
const TEST_EDGE_SA = join(PDF_DIR, "edge-cases/states/test_edge_sa_patient.pdf");
const TEST_EDGE_TAS = join(PDF_DIR, "edge-cases/states/test_edge_tas_patient.pdf");
const TEST_EDGE_NT = join(PDF_DIR, "edge-cases/states/test_edge_nt_patient.pdf");

// Generated test PDFs - Skewed (scanned documents)
const TEST_SKEWED_SPECIALIST = join(PDF_DIR, "edge-cases/skewed/test_skewed_specialist.pdf");
const TEST_SKEWED_GP = join(PDF_DIR, "edge-cases/skewed/test_skewed_gp_referral.pdf");
const TEST_SKEWED_CONSENT = join(PDF_DIR, "edge-cases/skewed/test_skewed_consent.pdf");

// Generated test PDFs - Grainy (fax-like)
const TEST_GRAINY_SPECIALIST = join(PDF_DIR, "edge-cases/grainy/test_grainy_specialist.pdf");
const TEST_GRAINY_GP = join(PDF_DIR, "edge-cases/grainy/test_grainy_gp_referral.pdf");
const TEST_GRAINY_CONSENT = join(PDF_DIR, "edge-cases/grainy/test_grainy_consent.pdf");

// Generated test PDFs - Multicultural Names
const TEST_MULTI_VIETNAMESE = join(PDF_DIR, "edge-cases/multicultural/test_multicultural_vietnamese.pdf");
const TEST_MULTI_CHINESE = join(PDF_DIR, "edge-cases/multicultural/test_multicultural_chinese.pdf");
const TEST_MULTI_ARABIC = join(PDF_DIR, "edge-cases/multicultural/test_multicultural_arabic.pdf");
const TEST_MULTI_INDIAN = join(PDF_DIR, "edge-cases/multicultural/test_multicultural_indian.pdf");
const TEST_MULTI_GREEK = join(PDF_DIR, "edge-cases/multicultural/test_multicultural_greek.pdf");
const TEST_MULTI_PACIFIC = join(PDF_DIR, "edge-cases/multicultural/test_multicultural_pacific_islander.pdf");
const TEST_MULTI_KOREAN = join(PDF_DIR, "edge-cases/multicultural/test_multicultural_korean.pdf");
const TEST_MULTI_LEBANESE = join(PDF_DIR, "edge-cases/multicultural/test_multicultural_lebanese.pdf");

// =============================================================================
// Document Type Detection
// =============================================================================

describe("Document Type Detection", () => {
  test("detects consent form correctly (original)", async () => {
    const result = await extractPatientData(readFileSync(CONSENT_FORM_PATH));
    expect(result.documentType).toBe("consent_form");
  });

  test("detects referral letter correctly (original)", async () => {
    const result = await extractPatientData(readFileSync(REFERRAL_DUMMY_PATH));
    expect(result.documentType).toBe("referral_letter");
  });

  test("detects GP referral correctly (original)", async () => {
    const result = await extractPatientData(readFileSync(GP_REFERRAL_PATH));
    expect(result.documentType).toBe("gp_referral");
  });

  test("detects specialist referral (generated)", async () => {
    const result = await extractPatientData(readFileSync(TEST_SPECIALIST));
    expect(result.documentType).toBe("referral_letter");
  });

  test("detects specialist referral with reverse name format", async () => {
    const result = await extractPatientData(readFileSync(TEST_SPECIALIST_REVERSE));
    expect(result.documentType).toBe("referral_letter");
  });

  test("detects GP referral (generated)", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP));
    expect(result.documentType).toBe("gp_referral");
  });

  test("detects consent form (generated)", async () => {
    const result = await extractPatientData(readFileSync(TEST_CONSENT));
    expect(result.documentType).toBe("consent_form");
  });

  test("detects minimal referral (no letterhead)", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_MINIMAL));
    expect(result.documentType).toBe("referral_letter");
  });

  test("detects 'Dear Elaine,' format as GP referral", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_DEAR_NAME));
    expect(result.documentType).toBe("gp_referral");
  });

  test("detects empty PDF as consent_form (fallback)", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_EMPTY));
    expect(result.documentType).toBe("consent_form");
    expect(result.success).toBe(false);
  });

  test("respects forced document type over auto-detection", async () => {
    const pdfBuffer = readFileSync(TEST_SPECIALIST);
    const result = await extractPatientData(pdfBuffer, "consent_form");
    expect(result.documentType).toBe("consent_form");
  });

  test("auto-detects when forceDocumentType is 'auto'", async () => {
    const pdfBuffer = readFileSync(TEST_SPECIALIST);
    const result = await extractPatientData(pdfBuffer, "auto");
    expect(result.documentType).toBe("referral_letter");
  });
});

// =============================================================================
// Specialist Referral Extraction
// =============================================================================

describe("Specialist Referral - Original Dummy", () => {
  test("extracts patient name from RE: line", async () => {
    const result = await extractPatientData(readFileSync(REFERRAL_DUMMY_PATH));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("John");
    expect(result.data.lastName).toBe("SMITH");
  });

  test("extracts DOB", async () => {
    const result = await extractPatientData(readFileSync(REFERRAL_DUMMY_PATH));
    expect(result.data.dob).toBe("19800615");
  });

  test("extracts phone number", async () => {
    const result = await extractPatientData(readFileSync(REFERRAL_DUMMY_PATH));
    expect(result.data.phone).toBe("0400000000");
  });

  test("infers sex from pronouns", async () => {
    const result = await extractPatientData(readFileSync(REFERRAL_DUMMY_PATH));
    expect(result.data.sex).toBe("M");
  });

  test("extracts address components", async () => {
    const result = await extractPatientData(readFileSync(REFERRAL_DUMMY_PATH));
    if (result.data.postcode) {
      expect(result.data.postcode).toBe("2000");
      expect(result.data.state).toBe("NSW");
    }
  });

  test("does not warn about missing Medicare", async () => {
    const result = await extractPatientData(readFileSync(REFERRAL_DUMMY_PATH));
    const medicareWarning = result.warnings.find((w) =>
      w.toLowerCase().includes("medicare")
    );
    expect(medicareWarning).toBeUndefined();
  });
});

describe("Specialist Referral - Generated (FirstName LASTNAME format)", () => {
  test("extracts name: Emma WILLIAMS", async () => {
    const result = await extractPatientData(readFileSync(TEST_SPECIALIST));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Emma");
    expect(result.data.lastName).toBe("WILLIAMS");
  });

  test("extracts DOB: 23/04/1985 -> 19850423", async () => {
    const result = await extractPatientData(readFileSync(TEST_SPECIALIST));
    expect(result.data.dob).toBe("19850423");
  });

  test("infers female sex from she/her pronouns", async () => {
    const result = await extractPatientData(readFileSync(TEST_SPECIALIST));
    expect(result.data.sex).toBe("F");
  });

  test("extracts phone: 0412 345 678 -> 0412345678", async () => {
    const result = await extractPatientData(readFileSync(TEST_SPECIALIST));
    expect(result.data.phone).toBe("0412345678");
  });

  test("extracts full address", async () => {
    const result = await extractPatientData(readFileSync(TEST_SPECIALIST));
    expect(result.data.address).toBe("45 Harbour Street");
    expect(result.data.suburb).toBe("PYRMONT");
    expect(result.data.state).toBe("NSW");
    expect(result.data.postcode).toBe("2009");
  });
});

describe("Specialist Referral - LASTNAME, Firstname format", () => {
  test("extracts reversed name: JOHNSON, Robert", async () => {
    const result = await extractPatientData(readFileSync(TEST_SPECIALIST_REVERSE));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Robert");
    expect(result.data.lastName).toBe("JOHNSON");
  });

  test("extracts DOB: 08/11/1972 -> 19721108", async () => {
    const result = await extractPatientData(readFileSync(TEST_SPECIALIST_REVERSE));
    expect(result.data.dob).toBe("19721108");
  });

  test("infers male sex from he/him/his pronouns", async () => {
    const result = await extractPatientData(readFileSync(TEST_SPECIALIST_REVERSE));
    expect(result.data.sex).toBe("M");
  });

  test("extracts address", async () => {
    const result = await extractPatientData(readFileSync(TEST_SPECIALIST_REVERSE));
    expect(result.data.address).toBe("12 King Street");
    expect(result.data.suburb).toBe("NEWTOWN");
    expect(result.data.postcode).toBe("2042");
  });
});

// =============================================================================
// GP Referral Extraction
// =============================================================================

describe("GP Referral - Original Best Practice (BP2026012137327)", () => {
  test("detects as gp_referral", async () => {
    const result = await extractPatientData(readFileSync(GP_REFERRAL_PATH));
    expect(result.documentType).toBe("gp_referral");
  });

  test("extracts name from 're. Mr Tim Ball' format", async () => {
    const result = await extractPatientData(readFileSync(GP_REFERRAL_PATH));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Tim");
    expect(result.data.lastName).toBe("Ball");
  });

  test("extracts DOB from separate line", async () => {
    const result = await extractPatientData(readFileSync(GP_REFERRAL_PATH));
    expect(result.data.dob).toBe("19680918");
  });

  test("extracts sex from title (Mr = Male)", async () => {
    const result = await extractPatientData(readFileSync(GP_REFERRAL_PATH));
    expect(result.data.sex).toBe("M");
  });

  test("extracts Medicare number", async () => {
    const result = await extractPatientData(readFileSync(GP_REFERRAL_PATH));
    expect(result.data.medicareNo).toBe("2673291844");
  });

  test("extracts mobile phone", async () => {
    const result = await extractPatientData(readFileSync(GP_REFERRAL_PATH));
    expect(result.data.phone).toBe("0468900291");
  });

  test("extracts address from multi-line format", async () => {
    const result = await extractPatientData(readFileSync(GP_REFERRAL_PATH));
    expect(result.data.address).toBe("274/4 The Crescent");
    expect(result.data.suburb).toBe("Wentworth Point");
    expect(result.data.postcode).toBe("2127");
    expect(result.data.state).toBe("NSW");
  });

  test("has no warnings for complete GP referral", async () => {
    const result = await extractPatientData(readFileSync(GP_REFERRAL_PATH));
    expect(result.warnings).toHaveLength(0);
  });
});

describe("GP Referral - Mrs title (Generated)", () => {
  test("extracts name from 're. Mrs Sarah Thompson'", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Sarah");
    expect(result.data.lastName).toBe("Thompson");
  });

  test("extracts DOB: 15/03/1990", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP));
    expect(result.data.dob).toBe("19900315");
  });

  test("extracts sex as Female from Mrs title", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP));
    expect(result.data.sex).toBe("F");
  });

  test("extracts phone without extra digits (regression)", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP));
    expect(result.data.phone).toBe("0434567890");
    expect(result.data.phone?.length).toBe(10);
  });

  test("extracts Medicare", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP));
    expect(result.data.medicareNo).toBe("3456789012");
  });

  test("extracts address", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP));
    expect(result.data.address).toBe("18 Victoria Road");
    expect(result.data.suburb).toBe("Parramatta");
    expect(result.data.postcode).toBe("2150");
    expect(result.data.state).toBe("NSW");
  });
});

describe("GP Referral - Mr title with apostrophe name", () => {
  test("extracts O'Connor surname correctly", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP_MALE));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("David");
    expect(result.data.lastName).toBe("O'Connor");
  });

  test("extracts sex as Male from Mr title", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP_MALE));
    expect(result.data.sex).toBe("M");
  });

  test("extracts 11-digit Medicare (10 + ref)", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP_MALE));
    expect(result.data.medicareNo).toBe("4987654321");
    expect(result.data.medicareRef).toBe("1");
  });

  test("extracts unit address format (7/88)", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP_MALE));
    expect(result.data.address).toBe("7/88 Campbell Parade");
    expect(result.data.suburb).toBe("Bondi Beach");
    expect(result.data.postcode).toBe("2026");
  });
});

describe("GP Referral - Miss title", () => {
  test("extracts name with Miss title", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP_MISS));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Aisha");
    expect(result.data.lastName).toBe("Khan");
  });

  test("extracts sex as Female from Miss title", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP_MISS));
    expect(result.data.sex).toBe("F");
  });

  test("extracts Unit address format", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP_MISS));
    expect(result.data.address).toBe("Unit 4, 22 Flinders Lane");
  });

  test("infers VIC state from 3000 postcode", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP_MISS));
    expect(result.data.postcode).toBe("3000");
    expect(result.data.state).toBe("VIC");
  });
});

// =============================================================================
// Consent Form Extraction
// =============================================================================

describe("Consent Form - Original (Regression)", () => {
  test("still extracts data from consent forms", async () => {
    const result = await extractPatientData(readFileSync(CONSENT_FORM_PATH));
    expect(result.documentType).toBe("consent_form");
    expect(result.data).toHaveProperty("firstName");
    expect(result.data).toHaveProperty("lastName");
    expect(result.data).toHaveProperty("dob");
    expect(result.data).toHaveProperty("sex");
  });

  test("warns about missing Medicare in consent forms", async () => {
    const result = await extractPatientData(readFileSync(CONSENT_FORM_PATH));
    if (!result.data.medicareNo) {
      const medicareWarning = result.warnings.find((w) =>
        w.toLowerCase().includes("medicare")
      );
      expect(medicareWarning).toBeDefined();
    }
  });
});

describe("Consent Form - Male (Generated)", () => {
  test("extracts full patient data", async () => {
    const result = await extractPatientData(readFileSync(TEST_CONSENT));
    expect(result.success).toBe(true);
    expect(result.documentType).toBe("consent_form");
    expect(result.data.firstName).toBe("James");
    expect(result.data.lastName).toBe("Patterson");
  });

  test("extracts DOB: 14/06/1978", async () => {
    const result = await extractPatientData(readFileSync(TEST_CONSENT));
    expect(result.data.dob).toBe("19780614");
  });

  test("extracts sex from Mr title", async () => {
    const result = await extractPatientData(readFileSync(TEST_CONSENT));
    expect(result.data.sex).toBe("M");
  });

  test("extracts phone", async () => {
    const result = await extractPatientData(readFileSync(TEST_CONSENT));
    expect(result.data.phone).toBe("0412987654");
  });

  test("extracts address, suburb, postcode", async () => {
    const result = await extractPatientData(readFileSync(TEST_CONSENT));
    expect(result.data.address).toBe("25 Pitt Street");
    expect(result.data.suburb).toBe("Redfern");
    expect(result.data.postcode).toBe("2016");
    expect(result.data.state).toBe("NSW");
  });

  test("extracts Medicare with ref", async () => {
    const result = await extractPatientData(readFileSync(TEST_CONSENT));
    expect(result.data.medicareNo).toBe("5678901234");
    expect(result.data.medicareRef).toBe("2");
  });
});

describe("Consent Form - Female (Generated)", () => {
  test("extracts full patient data", async () => {
    const result = await extractPatientData(readFileSync(TEST_CONSENT_FEMALE));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Priya");
    expect(result.data.lastName).toBe("Sharma");
  });

  test("extracts sex from Ms title", async () => {
    const result = await extractPatientData(readFileSync(TEST_CONSENT_FEMALE));
    expect(result.data.sex).toBe("F");
  });

  test("extracts DOB: 01/01/2000 (edge: first of year)", async () => {
    const result = await extractPatientData(readFileSync(TEST_CONSENT_FEMALE));
    expect(result.data.dob).toBe("20000101");
  });

  test("extracts Medicare with ref=1", async () => {
    const result = await extractPatientData(readFileSync(TEST_CONSENT_FEMALE));
    expect(result.data.medicareNo).toBe("2345678901");
    expect(result.data.medicareRef).toBe("1");
  });
});

// =============================================================================
// Edge Cases - Special Characters in Names
// =============================================================================

describe("Edge Case - Apostrophe/Hyphen in Names (O'Brien-Smith)", () => {
  test("extracts full hyphenated-apostrophe surname", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_SPECIAL_CHARS));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Mary");
    expect(result.data.lastName).toBe("O'Brien-Smith");
  });

  test("extracts sex from Mrs title", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_SPECIAL_CHARS));
    expect(result.data.sex).toBe("F");
  });

  test("extracts address starting with fraction (3/45)", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_SPECIAL_CHARS));
    expect(result.data.address).toBe("3/45 O'Connell Street");
  });

  test("extracts phone correctly (no extra digits)", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_SPECIAL_CHARS));
    expect(result.data.phone).toBe("0467890123");
    expect(result.data.phone?.length).toBe(10);
  });
});

describe("Edge Case - Very Long Names", () => {
  test("extracts long surname without truncation", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_LONG_NAMES));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Bartholomew");
    expect(result.data.lastName).toBe("Wolfeschlegelsteinhausenbergerdorff");
  });

  test("extracts address with long street name", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_LONG_NAMES));
    expect(result.data.address).toBe("123 Very Long Street Name Boulevard");
    expect(result.data.suburb).toBe("Woolloomooloo");
  });
});

// =============================================================================
// Edge Cases - Date Parsing
// =============================================================================

describe("Edge Case - Single-Digit Dates", () => {
  test("handles single-digit day and month: 3/2/1995 -> 19950203", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_SINGLE_DIGIT_DATES));
    expect(result.data.dob).toBe("19950203");
  });

  test("extracts short address", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_SINGLE_DIGIT_DATES));
    expect(result.data.address).toBe("1 Short St");
  });
});

describe("Edge Case - Elderly Patient (DOB 31/12/1949)", () => {
  test("handles year 1949 correctly", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_WA));
    expect(result.data.dob).toBe("19491231");
  });
});

describe("Edge Case - Young Patient (DOB 02/07/2001)", () => {
  test("handles year 2001 correctly", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP_MISS));
    expect(result.data.dob).toBe("20010702");
  });
});

// =============================================================================
// Edge Cases - Australian State Inference from Postcode
// =============================================================================

describe("Edge Case - State Inference from Postcodes", () => {
  test("NSW: 2xxx postcodes", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP));
    expect(result.data.postcode).toBe("2150");
    expect(result.data.state).toBe("NSW");
  });

  test("VIC: 3xxx postcodes", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_VIC));
    expect(result.data.postcode).toBe("3141");
    expect(result.data.state).toBe("VIC");
  });

  test("QLD: 4xxx postcodes", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_QLD));
    expect(result.data.postcode).toBe("4000");
    expect(result.data.state).toBe("QLD");
  });

  test("SA: 5xxx postcodes", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_SA));
    expect(result.data.postcode).toBe("5000");
    expect(result.data.state).toBe("SA");
  });

  test("WA: 6xxx postcodes", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_WA));
    expect(result.data.postcode).toBe("6009");
    expect(result.data.state).toBe("WA");
  });

  test("TAS: 7xxx postcodes", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_TAS));
    expect(result.data.postcode).toBe("7000");
    expect(result.data.state).toBe("TAS");
  });

  test("NT: 0xxx postcodes", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_NT));
    expect(result.data.postcode).toBe("0800");
    expect(result.data.state).toBe("NT");
  });
});

// =============================================================================
// Edge Cases - Minimal / Missing Data
// =============================================================================

describe("Edge Case - Minimal Referral (no phone, no address)", () => {
  test("extracts name and DOB from RE: line", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_MINIMAL));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Mark");
    expect(result.data.lastName).toBe("DAVIES");
    expect(result.data.dob).toBe("19600930");
  });

  test("infers male sex from pronouns", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_MINIMAL));
    expect(result.data.sex).toBe("M");
  });

  test("warns about missing phone and address", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_MINIMAL));
    expect(result.warnings).toContain("Could not extract phone number");
    expect(result.warnings).toContain("Could not extract address");
  });

  test("has no Medicare (not expected for specialist)", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_MINIMAL));
    expect(result.data.medicareNo).toBeUndefined();
  });
});

describe("Edge Case - No Medicare Number", () => {
  test("extracts patient without Medicare", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_NO_MEDICARE));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Nina");
    expect(result.data.lastName).toBe("Petrova");
    expect(result.data.medicareNo).toBeUndefined();
  });

  test("still extracts Ms title as Female", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_NO_MEDICARE));
    expect(result.data.sex).toBe("F");
  });
});

describe("Edge Case - Empty PDF", () => {
  test("returns success=false for empty PDF", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_EMPTY));
    expect(result.success).toBe(false);
  });

  test("returns default patient data", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_EMPTY));
    expect(result.data.firstName).toBe("UNKNOWN");
    expect(result.data.lastName).toBe("PATIENT");
    expect(result.data.dob).toBe("19000101");
    expect(result.data.sex).toBe("U");
  });

  test("warns about no extractable text", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_EMPTY));
    expect(result.warnings).toContain("PDF contains no extractable text");
  });
});

describe("Edge Case - 'Dear Elaine,' (first name only greeting)", () => {
  test("detects as GP referral", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_DEAR_NAME));
    expect(result.documentType).toBe("gp_referral");
  });

  test("extracts patient name correctly", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_DEAR_NAME));
    expect(result.data.firstName).toBe("Peter");
    expect(result.data.lastName).toBe("Zhang");
  });
});

// =============================================================================
// Edge Cases - Invalid / Corrupt Input
// =============================================================================

describe("Edge Case - Invalid Input", () => {
  test("handles non-PDF buffer gracefully", async () => {
    const notPdf = Buffer.from("This is not a PDF file at all");
    const result = await extractPatientData(notPdf);
    expect(result.success).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("handles empty buffer gracefully", async () => {
    const empty = Buffer.alloc(0);
    const result = await extractPatientData(empty);
    expect(result.success).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("returns default data for corrupt PDF", async () => {
    const corrupt = Buffer.from("%PDF-1.4 corrupt content ###");
    const result = await extractPatientData(corrupt);
    // Should not throw, should return graceful failure
    expect(result.data).toHaveProperty("firstName");
    expect(result.data).toHaveProperty("lastName");
  });
});

// =============================================================================
// Phone Number Extraction (Regression Tests)
// =============================================================================

describe("Phone Number Extraction - No Trailing Digits (Regression)", () => {
  test("GP referral phone: exactly 10 digits", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP));
    expect(result.data.phone).toBe("0434567890");
    expect(result.data.phone?.length).toBe(10);
  });

  test("GP referral male phone: exactly 10 digits", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP_MALE));
    expect(result.data.phone).toBe("0401222333");
    expect(result.data.phone?.length).toBe(10);
  });

  test("GP referral Miss phone: exactly 10 digits", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP_MISS));
    expect(result.data.phone).toBe("0455123456");
    expect(result.data.phone?.length).toBe(10);
  });

  test("specialist referral phone: exactly 10 digits", async () => {
    const result = await extractPatientData(readFileSync(TEST_SPECIALIST));
    expect(result.data.phone).toBe("0412345678");
    expect(result.data.phone?.length).toBe(10);
  });

  test("QLD patient phone: exactly 10 digits", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_QLD));
    expect(result.data.phone).toBe("0422333444");
    expect(result.data.phone?.length).toBe(10);
  });

  test("NT patient phone: exactly 10 digits", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_NT));
    expect(result.data.phone).toBe("0488111333");
    expect(result.data.phone?.length).toBe(10);
  });
});

// =============================================================================
// Address Extraction (Regression Tests)
// =============================================================================

describe("Address Extraction - GP Referrals (Regression)", () => {
  test("extracts address when between DOB and Medicare (original BP format)", async () => {
    const result = await extractPatientData(readFileSync(GP_REFERRAL_PATH));
    expect(result.data.address).toBe("274/4 The Crescent");
  });

  test("extracts address when after Medicare/Mobile (generated format)", async () => {
    const result = await extractPatientData(readFileSync(TEST_GP));
    expect(result.data.address).toBe("18 Victoria Road");
  });

  test("does not confuse clinic letterhead with patient address", async () => {
    // Original BP PDF has clinic at "Shop 4E /4 The Piazza, Wentworth Point"
    // Patient address is "274/4 The Crescent, Wentworth Point"
    const result = await extractPatientData(readFileSync(GP_REFERRAL_PATH));
    expect(result.data.address).not.toContain("Piazza");
    expect(result.data.address).toBe("274/4 The Crescent");
  });

  test("extracts 'Dear Name' referral address", async () => {
    const result = await extractPatientData(readFileSync(TEST_EDGE_DEAR_NAME));
    expect(result.data.address).toBe("9 Circular Quay");
    expect(result.data.suburb).toBe("The Rocks");
  });
});

// =============================================================================
// Skewed Documents (Scanned at angle)
// =============================================================================

describe("Skewed Documents - Scanned at Angle", () => {
  test("extracts specialist referral from skewed PDF", async () => {
    const result = await extractPatientData(readFileSync(TEST_SKEWED_SPECIALIST));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Michael");
    expect(result.data.lastName).toBe("CHEN");
    expect(result.data.dob).toBe("19680612");
    expect(result.data.phone).toBe("0433111222");
  });

  test("extracts GP referral from skewed PDF", async () => {
    const result = await extractPatientData(readFileSync(TEST_SKEWED_GP));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Angela");
    expect(result.data.lastName).toBe("Morris");
    expect(result.data.dob).toBe("19760520");
    expect(result.data.phone).toBe("0444555666");
  });

  test("extracts consent form from skewed PDF", async () => {
    const result = await extractPatientData(readFileSync(TEST_SKEWED_CONSENT));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Margaret");
    expect(result.data.lastName).toBe("Fletcher");
    expect(result.data.dob).toBe("19520328");
    expect(result.data.sex).toBe("F");
  });
});

// =============================================================================
// Grainy / Fax-like Documents
// =============================================================================

describe("Grainy Documents - Fax-like Quality", () => {
  test("extracts specialist referral from grainy PDF", async () => {
    const result = await extractPatientData(readFileSync(TEST_GRAINY_SPECIALIST));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Rachel");
    expect(result.data.lastName).toBe("GREEN");
    expect(result.data.dob).toBe("19910907");
    expect(result.data.phone).toBe("0422888999");
  });

  test("extracts GP referral from grainy PDF", async () => {
    const result = await extractPatientData(readFileSync(TEST_GRAINY_GP));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Graham");
    expect(result.data.lastName).toBe("Harris");
    expect(result.data.dob).toBe("19580115");
    expect(result.data.phone).toBe("0466777888");
  });

  test("extracts consent form from grainy PDF", async () => {
    const result = await extractPatientData(readFileSync(TEST_GRAINY_CONSENT));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Kevin");
    expect(result.data.lastName).toBe("Tran");
    expect(result.data.dob).toBe("19851122");
  });
});

// =============================================================================
// Multicultural Names
// =============================================================================

describe("Multicultural Names - Vietnamese", () => {
  test("extracts Mai Nguyen", async () => {
    const result = await extractPatientData(readFileSync(TEST_MULTI_VIETNAMESE));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Mai");
    expect(result.data.lastName).toBe("Nguyen");
    expect(result.data.sex).toBe("F");
  });

  test("extracts address in Cabramatta", async () => {
    const result = await extractPatientData(readFileSync(TEST_MULTI_VIETNAMESE));
    expect(result.data.suburb).toBe("Cabramatta");
    expect(result.data.postcode).toBe("2166");
  });
});

describe("Multicultural Names - Chinese", () => {
  test("extracts Wei ZHANG (specialist format)", async () => {
    const result = await extractPatientData(readFileSync(TEST_MULTI_CHINESE));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Wei");
    expect(result.data.lastName).toBe("ZHANG");
    expect(result.data.dob).toBe("19651014");
  });
});

describe("Multicultural Names - Arabic (hyphenated)", () => {
  test("extracts Mohammed Al-Rashidi", async () => {
    const result = await extractPatientData(readFileSync(TEST_MULTI_ARABIC));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Mohammed");
    expect(result.data.lastName).toBe("Al-Rashidi");
  });

  test("extracts address in Auburn", async () => {
    const result = await extractPatientData(readFileSync(TEST_MULTI_ARABIC));
    expect(result.data.suburb).toBe("Auburn");
    expect(result.data.postcode).toBe("2144");
  });
});

describe("Multicultural Names - Indian (consent form)", () => {
  test("extracts Rajesh Patel from consent form", async () => {
    const result = await extractPatientData(readFileSync(TEST_MULTI_INDIAN));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Rajesh");
    expect(result.data.lastName).toBe("Patel");
    expect(result.data.sex).toBe("M");
  });

  test("extracts Medicare", async () => {
    const result = await extractPatientData(readFileSync(TEST_MULTI_INDIAN));
    expect(result.data.medicareNo).toBe("4321098765");
    expect(result.data.medicareRef).toBe("1");
  });
});

describe("Multicultural Names - Greek", () => {
  test("extracts Eleni Papadopoulos", async () => {
    const result = await extractPatientData(readFileSync(TEST_MULTI_GREEK));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Eleni");
    expect(result.data.lastName).toBe("Papadopoulos");
    expect(result.data.sex).toBe("F");
  });
});

describe("Multicultural Names - Pacific Islander (Tongan)", () => {
  test("extracts Sione TUPOU (specialist format)", async () => {
    const result = await extractPatientData(readFileSync(TEST_MULTI_PACIFIC));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Sione");
    expect(result.data.lastName).toBe("TUPOU");
    expect(result.data.dob).toBe("19900803");
  });
});

describe("Multicultural Names - Korean", () => {
  test("extracts Jiyeon Kim", async () => {
    const result = await extractPatientData(readFileSync(TEST_MULTI_KOREAN));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Jiyeon");
    expect(result.data.lastName).toBe("Kim");
    expect(result.data.sex).toBe("F");
  });
});

describe("Multicultural Names - Lebanese (hyphenated)", () => {
  test("extracts Layla El-Masri", async () => {
    const result = await extractPatientData(readFileSync(TEST_MULTI_LEBANESE));
    expect(result.success).toBe(true);
    expect(result.data.firstName).toBe("Layla");
    expect(result.data.lastName).toBe("El-Masri");
    expect(result.data.sex).toBe("F");
  });

  test("extracts address in Punchbowl", async () => {
    const result = await extractPatientData(readFileSync(TEST_MULTI_LEBANESE));
    expect(result.data.suburb).toBe("Punchbowl");
    expect(result.data.postcode).toBe("2196");
  });
});

// =============================================================================
// formatExtractedData
// =============================================================================

describe("formatExtractedData", () => {
  test("formats DOB from YYYYMMDD to DD/MM/YYYY", () => {
    const formatted = formatExtractedData({
      firstName: "John",
      lastName: "Smith",
      dob: "19800615",
      sex: "M",
    });
    expect(formatted.dob).toBe("15/06/1980");
  });

  test("formats Male sex", () => {
    const formatted = formatExtractedData({
      firstName: "A", lastName: "B", dob: "20000101", sex: "M",
    });
    expect(formatted.sex).toBe("Male");
  });

  test("formats Female sex", () => {
    const formatted = formatExtractedData({
      firstName: "A", lastName: "B", dob: "20000101", sex: "F",
    });
    expect(formatted.sex).toBe("Female");
  });

  test("formats Unknown sex", () => {
    const formatted = formatExtractedData({
      firstName: "A", lastName: "B", dob: "20000101", sex: "U",
    });
    expect(formatted.sex).toBe("Unknown");
  });

  test("formats Medicare with ref", () => {
    const formatted = formatExtractedData({
      firstName: "A", lastName: "B", dob: "20000101", sex: "M",
      medicareNo: "1234567890", medicareRef: "3",
    });
    expect(formatted.medicareNo).toBe("1234567890-3");
  });

  test("formats Medicare without ref", () => {
    const formatted = formatExtractedData({
      firstName: "A", lastName: "B", dob: "20000101", sex: "M",
      medicareNo: "1234567890",
    });
    expect(formatted.medicareNo).toBe("1234567890");
  });

  test("shows 'Not provided' when no Medicare", () => {
    const formatted = formatExtractedData({
      firstName: "A", lastName: "B", dob: "20000101", sex: "M",
    });
    expect(formatted.medicareNo).toBe("Not provided");
  });

  test("handles non-8-digit DOB gracefully", () => {
    const formatted = formatExtractedData({
      firstName: "A", lastName: "B", dob: "invalid", sex: "M",
    });
    expect(formatted.dob).toBe("invalid");
  });
});

// =============================================================================
// Forced Document Type
// =============================================================================

describe("Forced Document Type", () => {
  test("forces specialist referral to be parsed as consent form", async () => {
    const pdfBuffer = readFileSync(TEST_SPECIALIST);
    const result = await extractPatientData(pdfBuffer, "consent_form");
    expect(result.documentType).toBe("consent_form");
    // Consent form parsing won't find the RE: format data
    // It should still not crash
  });

  test("forces consent form to be parsed as referral_letter", async () => {
    const pdfBuffer = readFileSync(TEST_CONSENT);
    const result = await extractPatientData(pdfBuffer, "referral_letter");
    expect(result.documentType).toBe("referral_letter");
    // Should still not crash, even if extraction is poor
  });

  test("'auto' falls through to normal detection", async () => {
    const pdfBuffer = readFileSync(TEST_GP);
    const result = await extractPatientData(pdfBuffer, "auto");
    expect(result.documentType).toBe("gp_referral");
  });

  test("undefined falls through to normal detection", async () => {
    const pdfBuffer = readFileSync(TEST_GP);
    const result = await extractPatientData(pdfBuffer, undefined);
    expect(result.documentType).toBe("gp_referral");
  });
});
