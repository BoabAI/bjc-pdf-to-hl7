/**
 * Domain types — single source of truth for the conceptual entities that flow
 * through the converter pipeline.
 *
 * These are deliberately kept independent of any integration module (Bedrock,
 * HL7 builder, conversion config). Integrations and adapters depend on domain;
 * domain depends on nothing inside this repo.
 */

/**
 * The six document classes recognized by the pipeline. Source of truth for
 * routing, prompts, audit policy, and UI labels.
 *
 * `referral` covers both GP-authored and specialist-authored referral letters
 * — Nicole confirmed the operational distinction has no consequence (both
 * route to PHY → Genie Incoming Letters). Pre-collapse audit rows still carry
 * the legacy `"gp_referral"` / `"referral_letter"` strings; the display layer
 * (`prettifyDocType`) maps them all to "Referral letter" so historical buckets
 * stay coherent. The alias map in `lib/domain/document-type-aliases.ts`
 * translates the legacy strings forward when they arrive on the input side.
 *
 * `consult_letter` is specialist-to-GP correspondence ("Thanks for referring
 * X, I saw her today…"). Routed to Genie Incoming Letters the same way as a
 * referral (OBR-24=PHY, MSH-9=REF^I12).
 */
export type DocumentType =
  | "consent_form"
  | "referral"
  | "consult_letter"
  | "pathology_result"
  | "radiology_result"
  | "generic";

/** Patient sex code as used in HL7 PID-8. */
export type Sex = "M" | "F" | "U";

/**
 * Structured patient information extracted from a PDF and consumed by the HL7
 * builder. `dob` is HL7 YYYYMMDD (the builder format), not the DD/MM/YYYY the
 * vision tool emits.
 */
export interface PatientData {
  firstName: string;
  lastName: string;
  dob: string; // YYYYMMDD format
  sex: Sex;
  address?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  phone?: string;
  medicareNo?: string;
  medicareRef?: string;
}

/**
 * Sender, addressee, and CC information lifted from a referral letter. Used to
 * populate REF^I12 PRD segments and ORU OBR-16 sender block.
 */
export interface ReferralInfo {
  senderName?: string;
  senderClinic?: string;
  senderProviderNumber?: string;
  addresseeName?: string;
  addresseeClinic?: string;
  ccNames?: string[];
}

/**
 * Upstream mailbox the PDF arrived in. Acts as a soft prior for vision
 * classification and a misroute signal in audit (LLM verdict still wins).
 *
 * - `referrals` expects {referral, consult_letter}
 * - `results` expects {pathology_result, radiology_result}
 *
 * `consent_form` and `generic` are never flagged as disagreements (too
 * ambiguous — a consent form forwarded via the referrals mailbox isn't
 * a misroute, just a non-referral attachment).
 */
export type MailboxSource = "referrals" | "results";

/** HL7 MSH-9 message type. ORU for results, REF for referral letters. */
export type MessageType = "ORU^R01" | "REF^I12";

/**
 * HL7 OBR-24 Diagnostic Service Section ID — drives Genie inbox routing.
 *
 *   LAB = Pathology lab result (routes to Genie pathology inbox)
 *   RAD = Radiology / imaging result (routes to Genie radiology inbox)
 *   PHY = Physician (routes to Genie REF Incoming Letters)
 */
export type DiagnosticServiceSection = "LAB" | "RAD" | "PHY";

/**
 * HL7 OBR-25 result status. F = Final (auto-file in Genie),
 * P = Preliminary (queue for review).
 */
export type ResultStatus = "F" | "P";
