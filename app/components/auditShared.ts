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
  userEmail?: string;
  /** Legacy MailboxSource enum ("referrals" / "results") from x-source-mailbox. */
  mailboxHint?: "referrals" | "results";
  /** Mailbox category derived from the new email-address mailbox header
   *  ("results" / "letters"). Absent for `none` (web upload, no header). */
  mailboxCategory?: "results" | "letters";
  mailboxDisagreement?: boolean;
  /** Routing decision — "auto_routed" produced HL7, "manual_review" diverted. */
  routingDecision?: "auto_routed" | "manual_review";
  /** When routingDecision === "manual_review", the failure reason. */
  routingReason?:
    | "low_confidence"
    | "missing_fields"
    | "mailbox_mismatch"
    | "unknown_doc_type"
    | "extraction_failed";
  /** Suggested Outlook category label PAD would apply to the source email. */
  suggestedCategory?: string;
  /** Classifier self-reported confidence (0-100). */
  classificationConfidence?: number;
}

/** Label + colour palette for routing decision badges (auto / manual). */
export const ROUTING_DECISION_LABELS = {
  auto_routed: "Auto-routed",
  manual_review: "Manual review",
} as const;

/** Reason label + Tailwind colours, mirrored across donuts and table badges. */
export const ROUTING_REASON_STYLE: Record<
  NonNullable<AuditRow["routingReason"]>,
  { label: string; badge: string; donut: string }
> = {
  low_confidence: {
    label: "Low confidence",
    badge:
      "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-700",
    donut: "amber",
  },
  missing_fields: {
    label: "Missing fields",
    badge:
      "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-700",
    donut: "orange",
  },
  mailbox_mismatch: {
    label: "Wrong inbox",
    badge:
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-700",
    donut: "rose",
  },
  unknown_doc_type: {
    label: "Unknown type",
    badge:
      "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-700",
    donut: "violet",
  },
  extraction_failed: {
    label: "Extraction failed",
    badge:
      "bg-zinc-200 text-zinc-900 border-zinc-400 dark:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-600",
    donut: "slate",
  },
};

// Display-layer label maps. The audit pipeline writes raw values
// (`outcome: "ok" | "fail"`, doc types from the classifier) — these helpers
// translate to the human labels BJC ops use, and collapse the classifier's
// 6 doc types into the 5 buckets they think in (referral_letter + gp_referral
// → "Referral letter"; generic + consent_form → "Letter").
const OUTCOME_LABELS: Record<string, string> = {
  ok: "Successful",
  fail: "Failed",
};

// Display-layer labels for the dashboard. Nicole's mental model is five
// buckets; we collapse the classifier's internal 7 doc types into them:
//   - referral_letter + gp_referral → "Referral letter"
//   - consult_letter                → "Consult letter"
//   - generic + consent_form        → "Letter"
//   - pathology_result              → "Pathology result"
//   - radiology_result              → "Radiology result"
//   - anything else                 → "Unknown"
const DOC_TYPE_LABELS: Record<string, string> = {
  pathology_result: "Pathology result",
  radiology_result: "Radiology result",
  referral_letter: "Referral letter",
  gp_referral: "Referral letter",
  consult_letter: "Consult letter",
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
