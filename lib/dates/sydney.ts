/**
 * Sydney calendar-date helpers shared by server and client.
 *
 * Client-safe: only uses `Intl.DateTimeFormat`, no Node-only or AWS SDK imports.
 * Outputs are plain strings safe for direct comparison and round-trip through
 * date inputs / API query strings.
 *
 * Why these formatters return `en-CA`: it gives ISO-style `YYYY-MM-DD` output
 * regardless of the user locale, which is what we want for sortable strings
 * and date input values.
 */

/** Current Sydney calendar month as `YYYY-MM`. */
export function currentSydneyMonth(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/** Today's date in Sydney as `YYYY-MM-DD`. Safe for string comparison. */
export function currentSydneyDate(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

/** First day of the current Sydney month as `YYYY-MM-DD`. */
export function firstOfCurrentSydneyMonth(): string {
  return `${currentSydneyMonth()}-01`;
}

/**
 * Convert a UTC ISO timestamp (with optional `#suffix`) to its Sydney calendar
 * date in `YYYY-MM-DD` form. Used to filter audit rows whose sort key is UTC
 * but whose user-facing date is Sydney-local.
 */
export function sydneyDateOnly(ts: string): string {
  const isoOnly = ts.split("#")[0];
  const date = new Date(isoOnly);
  if (Number.isNaN(date.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/** Format a UTC ISO timestamp (or sort key) as a short Sydney-local string. */
export function formatSydneyTimestamp(iso: string): string {
  const isoOnly = iso.split("#")[0];
  const date = new Date(isoOnly);
  if (Number.isNaN(date.getTime())) return iso;
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
}

/** Enumerate `YYYY-MM` partitions covering [from, to] inclusive. */
export function monthsInRange(from: string, to: string): string[] {
  const [fy, fm] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return [];
  const out: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
