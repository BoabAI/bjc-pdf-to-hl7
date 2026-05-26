/**
 * Sanitise free-text reference-data fields (doctor names, provider numbers,
 * carrier values/labels) before they are stored or sent to the API.
 *
 * Strips control characters (CR, LF, tabs, etc.) and trims surrounding
 * whitespace — these have no legitimate place in these fields and most often
 * arrive as invisible passengers when a value is pasted out of Word/Outlook.
 *
 * HL7 *separator* characters (`| ^ ~ & \`) are intentionally **preserved**: the
 * HL7 builder (`escapeHL7` in lib/hl7-builder.ts) escapes them on output, so a
 * name like "Dr Smith & Associates" is stored as-is and emitted safely as
 * "Smith \T\ Associates". Rejecting them at input was redundant and surfaced as
 * a confusing "Save failed" for ordinary names.
 *
 * Safe to import on both server and client (pure string work, no dependencies).
 */
export function sanitizeReferenceField(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f]/g, "").trim();
}
