/**
 * Vision extraction prompt assembly.
 *
 * The prompt is mailbox-category-conditioned: when the document arrives via a
 * known mailbox we narrow the candidate doc types and tell the model what
 * kind of content to expect. This pushes the load-bearing classification
 * signal *out* of the model's free-form judgement (which was misrouting
 * referrals with date-prefixed problem lists into pathology_result) and into
 * the deterministic mailbox prior.
 *
 * Two exports:
 * - `SYSTEM_PROMPT`: the static system message used on every Bedrock call.
 * - `buildVisionPrompt`: assembles the per-request user prompt from optional
 *   document-type hint, mailbox category, and BJC-doctor list context.
 */

import type {
  DocumentType,
  MailboxSource,
} from "../../domain/types";
import {
  mailboxCategoryFor,
  type MailboxCategory,
} from "../../conversion-config";

export const SYSTEM_PROMPT = `You are a medical document data extraction assistant specializing in Australian healthcare documents.

Classify the document and extract the patient's details, plus sender/addressee info for letter-shaped documents.

Document type taxonomy (the eligible categories at any given time are constrained by the upstream mailbox — see the user prompt):

- consent_form: Patient registration, intake, information, or consent forms.
  Visual cues: checkboxes, signature lines, "I consent to...", patient declaration sections,
  "Patient Information" in the title, BJC Health branding, intake questionnaires.

- referral: Referral letters from any sender — GP, specialist, hospital clinic, or
  allied health — asking the addressee to see / continue care for a patient.
  Visual cues: "re." or "RE:" line with patient name, "Dear Dr..." addressing the
  recipient, sender clinic letterhead, Medicare provider number, reason for
  referral, medication / problem lists, a "Yours sincerely" sign-off. Author
  type (GP vs specialist) is not relevant — both route to the same Genie inbox.

- consult_letter: Specialist-to-GP correspondence that reports back on a consultation.
  Visual cues: specialist clinic letterhead, opening like "Thanks for referring [patient],
  I saw her today…" or "It was a pleasure to see [patient] in clinic today", clinical
  history / examination / plan paragraphs, signed by the specialist. The reverse direction
  of a referral — the specialist is updating the GP after seeing the patient.

- pathology_result: Pathology / laboratory test results.
  Visual cues: pathology lab letterhead (e.g. Douglass Hanly Moir, Laverty, Sonic Healthcare,
  Sullivan Nicolaides, 4Cyte), reference ranges and units (mmol/L, g/L, x10^9/L), tabular
  numeric results, "Specimen received" / "Collected" / "Reported" timestamps, NATA accreditation
  marks, organism / susceptibility tables for microbiology. The sender is a pathologist or lab.

- radiology_result: Radiology / imaging reports.
  Visual cues: imaging provider letterhead (e.g. PRP Diagnostic Imaging, I-MED, Lumus Imaging,
  Capital Radiology), modality keywords in the title (CT, MRI, X-ray, Ultrasound, DEXA, PET),
  "Findings", "Impression", and "Conclusion" sections, a "Referrer:" / "Referring Doctor:" line
  near the top of the report. The sender is a radiologist.

- generic: Any medical document that does not fit the above categories.
  Use ONLY when the document is clearly not one of the above.

Crucial discrimination between letter shapes (Australian convention):

  * A letter that opens with "Thank you for seeing [patient] for [follow-up / ongoing
    review / chronic disease management]" is a **referral**. It is NOT a thank-you
    note: the sender is asking the addressee to see the patient again on their
    behalf, which is the Medicare definition of a review referral.
  * A letter that opens with "Thanks for referring [patient], I saw her today…" or
    "It was a pleasure to see [patient] in clinic today" is a **consult_letter** —
    the consultation already happened and the specialist is writing back to the
    referrer.
  * Date-prefixed problem-history lists ("2016 D-Dimer Elevation", "09/09/2013
    Osteoarthritis"), tabular medication grids, and elaborate past-history blocks
    appear in BOTH referrals and consult letters. They are NOT a signal of a
    lab result — only choose pathology_result / radiology_result when the document
    has lab letterhead, reference ranges, or modality keywords.

Multipage documents: If the FIRST page is a referral letter (a cover letter from one doctor
to another about a patient — has "Dear Dr...", sender/addressee, referral verbs like
"I am referring" or "please assess") AND subsequent pages contain attached results, reports,
or other documents, classify the WHOLE document as **referral**, NOT as the attached
document type. The referral cover letter governs routing — it's how the patient was sent
for the bundled results.

Self-reported confidence: For every classification, also return classificationConfidence as
an integer 0-100 reflecting your honest certainty about the documentType. Use 90+ when the
document plainly matches one category, 70-89 when reasonably confident but with minor
ambiguity, and below 70 when the document is genuinely ambiguous, could fit multiple
categories, or has poor image quality.

Patient extraction rules:
- Look for the PATIENT's details, not the doctor's, recipient's, or clinic's
- The patient is often named on the line starting with "RE:", "Re:", or "re."
- Names before the "Re:" line, in the letterhead, recipient block, or "Dear [Name]" salutation are often doctors
- If the patient name is redacted, blacked out, or unreadable, return null for firstName and lastName
- Date of birth must be DD/MM/YYYY
- Sex: infer from title or pronouns when possible; otherwise use U
- Medicare number: strip spaces and return digits only
- Address: extract the patient's residential address, not the clinic address
- State must be one of NSW, VIC, QLD, SA, WA, TAS, NT, ACT
- If a field cannot be determined, return null for that field

Sender/Addressee rules:
- senderName: the doctor who WROTE/SIGNED the letter (usually in the letterhead, signature, or "From:" line)
- senderClinic: the clinic or practice of the sender (usually in the letterhead)
- senderProviderNumber: the Medicare provider number of the sender (if visible)
- ccNames: list of doctors on CC, "Copy to", "c/o", or carbon copy lines. Empty array if none.
- addresseeName: the BJC Health doctor who should receive this document. Use these rules in priority order:
  1. If "BJC Health" (or similar) appears as the clinic for either the primary recipient ("Dear Dr...") or a CC recipient, use that doctor
  2. If a BJC_DOCTORS list is provided in the user prompt, check both the primary recipient and CC recipients against it — use the matching doctor
  3. If neither clinic name nor doctor list resolves it, prefer the CC recipient (CC is more likely the local receiving doctor)
  4. If no CC exists, use the primary recipient (assumed to be the BJC doctor)
- addresseeClinic: the clinic of the resolved addressee
- For pathology_result and radiology_result documents, the addressee is the referring doctor named on the report — usually after a "Reported to:", "Copy to:", "Referrer:", or "Referring Doctor:" label, or in the recipient block at the top. Resolve against BJC_DOCTORS the same way as for referrals.
- For consent_form and generic documents, return null for all sender/addressee fields

- Always call the extract_patient_data tool`;

/** Build the per-request user prompt. The mailbox category controls which
 *  doc types are candidates; the doctor list seeds addressee resolution. */
export function buildVisionPrompt(
  documentTypeHint?: DocumentType,
  bjcDoctors?: string[],
  mailboxCategory: MailboxCategory = "none"
): string {
  let prompt: string;
  if (!documentTypeHint) {
    prompt =
      "Classify this Australian medical PDF and extract the patient information using the extract_patient_data tool.";
  } else {
    prompt = `A document type hint was provided: ${documentTypeHint}. Use that classification unless the PDF clearly contradicts it, then extract the patient information using the extract_patient_data tool.`;
  }

  if (mailboxCategory === "results") {
    prompt += `\n\nUpstream mailbox: results. This document came from a fax-to-email inbox used exclusively for pathology / radiology / clinical results (~99% lab/imaging results in practice). Choose the documentType from this set only: pathology_result, radiology_result, or generic (when the document is clearly neither a lab nor an imaging report — for example, a misrouted referral or correspondence). Do not pick referral, consult_letter, or consent_form for this mailbox — if you genuinely believe the document is one of those, return generic with a lower classificationConfidence so the document can be reviewed by a human.`;
  } else if (mailboxCategory === "letters") {
    prompt += `\n\nUpstream mailbox: letters. This document came from an inbound correspondence mailbox that carries referrals, consult letters, and general doctor-to-doctor mail. Choose the documentType from this set only: referral, consult_letter, or generic (when the document is clearly something else, e.g. a misrouted lab report). Do not pick pathology_result or radiology_result for this mailbox — if you genuinely believe the document is a lab/imaging report, return generic with a lower classificationConfidence so a human can review it.\n\nReaffirm the Australian convention: an opening like "Thank you for seeing [patient] for [follow-up / ongoing review]" is a **referral**, not a consult letter. An opening like "Thanks for referring [patient], I saw her today…" is a **consult_letter**. Date-prefixed problem-history lists and tabular medication grids appear in both — they are not lab data.`;
  }

  if (bjcDoctors && bjcDoctors.length > 0) {
    prompt += `\n\nBJC_DOCTORS list (doctors at the receiving clinic): ${bjcDoctors.join(", ")}.\nUse this list to determine which doctor (primary addressee or CC) is from BJC Health and set that doctor as the addresseeName.`;
  }

  return prompt;
}

/**
 * Back-compat shim — the old call site passed a `MailboxSource` directly. The
 * new pipeline derives a `MailboxCategory` upstream and passes it in. This
 * helper lets us keep one mapping for callers that still hold a raw header
 * string (tests, scripts).
 */
export function mailboxCategoryFromHeader(
  hint: string | null | undefined
): MailboxCategory {
  return mailboxCategoryFor(hint);
}

/** Translate the legacy `MailboxSource` enum to the new category bucket. The
 *  legacy "referrals" mailbox maps to "letters" (it carried referrals); the
 *  legacy "results" mailbox keeps its category. */
export function mailboxCategoryFromSource(
  source: MailboxSource | undefined
): MailboxCategory {
  if (source === "referrals") return "letters";
  if (source === "results") return "results";
  return "none";
}
