"use client";

import { useCallback, useEffect, useState } from "react";
import {
  currentSydneyMonth,
  monthsInRange,
  sydneyDateOnly,
} from "@/lib/dates/sydney";
import {
  loadPersistedDateRange,
  persistDateRangeField,
  resolveRestoredRange,
} from "./audit/dateRangeStorage";

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
  /** sha256(pdf bytes)[0:12]; absent on rows before 2026-08-18. */
  contentHash?: string;
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
  /** Lowercased source mailbox address (e.g. `gofax.par@bjchealth.com.au`).
   *  Absent on web uploads and PAD rows written before 2026-09-01. */
  mailboxAddress?: string;
  mailboxDisagreement?: boolean;
  /** Routing decision — "auto_routed" produced HL7, "manual_review" diverted. */
  routingDecision?: "auto_routed" | "manual_review";
  /** When routingDecision === "manual_review", the failure reason. */
  routingReason?:
    | "low_confidence"
    | "missing_fields"
    | "mailbox_mismatch"
    | "unknown_doc_type"
    | "extraction_failed"
    | "urgent_result";
  /** Human review label for the routing reason (PAD applies no categories). */
  suggestedCategory?: string;
  /** Classifier self-reported confidence (0-100). */
  classificationConfidence?: number;
}

/**
 * Compact label for the audit log's "Mailbox" column. Prefers the persisted
 * source address, shown as `Fax · gofax.par` (local part only — the domain is
 * always bjchealth.com.au); falls back to the legacy category labels, then to
 * the bare source for rows that predate both.
 */
export function mailboxDisplay(row: AuditRow): string {
  if (row.mailboxAddress) {
    const localPart = row.mailboxAddress.split("@")[0] || row.mailboxAddress;
    const kind = row.mailboxCategory === "letters" ? "Admin" : "Fax";
    return `${kind} · ${localPart}`;
  }
  if (row.mailboxCategory === "results") return "Fax (results)";
  if (row.mailboxCategory === "letters") return "Admin (letters)";
  return row.source === "email" ? "Email" : "Web";
}

/** Label + colour palette for routing decision badges (auto / manual). */
export const ROUTING_DECISION_LABELS = {
  auto_routed: "Auto-routed",
  manual_review: "Manual review",
} as const;

/**
 * Reason label + Tailwind colours, mirrored across donuts and table badges.
 * This is a categorical scale that deliberately tracks the Tremor donut palette
 * (amber/orange/rose/violet/slate) so badge hue == chart segment hue — it
 * intentionally stays on Tailwind palette hues rather than brand semantic
 * tokens. The app has no dark mode, so no `dark:` variants.
 */
export const ROUTING_REASON_STYLE: Record<
  NonNullable<AuditRow["routingReason"]>,
  { label: string; badge: string; donut: string }
> = {
  low_confidence: {
    label: "Low confidence",
    badge: "bg-yellow-100 text-yellow-800 border-yellow-300",
    donut: "amber",
  },
  missing_fields: {
    label: "Missing fields",
    badge: "bg-orange-100 text-orange-800 border-orange-300",
    donut: "orange",
  },
  mailbox_mismatch: {
    label: "Wrong inbox",
    badge: "bg-red-100 text-red-800 border-red-300",
    donut: "rose",
  },
  unknown_doc_type: {
    label: "Unknown type",
    badge: "bg-purple-100 text-purple-800 border-purple-300",
    donut: "violet",
  },
  extraction_failed: {
    label: "Extraction failed",
    badge: "bg-zinc-200 text-zinc-900 border-zinc-400",
    donut: "slate",
  },
  urgent_result: {
    label: "Urgent",
    badge:
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-700",
    donut: "red",
  },
};

// Display-layer label maps. The audit pipeline writes raw values
// (`outcome: "ok" | "fail"`, doc types from the classifier) — these helpers
// translate to the human labels BJC ops use.
const OUTCOME_LABELS: Record<string, string> = {
  ok: "Successful",
  fail: "Failed",
};

// Display-layer labels for the dashboard. Post-collapse taxonomy is
// `referral`, `consult_letter`, `pathology_result`, `radiology_result`,
// `consent_form`, `generic`. Pre-collapse audit rows still carry
// `gp_referral` / `referral_letter` strings in DynamoDB (we do not migrate
// historical data) — keep the legacy keys here so the historical bucket
// stays coherent on /stats and /log:
//   - referral OR referral_letter OR gp_referral → "Referral letter"
//   - consult_letter                              → "Consult letter"
//   - generic + consent_form                      → "Letter"
//   - pathology_result                            → "Pathology result"
//   - radiology_result                            → "Radiology result"
const DOC_TYPE_LABELS: Record<string, string> = {
  pathology_result: "Pathology result",
  radiology_result: "Radiology result",
  referral: "Referral letter",
  // Legacy (pre-2026-05-20 collapse) keys — preserved for historical rows.
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
 *
 * Pass `options.persistKey` to retain the range in localStorage: fields the
 * user changes are saved per-field and restored after mount (post-hydration,
 * so SSR markup stays deterministic). Untouched fields keep following their
 * defaults — see dateRangeStorage.ts for why `to` must not be pinned.
 */
export function useAuditDataRange(
  initialFrom: string,
  initialTo: string,
  options?: { persistKey?: string }
): UseAuditDataRangeResult {
  const persistKey = options?.persistKey;
  const [from, setFromState] = useState<string>(initialFrom);
  const [to, setToState] = useState<string>(initialTo);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Gates the fetch until the persisted range has been restored, so we don't
  // query the default range and immediately re-query the saved one.
  const [restored, setRestored] = useState<boolean>(!persistKey);

  useEffect(() => {
    if (!persistKey) return;
    const range = resolveRestoredRange(
      loadPersistedDateRange(persistKey),
      initialFrom,
      initialTo
    );
    setFromState(range.from);
    setToState(range.to);
    setRestored(true);
  }, [persistKey, initialFrom, initialTo]);

  const setFrom = useCallback(
    (d: string) => {
      setFromState(d);
      if (persistKey) persistDateRangeField(persistKey, "from", d);
    },
    [persistKey]
  );

  const setTo = useCallback(
    (d: string) => {
      setToState(d);
      if (persistKey) persistDateRangeField(persistKey, "to", d);
    },
    [persistKey]
  );

  useEffect(() => {
    if (!restored) return;
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
  }, [from, to, restored]);

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
