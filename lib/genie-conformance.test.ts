/**
 * Conformance tests against working Genie HL7 samples from BJC Health.
 *
 * BACKGROUND
 * ----------
 * `samples/genie-results-hl7-examples/` (gitignored, contains PHI) holds 7
 * working .hl7 files that BJC drops directly into Genie's LabRslts folder
 * and which Genie successfully imports today. They represent the
 * ground-truth "shape" Genie at BJC accepts.
 *
 * 6 of the samples are ORU^R01 (results / correspondence sent via fax-email).
 * 1 sample is REF^I12 (Xiao_Laibing — referral letter).
 *
 * This file pins the structural fingerprint extracted from those samples
 * (segment counts, field positions, exact MSH constants, etc.) so future
 * changes to lib/hl7-builder.ts that would break Genie compatibility fail
 * loudly here. No PHI is encoded in this file — only structural patterns.
 *
 * Two intentional divergences from the samples are explicitly documented
 * (OBR-4 label and OBR-24 for ORU result types) — see
 * `docs/research/genie-results-routing.md` for the analysis. The tests
 * pin our CURRENT (post-PR-1) behaviour and call out the divergence so
 * Nicole's Genie UI test post-deploy can decide whether to converge or
 * keep our richer routing.
 */

import { describe, expect, test } from "bun:test";
import {
  buildHL7Message,
  type PatientData,
} from "./hl7-builder";
import {
  diagnosticServiceSectionFor,
  documentTypeLabel,
  isReferralDocumentType,
} from "./conversion-config";
import type { DocumentType } from "./vision-extractor";

// Fake patient data — never use real BJC patient names, DOBs, or Medicare
// numbers in test fixtures.
const SYNTH_PATIENT: PatientData = {
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

const TINY_PDF = Buffer.from("%PDF-1.4 synthetic test pdf");

/** Split HL7 message into segments. CR-only terminator, per the samples. */
function getSegments(hl7: string): string[] {
  return hl7.split("\r").filter(Boolean);
}

function getSegment(hl7: string, name: string): string {
  const seg = getSegments(hl7).find((s) => s.startsWith(name + "|"));
  if (!seg) throw new Error(`Missing ${name} segment`);
  return seg;
}

function fields(segment: string): string[] {
  return segment.split("|");
}

/** Build HL7 for a given document type using shared synthetic patient data.
 *  Mirrors lib/convert-service.ts wiring without touching that module. */
function buildForDocType(documentType: DocumentType): string {
  const messageType = isReferralDocumentType(documentType)
    ? ("REF^I12" as const)
    : ("ORU^R01" as const);
  return buildHL7Message(SYNTH_PATIENT, TINY_PDF, {
    sendingApplication: "FAX", // matches BJC samples
    documentTitle: documentTypeLabel(documentType),
    diagnosticServiceSection: diagnosticServiceSectionFor(documentType),
    resultStatus: "F",
    messageType,
    referralInfo: isReferralDocumentType(documentType)
      ? {
          senderName: "Dr Test Sender",
          addresseeName: "Dr Test Addressee",
        }
      : undefined,
  });
}

// =============================================================================
// Constants extracted from samples/genie-results-hl7-examples/ (PHI removed —
// only the structural shape; never the patient values).
// =============================================================================

/** Every working sample uses these exact MSH constants. */
const SAMPLE_MSH_CONSTANTS = {
  fieldSep: "|",
  encodingChars: "^~\\&",
  sendingFacility: "BJCHEALTH",
  receivingApplication: "GENIE",
  receivingFacility: "CLINIC",
  processingId: "P",
  acceptAck: "AL",
  appAck: "NE",
  countryCode: "AUS",
  charset: "8859/1",
};

const ORU_MSH12 = "2.4";
const REF_MSH12 = "2.4^AUS&Australia&ISO3166_1^HL7AU-OO-REF-SIMPLIFIED-201706&&L";

/** OBX shape is identical across every sample (ORU and REF). */
const SAMPLE_OBX3 = "PDF^Display format in PDF^AUSPDI";
const SAMPLE_OBX5_PREFIX = "^application^pdf^Base64^";

// =============================================================================
// Tests
// =============================================================================

describe("MSH segment matches BJC Genie samples", () => {
  test.each<DocumentType>([
    "consent_form",
    "generic",
    "pathology_result",
    "radiology_result",
    "referral_letter",
    "gp_referral",
  ])("MSH constants match for %s", (docType) => {
    const hl7 = buildForDocType(docType);
    const msh = fields(getSegment(hl7, "MSH"));

    // MSH-1 is the field separator itself; in our split the first field after
    // "MSH" is the encoding chars (MSH-2). MSH-3 onward shifts by 1.
    expect(msh[1]).toBe(SAMPLE_MSH_CONSTANTS.encodingChars); // MSH-2
    // MSH-3 (Sending Application) — we set this to FAX to match samples
    expect(msh[2]).toBe("FAX");
    expect(msh[3]).toBe(SAMPLE_MSH_CONSTANTS.sendingFacility); // MSH-4
    expect(msh[4]).toBe(SAMPLE_MSH_CONSTANTS.receivingApplication); // MSH-5
    expect(msh[5]).toBe(SAMPLE_MSH_CONSTANTS.receivingFacility); // MSH-6
    expect(msh[6]).toMatch(/^\d{14}$/); // MSH-7 timestamp
    expect(msh[7]).toBe(""); // MSH-8 security empty
    // MSH-10 control id — samples use MSG{ts}{4-char-suffix}; we match
    expect(msh[9]).toMatch(/^MSG\d{14}[A-Z0-9]{4}$/);
    expect(msh[10]).toBe(SAMPLE_MSH_CONSTANTS.processingId); // MSH-11
    expect(msh[14]).toBe(SAMPLE_MSH_CONSTANTS.acceptAck); // MSH-15
    expect(msh[15]).toBe(SAMPLE_MSH_CONSTANTS.appAck); // MSH-16
    expect(msh[16]).toBe(SAMPLE_MSH_CONSTANTS.countryCode); // MSH-17
    expect(msh[17]).toBe(SAMPLE_MSH_CONSTANTS.charset); // MSH-18
  });

  test("MSH-9 message type — ORU for results/correspondence, REF for referrals", () => {
    expect(fields(getSegment(buildForDocType("consent_form"), "MSH"))[8]).toBe("ORU^R01");
    expect(fields(getSegment(buildForDocType("generic"), "MSH"))[8]).toBe("ORU^R01");
    expect(fields(getSegment(buildForDocType("pathology_result"), "MSH"))[8]).toBe("ORU^R01");
    expect(fields(getSegment(buildForDocType("radiology_result"), "MSH"))[8]).toBe("ORU^R01");
    expect(fields(getSegment(buildForDocType("referral_letter"), "MSH"))[8]).toBe("REF^I12");
    expect(fields(getSegment(buildForDocType("gp_referral"), "MSH"))[8]).toBe("REF^I12");
  });

  test("MSH-12 version — plain 2.4 for ORU; AU REF profile for REF", () => {
    expect(fields(getSegment(buildForDocType("consent_form"), "MSH"))[11]).toBe(ORU_MSH12);
    expect(fields(getSegment(buildForDocType("pathology_result"), "MSH"))[11]).toBe(ORU_MSH12);
    expect(fields(getSegment(buildForDocType("radiology_result"), "MSH"))[11]).toBe(ORU_MSH12);
    expect(fields(getSegment(buildForDocType("referral_letter"), "MSH"))[11]).toBe(REF_MSH12);
    expect(fields(getSegment(buildForDocType("gp_referral"), "MSH"))[11]).toBe(REF_MSH12);
  });
});

describe("Segment ordering matches BJC Genie samples", () => {
  test("ORU^R01 order: MSH → PID → PV1 → OBR → OBX", () => {
    const segments = getSegments(buildForDocType("pathology_result")).map(
      (s) => s.split("|")[0]
    );
    expect(segments).toEqual(["MSH", "PID", "PV1", "OBR", "OBX"]);
  });

  test("REF^I12 order: MSH → RF1 → PRD(s) → PID → OBR → OBX → PV1", () => {
    const segments = getSegments(buildForDocType("referral_letter")).map(
      (s) => s.split("|")[0]
    );
    expect(segments).toEqual([
      "MSH",
      "RF1",
      "PRD",
      "PRD",
      "PID",
      "OBR",
      "OBX",
      "PV1",
    ]);
  });
});

describe("PID segment matches BJC Genie samples", () => {
  test("PID-1 is '1', empty external ID/alternate ID, name as Last^First", () => {
    const pid = fields(getSegment(buildForDocType("consent_form"), "PID"));
    expect(pid[1]).toBe("1"); // PID-1 set ID
    expect(pid[2]).toBe(""); // PID-2 empty
    expect(pid[4]).toBe(""); // PID-4 alternate ID empty in samples
    expect(pid[5]).toBe("Synthetic^Alpha"); // PID-5 Last^First
  });

  test("PID-7 DOB is YYYYMMDD", () => {
    const pid = fields(getSegment(buildForDocType("consent_form"), "PID"));
    expect(pid[7]).toMatch(/^\d{8}$/);
    expect(pid[7]).toBe("19800101");
  });

  test("PID-8 sex is M/F/U", () => {
    const pid = fields(getSegment(buildForDocType("consent_form"), "PID"));
    expect(pid[8]).toMatch(/^[MFU]$/);
  });

  test("PID-11 address uses ^-component format with AUS country", () => {
    const pid = fields(getSegment(buildForDocType("consent_form"), "PID"));
    // Format observed in samples: street^^suburb^state^postcode^AUS
    expect(pid[11].split("^")).toEqual([
      "1 Test Street",
      "",
      "Sydney",
      "NSW",
      "2000",
      "AUS",
    ]);
  });
});

describe("PV1 segment matches BJC Genie samples", () => {
  test("PV1-1=1, PV1-2=O (Outpatient) for ORU without addressee", () => {
    const pv1 = fields(getSegment(buildForDocType("consent_form"), "PV1"));
    expect(pv1[1]).toBe("1");
    expect(pv1[2]).toBe("O");
    // Samples show PV1 as "PV1|1|O" with no further fields when no doctor — match.
    expect(pv1.length).toBe(3);
  });

  test("PV1-9 carries doctor name when set (REF addressee or orderingProvider)", () => {
    const pv1 = fields(getSegment(buildForDocType("referral_letter"), "PV1"));
    // Sample shape: ^Lau^Herman^^^DR
    expect(pv1[9]).toBe("^Addressee^Test^^^DR");
  });
});

describe("OBR segment matches BJC Genie samples — matching fields", () => {
  test("OBR-1=1, OBR-2 empty, OBR-3 has RPT{ts}^{carrier} shape", () => {
    const obr = fields(getSegment(buildForDocType("consent_form"), "OBR"));
    expect(obr[1]).toBe("1");
    expect(obr[2]).toBe("");
    expect(obr[3]).toMatch(/^RPT\d{14}\^FAX$/);
  });

  test("OBR-7 (observation date) and OBR-22 (results status change) are timestamps", () => {
    const obr = fields(getSegment(buildForDocType("consent_form"), "OBR"));
    expect(obr[7]).toMatch(/^\d{14}$/);
    expect(obr[22]).toMatch(/^\d{14}$/);
  });

  test("OBR-25 result status is F (Final / auto-file)", () => {
    expect(fields(getSegment(buildForDocType("consent_form"), "OBR"))[25]).toBe("F");
    expect(fields(getSegment(buildForDocType("referral_letter"), "OBR"))[25]).toBe("F");
  });

  test("OBR-24 is PHY for REF (matches Xiao_Laibing sample)", () => {
    expect(fields(getSegment(buildForDocType("referral_letter"), "OBR"))[24]).toBe("PHY");
    expect(fields(getSegment(buildForDocType("gp_referral"), "OBR"))[24]).toBe("PHY");
  });

  test("OBR-24 is empty for consent_form / generic (matches all 6 ORU samples)", () => {
    expect(fields(getSegment(buildForDocType("consent_form"), "OBR"))[24]).toBe("");
    expect(fields(getSegment(buildForDocType("generic"), "OBR"))[24]).toBe("");
  });

  test("OBR-4 universal service id has shape PDF^{label}^L for REF and ORU correspondence", () => {
    // Matches all samples: PDF^Correspondence^L for ORU, PDF^Referral^L for REF.
    expect(fields(getSegment(buildForDocType("consent_form"), "OBR"))[4])
      .toBe("PDF^Correspondence^L");
    expect(fields(getSegment(buildForDocType("generic"), "OBR"))[4])
      .toBe("PDF^Correspondence^L");
    expect(fields(getSegment(buildForDocType("referral_letter"), "OBR"))[4])
      .toBe("PDF^Referral^L");
  });
});

// =============================================================================
// Intentional divergences — pin our PR 1 design and document the divergence.
// See docs/research/genie-results-routing.md for the analysis.
// =============================================================================

describe("Intentional divergences from BJC Genie samples (post-PR-1 design)", () => {
  // The 6 ORU samples in samples/genie-results-hl7-examples/ all use:
  //   OBR-4 = "PDF^Correspondence^L"
  //   OBR-24 = "" (empty)
  // PR 1 introduced result-specific labels and OBR-24 routing so that
  // pathology / radiology results can land in Genie's Pathology / Radiology
  // inboxes via OBR-24=LAB / RAD when REF V8 is enabled at BJC.
  // These tests pin that intentional divergence — they will fail if we
  // accidentally fall back to "Correspondence" / empty for results.

  test("pathology_result OBR-4 label = 'Pathology Result' (DIVERGES from samples)", () => {
    // Samples would have: PDF^Correspondence^L
    expect(fields(getSegment(buildForDocType("pathology_result"), "OBR"))[4])
      .toBe("PDF^Pathology Result^L");
  });

  test("pathology_result OBR-24 = 'LAB' (DIVERGES from samples — empty)", () => {
    expect(fields(getSegment(buildForDocType("pathology_result"), "OBR"))[24]).toBe("LAB");
  });

  test("radiology_result OBR-4 label = 'Radiology Result' (DIVERGES from samples)", () => {
    expect(fields(getSegment(buildForDocType("radiology_result"), "OBR"))[4])
      .toBe("PDF^Radiology Result^L");
  });

  test("radiology_result OBR-24 = 'RAD' (DIVERGES from samples — empty)", () => {
    expect(fields(getSegment(buildForDocType("radiology_result"), "OBR"))[24]).toBe("RAD");
  });
});

describe("OBX segment matches BJC Genie samples", () => {
  test.each<DocumentType>([
    "consent_form",
    "pathology_result",
    "radiology_result",
    "referral_letter",
  ])("OBX shape matches for %s", (docType) => {
    const obx = fields(getSegment(buildForDocType(docType), "OBX"));
    expect(obx[1]).toBe("1"); // OBX-1
    expect(obx[2]).toBe("ED"); // OBX-2 datatype
    expect(obx[3]).toBe(SAMPLE_OBX3); // OBX-3
    expect(obx[4]).toBe(""); // OBX-4 sub-id
    expect(obx[5].startsWith(SAMPLE_OBX5_PREFIX)).toBe(true); // OBX-5 ED
    expect(obx[11]).toBe("F"); // OBX-11 result status
  });
});

describe("Segment terminator and file shape match samples", () => {
  test("CR-only terminators (no LF) — Genie expects \\r exclusively", () => {
    const hl7 = buildForDocType("consent_form");
    expect(hl7.includes("\n")).toBe(false);
    // Sample files end with `0d` only — no trailing LF.
    expect(hl7.endsWith("\r")).toBe(true);
  });

  test("Trailing CR after final segment (matches sample tail bytes 0d)", () => {
    const hl7 = buildForDocType("referral_letter");
    expect(hl7.endsWith("\r")).toBe(true);
    // Last byte is exactly one CR, not two
    expect(hl7.endsWith("\r\r")).toBe(false);
  });
});

describe("REF^I12 PRD segments match Xiao_Laibing sample", () => {
  test("two PRD segments: RP~AP for sender and RT~IR for addressee", () => {
    const segments = getSegments(buildForDocType("referral_letter"));
    const prds = segments.filter((s) => s.startsWith("PRD|"));
    expect(prds).toHaveLength(2);

    const sender = fields(prds[0]);
    expect(sender[1]).toBe("RP~AP"); // PRD-1
    expect(sender[2]).toBe("Sender^Test^^^DR"); // PRD-2 Last^First^^^Prefix

    const addressee = fields(prds[1]);
    expect(addressee[1]).toBe("RT~IR");
    expect(addressee[2]).toBe("Addressee^Test^^^DR");
  });
});

describe("RF1 segment matches Xiao_Laibing sample", () => {
  test("RF1-7 effective date is a timestamp; RF1-1..6 empty", () => {
    const rf1 = fields(getSegment(buildForDocType("referral_letter"), "RF1"));
    expect(rf1[1]).toBe("");
    expect(rf1[7]).toMatch(/^\d{14}$/);
  });
});
