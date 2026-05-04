"use client";

import { useMemo } from "react";
import { DonutChart, Legend } from "@tremor/react";
import { AppNav } from "../components/AppNav";
import { LogoStrip } from "../components/LogoStrip";
import { ChartPieIcon } from "../components/ui/icons";
import {
  type AuditRow,
  currentSydneyDate,
  firstOfCurrentSydneyMonth,
  useAuditDataRange,
} from "../components/auditShared";
import { AuditDateRangeHeader } from "../components/audit/AuditDateRangeHeader";
import { AuditPageState } from "../components/audit/AuditPageState";

interface ChartDatum {
  name: string;
  value: number;
}

const CHART_COLORS = ["blue", "emerald", "red", "violet", "amber"] as const;

const LABEL_OVERRIDES: Record<string, string> = {
  gp_referral: "Referral",
  pathology_result: "Result",
};

function prettify(raw: string): string {
  if (!raw) return "Unknown";
  const key = raw.toLowerCase();
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key];
  const cleaned = raw.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "Unknown";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
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
    .map(([name, value]) => ({ name: prettify(name), value }))
    .sort((a, b) => b.value - a.value);
}

interface BreakdownPieProps {
  title: string;
  data: ChartDatum[];
}

function BreakdownPie({ title, data }: BreakdownPieProps): JSX.Element {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const colors = data.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  return (
    <div className="card-inner p-4 flex-1 min-w-[280px]">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-md bg-[var(--blue-50)] text-[var(--bjc-blue)] flex items-center justify-center">
          <ChartPieIcon className="w-3.5 h-3.5" />
        </span>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
      </div>
      {total === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-8 text-center">
          No data
        </p>
      ) : (
        <div className="flex flex-col items-center">
          <div className="relative">
            <DonutChart
              data={data}
              category="value"
              index="name"
              colors={[...colors]}
              showLabel={false}
              showAnimation={false}
              className="h-44"
              valueFormatter={(v) => String(v)}
            />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold text-[var(--text-primary)]">
                {total}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                total
              </span>
            </div>
          </div>
          <Legend
            categories={data.map((d) => `${d.name} (${d.value})`)}
            colors={[...colors]}
            className="mt-3 justify-center"
          />
        </div>
      )}
    </div>
  );
}

export default function StatsPage(): JSX.Element {
  const today = currentSydneyDate();
  const { from, to, setFrom, setTo, rows, loading, error } = useAuditDataRange(
    firstOfCurrentSydneyMonth(),
    today
  );

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

          <AuditDateRangeHeader
            title="Conversion Stats"
            subtitle={`Breakdown of conversions from ${from} to ${to}`}
            from={from}
            to={to}
            today={today}
            onFromChange={setFrom}
            onToChange={setTo}
          />

          <AuditPageState loading={loading} error={error} hasRows={hasRows}>
            <section className="card p-6">
              <div className="flex flex-wrap gap-4">
                <BreakdownPie title="Document type" data={docTypeData} />
                <BreakdownPie title="Outcome" data={outcomeData} />
                <BreakdownPie title="Source" data={sourceData} />
              </div>
            </section>
          </AuditPageState>
        </div>
      </main>
    </>
  );
}
