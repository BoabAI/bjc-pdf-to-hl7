"use client";

import { useEffect, useState } from "react";

// Local AuditRow type — mirrors lib/audit.ts but kept inline so client
// components don't pull AWS SDK types into the browser bundle.
export interface AuditRow {
  month: string;
  ts: string;
  documentType?: string;
  outcome: "ok" | "fail";
  source: "web" | "email";
  messageType?: string;
  diagnosticServiceSection?: string;
  filenameHash: string;
  filenameExt: string;
  fileSizeBytes: number;
  durationMs: number;
  warningCount: number;
  patientInitials?: string;
}

export interface LogsResponse {
  success: boolean;
  month?: string;
  rows?: AuditRow[];
  error?: string;
}

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
 * Convert an audit `ts` (UTC ISO + optional `#suffix`) to its Sydney calendar
 * date in `YYYY-MM-DD` form. Returned string is safe for direct comparison
 * against picker values, which are also Sydney-local calendar dates.
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

/** Enumerate YYYY-MM partitions covering [from, to] inclusive. */
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

export function formatSydneyTimestamp(iso: string): string {
  // Sort key format: "2026-04-29T12:34:56.789Z#abc123" — strip the suffix
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

interface UseAuditDataResult {
  month: string;
  setMonth: (m: string) => void;
  rows: AuditRow[];
  loading: boolean;
  error: string | null;
}

interface UseAuditDataRangeResult {
  from: string;
  to: string;
  setFrom: (d: string) => void;
  setTo: (d: string) => void;
  rows: AuditRow[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetch audit rows across an inclusive date range `[from, to]` (Sydney
 * calendar dates, `YYYY-MM-DD`). Fans out to `/api/logs?month=` for every
 * month-partition the range touches, then filters returned rows to those
 * whose Sydney date falls inside the range.
 */
export function useAuditDataRange(
  initialFrom: string,
  initialTo: string
): UseAuditDataRangeResult {
  const [from, setFrom] = useState<string>(initialFrom);
  const [to, setTo] = useState<string>(initialTo);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!from || !to || from > to) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const months = monthsInRange(from, to);

    Promise.all(
      months.map((m) =>
        fetch(`/api/logs?month=${encodeURIComponent(m)}`).then(async (res) => {
          const data = (await res.json()) as LogsResponse;
          if (!res.ok || !data.success) {
            throw new Error(data.error ?? `Request failed (${res.status})`);
          }
          return data.rows ?? [];
        })
      )
    )
      .then((batches) => {
        if (cancelled) return;
        const all = batches.flat();
        const filtered = all.filter((row) => {
          const d = sydneyDateOnly(row.ts);
          return d >= from && d <= to;
        });
        filtered.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
        setRows(filtered);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load audit logs";
        setError(message);
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [from, to]);

  return { from, to, setFrom, setTo, rows, loading, error };
}

export function useAuditData(): UseAuditDataResult {
  const [month, setMonth] = useState<string>(() => currentSydneyMonth());
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/logs?month=${encodeURIComponent(month)}`)
      .then(async (res) => {
        const data = (await res.json()) as LogsResponse;
        if (!res.ok || !data.success) {
          throw new Error(data.error ?? `Request failed (${res.status})`);
        }
        if (cancelled) return;
        setRows(data.rows ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load audit logs";
        setError(message);
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month]);

  return { month, setMonth, rows, loading, error };
}
