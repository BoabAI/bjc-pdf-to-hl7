"use client";

import { useMemo } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { AppNav } from "../components/AppNav";
import { LogoStrip } from "../components/LogoStrip";
import { ChartPieIcon } from "../components/ui/icons";
import {
  type AuditRow,
  currentSydneyMonth,
  useAuditData,
} from "../components/auditShared";

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
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-md bg-[var(--blue-50)] text-[var(--bjc-blue)] flex items-center justify-center">
          <ChartPieIcon className="w-3.5 h-3.5" />
        </span>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </h3>
      </div>
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

export default function StatsPage(): JSX.Element {
  const { month, setMonth, rows, loading, error } = useAuditData();

  const docTypeData = useMemo(
    () => groupBy(rows, (r) => r.documentType ?? "unknown"),
    [rows]
  );
  const outcomeData = useMemo(() => groupBy(rows, (r) => r.outcome), [rows]);
  const sourceData = useMemo(() => groupBy(rows, (r) => r.source), [rows]);

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
              Conversion Stats
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Breakdown of conversions for {month}
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
          <section className="card p-6">
            <div className="flex flex-wrap gap-4">
              <BreakdownPie title="Document type" data={docTypeData} />
              <BreakdownPie title="Outcome" data={outcomeData} />
              <BreakdownPie title="Source" data={sourceData} />
            </div>
          </section>
        )}
        </div>
      </main>
    </>
  );
}
