"use client";

import { useCallback } from "react";
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

  const handleDownloadCsv = useCallback(() => {
    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${from}_to_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [rows, from, to]);

  const hasRows = rows.length > 0;

  return (
    <>
      <AppNav />
      <main className="min-h-screen p-6 md:p-10">
        <div className="max-w-7xl mx-auto space-y-6">
          <LogoStrip />

          <header className="card p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              Audit Log
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Per-conversion audit rows from {from} to {to}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <label
                htmlFor="from-date"
                className="text-xs text-[var(--text-secondary)] mb-1"
              >
                From
              </label>
              <input
                id="from-date"
                type="date"
                className="input-field"
                value={from}
                max={to || today}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col">
              <label
                htmlFor="to-date"
                className="text-xs text-[var(--text-secondary)] mb-1"
              >
                To
              </label>
              <input
                id="to-date"
                type="date"
                className="input-field"
                value={to}
                min={from || undefined}
                max={today}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        </header>

        {error && (
          <div className="card p-4 border-l-4 border-[var(--error)]">
            <p className="text-sm text-[var(--error)] font-medium">
              Failed to load audit logs
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{error}</p>
          </div>
        )}

        {loading && !error && (
          <div className="card p-6">
            <p className="text-sm text-[var(--text-secondary)]">
              Loading audit data…
            </p>
          </div>
        )}

        {!loading && !error && !hasRows && (
          <div className="card p-10 text-center">
            <p className="text-base text-[var(--text-secondary)]">
              No conversions logged in this date range.
            </p>
          </div>
        )}

        {!loading && !error && hasRows && (
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
                    <th className="py-2 pr-4 font-medium">Time</th>
                    <th className="py-2 pr-4 font-medium">Patient</th>
                    <th className="py-2 pr-4 font-medium">Doc Type</th>
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 pr-4 font-medium">Outcome</th>
                    <th className="py-2 pr-4 font-medium">Filename Hash</th>
                    <th className="py-2 pr-4 font-medium">Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.ts}
                      className="border-b border-[var(--border-light)] hover:bg-[var(--bg-hover)]"
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
        )}
        </div>
      </main>
    </>
  );
}
