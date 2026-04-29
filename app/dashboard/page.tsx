"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

// Local AuditRow type — mirrors lib/audit.ts but kept inline so this client
// component doesn't pull AWS SDK types into the browser bundle.
interface AuditRow {
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
}

interface LogsResponse {
  success: boolean;
  month?: string;
  rows?: AuditRow[];
  error?: string;
}

interface ChartDatum {
  name: string;
  value: number;
}

const CHART_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#a855f7",
  "#f59e0b",
];

function currentSydneyMonth(): string {
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

function formatSydneyTimestamp(iso: string): string {
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

function groupBy(
  rows: AuditRow[],
  selector: (row: AuditRow) => string
): ChartDatum[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = selector(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

interface BreakdownPieProps {
  title: string;
  data: ChartDatum[];
}

function BreakdownPie({ title, data }: BreakdownPieProps): JSX.Element {
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="card-inner p-4 flex-1 min-w-[260px]">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
        {title}
      </h3>
      {total === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-8 text-center">
          No data
        </p>
      ) : (
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={70}
                label={(entry: { name?: string; value?: number }) => {
                  const value = typeof entry.value === "number" ? entry.value : 0;
                  const name = entry.name ?? "";
                  const pct = total > 0 ? (value / total) * 100 : 0;
                  return `${name} (${pct.toFixed(0)}%)`;
                }}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => {
                  const numeric =
                    typeof value === "number"
                      ? value
                      : typeof value === "string"
                        ? Number(value)
                        : 0;
                  const safe = Number.isFinite(numeric) ? numeric : 0;
                  const pct = total > 0 ? (safe / total) * 100 : 0;
                  const label =
                    typeof name === "string" || typeof name === "number"
                      ? String(name)
                      : "";
                  return [`${safe} (${pct.toFixed(1)}%)`, label];
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage(): JSX.Element {
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

  const docTypeData = useMemo(
    () => groupBy(rows, (r) => r.documentType ?? "unknown"),
    [rows]
  );
  const outcomeData = useMemo(() => groupBy(rows, (r) => r.outcome), [rows]);
  const sourceData = useMemo(() => groupBy(rows, (r) => r.source), [rows]);

  const handleDownloadCsv = useCallback(() => {
    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bjc-audit-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [rows, month]);

  const hasRows = rows.length > 0;

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="card p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              Conversion Dashboard
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Audit log and conversion breakdown for {month}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label
              htmlFor="month-picker"
              className="text-sm text-[var(--text-secondary)]"
            >
              Month
            </label>
            <input
              id="month-picker"
              type="month"
              className="input-field"
              value={month}
              max={currentSydneyMonth()}
              onChange={(e) => setMonth(e.target.value)}
            />
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
              No conversions logged for {month} yet.
            </p>
          </div>
        )}

        {!loading && !error && hasRows && (
          <>
            <section className="card p-6">
              <div className="flex flex-wrap gap-4">
                <BreakdownPie title="Document type" data={docTypeData} />
                <BreakdownPie title="Outcome" data={outcomeData} />
                <BreakdownPie title="Source" data={sourceData} />
              </div>
            </section>

            <section className="card p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Audit log ({rows.length} {rows.length === 1 ? "row" : "rows"})
                </h2>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleDownloadCsv}
                >
                  Download CSV
                </button>
              </div>
              <div className="divider-subtle mb-4" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border-light)]">
                      <th className="py-2 pr-4 font-medium">Time</th>
                      <th className="py-2 pr-4 font-medium">Doc Type</th>
                      <th className="py-2 pr-4 font-medium">Source</th>
                      <th className="py-2 pr-4 font-medium">Outcome</th>
                      <th className="py-2 pr-4 font-medium">Duration (ms)</th>
                      <th className="py-2 pr-4 font-medium">Message Type</th>
                      <th className="py-2 pr-4 font-medium">OBR-24</th>
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
                        <td className="py-2 pr-4 text-[var(--text-primary)]">
                          {row.durationMs}
                        </td>
                        <td className="py-2 pr-4 text-[var(--text-primary)]">
                          {row.messageType ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-[var(--text-primary)]">
                          {row.diagnosticServiceSection ?? "—"}
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
          </>
        )}
      </div>
    </main>
  );
}
