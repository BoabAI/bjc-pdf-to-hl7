import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildHL7Message,
  generateHL7Filename,
  type PatientData,
} from "./hl7-builder";

const TEST_PDF_PATH = join(
  import.meta.dir,
  "../docs/input PDF/Patient_Information_and_Consent_Form_2025-12-10T14-09-58_29503708_0 (1).pdf"
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
  test("contains all 5 required segments in order", () => {
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

    expect(msh[2]).toBe("MEDIHOST"); // MSH-3: Sending Application
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

  test("has ORU^R01 message type (MSH-9)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[8]).toBe("ORU^R01");
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

  test("has HL7 version 2.4 (MSH-12)", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF);
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[11]).toBe("2.4");
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

  test("formats Medicare with ref as number-ref^^^Medicare^MC (PID-3)", () => {
    const hl7 = buildHL7Message(fullPatient, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[3]).toBe("2123456789-3^^^Medicare^MC");
  });

  test("defaults Medicare ref to 1 when not provided", () => {
    const patientNoRef: PatientData = {
      ...samplePatient,
      medicareNo: "9876543210",
    };
    const hl7 = buildHL7Message(patientNoRef, TINY_PDF);
    const pid = getFields(getSegment(hl7, "PID")!);

    expect(pid[3]).toBe("9876543210-1^^^Medicare^MC");
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

    // OBR-3: RPT<timestamp>^MEDIHOST
    expect(obr[3]).toMatch(/^RPT\d{14}\^MEDIHOST$/);
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
    expect(msh[2]).toBe("MEDIHOST");
    expect(msh[4]).toBe("GENIE");
    expect(msh[5]).toBe("CLINIC");
  });

  test("empty options object uses all defaults", () => {
    const hl7 = buildHL7Message(samplePatient, TINY_PDF, {});
    const msh = getFields(getSegment(hl7, "MSH")!);

    expect(msh[2]).toBe("MEDIHOST");
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
    expect(getSegment(hl7, "PID")).toContain("2123456789-3^^^Medicare^MC");
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
