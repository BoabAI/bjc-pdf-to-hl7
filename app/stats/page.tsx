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

const CHART_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#a855f7",
  "#f59e0b",
];

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

interface PieLabelArgs {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  name?: string;
  value?: number;
  fill?: string;
}

function renderPieLabel(props: PieLabelArgs): JSX.Element | null {
  const { cx, cy, midAngle, outerRadius, percent, name, value, fill } = props;
  if (!percent || percent < 0.04) return null;

  const RADIAN = Math.PI / 180;
  const sin = Math.sin(-midAngle * RADIAN);
  const cos = Math.cos(-midAngle * RADIAN);
  const sx = cx + outerRadius * cos;
  const sy = cy + outerRadius * sin;
  const mx = cx + (outerRadius + 12) * cos;
  const my = cy + (outerRadius + 12) * sin;
  const isRight = cos >= 0;
  const ex = mx + (isRight ? 14 : -14);
  const ey = my;
  const textAnchor = isRight ? "start" : "end";

  return (
    <g style={{ pointerEvents: "none" }}>
      <path
        d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
        stroke={fill ?? "#94a3b8"}
        fill="none"
        strokeWidth={1}
      />
      <circle cx={ex} cy={ey} r={2} fill={fill ?? "#94a3b8"} />
      <text
        x={ex + (isRight ? 4 : -4)}
        y={ey}
        dy={4}
        textAnchor={textAnchor}
        fill="var(--text-primary)"
        fontSize={11}
        fontWeight={500}
      >
        {name}
      </text>
      <text
        x={ex + (isRight ? 4 : -4)}
        y={ey}
        dy={18}
        textAnchor={textAnchor}
        fill="var(--text-muted)"
        fontSize={10}
      >
        {value}
      </text>
    </g>
  );
}

function BreakdownPie({ title, data }: BreakdownPieProps): JSX.Element {
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="card-inner p-4 flex-1 min-w-[280px]">
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
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <PieChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={68}
                paddingAngle={1.5}
                stroke="var(--card-bg, #ffffff)"
                strokeWidth={2}
                labelLine={false}
                label={renderPieLabel as never}
                isAnimationActive={false}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                cursor={{ fill: "transparent" }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border-color, #e2e8f0)",
                  fontSize: 12,
                  padding: "6px 10px",
                }}
                formatter={(value, name) => {
                  const numeric =
                    typeof value === "number"
                      ? value
                      : typeof value === "string"
                        ? Number(value)
                        : 0;
                  const safe = Number.isFinite(numeric) ? numeric : 0;
                  const label =
                    typeof name === "string" || typeof name === "number"
                      ? String(name)
                      : "";
                  return [String(safe), label];
                }}
              />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
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
