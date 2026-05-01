/**
 * Conversion policy helpers — pure mappings from domain types to HL7 message
 * type and UI labels. These are policy decisions shared by the API route, the
 * conversion service, and the audit-row builder.
 *
 * Keep this file dependency-free: domain types only. No Bedrock, no HL7 builder.
 */

import { isReferralDocumentType } from "@/lib/conversion-config";
import type { DocumentType, MessageType } from "@/lib/domain/types";

/**
 * Map a classified document type to its HL7 MSH-9 message type.
 * - Referral letters / GP referrals → REF^I12
 * - Everything else (results, consent forms, generic) → ORU^R01
 */
export function messageTypeForDocumentType(
  documentType: DocumentType
): MessageType {
  return isReferralDocumentType(documentType) ? "REF^I12" : "ORU^R01";
}

/**
 * Friendly UI label for a message type. Used in the conversion-result panel
 * header so operators see "REF (Referral)" / "ORU (Result)" instead of raw
 * HL7 codes.
 */
export function messageTypeDisplayLabel(messageType: MessageType): string {
  return messageType === "REF^I12" ? "REF (Referral)" : "ORU (Result)";
}
