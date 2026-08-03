/**
 * localStorage persistence for the audit date-range filter.
 *
 * Each field (`from` / `to`) is stored only when the user explicitly changes
 * it. An untouched field stays absent so it keeps tracking its default on the
 * next visit — most importantly `to`, whose default is "today": persisting it
 * implicitly would pin the range to the day of the last visit and silently
 * hide newer rows.
 */

export interface StoredDateRange {
  from?: string;
  to?: string;
}

/** Storage key for the /log page range. */
export const AUDIT_LOG_RANGE_KEY = "bjc.auditLogDateRange";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read the persisted range for `key`. Returns `{}` on SSR, disabled storage,
 * corrupt JSON, or malformed fields — callers always get a safe partial.
 */
export function loadPersistedDateRange(key: string): StoredDateRange {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const record = parsed as Record<string, unknown>;
    const out: StoredDateRange = {};
    if (typeof record.from === "string" && DATE_RE.test(record.from)) {
      out.from = record.from;
    }
    if (typeof record.to === "string" && DATE_RE.test(record.to)) {
      out.to = record.to;
    }
    return out;
  } catch {
    // Storage may be disabled (private browsing). Fall through to default.
    return {};
  }
}

/**
 * Persist one field, keeping the other as-is. A value that isn't a valid
 * `YYYY-MM-DD` (e.g. a cleared date input emitting "") removes the field, so
 * clearing an input restores its default on the next visit.
 */
export function persistDateRangeField(
  key: string,
  field: keyof StoredDateRange,
  value: string
): void {
  if (typeof window === "undefined") return;
  try {
    const next = loadPersistedDateRange(key);
    if (DATE_RE.test(value)) {
      next[field] = value;
    } else {
      delete next[field];
    }
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Ignored — persistence is non-critical.
  }
}

/**
 * Compose a stored partial range with the page defaults. If the combination
 * inverts (from > to), the stored values are discarded entirely — a broken
 * restore must never leave the page showing an impossible range.
 */
export function resolveRestoredRange(
  stored: StoredDateRange,
  initialFrom: string,
  initialTo: string
): { from: string; to: string } {
  const from = stored.from ?? initialFrom;
  const to = stored.to ?? initialTo;
  if (from > to) return { from: initialFrom, to: initialTo };
  return { from, to };
}
