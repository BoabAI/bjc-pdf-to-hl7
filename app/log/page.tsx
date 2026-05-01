"use client";

import { useCallback, useMemo, useState } from "react";
import { AppNav } from "../components/AppNav";
import { LogoStrip } from "../components/LogoStrip";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DownloadIcon, HistoryIcon } from "../components/ui/icons";
import {
  type AuditRow,
  currentSydneyDate,
  firstOfCurrentSydneyMonth,
  formatSydneyTimestamp,
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
    "filenameHash",
    "warningCount",
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
      csvEscape(row.filenameHash),
      csvEscape(row.warningCount),
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

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => compareRows(a, b, sortKey) * dir);
  }, [rows, sortKey, sortDir]);

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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border-light)]">
                    <SortableHeader label="Time"          sortKey="ts"               currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader label="Patient"       sortKey="patientInitials"  currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader label="Doc Type"      sortKey="documentType"     currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader label="Source"        sortKey="source"           currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader label="Outcome"       sortKey="outcome"          currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader label="Filename Hash" sortKey="filenameHash"     currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableHeader label="Warnings"      sortKey="warningCount"     currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr
                      key={row.ts}
                      className={
                        "border-b border-[var(--border-light)] " +
                        (row.outcome === "ok"
                          ? "bg-emerald-50/60 hover:bg-emerald-100/60"
                          : "bg-red-50/60 hover:bg-red-100/60")
                      }
                    >
                      <td className="py-2 pr-4 whitespace-nowrap text-[var(--text-primary)]">
                        {formatSydneyTimestamp(row.ts)}
                      </td>
                      <td className="py-2 pr-4 font-mono text-[var(--text-primary)]">
                        {row.patientInitials ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-[var(--text-primary)]">
                        {row.documentType ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-[var(--text-primary)]">
                        {row.source}
                      </td>
                      <td
                        className={
                          "py-2 pr-4 font-medium " +
                          (row.outcome === "ok"
                            ? "text-[var(--success)]"
                            : "text-[var(--error)]")
                        }
                      >
                        {row.outcome}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-[var(--text-secondary)]">
                        {row.filenameHash}
                      </td>
                      <td className="py-2 pr-4 text-[var(--text-primary)]">
                        {row.warningCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          </AuditPageState>
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
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onClick,
}: SortableHeaderProps) {
  const active = currentKey === sortKey;
  const ariaSort: "ascending" | "descending" | "none" = active
    ? dir === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <th aria-sort={ariaSort} className="py-2 pr-4 font-medium">
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
    </th>
  );
}
