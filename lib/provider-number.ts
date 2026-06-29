/**
 * Australian Medicare provider-number helpers — shared by extraction
 * (`senderProviderNumber`), the conversion form (`orderingProvider` routing),
 * and the reference-data write path (doctor provider numbers).
 *
 * Two distinct jobs, deliberately kept separate:
 *
 *  1. `cleanProviderNumber` — transport hygiene. Trim, length-cap, and drop any
 *     value carrying HL7 separators or control characters that would corrupt a
 *     segment if echoed into the builder from a crafted PDF. Lenient on format:
 *     the spaced Medicare convention (`123456 7Y`) and legacy shapes pass
 *     through unchanged.
 *
 *  2. `validateProviderNumberForStorage` — structural correctness. Verifies the
 *     Medicare check digit of a *fully* well-formed 8-char number (6-digit stem
 *     + location char + check char). Used by the write path to reject typo'd
 *     numbers before they silently misroute a clinical document to the wrong
 *     Genie inbox. Placeholder/seed (`…Z`) and legacy spaced/hyphenated formats
 *     are NOT check-digit verified — they fall through with only the length cap,
 *     so admins are never blocked from entering an unusual-but-real identifier.
 *
 * Safe to import on both server and client (pure string work, no dependencies).
 */

// --- Transport hygiene -------------------------------------------------------

export const MAX_PROVIDER_NUMBER_LEN = 20;

// HL7 separators (| ^ ~ & \) and ASCII control chars must never reach the HL7
// builder un-neutralised. Drop the value rather than pass it through.
const PROVIDER_NUMBER_HL7_OR_CONTROL = /[|^~&\\\x00-\x1f\x7f]/;

export function cleanProviderNumber(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > MAX_PROVIDER_NUMBER_LEN) return undefined;
  if (PROVIDER_NUMBER_HL7_OR_CONTROL.test(trimmed)) return undefined;
  return trimmed;
}

// --- Medicare check digit ----------------------------------------------------

// Practice Location Value: the 7th char maps to an integer via this ordered
// set. I, O, S, Z are intentionally absent (avoid visual ambiguity with 1/0/5
// and the check-char set).
const PLV_CHARS = "0123456789ABCDEFGHJKLMNPQRTUVWXY";
// Check character indexed by (weighted sum mod 11).
const CHECK_CHARS = "YXWTLKJHFBA";
// Position weights for the 6 stem digits.
const STEM_WEIGHTS = [3, 5, 8, 4, 2, 1];
// Weight applied to the location value.
const PLV_WEIGHT = 6;

// The 7-char prefix: 6 stem digits + one valid location character.
const STEM_AND_LOCATION_RE = /^[0-9]{6}[0-9A-HJ-NP-RT-Y]$/i;
// A fully-standard 8-char provider number: prefix + a check char from the set.
export const MEDICARE_PROVIDER_NUMBER_RE = /^[0-9]{6}[0-9A-HJ-NP-RT-Y][YXWTLKJHFBA]$/i;

/**
 * Compute the check character for a 7-char stem+location prefix. Returns
 * `undefined` when the prefix is malformed (wrong length / bad location char).
 */
export function computeProviderCheckChar(
  stemAndLocation: string
): string | undefined {
  if (!STEM_AND_LOCATION_RE.test(stemAndLocation)) return undefined;
  const upper = stemAndLocation.toUpperCase();
  let sum = 0;
  for (let i = 0; i < 6; i++) {
    sum += Number(upper[i]) * STEM_WEIGHTS[i];
  }
  sum += PLV_CHARS.indexOf(upper[6]) * PLV_WEIGHT;
  return CHECK_CHARS[sum % 11];
}

/**
 * True only for a fully-standard 8-char Medicare provider number whose check
 * digit is correct. Anything non-standard (spaced, hyphenated, wrong char set)
 * returns `false`.
 */
export function isValidMedicareProviderNumber(value: string): boolean {
  if (!MEDICARE_PROVIDER_NUMBER_RE.test(value)) return false;
  const upper = value.toUpperCase();
  return computeProviderCheckChar(upper.slice(0, 7)) === upper[7];
}

// --- Write-path validation ---------------------------------------------------

export type ProviderNumberCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Validate a (already-sanitised) provider number for storage on a doctor
 * record. Empty is allowed (the field is optional). Over-length is rejected.
 * A number that is fully Medicare-shaped but fails the check digit — the
 * dangerous "looks real but mistyped" case — is rejected; every other shape
 * passes (length-capped only).
 */
export function validateProviderNumberForStorage(
  value: string
): ProviderNumberCheck {
  if (value.length === 0) return { ok: true };
  if (value.length > MAX_PROVIDER_NUMBER_LEN) {
    return {
      ok: false,
      reason: `Provider number must be ${MAX_PROVIDER_NUMBER_LEN} characters or fewer.`,
    };
  }
  if (
    MEDICARE_PROVIDER_NUMBER_RE.test(value) &&
    !isValidMedicareProviderNumber(value)
  ) {
    return {
      ok: false,
      reason:
        "Provider number check digit is invalid — please re-check the number.",
    };
  }
  return { ok: true };
}
