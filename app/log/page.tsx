"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { AppFooter } from "../components/AppFooter";
import { AppNav } from "../components/AppNav";
import { LogoStrip } from "../components/LogoStrip";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DownloadIcon, HistoryIcon, QuestionMarkCircleIcon } from "../components/ui/icons";
import {
  type AuditRow,
  currentSydneyDate,
  firstOfCurrentSydneyMonth,
  formatSydneyTimestamp,
  prettifyDocType,
  prettifyOutcome,
  ROUTING_DECISION_LABELS,
  ROUTING_REASON_STYLE,
  useAuditDataRange,
} from "../components/auditShared";
import { AuditDateRangeHeader } from "../components/audit/AuditDateRangeHeader";
import { AuditPageState } from "../components/audit/AuditPageState";

type SortKey =
  | "ts"
  | "patientInitials"
  | "documentType"
  | "source"
  | "outcome"
  | "filenameHash"
  | "warningCount";
type SortDir = "asc" | "desc";

/** Compact label combining new mailbox category (when present) with the
 *  legacy source field for backward compat. */
function mailboxDisplay(row: AuditRow): string {
  if (row.mailboxCategory === "results") return "Fax (results)";
  if (row.mailboxCategory === "letters") return "Admin (letters)";
  return row.source === "email" ? "Email" : "Web";
}

function compareRows(a: AuditRow, b: AuditRow, key: SortKey): number {
  const av = a[key];
  const bv = b[key];
  // Treat undefined/null as the "smallest" value so blanks group at the
  // bottom on desc sort and the top on asc — matches user expectation that
  // missing values aren't louder than real ones.
  if (av === undefined && bv === undefined) return 0;
  if (av === undefined) return 1;
  if (bv === undefined) return -1;
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv));
}

function csvEscape(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(rows: AuditRow[]): string {
  const header = [
    "timestamp",
    "patientInitials",
    "documentType",
    "source",
    "outcome",
    "durationMs",
    "messageType",
    "diagnosticServiceSection",
    "mailboxCategory",
    "routingDecision",
    "routingReason",
    "suggestedCategory",
    "filenameHash",
    "warningCount",
    "warnings",
  ].join(",");

  const lines = rows.map((row) =>
    [
      csvEscape(row.ts),
      csvEscape(row.patientInitials ?? ""),
      csvEscape(row.documentType ?? ""),
      csvEscape(row.source),
      csvEscape(row.outcome),
      csvEscape(row.durationMs),
      csvEscape(row.messageType ?? ""),
      csvEscape(row.diagnosticServiceSection ?? ""),
      csvEscape(row.mailboxCategory ?? ""),
      csvEscape(row.routingDecision ?? ""),
      csvEscape(row.routingReason ?? ""),
      csvEscape(row.suggestedCategory ?? ""),
      csvEscape(row.filenameHash),
      csvEscape(row.warningCount),
      csvEscape(row.warnings?.join(" | ") ?? ""),
    ].join(",")
  );

  return [header, ...lines].join("\n");
}

export default function LogPage(): JSX.Element {
  const today = currentSydneyDate();
  const { from, to, setFrom, setTo, rows, loading, error } = useAuditDataRange(
    firstOfCurrentSydneyMonth(),
    today
  );

  const [sortKey, setSortKey] = useState<SortKey>("ts");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedTs, setExpandedTs] = useState<string | null>(null);
  const [routingFilter, setRoutingFilter] = useState<"all" | "auto_routed" | "manual_review">("all");
  const [reasonFilter, setReasonFilter] = useState<"all" | NonNullable<AuditRow["routingReason"]>>("all");

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (routingFilter !== "all") {
        // Treat missing routingDecision (pre-Nicole rows) as auto_routed if
        // outcome is ok, otherwise manual_review. Keeps legacy rows visible
        // under whichever filter the operator picks.
        const effective =
          row.routingDecision ?? (row.outcome === "ok" ? "auto_routed" : "manual_review");
        if (effective !== routingFilter) return false;
      }
      if (reasonFilter !== "all") {
        if (row.routingReason !== reasonFilter) return false;
      }
      return true;
    });
  }, [rows, routingFilter, reasonFilter]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => compareRows(a, b, sortKey) * dir);
  }, [filteredRows, sortKey, sortDir]);

  const outcomeStats = useMemo(() => {
    const total = rows.length;
    const ok = rows.reduce((n, r) => n + (r.outcome === "ok" ? 1 : 0), 0);
    const fail = total - ok;
    // Round ok up-or-down, then derive fail so the two always sum to 100%
    // within rounding. Guard against div-by-zero on the empty state.
    const okPct = total === 0 ? 0 : Math.round((ok / total) * 100);
    const failPct = total === 0 ? 0 : 100 - okPct;
    return { total, ok, fail, okPct, failPct };
  }, [rows]);

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        // Newest first feels right for ts; ascending feels right elsewhere.
        setSortDir(key === "ts" || key === "warningCount" ? "desc" : "asc");
      }
    },
    [sortKey]
  );

  const handleDownloadCsv = useCallback(() => {
    const csv = buildCsv(sortedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${from}_to_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [sortedRows, from, to]);

  const hasRows = sortedRows.length > 0;

  return (
    <>
      <AppNav />
      <main className="min-h-screen p-6 md:p-10">
        <div className="max-w-7xl mx-auto space-y-6">
          <LogoStrip />

          <AuditDateRangeHeader
            title="Audit Log"
            subtitle={`Per-conversion audit rows from ${from} to ${to}`}
            from={from}
            to={to}
            today={today}
            onFromChange={setFrom}
            onToChange={setTo}
          />

          <AuditPageState loading={loading} error={error} hasRows={hasRows}>
          <section className="card p-6">
            <div className="mb-4">
              <SectionHeader
                icon={<HistoryIcon />}
                title="Audit log"
                count={rows.length}
                description={
                  outcomeStats.total === 0
                    ? "No conversions in the selected range."
                    : `${outcomeStats.total} total · ${outcomeStats.ok} successful (${outcomeStats.okPct}%) · ${outcomeStats.fail} failed (${outcomeStats.failPct}%)`
                }
                action={
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 btn-primary text-sm px-4 py-2 flex-shrink-0"
                    onClick={handleDownloadCsv}
                  >
                    <DownloadIcon />
                    Download CSV
                  </button>
                }
              />
            </div>
            <div className="divider-subtle mb-4" />

            <div className="flex flex-wrap gap-3 mb-4 items-center text-xs">
              <label className="flex items-center gap-1.5">
                <span className="text-[var(--text-muted)]">Routing:</span>
                <select
                  className="select-field text-xs py-1"
                  value={routingFilter}
                  onChange={(e) =>
                    setRoutingFilter(e.target.value as typeof routingFilter)
                  }
                  aria-label="Filter by routing decision"
                >
                  <option value="all">All</option>
                  <option value="auto_routed">Auto-routed</option>
                  <option value="manual_review">Manual review</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-[var(--text-muted)]">Review reason:</span>
                <select
                  className="select-field text-xs py-1"
                  value={reasonFilter}
                  onChange={(e) =>
                    setReasonFilter(e.target.value as typeof reasonFilter)
                  }
                  aria-label="Filter by manual review reason"
                  disabled={routingFilter === "auto_routed"}
                >
                  <option value="all">All</option>
                  <option value="low_confidence">Low confidence</option>
                  <option value="missing_fields">Missing fields</option>
                  <option value="mailbox_mismatch">Wrong inbox</option>
                  <option value="unknown_doc_type">Unknown type</option>
                  <option value="extraction_failed">Extraction failed</option>
                  <option value="urgent_result">Urgent result</option>
                </select>
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border-light)]">
                    <SortableHeader label="Time"          sortKey="ts"               currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader label="Patient"       sortKey="patientInitials"  currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader label="Doc Type"      sortKey="documentType"     currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader label="Mailbox"       sortKey="source"           currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader label="Routing"       sortKey="outcome"          currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
                    <th className="py-2 pr-4 font-medium">Review reason</th>
                    <SortableHeader
                      label="Filename Hash"
                      sortKey="filenameHash"
                      currentKey={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                      helpHref="/help/filename-hash"
                      helpLabel="How to compute this hash"
                    />
                    <SortableHeader label="Warnings"      sortKey="warningCount"     currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => {
                    const hasWarnings = row.warningCount > 0;
                    const hasDetail = hasWarnings && (row.warnings?.length ?? 0) > 0;
                    const isLegacy = hasWarnings && !hasDetail;
                    const isExpanded = expandedTs === row.ts;
                    const mailboxLabel = mailboxDisplay(row);
                    const effectiveRouting =
                      row.routingDecision ??
                      (row.outcome === "ok" ? "auto_routed" : "manual_review");
                    const isManual = effectiveRouting === "manual_review";
                    return (
                      <Fragment key={row.ts}>
                        <tr
                          className={
                            "border-b border-[var(--border-light)] " +
                            (isManual ? "audit-row-review" : "audit-row-ok")
                          }
                        >
                          <td className="py-2 pr-4 whitespace-nowrap text-[var(--text-primary)]">
                            {formatSydneyTimestamp(row.ts)}
                          </td>
                          <td className="py-2 pr-4 mono text-[var(--text-primary)]">
                            {row.patientInitials ?? "—"}
                          </td>
                          <td className="py-2 pr-4 text-[var(--text-primary)]">
                            {row.documentType ? prettifyDocType(row.documentType) : "—"}
                          </td>
                          <td className="py-2 pr-4 text-[var(--text-primary)]">
                            {mailboxLabel}
                          </td>
                          <td className="py-2 pr-4">
                            <span
                              className={
                                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border " +
                                (isManual
                                  ? "bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]"
                                  : "bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]")
                              }
                            >
                              {ROUTING_DECISION_LABELS[effectiveRouting]}
                            </span>
                          </td>
                          <td className="py-2 pr-4">
                            {row.routingReason ? (
                              <span
                                className={
                                  "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border " +
                                  ROUTING_REASON_STYLE[row.routingReason].badge
                                }
                              >
                                {ROUTING_REASON_STYLE[row.routingReason].label}
                              </span>
                            ) : (
                              <span className="text-[var(--text-faint)]">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 mono text-xs text-[var(--text-secondary)]">
                            {row.filenameHash}
                          </td>
                          <td className="py-2 pr-4 text-[var(--text-primary)]">
                            {hasDetail ? (
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                aria-controls={`warnings-${row.ts}`}
                                onClick={() =>
                                  setExpandedTs(isExpanded ? null : row.ts)
                                }
                                className="inline-flex items-center gap-1 underline decoration-dotted hover:text-[var(--text-primary)]"
                              >
                                {row.warningCount}
                                <span aria-hidden="true" className="text-xs">
                                  {isExpanded ? "▾" : "▸"}
                                </span>
                              </button>
                            ) : isLegacy ? (
                              <span>
                                {row.warningCount}
                                <span className="ml-1 text-xs text-[var(--text-faint)]">
                                  (legacy)
                                </span>
                              </span>
                            ) : (
                              row.warningCount
                            )}
                          </td>
                        </tr>
                        {isExpanded && hasDetail ? (
                          <tr
                            id={`warnings-${row.ts}`}
                            className="border-b border-[var(--border-light)] bg-[var(--warning-bg)]"
                          >
                            <td colSpan={8} className="py-3 px-4">
                              <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--text-primary)]">
                                {row.warnings?.map((msg, i) => (
                                  <li key={i} className="mono text-xs">
                                    {msg}
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          </AuditPageState>

          <AppFooter />
        </div>
      </main>
    </>
  );
}

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onClick: (key: SortKey) => void;
  helpHref?: string;
  helpLabel?: string;
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onClick,
  helpHref,
  helpLabel,
}: SortableHeaderProps) {
  const active = currentKey === sortKey;
  const ariaSort: "ascending" | "descending" | "none" = active
    ? dir === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <th aria-sort={ariaSort} className="py-2 pr-4 font-medium">
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onClick(sortKey)}
          className={
            "inline-flex items-center gap-1 -mx-1 px-1 rounded hover:text-[var(--text-primary)] " +
            (active ? "text-[var(--text-primary)]" : "")
          }
        >
          {label}
          <span aria-hidden="true" className="text-[var(--text-faint)] text-xs leading-none">
            {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
        {helpHref ? (
          <a
            href={helpHref}
            target="_blank"
            rel="noopener noreferrer"
            title={helpLabel ?? "Help"}
            aria-label={helpLabel ?? "Help"}
            className="text-[var(--text-faint)] hover:text-[var(--text-primary)] inline-flex"
          >
            <QuestionMarkCircleIcon className="w-4 h-4" />
          </a>
        ) : null}
      </span>
    </th>
  );
}
