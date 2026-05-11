/**
 * HL7 v2.4 Message Builder for Australian Pathology (Genie-compatible)
 * Based on Australian Diagnostics and Referral Messaging (ADRM) specification
 * Supports both ORU^R01 (results) and REF^I12 (referral letters) message types
 */

import type {
  DiagnosticServiceSection,
  DocumentType,
  MessageType,
  PatientData,
  ReferralInfo,
  ResultStatus,
} from "./domain/types";
import {
  createHL7BuildContext,
  type HL7BuildContext,
} from "./hl7/build-context";
import { segment } from "./hl7/segment";
import { isResultDocumentType } from "./conversion-config";

export type { HL7BuildContext } from "./hl7/build-context";
export { createHL7BuildContext } from "./hl7/build-context";

export interface HL7Options {
  sendingApplication?: string;
  sendingFacility?: string;
  receivingApplication?: string;
  receivingFacility?: string;
  documentTitle?: string;
  // Genie actions
  resultStatus?: ResultStatus; // OBR-25: Final (auto-file) or Preliminary (queue for review)
  orderingProvider?: string; // PV1-9: Medicare Provider Number for doctor routing
  messageType?: MessageType; // MSH-9: ORU for results, REF for referral letters
  referralInfo?: ReferralInfo; // Sender/addressee info for referral letters
  // OBR-24: Diagnostic Service Section ID
  //   LAB = Pathology lab result (routes to Genie pathology inbox)
  //   RAD = Radiology / imaging result (routes to Genie radiology inbox)
  //   PHY = Physician (routes to Genie REF Incoming Letters)
  // When omitted, OBR-24 is left empty (preserves existing consent_form/generic behavior).
  diagnosticServiceSection?: DiagnosticServiceSection;
  /**
   * Drives OBR-16 source selection. For results documents (pathology_result,
   * radiology_result) the LAB is the sender and the ordering doctor lives on
   * the addressee; OBR-16 ("Ordered By") must therefore source from
   * `referralInfo.addresseeName`. For all other types (referral_letter,
   * gp_referral, consent_form, generic) OBR-16 keeps the legacy behaviour of
   * sourcing from `referralInfo.senderName`. When omitted, the legacy
   * (sender-based) behaviour applies.
   */
  documentType?: DocumentType;
}

const DEFAULT_OPTIONS: HL7Options = {
  sendingApplication: "SMECAI",
  sendingFacility: "BJCHEALTH",
  receivingApplication: "GENIE",
  receivingFacility: "CLINIC",
  documentTitle: "Patient Consent Form",
};

// HL7 encoding characters (MSH-2). MSH-1 is the field separator (`|`).
const ENCODING_CHARS = "^~\\&";
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
 * Build MSH (Message Header) segment.
 *
 * MSH-1 is the field separator (`|`) — produced naturally by joining
 * the segment name with field 2. MSH-2 is the encoding-character set.
 */
function buildMSH(options: HL7Options, context: HL7BuildContext): string {
  const isREF = options.messageType === "REF^I12";

  // MSH-12: Version ID
  // For REF^I12: extended version with AU simplified REF profile identifier
  // For ORU^R01: plain 2.4
  const versionId = isREF
    ? "2.4^AUS&Australia&ISO3166_1^HL7AU-OO-REF-SIMPLIFIED-201706&&L"
    : "2.4";

  return segment("MSH", {
    // MSH-2: Encoding Characters
    2: ENCODING_CHARS,
    // MSH-3: Sending Application
    3: options.sendingApplication ? escapeHL7(options.sendingApplication) : options.sendingApplication,
    // MSH-4: Sending Facility
    4: options.sendingFacility ? escapeHL7(options.sendingFacility) : options.sendingFacility,
    // MSH-5: Receiving Application
    5: options.receivingApplication ? escapeHL7(options.receivingApplication) : options.receivingApplication,
    // MSH-6: Receiving Facility
    6: options.receivingFacility ? escapeHL7(options.receivingFacility) : options.receivingFacility,
    // MSH-7: Date/Time of Message
    7: context.timestamp,
    // MSH-8: Security (empty)
    // MSH-9: Message Type
    9: options.messageType || "ORU^R01",
    // MSH-10: Message Control ID
    10: context.messageId,
    // MSH-11: Processing ID (P=Production)
    11: "P",
    // MSH-12: Version ID
    12: versionId,
    // MSH-13: Sequence Number (empty)
    // MSH-14: Continuation Pointer (empty)
    // MSH-15: Accept Acknowledgment Type
    15: "AL",
    // MSH-16: Application Acknowledgment Type
    16: "NE",
    // MSH-17: Country Code
    17: "AUS",
    // MSH-18: Character Set
    18: "8859/1",
  });
}

/**
 * Build PID (Patient Identification) segment
 */
function buildPID(patient: PatientData): string {
  // PID-3: Patient Identifier List
  //   Medicare format: number-IRN^^^AUSHIC^MC (IRN defaults to 1)
  let patientId = "";
  if (patient.medicareNo) {
    const ref = patient.medicareRef || "1";
    patientId = `${patient.medicareNo}-${ref}^^^AUSHIC^MC`;
  }

  // PID-11: Patient Address — street^street2^suburb^state^postcode^country
  let address = "";
  if (patient.address || patient.suburb) {
    address = [
      escapeHL7(patient.address || ""),
      "", // Street 2
      escapeHL7(patient.suburb || ""),
      patient.state || "VIC",
      patient.postcode || "",
      "AUS",
    ].join("^");
  }

  // PID-5: Patient Name (LastName^FirstName)
  const patientName = `${escapeHL7(patient.lastName)}^${escapeHL7(patient.firstName)}`;

  return segment("PID", {
    // PID-1: Set ID
    1: "1",
    // PID-2: Patient ID (External) — empty
    // PID-3: Patient Identifier List
    3: patientId,
    // PID-4: Alternate Patient ID — empty
    // PID-5: Patient Name
    5: patientName,
    // PID-6: Mother's Maiden Name — empty
    // PID-7: Date of Birth
    7: patient.dob,
    // PID-8: Sex
    8: patient.sex,
    // PID-9: Patient Alias — empty
    // PID-10: Race — empty
    // PID-11: Patient Address
    11: address,
    // PID-12: County Code — empty
    // PID-13: Phone Number (Home)
    13: patient.phone ? escapeHL7(patient.phone) : "",
  });
}

/**
 * Build PV1 (Patient Visit) segment.
 *
 * Two shapes are produced today, both byte-identical to the pre-refactor
 * code:
 *   - Minimal: PV1|1|O          (no provider, no addressee)
 *   - Routed:  PV1|1|O||||||||<XCN>   (PV1-9 carries doctor / provider)
 */
function buildPV1(options: HL7Options): string {
  // PV1-1: Set ID
  // PV1-2: Patient Class (O = Outpatient)
  // PV1-9: Consulting Doctor (routes to this doctor's inbox in Genie)
  let consultingDoctor: string | undefined;

  if (options.orderingProvider) {
    // Provider number routing: ProviderNumber^^^AUSHICPR
    consultingDoctor = `${escapeHL7(options.orderingProvider)}^^^AUSHICPR`;
  } else if (options.referralInfo?.addresseeName) {
    // Name-only routing from referral addressee: ^Last^First^^^DR
    const { lastName, firstName } = parseDoctorName(options.referralInfo.addresseeName);
    consultingDoctor = `^${lastName}^${firstName}^^^DR`;
  }

  if (consultingDoctor === undefined) {
    // Minimal PV1 — preserves historical exact-3-fields output
    return segment("PV1", { 1: "1", 2: "O" });
  }

  return segment("PV1", {
    1: "1",
    2: "O",
    9: consultingDoctor,
  });
}

/**
 * Build OBR (Observation Request) segment
 */
function buildOBR(options: HL7Options, context: HL7BuildContext): string {
  const reportId = `RPT${context.timestamp}^${escapeHL7(options.sendingApplication ?? "")}`;
  const serviceId = `PDF^${escapeHL7(options.documentTitle || "PDF Report")}^L`;

  // OBR-16: Ordering Provider ("Ordered By" in Genie).
  //
  // For results documents (pathology_result, radiology_result) the LAB is the
  // sender and the ordering doctor sits on the addressee block, so OBR-16 must
  // source from `referralInfo.addresseeName`. For every other document type
  // (referral_letter, gp_referral, consent_form, generic, or missing) OBR-16
  // sources from `referralInfo.senderName` — the historical behaviour.
  // If the chosen source is empty, OBR-16 is left empty rather than synthesised.
  let orderingProviderField = "";
  const ref = options.referralInfo;
  const isResultDoc =
    options.documentType !== undefined &&
    isResultDocumentType(options.documentType);
  const orderingDoctorName = isResultDoc ? ref?.addresseeName : ref?.senderName;
  // Provider number is only meaningful for the sender path today —
  // `ReferralInfo` has no `addresseeProviderNumber` field.
  const orderingProviderNumber = isResultDoc ? "" : ref?.senderProviderNumber || "";

  if (orderingDoctorName) {
    const { lastName, firstName } = parseDoctorName(orderingDoctorName);
    orderingProviderField = orderingProviderNumber
      ? // ProviderNumber^LastName^FirstName^^^DR^^^AUSHICPR
        `${escapeHL7(orderingProviderNumber)}^${lastName}^${firstName}^^^DR^^^AUSHICPR`
      : // ^LastName^FirstName^^^DR
        `^${lastName}^${firstName}^^^DR`;
  }

  return segment("OBR", {
    // OBR-1: Set ID
    1: "1",
    // OBR-2: Placer Order Number — empty
    // OBR-3: Filler Order Number
    3: reportId,
    // OBR-4: Universal Service Identifier
    4: serviceId,
    // OBR-5..6: empty
    // OBR-7: Observation Date/Time
    7: context.timestamp,
    // OBR-8..15: empty
    // OBR-16: Ordering Provider
    16: orderingProviderField,
    // OBR-17..21: empty
    // OBR-22: Results Rpt/Status Chng
    22: context.timestamp,
    // OBR-23: empty
    // OBR-24: Diagnostic Service Section ID
    //   LAB = Pathology lab result (routes to Genie pathology inbox)
    //   RAD = Radiology / imaging result (routes to Genie radiology inbox)
    //   PHY = Physician (routes to Genie REF Incoming Letters)
    // Source of truth is `diagnosticServiceSection` (set by convert-service from
    // the document type). When omitted, OBR-24 is left empty (consent_form/generic
    // and any caller that hasn't opted in to results routing).
    24: options.diagnosticServiceSection ?? "",
    // OBR-25: Result Status (F=Final/auto-file, P=Preliminary/queue)
    25: options.resultStatus || "F",
  });
}

/**
 * Build OBX (Observation/Result) segment with embedded PDF
 */
function buildOBX(pdfBase64: string): string {
  // ED format: source^type^subtype^encoding^data
  // For PDF: ^application^pdf^Base64^<base64data>
  const observationValue = `^application^pdf^Base64^${pdfBase64}`;

  return segment("OBX", {
    // OBX-1: Set ID
    1: "1",
    // OBX-2: Value Type (ED = Encapsulated Data)
    2: "ED",
    // OBX-3: Observation Identifier (AUSPDI format)
    3: "PDF^Display format in PDF^AUSPDI",
    // OBX-4: Observation Sub-ID — empty
    // OBX-5: Observation Value (ED format)
    5: observationValue,
    // OBX-6..10: empty
    // OBX-11: Observation Result Status
    11: "F",
  });
}

/**
 * Build RF1 (Referral Information) segment - required for REF^I12
 */
function buildRF1(context: HL7BuildContext): string {
  return segment("RF1", {
    // RF1-1: Referral Status (empty — explicitly set so the helper renders
    // fields 1..7 rather than collapsing to a single field at position 1)
    1: "",
    // RF1-2..6: empty (omitted keys render as empty between min and max)
    // RF1-7: Effective Date
    7: context.timestamp,
  });
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

  // PRD-7: Provider Identifiers (CM format: ProviderNumber^AssigningAuthority^IdentifierType)
  const providerIds = providerNumber ? `${escapeHL7(providerNumber)}^AUSHICPR^UPIN` : "";

  return segment("PRD", {
    // PRD-1: Provider Role
    1: roleCode,
    // PRD-2: Provider Name
    2: providerName,
    // PRD-3..6: empty (Address, Location, Communication Information, Provider Id No)
    // PRD-7: Provider Identifiers
    7: providerIds,
  });
}

function buildReferralProviderSegments(options: HL7Options): string[] {
  const ref = options.referralInfo;
  return [
    ...(ref?.senderName
      ? [buildPRD("sender", ref.senderName, ref.senderProviderNumber)]
      : []),
    ...(ref?.addresseeName ? [buildPRD("addressee", ref.addresseeName)] : []),
  ];
}

function buildRefSegments(
  patient: PatientData,
  pdfBase64: string,
  options: HL7Options,
  context: HL7BuildContext,
): string[] {
  return [
    buildMSH(options, context),
    buildRF1(context),
    ...buildReferralProviderSegments(options),
    buildPID(patient),
    buildOBR(options, context),
    buildOBX(pdfBase64),
    buildPV1(options),
  ];
}

function buildOruSegments(
  patient: PatientData,
  pdfBase64: string,
  options: HL7Options,
  context: HL7BuildContext,
): string[] {
  return [
    buildMSH(options, context),
    buildPID(patient),
    buildPV1(options),
    buildOBR(options, context),
    buildOBX(pdfBase64),
  ];
}

/**
 * Build complete HL7 message with embedded PDF
 *
 * Segment order varies by message type:
 * - ORU^R01: MSH → PID → PV1 → OBR → OBX
 * - REF^I12: MSH → RF1 → PRD(s) → PID → OBR → OBX → PV1
 *
 * The optional `context` parameter pins MSH-7 / OBR-7 / OBR-22 / RF1-7 and
 * MSH-10 across the whole message. When omitted, a fresh context is created
 * (current time + random 4-char message-ID suffix), preserving historical
 * behaviour for all existing call sites.
 */
export function buildHL7Message(
  patient: PatientData,
  pdfBuffer: Buffer,
  options: Partial<HL7Options> = {},
  context: HL7BuildContext = createHL7BuildContext(),
): string {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Convert PDF to Base64 (no line breaks or spaces)
  const pdfBase64 = pdfBuffer.toString("base64");
  const segments =
    mergedOptions.messageType === "REF^I12"
      ? buildRefSegments(patient, pdfBase64, mergedOptions, context)
      : buildOruSegments(patient, pdfBase64, mergedOptions, context);

  // Join segments with CR (carriage return) only - no LF
  return segments.join(SEGMENT_TERMINATOR) + SEGMENT_TERMINATOR;
}

/**
 * Generate filename for HL7 file based on patient data.
 *
 * The optional `context` parameter pins the timestamp portion of the
 * filename so a paired `buildHL7Message` + `generateHL7Filename` call can
 * use the same timestamp. When omitted, a fresh context is created.
 */
export function generateHL7Filename(
  patient: PatientData,
  context: HL7BuildContext = createHL7BuildContext(),
): string {
  const safeName = `${patient.lastName}_${patient.firstName}`.replace(/[^a-zA-Z0-9]/g, "_");
  return `${safeName}_${context.timestamp}.hl7`;
}
