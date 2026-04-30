/**
 * Deterministic HL7 build context.
 *
 * A single timestamp and message ID is captured per `buildHL7Message` call
 * so that all segments in one message share the same MSH-7 / OBR-7 / OBR-22
 * / RF1-7 / filename timestamp. Callers (typically tests) may inject a
 * fixed context to make HL7 output byte-deterministic.
 */

export interface HL7BuildContext {
  /** YYYYMMDDHHMMSS — used in MSH-7, OBR-7, OBR-22, RF1-7, and the filename. */
  timestamp: string;
  /** Message control ID — used in MSH-10. Format: `MSG{timestamp}{4-char-suffix}`. */
  messageId: string;
}

/**
 * Format a JS Date as an HL7 v2 timestamp (YYYYMMDDHHMMSS, local time).
 * Pure: same input → same output.
 */
export function formatHL7Timestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

/**
 * Generate a 4-char base36 uppercase suffix for message-ID uniqueness.
 *
 * Format intentionally byte-equivalent to the historical
 * `Math.random().toString(36).substring(2, 6).toUpperCase()` so existing
 * conformance tests that regex-match `MSG\d{14}[A-Z0-9]{4}` continue to
 * pass. Isolated here so the random source is swappable without touching
 * the rest of the builder.
 */
function randomMessageIdSuffix(): string {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

/**
 * Build a fresh deterministic context. Tests can pin either field
 * (or both) to make output reproducible:
 *
 *   createHL7BuildContext({ timestamp: "20260101120000" })
 *     → { timestamp: "20260101120000", messageId: "MSG20260101120000XXXX" }
 *
 *   createHL7BuildContext({ messageId: "MSGFOO" })
 *     → { timestamp: <now>, messageId: "MSGFOO" }
 *
 * When no overrides are passed, behaviour matches the pre-refactor
 * builder: current time + random 4-char suffix.
 */
export function createHL7BuildContext(
  overrides?: Partial<HL7BuildContext>,
): HL7BuildContext {
  const timestamp = overrides?.timestamp ?? formatHL7Timestamp(new Date());
  const messageId =
    overrides?.messageId ?? `MSG${timestamp}${randomMessageIdSuffix()}`;
  return { timestamp, messageId };
}
