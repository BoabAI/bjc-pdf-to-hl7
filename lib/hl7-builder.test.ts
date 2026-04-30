import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { buildHL7Message, generateHL7Filename } from "./hl7-builder";
import type { PatientData } from "./domain/types";

const TEST_PDF_PATH = join(
  import.meta.dir,
  "../docs/input PDF/originals/Patient_Information_and_Consent_Form_2025-12-10T14-09-58_29503708_0 (1).pdf"
);

// Use a tiny buffer for most tests (faster, no file I/O dependency)
const TINY_PDF = Buffer.from("%PDF-1.4 tiny test content");

const samplePatient: PatientData = {
  firstName: "John",
  lastName: "Smith",
  dob: "19800115",
  sex: "M",
};

const fullPatient: PatientData = {
  firstName: "Jane",
  lastName: "O'Brien",
  dob: "19921231",
  sex: "F",
  address: "42 Wallaby Way",
  suburb: "Sydney",
  state: "NSW",
  postcode: "2000",
  phone: "0412345678",
  medicareNo: "2123456789",
  medicareRef: "3",
};

/** Helper: split HL7 message into segments */
function getSegments(hl7: string): string[] {
  return hl7.split("\r").filter(Boolean);
}

/** Helper: get a specific segment by name */
function getSegment(hl7: string, name: string): string | undefined {
  return getSegments(hl7).find((s) => s.startsWith(name + "|"));
}

/** Helper: get fields from a segment (field[0] = segment name) */
function getFields(segment: string): string[] {
  return segment.split("|");
}

// =============================================================================
// Message Structure
// =============================================================================

describe("HL7 Message Structure", () => {
  test("ORU^R01 contains 5 segments in order: MSH PID PV1 OBR OBX", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const segments = getSegments(hl7);

    expect(segments).toHaveLength(5);
    expect(segments[0]).toMatch(/^MSH\|/);
    expect(segments[1]).toMatch(/^PID\|/);
    expect(segments[2]).toMatch(/^PV1\|/);
    expect(segments[3]).toMatch(/^OBR\|/);
    expect(segments[4]).toMatch(/^OBX\|/);
  });

  test("uses CR-only segment terminators (no LF)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);

    expect(hl7).not.toContain("\n");
    expect(hl7).toContain("\r");
    // Should end with a trailing CR
    expect(hl7.endsWith("\r")).toBe(true);
  });

  test("segment count matches CR count", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const crCount = (hl7.match(/\r/g) || []).length;

    // 5 segments = 5 CRs (each segment terminated by CR)
    expect(crCount).toBe(5);
  });
});

// =============================================================================
// MSH Segment
// =============================================================================

describe("MSH (Message Header) Segment", () => {
  test("has correct encoding characters in MSH-2", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const msh = getFields(getSegment(hl7, "MSH")!);

    // MSH is special: MSH-1 is |, MSH-2 is ^~\&
    // When split by |, index 1 = encoding chars
    expect(msh[1]).toBe("^~\\&");
  });

  test("uses default sending/receiving applications", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[2]).toBe("SMECAI"); // MSH-3: Sending Application
    expect(msh[3]).toBe("BJCHEALTH"); // MSH-4: Sending Facility
    expect(msh[4]).toBe("GENIE"); // MSH-5: Receiving Application
    expect(msh[5]).toBe("CLINIC"); // MSH-6: Receiving Facility
  });

  test("allows custom sending/receiving applications", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      sendingApplication: "MYAPP",
      sendingFacility: "MYFACILITY",
      receivingApplication: "BESTPRACTICE",
      receivingFacility: "OTHERCLINIC",
    });
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[2]).toBe("MYAPP");
    expect(msh[3]).toBe("MYFACILITY");
    expect(msh[4]).toBe("BESTPRACTICE");
    expect(msh[5]).toBe("OTHERCLINIC");
  });

  test("has timestamp in YYYYMMDDHHMMSS format (MSH-7)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const msh = getFields(getSegment(hl7, "MSH")!);

    // MSH-7: timestamp - 14 digits
    expect(msh[6]).toMatch(/^\d{14}$/);
  });

  test("has ORU^R01 message type by default (MSH-9)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[8]).toBe("ORU^R01");
  });

  test("uses REF^I12 message type when specified (MSH-9)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
    });
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[8]).toBe("REF^I12");
  });

  test("MSH field count unchanged at 18 regardless of message type", () => {
    const hl7Ref = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
    });
    const hl7Oru = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "ORU^R01",
    });
    const mshRef = getFields(getSegment(hl7Ref, "MSH")!);
    const mshOru = getFields(getSegment(hl7Oru, "MSH")!);

    expect(mshRef).toHaveLength(18);
    expect(mshOru).toHaveLength(18);
  });

  test("has unique message control ID starting with MSG (MSH-10)", () => {
    const hl7a = buildHL7Message(samplePatient, TINY_PDF);
    const hl7b = buildHL7Message(samplePatient, TINY_PDF);
    const mshA = getFields(getSegment(hl7a, "MSH")!);
    const mshB = getFields(getSegment(hl7b, "MSH")!);

    expect(mshA[9]).toMatch(/^MSG/);
    expect(mshB[9]).toMatch(/^MSG/);
    // Should be unique (random suffix)
    expect(mshA[9]).not.toBe(mshB[9]);
  });

  test("has Production processing ID (MSH-11)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[10]).toBe("P");
  });

  test("has HL7 version 2.4 for ORU messages (MSH-12)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[11]).toBe("2.4");
  });

  test("has extended ADRM version for REF messages (MSH-12)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
    });
    const msh = getFields(getSegment(hl7, "MSH")!);

    // REF profile requires extended version identifier
    expect(msh[11]).toBe(
      "2.4^AUS&Australia&ISO3166_1^HL7AU-OO-REF-SIMPLIFIED-201706&&L"
    );
  });

  test("has AUS country code (MSH-17)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[16]).toBe("AUS");
  });

  test("has 8859/1 character set (MSH-18)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[17]).toBe("8859/1");
  });

  test("has AL accept ack and NE app ack (MSH-15, MSH-16)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[14]).toBe("AL");
    expect(msh[15]).toBe("NE");
  });
});

// =============================================================================
// PID Segment
// =============================================================================

describe("PID (Patient Identification) Segment", () => {
  test("has Set ID of 1 (PID-1)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[1]).toBe("1");
  });

  test("formats patient name as LastName^FirstName (PID-5)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[5]).toBe("Smith^John");
  });

  test("includes DOB in YYYYMMDD format (PID-7)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[7]).toBe("19800115");
  });

  test("includes sex (PID-8)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[8]).toBe("M");
  });

  test("handles female sex", () => {
    const female: PatientData = { ...samplePatient, sex: "F" };
    const hl7 = buildHL7Message(female, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[8]).toBe("F");
  });

  test("handles unknown sex", () => {
    const unknown: PatientData = { ...samplePatient, sex: "U" };
    const hl7 = buildHL7Message(unknown, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[8]).toBe("U");
  });

  test("formats Medicare with ref as number-ref^^^AUSHIC^MC (PID-3)", () => {
    const hl7 = buildHL7Message(fullPatient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[3]).toBe("2123456789-3^^^AUSHIC^MC");
  });

  test("defaults Medicare ref to 1 when not provided", () => {
    const patientNoRef: PatientData = {
      ...samplePatient,
      medicareNo: "9876543210",
    };
    const hl7 = buildHL7Message(patientNoRef, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[3]).toBe("9876543210-1^^^AUSHIC^MC");
  });

  test("leaves PID-3 empty when no Medicare number", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[3]).toBe("");
  });

  test("formats full address with components (PID-11)", () => {
    const hl7 = buildHL7Message(fullPatient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    // PID-11: address^street2^suburb^state^postcode^country
    const addrParts = pid[11].split("^");
    expect(addrParts[0]).toBe("42 Wallaby Way"); // Street
    expect(addrParts[1]).toBe(""); // Street 2
    expect(addrParts[2]).toBe("Sydney"); // Suburb
    expect(addrParts[3]).toBe("NSW"); // State
    expect(addrParts[4]).toBe("2000"); // Postcode
    expect(addrParts[5]).toBe("AUS"); // Country
  });

  test("defaults state to VIC when address present but no state", () => {
    const patient: PatientData = {
      ...samplePatient,
      address: "10 Test St",
      suburb: "Somewhere",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    const addrParts = pid[11].split("^");
    expect(addrParts[3]).toBe("VIC");
  });

  test("leaves PID-11 empty when no address or suburb", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[11]).toBe("");
  });

  test("includes phone number (PID-13)", () => {
    const hl7 = buildHL7Message(fullPatient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[13]).toBe("0412345678");
  });

  test("leaves PID-13 empty when no phone", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[13]).toBe("");
  });
});

// =============================================================================
// HL7 Special Character Escaping
// =============================================================================

describe("HL7 Special Character Escaping", () => {
  test("escapes pipe character in patient name", () => {
    const patient: PatientData = {
      ...samplePatient,
      lastName: "Pipe|Test",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getSegment(hl7, "PID")!;

    expect(pid).toContain("Pipe\\F\\Test");
    expect(pid).not.toContain("Pipe|Test");
  });

  test("escapes caret in patient name", () => {
    const patient: PatientData = {
      ...samplePatient,
      firstName: "Test^Name",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getSegment(hl7, "PID")!;

    expect(pid).toContain("Test\\S\\Name");
  });

  test("escapes backslash in patient name", () => {
    const patient: PatientData = {
      ...samplePatient,
      lastName: "Back\\slash",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getSegment(hl7, "PID")!;

    expect(pid).toContain("Back\\E\\slash");
  });

  test("escapes tilde in patient data", () => {
    const patient: PatientData = {
      ...samplePatient,
      address: "123 Tilde~Way",
      suburb: "Testville",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getSegment(hl7, "PID")!;

    expect(pid).toContain("123 Tilde\\R\\Way");
  });

  test("escapes ampersand in patient data", () => {
    const patient: PatientData = {
      ...samplePatient,
      address: "Smith & Jones St",
      suburb: "Testville",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getSegment(hl7, "PID")!;

    expect(pid).toContain("Smith \\T\\ Jones St");
  });

  test("escapes apostrophe names correctly (no special escape needed)", () => {
    const hl7 = buildHL7Message(fullPatient, TINY_PDF);
    const pid = getSegment(hl7, "PID")!;

    // O'Brien - apostrophe is NOT an HL7 special character
    expect(pid).toContain("O'Brien");
  });

  test("escapes phone number with special characters", () => {
    const patient: PatientData = {
      ...samplePatient,
      phone: "04|1234^5678",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getSegment(hl7, "PID")!;

    expect(pid).toContain("04\\F\\1234\\S\\5678");
  });
});

// =============================================================================
// PV1 Segment
// =============================================================================

describe("PV1 (Patient Visit) Segment", () => {
  test("has Outpatient class by default (PV1-2)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const pv1 = getFields(getSegment(hl7, "PV1")!);

    expect(pv1[1]).toBe("1"); // Set ID
    expect(pv1[2]).toBe("O"); // Patient Class
  });

  test("is minimal (3 fields) when no ordering provider", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const pv1 = getFields(getSegment(hl7, "PV1")!);

    expect(pv1).toHaveLength(3);
  });

  test("includes ordering provider in PV1-9 with AUSHICPR format", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      orderingProvider: "1234567A",
    });
    const pv1 = getFields(getSegment(hl7, "PV1")!);

    // PV1-9 is at index 9 (fields 3-8 are empty)
    expect(pv1[9]).toBe("1234567A^^^AUSHICPR");
  });

  test("pads empty fields 3-8 when provider specified", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      orderingProvider: "1234567A",
    });
    const pv1 = getFields(getSegment(hl7, "PV1")!);

    // Fields 3-8 (indices 3-8) should be empty
    for (let i = 3; i <= 8; i++) {
      expect(pv1[i]).toBe("");
    }
  });
});

// =============================================================================
// OBR Segment
// =============================================================================

describe("OBR (Observation Request) Segment", () => {
  test("has Set ID of 1 (OBR-1)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[1]).toBe("1");
  });

  test("has filler order number with timestamp (OBR-3)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obr = getFields(getSegment(hl7, "OBR")!);

    // OBR-3: RPT<timestamp>^SMECAI
    expect(obr[3]).toMatch(/^RPT\d{14}\^SMECAI$/);
  });

  test("has default document title in service ID (OBR-4)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[4]).toBe("PDF^Patient Consent Form^L");
  });

  test("uses custom document title in service ID", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      documentTitle: "GP Referral Letter",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[4]).toBe("PDF^GP Referral Letter^L");
  });

  test("escapes special characters in document title", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      documentTitle: "Smith & Jones Report",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[4]).toContain("Smith \\T\\ Jones Report");
  });

  test("has observation datetime in OBR-7", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[7]).toMatch(/^\d{14}$/);
  });

  test("has results report datetime in OBR-22", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[22]).toMatch(/^\d{14}$/);
  });

  test("defaults to Final result status (OBR-25)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[25]).toBe("F");
  });

  test("uses Preliminary status when resultStatus=P (auto-file off)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      resultStatus: "P",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[25]).toBe("P");
  });

  test("uses Final status when resultStatus=F (auto-file on)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      resultStatus: "F",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[25]).toBe("F");
  });
});

// =============================================================================
// OBX Segment
// =============================================================================

describe("OBX (Observation) Segment", () => {
  test("has ED value type (OBX-2)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obx = getFields(getSegment(hl7, "OBX")!);

    expect(obx[2]).toBe("ED");
  });

  test("has AUSPDI observation ID (OBX-3)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obx = getFields(getSegment(hl7, "OBX")!);

    expect(obx[3]).toBe("PDF^Display format in PDF^AUSPDI");
  });

  test("has Final result status (OBX-11)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obx = getFields(getSegment(hl7, "OBX")!);

    expect(obx[11]).toBe("F");
  });

  test("PDF is embedded as Base64 in OBX-5", () => {
    const pdfBuffer = readFileSync(TEST_PDF_PATH);
    const hl7 = buildHL7Message(samplePatient, pdfBuffer);

    expect(hl7).toContain("^application^pdf^Base64^");
  });

  test("embedded Base64 decodes back to original PDF", () => {
    const pdfBuffer = readFileSync(TEST_PDF_PATH);
    const hl7 = buildHL7Message(samplePatient, pdfBuffer);

    const match = hl7.match(/\^application\^pdf\^Base64\^([A-Za-z0-9+/=]+)/);
    expect(match).not.toBeNull();

    const extractedBase64 = match![1];
    const decodedBuffer = Buffer.from(extractedBase64, "base64");

    expect(decodedBuffer.equals(pdfBuffer)).toBe(true);
  });
});

// =============================================================================
// generateHL7Filename
// =============================================================================

describe("generateHL7Filename", () => {
  test("generates filename with LastName_FirstName format", () => {
    const filename = generateHL7Filename(samplePatient);

    expect(filename).toMatch(/^Smith_John_\d{14}\.hl7$/);
  });

  test("sanitizes special characters in names", () => {
    const filename = generateHL7Filename(fullPatient);

    // O'Brien should become O_Brien (apostrophe replaced)
    expect(filename).toMatch(/^O_Brien_Jane_\d{14}\.hl7$/);
  });

  test("sanitizes spaces and hyphens", () => {
    const patient: PatientData = {
      firstName: "Mary Jane",
      lastName: "Van der Berg",
      dob: "19900101",
      sex: "F",
    };
    const filename = generateHL7Filename(patient);

    expect(filename).toMatch(/^Van_der_Berg_Mary_Jane_\d{14}\.hl7$/);
  });

  test("always has .hl7 extension", () => {
    const filename = generateHL7Filename(samplePatient);

    expect(filename.endsWith(".hl7")).toBe(true);
  });
});

// =============================================================================
// Options Merging
// =============================================================================

describe("Options Merging", () => {
  test("partial options override only specified defaults", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      sendingFacility: "CUSTOMFACILITY",
    });
    const msh = getFields(getSegment(hl7, "MSH")!);

    // Custom value
    expect(msh[3]).toBe("CUSTOMFACILITY");
    // Defaults preserved
    expect(msh[2]).toBe("SMECAI");
    expect(msh[4]).toBe("GENIE");
    expect(msh[5]).toBe("CLINIC");
  });

  test("empty options object uses all defaults", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {});
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[2]).toBe("SMECAI");
    expect(msh[3]).toBe("BJCHEALTH");
  });
});

// =============================================================================
// Integration / Edge Cases
// =============================================================================

describe("Integration & Edge Cases", () => {
  test("minimal patient (only required fields) produces valid message", () => {
    const minimal: PatientData = {
      firstName: "A",
      lastName: "B",
      dob: "20000101",
      sex: "U",
    };
    const hl7 = buildHL7Message(minimal, TINY_PDF);
    const segments = getSegments(hl7);

    expect(segments).toHaveLength(5);
    expect(getSegment(hl7, "PID")).toContain("B^A");
    expect(getSegment(hl7, "PID")).toContain("20000101");
  });

  test("full patient with all options produces valid message", () => {
    const hl7 = buildHL7Message(fullPatient, TINY_PDF, {
      sendingApplication: "CUSTOM",
      sendingFacility: "FAC",
      receivingApplication: "RCV",
      receivingFacility: "RCVFAC",
      documentTitle: "Referral Letter",
      resultStatus: "P",
      orderingProvider: "9999999Z",
    });
    const segments = getSegments(hl7);

    expect(segments).toHaveLength(5);
    expect(getSegment(hl7, "MSH")).toContain("CUSTOM");
    expect(getSegment(hl7, "PID")).toContain("2123456789-3^^^AUSHIC^MC");
    expect(getSegment(hl7, "PV1")).toContain("9999999Z^^^AUSHICPR");
    expect(getSegment(hl7, "OBR")).toContain("Referral Letter");
  });

  test("empty string fields don't cause extra separators", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);

    // No double pipes next to each other that shouldn't be there
    // (Some empty fields are expected, but shouldn't have ||||| clusters beyond spec)
    expect(hl7).not.toContain("||||||||||||||||||");
  });

  test("handles very small PDF buffer", () => {
    const tiny = Buffer.from("x");
    const hl7 = buildHL7Message(samplePatient, tiny);

    expect(hl7).toContain("^application^pdf^Base64^");
    // Single byte 'x' => base64 'eA=='
    expect(hl7).toContain("eA==");
  });
});

// =============================================================================
// Referral Info (Sender/Addressee)
// =============================================================================

describe("Referral Info - OBR-16 (Sender)", () => {
  test("populates OBR-16 with sender name and provider number", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      referralInfo: {
        senderName: "Dr Sarah Jones",
        senderProviderNumber: "1234567A",
      },
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    // OBR-16: ProviderNumber^LastName^FirstName^^^DR^^^AUSHICPR
    expect(obr[16]).toBe("1234567A^Jones^Sarah^^^DR^^^AUSHICPR");
  });

  test("populates OBR-16 with sender name only (no provider number)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      referralInfo: {
        senderName: "Dr Michael Brown",
      },
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    // No provider number: ^LastName^FirstName^^^DR
    expect(obr[16]).toBe("^Brown^Michael^^^DR");
  });

  test("OBR-16 is empty when no referralInfo provided", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[16]).toBe("");
  });

  test("OBR field count unchanged at 26 with referralInfo", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      referralInfo: {
        senderName: "Dr Test",
        senderProviderNumber: "9999999Z",
      },
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr).toHaveLength(26);
  });
});

describe("Referral Info - PV1-9 (Addressee)", () => {
  test("populates PV1-9 with addressee name when no orderingProvider", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      referralInfo: {
        addresseeName: "Dr Emily Watson",
      },
    });
    const pv1 = getFields(getSegment(hl7, "PV1")!);

    expect(pv1[9]).toBe("^Watson^Emily^^^DR");
  });

  test("orderingProvider takes precedence over addressee name", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      orderingProvider: "1234567A",
      referralInfo: {
        addresseeName: "Dr Emily Watson",
      },
    });
    const pv1 = getFields(getSegment(hl7, "PV1")!);

    expect(pv1[9]).toBe("1234567A^^^AUSHICPR");
  });

  test("PV1 remains minimal when no provider and no addressee", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      referralInfo: {
        senderName: "Dr Sarah Jones", // Only sender, no addressee
      },
    });
    const pv1 = getFields(getSegment(hl7, "PV1")!);

    expect(pv1).toHaveLength(3);
  });
});

// =============================================================================
// Edge Cases - Data Integrity
// =============================================================================

describe("Edge Cases - Data Integrity", () => {
  test("CR in patient name is stripped, preserving segment structure", () => {
    const patient: PatientData = {
      ...samplePatient,
      lastName: "Smith\rJones",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const segments = getSegments(hl7);

    expect(segments).toHaveLength(5);
    expect(getSegment(hl7, "PID")).toContain("Smith Jones");
  });

  test("LF in patient name is stripped, preserving segment structure", () => {
    const patient: PatientData = {
      ...samplePatient,
      lastName: "Smith\nJones",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const segments = getSegments(hl7);

    expect(segments).toHaveLength(5);
    expect(getSegment(hl7, "PID")).toContain("Smith Jones");
  });

  test("tab characters in data are replaced with spaces", () => {
    const patient: PatientData = {
      ...samplePatient,
      address: "123\tMain\tSt",
      suburb: "Test",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);

    expect(getSegment(hl7, "PID")).toContain("123 Main St");
  });

  test("CRLF in address is stripped, preserving segment structure", () => {
    const patient: PatientData = {
      ...samplePatient,
      address: "Line1\r\nLine2",
      suburb: "Test",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const segments = getSegments(hl7);

    expect(segments).toHaveLength(5);
    expect(getSegment(hl7, "PID")).toContain("Line1  Line2");
  });

  test("null bytes are stripped from data", () => {
    const patient: PatientData = {
      ...samplePatient,
      firstName: "John\x00Smith",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);

    expect(getSegment(hl7, "PID")).toContain("John Smith");
    expect(getSegment(hl7, "PID")).not.toContain("\x00");
  });

  test("multiple special characters in a single field all get escaped", () => {
    const patient: PatientData = {
      ...samplePatient,
      address: "A|B^C\\D~E&F",
      suburb: "Test",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getSegment(hl7, "PID")!;

    expect(pid).toContain("A\\F\\B\\S\\C\\E\\D\\R\\E\\T\\F");
  });

  test("empty string address with populated suburb still builds address", () => {
    const patient: PatientData = {
      ...samplePatient,
      suburb: "Bondi",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    const addrParts = pid[11].split("^");
    expect(addrParts[0]).toBe(""); // No street
    expect(addrParts[2]).toBe("Bondi"); // Suburb present
    expect(addrParts[3]).toBe("VIC"); // Default state
    expect(addrParts[5]).toBe("AUS"); // Country
  });

  test("address with street but no suburb still builds address", () => {
    const patient: PatientData = {
      ...samplePatient,
      address: "123 Main St",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    const addrParts = pid[11].split("^");
    expect(addrParts[0]).toBe("123 Main St");
    expect(addrParts[2]).toBe(""); // No suburb
    expect(addrParts[5]).toBe("AUS");
  });

  test("empty string Medicare ref falls back to 1", () => {
    const patient: PatientData = {
      ...samplePatient,
      medicareNo: "1234567890",
      medicareRef: "", // Empty string is falsy
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[3]).toBe("1234567890-1^^^AUSHIC^MC");
  });

  test("empty PDF buffer (0 bytes) still produces valid message", () => {
    const empty = Buffer.alloc(0);
    const hl7 = buildHL7Message(samplePatient, empty);
    const segments = getSegments(hl7);

    expect(segments).toHaveLength(5);
    // Empty buffer -> empty base64 string
    expect(hl7).toContain("^application^pdf^Base64^");
  });

  test("Base64 output contains no line breaks or spaces", () => {
    // Some Base64 encoders insert line breaks every 76 chars — HL7 can't have that
    const largePdf = Buffer.alloc(1000, 0xff);
    const hl7 = buildHL7Message(samplePatient, largePdf);

    const match = hl7.match(/\^Base64\^([^\r]+)/);
    expect(match).not.toBeNull();

    const base64Data = match![1];
    expect(base64Data).not.toContain("\n");
    expect(base64Data).not.toContain("\r");
    expect(base64Data).not.toContain(" ");
  });

  test("PID always has exactly 14 fields regardless of optional data", () => {
    // Minimal patient
    const hl7Min = buildHL7Message(samplePatient, TINY_PDF);
    const pidMin = getFields(getSegment(hl7Min, "PID")!);

    // Full patient
    const hl7Full = buildHL7Message(fullPatient, TINY_PDF);
    const pidFull = getFields(getSegment(hl7Full, "PID")!);

    // Both should have the same number of fields (PID + 13 data fields = 14)
    expect(pidMin).toHaveLength(14);
    expect(pidFull).toHaveLength(14);
  });

  test("OBR always has exactly 26 fields", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obr = getFields(getSegment(hl7, "OBR")!);

    // OBR name + 25 data fields = 26
    expect(obr).toHaveLength(26);
  });

  test("OBX always has exactly 12 fields", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obx = getFields(getSegment(hl7, "OBX")!);

    // OBX name + 11 data fields = 12
    expect(obx).toHaveLength(12);
  });

  test("MSH always has exactly 18 fields", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const msh = getFields(getSegment(hl7, "MSH")!);

    // MSH + 17 data fields = 18
    expect(msh).toHaveLength(18);
  });
});

// =============================================================================
// Edge Cases - Australian Healthcare Names
// =============================================================================

describe("Edge Cases - Australian Healthcare Names", () => {
  test("handles hyphenated surnames", () => {
    const patient: PatientData = {
      ...samplePatient,
      lastName: "Smith-Jones",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[5]).toBe("Smith-Jones^John");
  });

  test("handles accented characters (common in AU healthcare)", () => {
    const patient: PatientData = {
      ...samplePatient,
      firstName: "José",
      lastName: "Müller",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[5]).toBe("Müller^José");
  });

  test("handles single-character names", () => {
    const patient: PatientData = {
      firstName: "X",
      lastName: "Y",
      dob: "20000101",
      sex: "U",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[5]).toBe("Y^X");
  });

  test("handles very long names without truncation", () => {
    const patient: PatientData = {
      ...samplePatient,
      firstName: "Bartholomew Christopher",
      lastName: "Wolfeschlegelsteinhausenbergerdorff",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[5]).toBe(
      "Wolfeschlegelsteinhausenbergerdorff^Bartholomew Christopher"
    );
  });

  test("handles names with periods (Jr., Sr., Dr.)", () => {
    const patient: PatientData = {
      ...samplePatient,
      firstName: "John Jr.",
      lastName: "Smith",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[5]).toBe("Smith^John Jr.");
  });
});

// =============================================================================
// Edge Cases - Provider & Medicare Formats
// =============================================================================

describe("Edge Cases - Provider & Medicare Formats", () => {
  test("empty string ordering provider is treated as no provider", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      orderingProvider: "",
    });
    const pv1 = getFields(getSegment(hl7, "PV1")!);

    // Empty string is falsy, so PV1 should be minimal
    expect(pv1).toHaveLength(3);
  });

  test("handles 6-character provider number", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      orderingProvider: "123456",
    });
    const pv1 = getFields(getSegment(hl7, "PV1")!);

    expect(pv1[9]).toBe("123456^^^AUSHICPR");
  });

  test("handles alphanumeric provider number", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      orderingProvider: "0123456T",
    });
    const pv1 = getFields(getSegment(hl7, "PV1")!);

    expect(pv1[9]).toBe("0123456T^^^AUSHICPR");
  });

  test("Medicare number with ref=1 explicitly set", () => {
    const patient: PatientData = {
      ...samplePatient,
      medicareNo: "1234567890",
      medicareRef: "1",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[3]).toBe("1234567890-1^^^AUSHIC^MC");
  });

  test("Medicare number with high ref number", () => {
    const patient: PatientData = {
      ...samplePatient,
      medicareNo: "1234567890",
      medicareRef: "9",
    };
    const hl7 = buildHL7Message(patient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[3]).toBe("1234567890-9^^^AUSHIC^MC");
  });
});

// =============================================================================
// Edge Cases - OBR Document Title
// =============================================================================

describe("Edge Cases - OBR Document Title", () => {
  test("explicit undefined documentTitle falls back to 'PDF Report'", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      documentTitle: undefined,
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    // Spread with explicit undefined overwrites the default, then
    // buildOBR's `options.documentTitle || "PDF Report"` fallback kicks in
    expect(obr[4]).toBe("PDF^PDF Report^L");
  });

  test("empty string documentTitle falls back to 'PDF Report'", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      documentTitle: "",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    // Empty string is falsy, so `options.documentTitle || "PDF Report"` kicks in
    expect(obr[4]).toBe("PDF^PDF Report^L");
  });

  test("OBR filler order uses custom sending application", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      sendingApplication: "MYAPP",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[3]).toMatch(/^RPT\d{14}\^MYAPP$/);
  });

  test("document title with all 5 HL7 special chars gets fully escaped", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      documentTitle: "A|B^C\\D~E&F",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    // The title inside OBR-4 should have all chars escaped
    expect(obr[4]).toContain("A\\F\\B\\S\\C\\E\\D\\R\\E\\T\\F");
  });
});

// =============================================================================
// Edge Cases - Filename Generation
// =============================================================================

describe("Edge Cases - Filename Generation", () => {
  test("filename with dots in name sanitizes them", () => {
    const patient: PatientData = {
      ...samplePatient,
      firstName: "J.R.",
      lastName: "Smith",
    };
    const filename = generateHL7Filename(patient);

    // Dots are not [a-zA-Z0-9_] so get replaced with _
    expect(filename).toMatch(/^Smith_J_R__\d{14}\.hl7$/);
  });

  test("filename with slashes in name sanitizes them", () => {
    const patient: PatientData = {
      ...samplePatient,
      firstName: "Test",
      lastName: "A/B",
    };
    const filename = generateHL7Filename(patient);

    // Slash replaced with underscore — no path traversal
    expect(filename).toMatch(/^A_B_Test_\d{14}\.hl7$/);
    expect(filename).not.toContain("/");
  });

  test("filename with accented chars replaces them with underscore", () => {
    const patient: PatientData = {
      ...samplePatient,
      firstName: "José",
      lastName: "Müller",
    };
    const filename = generateHL7Filename(patient);

    // Non-ASCII replaced by regex [^a-zA-Z0-9]
    expect(filename).not.toContain("é");
    expect(filename).not.toContain("ü");
    expect(filename).toMatch(/\.hl7$/);
  });

  test("two filenames generated in sequence have different timestamps", () => {
    const a = generateHL7Filename(samplePatient);
    // Small delay to ensure different second
    const b = generateHL7Filename(samplePatient);

    // Filenames share the name prefix but timestamps may differ
    expect(a).toMatch(/^Smith_John_/);
    expect(b).toMatch(/^Smith_John_/);
    // Both should be valid .hl7 files
    expect(a).toMatch(/\.hl7$/);
    expect(b).toMatch(/\.hl7$/);
  });
});

// =============================================================================
// Edge Cases - Message Uniqueness
// =============================================================================

describe("Edge Cases - Message Uniqueness", () => {
  test("10 consecutive messages all have unique control IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const hl7 = buildHL7Message(samplePatient, TINY_PDF);
      const msh = getFields(getSegment(hl7, "MSH")!);
      ids.add(msh[9]);
    }
    expect(ids.size).toBe(10);
  });

  test("OBR-7 and OBR-22 have same timestamp within one message", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obr = getFields(getSegment(hl7, "OBR")!);

    // Both timestamps generated in same buildOBR() call
    expect(obr[7]).toBe(obr[22]);
  });
});

// =============================================================================
// REF^I12 Message Structure
// =============================================================================

describe("REF^I12 Message Structure", () => {
  const refOptions = {
    messageType: "REF^I12" as const,
    referralInfo: {
      senderName: "Dr Sarah Jones",
      senderProviderNumber: "1234567A",
      senderClinic: "Springfield Medical",
      addresseeName: "Dr Michael Brown",
      addresseeClinic: "BJC Health",
    },
  };

  test("REF^I12 has correct segment order: MSH RF1 PRD PRD PID OBR OBX PV1", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, refOptions);
    const segments = getSegments(hl7);

    expect(segments).toHaveLength(8);
    expect(segments[0]).toMatch(/^MSH\|/);
    expect(segments[1]).toMatch(/^RF1\|/);
    expect(segments[2]).toMatch(/^PRD\|/);
    expect(segments[3]).toMatch(/^PRD\|/);
    expect(segments[4]).toMatch(/^PID\|/);
    expect(segments[5]).toMatch(/^OBR\|/);
    expect(segments[6]).toMatch(/^OBX\|/);
    expect(segments[7]).toMatch(/^PV1\|/); // PV1 is LAST in REF
  });

  test("REF^I12 with only sender has 7 segments (one PRD)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
      referralInfo: { senderName: "Dr Sarah Jones" },
    });
    const segments = getSegments(hl7);

    expect(segments).toHaveLength(7);
    expect(segments[1]).toMatch(/^RF1\|/);
    expect(segments[2]).toMatch(/^PRD\|RP~AP/);
  });

  test("REF^I12 with only addressee has 7 segments (one PRD)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
      referralInfo: { addresseeName: "Dr Michael Brown" },
    });
    const segments = getSegments(hl7);

    expect(segments).toHaveLength(7);
    expect(segments[1]).toMatch(/^RF1\|/);
    expect(segments[2]).toMatch(/^PRD\|RT~IR/);
  });

  test("REF^I12 with no referralInfo has 6 segments (RF1 but no PRD)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
    });
    const segments = getSegments(hl7);

    expect(segments).toHaveLength(6);
    expect(segments[0]).toMatch(/^MSH\|/);
    expect(segments[1]).toMatch(/^RF1\|/);
    expect(segments[2]).toMatch(/^PID\|/);
    expect(segments[3]).toMatch(/^OBR\|/);
    expect(segments[4]).toMatch(/^OBX\|/);
    expect(segments[5]).toMatch(/^PV1\|/);
  });

  test("REF^I12 still uses CR-only terminators", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, refOptions);

    expect(hl7).not.toContain("\n");
    expect(hl7).toContain("\r");
    expect(hl7.endsWith("\r")).toBe(true);
  });
});

// =============================================================================
// RF1 (Referral Information) Segment
// =============================================================================

describe("RF1 (Referral Information) Segment", () => {
  test("RF1 is present in REF^I12 messages", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
    });

    expect(getSegment(hl7, "RF1")).toBeDefined();
  });

  test("RF1 is NOT present in ORU^R01 messages", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);

    expect(getSegment(hl7, "RF1")).toBeUndefined();
  });

  test("RF1-7 has timestamp (Effective Date)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
    });
    const rf1 = getFields(getSegment(hl7, "RF1")!);

    // RF1 fields: RF1|empty|empty|empty|empty|empty|empty|timestamp
    expect(rf1[7]).toMatch(/^\d{14}$/);
  });

  test("RF1 has 8 fields total", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
    });
    const rf1 = getFields(getSegment(hl7, "RF1")!);

    expect(rf1).toHaveLength(8);
  });
});

// =============================================================================
// PRD (Provider Data) Segments
// =============================================================================

describe("PRD (Provider Data) Segments", () => {
  test("sender PRD has RP~AP role code", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
      referralInfo: { senderName: "Dr Sarah Jones", senderProviderNumber: "1234567A" },
    });
    const segments = getSegments(hl7);
    const senderPRD = segments.find((s) => s.startsWith("PRD|RP~AP"));

    expect(senderPRD).toBeDefined();
  });

  test("addressee PRD has RT~IR role code", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
      referralInfo: { addresseeName: "Dr Michael Brown" },
    });
    const segments = getSegments(hl7);
    const addresseePRD = segments.find((s) => s.startsWith("PRD|RT~IR"));

    expect(addresseePRD).toBeDefined();
  });

  test("sender PRD-2 has correct name format (LastName^FirstName^^^DR)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
      referralInfo: { senderName: "Dr Sarah Jones" },
    });
    const segments = getSegments(hl7);
    const senderPRD = getFields(segments.find((s) => s.startsWith("PRD|RP~AP"))!);

    expect(senderPRD[2]).toBe("Jones^Sarah^^^DR");
  });

  test("sender PRD-7 has provider number with AUSHICPR^UPIN", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
      referralInfo: { senderName: "Dr Sarah Jones", senderProviderNumber: "1234567A" },
    });
    const segments = getSegments(hl7);
    const senderPRD = getFields(segments.find((s) => s.startsWith("PRD|RP~AP"))!);

    expect(senderPRD[7]).toBe("1234567A^AUSHICPR^UPIN");
  });

  test("sender PRD-7 is empty when no provider number", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
      referralInfo: { senderName: "Dr Sarah Jones" },
    });
    const segments = getSegments(hl7);
    const senderPRD = getFields(segments.find((s) => s.startsWith("PRD|RP~AP"))!);

    expect(senderPRD[7]).toBe("");
  });

  test("addressee PRD-2 has correct name format", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
      referralInfo: { addresseeName: "Dr Emily Watson" },
    });
    const segments = getSegments(hl7);
    const addresseePRD = getFields(segments.find((s) => s.startsWith("PRD|RT~IR"))!);

    expect(addresseePRD[2]).toBe("Watson^Emily^^^DR");
  });

  test("PRD segments are NOT present in ORU^R01 messages", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      referralInfo: {
        senderName: "Dr Sarah Jones",
        addresseeName: "Dr Michael Brown",
      },
    });

    const segments = getSegments(hl7);
    const prdSegments = segments.filter((s) => s.startsWith("PRD|"));
    expect(prdSegments).toHaveLength(0);
  });

  test("PRD sender comes before PRD addressee", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
      referralInfo: {
        senderName: "Dr Sarah Jones",
        senderProviderNumber: "1234567A",
        addresseeName: "Dr Michael Brown",
      },
    });
    const segments = getSegments(hl7);
    const prdIndices = segments
      .map((s, i) => (s.startsWith("PRD|") ? i : -1))
      .filter((i) => i >= 0);

    expect(prdIndices).toHaveLength(2);
    expect(segments[prdIndices[0]]).toContain("RP~AP"); // sender first
    expect(segments[prdIndices[1]]).toContain("RT~IR"); // addressee second
  });

  test("PRD has 8 fields total", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
      referralInfo: { senderName: "Dr Sarah Jones", senderProviderNumber: "1234567A" },
    });
    const segments = getSegments(hl7);
    const prd = getFields(segments.find((s) => s.startsWith("PRD|"))!);

    expect(prd).toHaveLength(8);
  });
});

// =============================================================================
// OBR-24 (Diagnostic Service Section ID)
// =============================================================================

describe("OBR-24 (Diagnostic Service Section ID)", () => {
  test("OBR-24 is PHY for REF^I12 messages when diagnosticServiceSection=PHY (routes to Incoming Letters)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
      diagnosticServiceSection: "PHY",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[24]).toBe("PHY");
  });

  test("OBR-24 is empty for ORU^R01 messages", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[24]).toBe("");
  });

  test("OBR-24 is empty for REF^I12 messages when diagnosticServiceSection is omitted", () => {
    // Source of truth is now `diagnosticServiceSection`, not `messageType`.
    // Convert-service is responsible for passing PHY for referral types.
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[24]).toBe("");
  });

  test("OBR-25 is still correct after OBR-24 addition", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
      diagnosticServiceSection: "PHY",
      resultStatus: "P",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[24]).toBe("PHY");
    expect(obr[25]).toBe("P");
  });

  test("carrier value is used as MSH-3 Sending Application", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      sendingApplication: "EMAIL",
    });
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[2]).toBe("EMAIL");

    // OBR-3 filler order number should also reflect the carrier
    const obr = getFields(getSegment(hl7, "OBR")!);
    expect(obr[3]).toMatch(/^RPT\d+\^EMAIL$/);
  });
});

// =============================================================================
// OBR-24 by diagnostic service section (PR 1 — Results routing)
// =============================================================================

describe("OBR-24 by diagnostic service section", () => {
  test("OBR-24 is LAB when diagnosticServiceSection=LAB on ORU^R01 (pathology result)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "ORU^R01",
      diagnosticServiceSection: "LAB",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[24]).toBe("LAB");
  });

  test("OBR-24 is RAD when diagnosticServiceSection=RAD on ORU^R01 (radiology result)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "ORU^R01",
      diagnosticServiceSection: "RAD",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[24]).toBe("RAD");
  });

  test("OBR-24 is PHY when diagnosticServiceSection=PHY explicitly (not just inferred from REF)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "REF^I12",
      diagnosticServiceSection: "PHY",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[24]).toBe("PHY");
  });

  test("OBR-25 (result status) is still correct alongside OBR-24=LAB", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      diagnosticServiceSection: "LAB",
      resultStatus: "F",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[24]).toBe("LAB");
    expect(obr[25]).toBe("F");
  });

  test("OBR-25 (result status) is still correct alongside OBR-24=RAD with Preliminary status", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      diagnosticServiceSection: "RAD",
      resultStatus: "P",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr[24]).toBe("RAD");
    expect(obr[25]).toBe("P");
  });

  test("OBR-24 stays empty for ORU^R01 when diagnosticServiceSection is omitted", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      messageType: "ORU^R01",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    // Existing behavior: consent_form/generic ORU messages have empty OBR-24
    expect(obr[24]).toBe("");
  });

  test("OBR field count remains 26 with diagnosticServiceSection set", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {
      diagnosticServiceSection: "LAB",
    });
    const obr = getFields(getSegment(hl7, "OBR")!);

    expect(obr).toHaveLength(26);
  });
});
