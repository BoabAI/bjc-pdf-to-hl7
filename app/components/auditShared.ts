"use client";

import { useEffect, useState } from "react";
import {
  currentSydneyMonth,
  monthsInRange,
  sydneyDateOnly,
} from "@/lib/dates/sydney";

// Re-export Sydney date helpers from the shared module so existing imports
// from `auditShared` keep working without churn.
export {
  currentSydneyDate,
  currentSydneyMonth,
  firstOfCurrentSydneyMonth,
  formatSydneyTimestamp,
  monthsInRange,
  sydneyDateOnly,
} from "@/lib/dates/sydney";

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
  /**
   * Sanitised warning messages, when present. Older rows written before this
   * field existed will only have `warningCount` — the UI shows a "(legacy)"
   * affordance in that case.
   */
  warnings?: string[];
  patientInitials?: string;
}

// Display-layer label maps. The audit pipeline writes raw values
// (`outcome: "ok" | "fail"`, doc types from the classifier) — these helpers
// translate to the human labels BJC ops use, and collapse the classifier's
// 6 doc types into the 5 buckets they think in (referral_letter + gp_referral
// → "Referral letter"; generic + consent_form → "Letter").
const OUTCOME_LABELS: Record<string, string> = {
  ok: "Successful",
  fail: "Failed",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  pathology_result: "Pathology result",
  radiology_result: "Radiology result",
  referral_letter: "Referral letter",
  gp_referral: "Referral letter",
  generic: "Letter",
  consent_form: "Letter",
  unknown: "Unknown",
};

export function prettifyOutcome(raw: string): string {
  return OUTCOME_LABELS[raw] ?? raw;
}

export function prettifyDocType(raw: string | null | undefined): string {
  if (!raw) return "Unknown";
  return DOC_TYPE_LABELS[raw.toLowerCase()] ?? raw;
}

export interface LogsResponse {
  success: boolean;
  month?: string;
  rows?: AuditRow[];
  error?: string;
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
