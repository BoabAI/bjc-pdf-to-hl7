/**
 * HL7 v2.4 Message Builder for Australian Pathology (Genie-compatible)
 * Based on Australian Diagnostics and Referral Messaging (ADRM) specification
 * Supports both ORU^R01 (results) and REF^I12 (referral letters) message types
 */

import type { ReferralInfo } from "./vision-extractor";

export interface PatientData {
  firstName: string;
  lastName: string;
  dob: string; // YYYYMMDD format
  sex: "M" | "F" | "U";
  address?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  phone?: string;
  medicareNo?: string;
  medicareRef?: string;
}

export interface HL7Options {
  sendingApplication?: string;
  sendingFacility?: string;
  receivingApplication?: string;
  receivingFacility?: string;
  documentTitle?: string;
  // Genie actions
  resultStatus?: "F" | "P"; // OBR-25: Final (auto-file) or Preliminary (queue for review)
  orderingProvider?: string; // PV1-9: Medicare Provider Number for doctor routing
  messageType?: "ORU^R01" | "REF^I12"; // MSH-9: ORU for results, REF for referral letters
  referralInfo?: ReferralInfo; // Sender/addressee info for referral letters
}

const DEFAULT_OPTIONS: HL7Options = {
  sendingApplication: "SMECAI",
  sendingFacility: "BJCHEALTH",
  receivingApplication: "GENIE",
  receivingFacility: "CLINIC",
  documentTitle: "Patient Consent Form",
};

// HL7 field separator and encoding characters
const FIELD_SEP = "|";
const ENCODING_CHARS = "^~\\&";
const COMPONENT_SEP = "^";
const SEGMENT_TERMINATOR = "\r"; // CR only, no LF

/**
 * Parse a doctor name string into XCN components (lastName, firstName)
 * Handles "Dr FirstName LastName", "Dr. FirstName LastName", "FirstName LastName"
 */
function parseDoctorName(name: string): { lastName: string; firstName: string } {
  const nameParts = name.replace(/^Dr\.?\s*/i, "").trim().split(/\s+/);
  return {
    lastName: escapeHL7(nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0]),
    firstName: escapeHL7(nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : ""),
  };
}

/**
 * Escape special characters in HL7 data
 */
function escapeHL7(value: string): string {
  return value
    .replace(/[\x00-\x1f\x7f]/g, " ") // Strip control characters (CR, LF, tabs, etc.) — these break HL7 segment structure
    .replace(/\\/g, "\\E\\") // Escape character first
    .replace(/\|/g, "\\F\\") // Field separator
    .replace(/\^/g, "\\S\\") // Component separator
    .replace(/~/g, "\\R\\") // Repetition separator
    .replace(/&/g, "\\T\\"); // Subcomponent separator
}

/**
 * Generate HL7 timestamp in YYYYMMDDHHMMSS format
 */
function getHL7Timestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

/**
 * Generate unique message control ID
 */
function generateMessageId(): string {
  return `MSG${getHL7Timestamp()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

/**
 * Build MSH (Message Header) segment
 */
function buildMSH(options: HL7Options): string {
  const timestamp = getHL7Timestamp();
  const messageId = generateMessageId();

  // MSH-1: Field Separator (|)
  // MSH-2: Encoding Characters (^~\&)
  // MSH-3: Sending Application
  // MSH-4: Sending Facility
  // MSH-5: Receiving Application
  // MSH-6: Receiving Facility
  // MSH-7: Date/Time of Message
  // MSH-8: Security (empty)
  // MSH-9: Message Type (ORU^R01)
  // MSH-10: Message Control ID
  // MSH-11: Processing ID (P=Production)
  // MSH-12: Version ID (2.4)
  // MSH-13-14: empty
  // MSH-15: Accept Acknowledgment Type (AL)
  // MSH-16: Application Acknowledgment Type (NE)
  // MSH-17: Country Code (AUS)
  // MSH-18: Character Set (8859/1)

  const isREF = options.messageType === "REF^I12";

  // MSH-12: Version ID
  // For REF^I12: extended version with AU simplified REF profile identifier
  // For ORU^R01: plain 2.4
  const versionId = isREF
    ? "2.4^AUS&Australia&ISO3166_1^HL7AU-OO-REF-SIMPLIFIED-201706&&L"
    : "2.4";

  return [
    "MSH",
    ENCODING_CHARS,
    options.sendingApplication,
    options.sendingFacility,
    options.receivingApplication,
    options.receivingFacility,
    timestamp,
    "", // Security
    options.messageType || "ORU^R01",
    messageId,
    "P",
    versionId,
    "", // Sequence Number
    "", // Continuation Pointer
    "AL",
    "NE",
    "AUS",
    "8859/1",
  ].join(FIELD_SEP);
}

/**
 * Build PID (Patient Identification) segment
 */
function buildPID(patient: PatientData): string {
  // Format Medicare number with Individual Reference Number (IRN)
  // ADRM format: number-IRN^^^AUSHIC^MC
  let patientId = "";
  if (patient.medicareNo) {
    const ref = patient.medicareRef || "1";
    patientId = `${patient.medicareNo}-${ref}^^^AUSHIC^MC`;
  }

  // Format address
  let address = "";
  if (patient.address || patient.suburb) {
    address = [
      escapeHL7(patient.address || ""),
      "", // Street 2
      escapeHL7(patient.suburb || ""),
      patient.state || "VIC",
      patient.postcode || "",
      "AUS",
    ].join(COMPONENT_SEP);
  }

  // Format name: LastName^FirstName
  const patientName = `${escapeHL7(patient.lastName)}^${escapeHL7(patient.firstName)}`;

  // PID-1: Set ID
  // PID-2: Patient ID (External) - empty
  // PID-3: Patient Identifier List
  // PID-4: Alternate Patient ID - empty
  // PID-5: Patient Name
  // PID-6: Mother's Maiden Name - empty
  // PID-7: Date of Birth
  // PID-8: Sex
  // PID-9-10: empty
  // PID-11: Patient Address
  // PID-12: empty
  // PID-13: Phone Number (Home)

  return [
    "PID",
    "1",
    "", // External ID
    patientId,
    "", // Alternate ID
    patientName,
    "", // Mother's Maiden Name
    patient.dob,
    patient.sex,
    "", // Patient Alias
    "", // Race
    address,
    "", // County Code
    patient.phone ? escapeHL7(patient.phone) : "",
  ].join(FIELD_SEP);
}

/**
 * Build PV1 (Patient Visit) segment
 */
function buildPV1(options: HL7Options): string {
  // PV1-1: Set ID
  // PV1-2: Patient Class (O = Outpatient)
  // PV1-9: Consulting Doctor (routes to this doctor's inbox in Genie)
  const fields = ["PV1", "1", "O"];

  if (options.orderingProvider) {
    // Pad fields 3-8 (empty)
    for (let i = 0; i < 6; i++) fields.push("");
    // PV1-9: Consulting Doctor with Medicare Provider Number
    // Format: ProviderNumber^^^AUSHICPR
    fields.push(`${options.orderingProvider}^^^AUSHICPR`);
  } else if (options.referralInfo?.addresseeName) {
    // Pad fields 3-8 (empty)
    for (let i = 0; i < 6; i++) fields.push("");
    // PV1-9: Consulting Doctor from referral addressee (name only, no provider number)
    const { lastName, firstName } = parseDoctorName(options.referralInfo.addresseeName);
    fields.push(`^${lastName}^${firstName}^^^DR`);
  }

  return fields.join(FIELD_SEP);
}

/**
 * Build OBR (Observation Request) segment
 */
function buildOBR(options: HL7Options): string {
  const timestamp = getHL7Timestamp();
  const reportId = `RPT${timestamp}^${options.sendingApplication}`;
  const serviceId = `PDF^${escapeHL7(options.documentTitle || "PDF Report")}^L`;

  // OBR-1: Set ID
  // OBR-2: Placer Order Number - empty
  // OBR-3: Filler Order Number
  // OBR-4: Universal Service Identifier
  // OBR-5-6: empty
  // OBR-7: Observation Date/Time
  // OBR-8-24: mostly empty
  // OBR-25: Result Status (F = Final)

  const fields = ["OBR", "1", "", reportId, serviceId];

  // Pad empty fields up to OBR-7
  fields.push("", "");
  fields.push(timestamp); // OBR-7

  // OBR-8 through OBR-15 (empty)
  for (let i = 0; i < 8; i++) {
    fields.push("");
  }

  // OBR-16: Ordering Provider (sender of the referral letter)
  const ref = options.referralInfo;
  if (ref?.senderName) {
    const provNum = ref.senderProviderNumber || "";
    const { lastName: senderLast, firstName: senderFirst } = parseDoctorName(ref.senderName);
    if (provNum) {
      // Format: ProviderNumber^LastName^FirstName^^^DR^^^AUSHICPR
      fields.push(`${provNum}^${senderLast}^${senderFirst}^^^DR^^^AUSHICPR`);
    } else {
      // Format: ^LastName^FirstName^^^DR
      fields.push(`^${senderLast}^${senderFirst}^^^DR`);
    }
  } else {
    fields.push("");
  }

  // OBR-17 through OBR-21 (empty)
  for (let i = 0; i < 5; i++) {
    fields.push("");
  }

  fields.push(timestamp); // OBR-22: Results Rpt/Status Chng
  fields.push(""); // OBR-23

  // OBR-24: Diagnostic Service Section ID
  // PHY = Physician (routes to Incoming Letters in Genie REF)
  // Empty for ORU messages (routes to Pathology/Radiology by default)
  const isREF = options.messageType === "REF^I12";
  fields.push(isREF ? "PHY" : "");

  fields.push(options.resultStatus || "F"); // OBR-25: Result Status (F=Final/auto-file, P=Preliminary/queue)

  return fields.join(FIELD_SEP);
}

/**
 * Build OBX (Observation/Result) segment with embedded PDF
 */
function buildOBX(pdfBase64: string): string {
  // OBX-1: Set ID
  // OBX-2: Value Type (ED = Encapsulated Data)
  // OBX-3: Observation Identifier (AUSPDI format)
  // OBX-4: Observation Sub-ID - empty
  // OBX-5: Observation Value (ED format: ^application^pdf^Base64^<data>)
  // OBX-6-10: empty
  // OBX-11: Observation Result Status (F = Final)

  const observationId = "PDF^Display format in PDF^AUSPDI";

  // ED format: source^type^subtype^encoding^data
  // For PDF: ^application^pdf^Base64^<base64data>
  const observationValue = `^application^pdf^Base64^${pdfBase64}`;

  return [
    "OBX",
    "1",
    "ED",
    observationId,
    "", // Sub-ID
    observationValue,
    "", // Units
    "", // Reference Range
    "", // Abnormal Flags
    "", // Probability
    "", // Nature of Abnormal Test
    "F", // Result Status
  ].join(FIELD_SEP);
}

/**
 * Build RF1 (Referral Information) segment - required for REF^I12
 */
function buildRF1(): string {
  const timestamp = getHL7Timestamp();
  // RF1-1: Referral Status (empty)
  // RF1-2: Referral Priority (empty)
  // RF1-3: Referral Type (empty)
  // RF1-4: Referral Disposition (empty)
  // RF1-5: Referral Category (empty)
  // RF1-6: Originating Referral Identifier (empty)
  // RF1-7: Effective Date (timestamp)
  return ["RF1", "", "", "", "", "", "", timestamp].join(FIELD_SEP);
}

/**
 * Build PRD (Provider Data) segment - required for REF^I12
 * Used to identify sender (RP~AP = Referring+Authoring Provider) and
 * addressee (RT~IR = Referred-To+Intended Recipient)
 */
function buildPRD(
  role: "sender" | "addressee",
  name: string,
  providerNumber?: string,
): string {
  // PRD-1: Provider Role
  //   Sender:    RP (Referring Provider) + AP (Authoring Provider)
  //   Addressee: RT (Referred-To Provider) + IR (Intended Recipient)
  const roleCode = role === "sender" ? "RP~AP" : "RT~IR";

  const { lastName, firstName } = parseDoctorName(name);

  // PRD-2: Provider Name (XPN format: LastName^FirstName^^^Prefix)
  const providerName = `${lastName}^${firstName}^^^DR`;

  // PRD-3 through PRD-6: empty
  // PRD-7: Provider Identifiers (CM format: ProviderNumber^AssigningAuthority^IdentifierType)
  let providerIds = "";
  if (providerNumber) {
    providerIds = `${providerNumber}^AUSHICPR^UPIN`;
  }

  return [
    "PRD",
    roleCode,
    providerName,
    "", // Provider Address
    "", // Provider Location
    "", // Provider Communication Information
    "", // Provider Id No
    providerIds,
  ].join(FIELD_SEP);
}

/**
 * Build complete HL7 message with embedded PDF
 *
 * Segment order varies by message type:
 * - ORU^R01: MSH → PID → PV1 → OBR → OBX
 * - REF^I12: MSH → RF1 → PRD(s) → PID → OBR → OBX → PV1
 */
export function buildHL7Message(
  patient: PatientData,
  pdfBuffer: Buffer,
  options: Partial<HL7Options> = {}
): string {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const isREF = mergedOptions.messageType === "REF^I12";

  // Convert PDF to Base64 (no line breaks or spaces)
  const pdfBase64 = pdfBuffer.toString("base64");

  let segments: string[];

  if (isREF) {
    // REF^I12 segment order: MSH → RF1 → PRD(s) → PID → OBR → OBX → PV1
    segments = [buildMSH(mergedOptions)];

    // RF1: Referral Information (required for REF)
    segments.push(buildRF1());

    // PRD: Provider Data segments (required for REF)
    const ref = mergedOptions.referralInfo;
    if (ref?.senderName) {
      segments.push(buildPRD("sender", ref.senderName, ref.senderProviderNumber));
    }
    if (ref?.addresseeName) {
      segments.push(buildPRD("addressee", ref.addresseeName));
    }

    segments.push(buildPID(patient));
    segments.push(buildOBR(mergedOptions));
    segments.push(buildOBX(pdfBase64));
    segments.push(buildPV1(mergedOptions)); // PV1 last in REF
  } else {
    // ORU^R01 segment order: MSH → PID → PV1 → OBR → OBX
    segments = [
      buildMSH(mergedOptions),
      buildPID(patient),
      buildPV1(mergedOptions),
      buildOBR(mergedOptions),
      buildOBX(pdfBase64),
    ];
  }

  // Join segments with CR (carriage return) only - no LF
  return segments.join(SEGMENT_TERMINATOR) + SEGMENT_TERMINATOR;
}

/**
 * Generate filename for HL7 file based on patient data
 */
export function generateHL7Filename(patient: PatientData): string {
  const timestamp = getHL7Timestamp();
  const safeName = `${patient.lastName}_${patient.firstName}`.replace(/[^a-zA-Z0-9]/g, "_");
  return `${safeName}_${timestamp}.hl7`;
}
