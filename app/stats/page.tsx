"use client";

import { useMemo } from "react";
import { DonutChart } from "@tremor/react";
import { AppFooter } from "../components/AppFooter";
import { AppNav } from "../components/AppNav";
import { LogoStrip } from "../components/LogoStrip";
import { ChartPieIcon } from "../components/ui/icons";
import {
  type AuditRow,
  currentSydneyDate,
  firstOfCurrentSydneyMonth,
  prettifyDocType,
  prettifyOutcome,
  ROUTING_REASON_STYLE,
  useAuditDataRange,
} from "../components/auditShared";
import { AuditDateRangeHeader } from "../components/audit/AuditDateRangeHeader";
import { AuditPageState } from "../components/audit/AuditPageState";

type TremorColor =
  | "blue"
  | "teal"
  | "violet"
  | "amber"
  | "rose"
  | "emerald"
  | "slate"
  | "orange"
  | "red";

const DOC_TYPE_COLORS: TremorColor[] = ["blue", "teal", "violet", "amber", "slate"];
const OUTCOME_COLORS: TremorColor[] = ["emerald", "rose"];
const SOURCE_COLORS: TremorColor[] = ["blue", "teal"];
const ROUTING_COLORS: TremorColor[] = ["emerald", "amber"];
const MAILBOX_COLORS: TremorColor[] = ["teal", "violet", "slate"];

// Tremor builds chart classes dynamically (e.g. `fill-blue-500`), so Tailwind's
// content scanner can't see them. Listing them as literal strings keeps them
// in the bundle without a tailwind.config safelist.
const TREMOR_COLOR_SAFELIST =
  "fill-blue-500 stroke-blue-500 bg-blue-500 text-blue-500 " +
  "fill-teal-500 stroke-teal-500 bg-teal-500 text-teal-500 " +
  "fill-violet-500 stroke-violet-500 bg-violet-500 text-violet-500 " +
  "fill-amber-500 stroke-amber-500 bg-amber-500 text-amber-500 " +
  "fill-rose-500 stroke-rose-500 bg-rose-500 text-rose-500 " +
  "fill-emerald-500 stroke-emerald-500 bg-emerald-500 text-emerald-500 " +
  "fill-slate-500 stroke-slate-500 bg-slate-500 text-slate-500 " +
  "fill-orange-500 stroke-orange-500 bg-orange-500 text-orange-500 " +
  "fill-red-500 stroke-red-500 bg-red-500 text-red-500";

const COLOR_SWATCH: Record<TremorColor, string> = {
  blue: "bg-blue-500",
  teal: "bg-teal-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  emerald: "bg-emerald-500",
  slate: "bg-slate-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
};

interface ChartDatum {
  name: string;
  value: number;
}

interface BreakdownPieProps {
  title: string;
  data: ChartDatum[];
  colors: TremorColor[];
  /** When true, the dominant-slice caption renders in lowercase
   *  ("successful", "web"). Used for binary semantic splits. */
  lowercaseDominant?: boolean;
}

function BreakdownPie({
  title,
  data,
  colors,
  lowercaseDominant = false,
}: BreakdownPieProps): JSX.Element {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const dominant = data[0];
  const dominantPct =
    dominant && total > 0 ? Math.round((dominant.value / total) * 100) : 0;
  const dominantLabel =
    lowercaseDominant && dominant ? dominant.name.toLowerCase() : dominant?.name;

  return (
    <div className="card-inner p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-7 h-7 rounded-md bg-[var(--blue-50)] text-[var(--bjc-blue)] flex items-center justify-center">
          <ChartPieIcon className="w-3.5 h-3.5" />
        </span>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
      </div>

      {total === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-10 text-center">
          No data in this range.
        </p>
      ) : (
        <>
          <div className="flex justify-center">
            <div className="relative w-36 h-36">
              <DonutChart
                data={data}
                category="value"
                index="name"
                colors={[...colors]}
                showLabel={false}
                showAnimation={false}
                className="h-36"
                valueFormatter={(v) => String(v)}
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl md:text-3xl font-semibold tabular-nums text-[var(--text-primary)] leading-none">
                  {dominantPct}%
                </span>
                <span className="mt-1 text-[10px] tracking-wide uppercase text-[var(--text-muted)]">
                  {dominantLabel}
                </span>
              </div>
            </div>
          </div>

          <ul className="mt-4 space-y-1.5">
            {data.map((d, i) => {
              const pct = Math.round((d.value / total) * 100);
              return (
                <li
                  key={d.name}
                  className="grid grid-cols-[0.75rem_1fr_2.25rem_2.25rem] gap-2 items-center text-sm"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${COLOR_SWATCH[colors[i % colors.length]]}`}
                    aria-hidden
                  />
                  <span className="truncate text-[var(--text-primary)]">
                    {d.name}
                  </span>
                  <span className="text-right tabular-nums text-[var(--text-primary)]">
                    {d.value}
                  </span>
                  <span className="text-right tabular-nums text-[var(--text-muted)]">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <span className={`hidden ${TREMOR_COLOR_SAFELIST}`} aria-hidden />
    </div>
  );
}

function groupBy<T extends string>(
  rows: AuditRow[],
  selector: (row: AuditRow) => T
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

export default function StatsPage(): JSX.Element {
  const today = currentSydneyDate();
  const { from, to, setFrom, setTo, rows, loading, error } = useAuditDataRange(
    firstOfCurrentSydneyMonth(),
    today
  );

  const docTypeData = useMemo(
    () => groupBy(rows, (r) => prettifyDocType(r.documentType)),
    [rows]
  );
  const outcomeData = useMemo(
    () => groupBy(rows, (r) => prettifyOutcome(r.outcome)),
    [rows]
  );
  const sourceData = useMemo(
    () =>
      groupBy(rows, (r) => {
        const raw = (r.source ?? "web").toLowerCase();
        return raw.charAt(0).toUpperCase() + raw.slice(1);
      }),
    [rows]
  );

  // Drop settings-row sentinels from the routing donuts — they live in the
  // same audit table but carry no routing decision.
  const conversionRows = useMemo(
    () => rows.filter((r) => r.documentType !== undefined || r.routingDecision),
    [rows]
  );

  const routingData = useMemo(
    () =>
      groupBy(conversionRows, (r) => {
        if (r.routingDecision === "auto_routed") return "Auto-routed";
        if (r.routingDecision === "manual_review") return "Manual review";
        // Pre-Nicole-refactor rows lack the field — treat them as auto-routed
        // since the legacy pipeline only produced HL7 outcomes.
        return r.outcome === "ok" ? "Auto-routed" : "Manual review";
      }),
    [conversionRows]
  );

  const mailboxData = useMemo(
    () =>
      groupBy(conversionRows, (r) => {
        if (r.mailboxCategory === "results") return "Fax (results)";
        if (r.mailboxCategory === "letters") return "Admin (letters)";
        return "Web upload";
      }),
    [conversionRows]
  );

  const reasonData = useMemo(() => {
    const filtered = conversionRows.filter(
      (r) => r.routingDecision === "manual_review" && r.routingReason
    );
    return groupBy(
      filtered,
      (r) => ROUTING_REASON_STYLE[r.routingReason!].label
    );
  }, [conversionRows]);

  // Build a stable colour palette for the reason donut so each segment keeps
  // its colour even when ordering changes.
  const reasonColors = useMemo<TremorColor[]>(() => {
    const map: Record<string, TremorColor> = {
      "Low confidence": "amber",
      "Missing fields": "orange",
      "Wrong inbox": "rose",
      "Unknown type": "violet",
      "Extraction failed": "slate",
      "Urgent": "red",
    };
    return reasonData.map((d) => map[d.name] ?? "slate");
  }, [reasonData]);

  const total = rows.length;
  const hasRows = total > 0;

  return (
    <>
      <AppNav />
      <main className="min-h-screen p-6 md:p-10">
        <div className="max-w-7xl mx-auto space-y-6">
          <LogoStrip />

          <AuditDateRangeHeader
            title="Conversion Stats"
            subtitle={
              hasRows
                ? `${from} – ${to}  ·  ${total} conversion${total === 1 ? "" : "s"}`
                : `${from} – ${to}`
            }
            from={from}
            to={to}
            today={today}
            onFromChange={setFrom}
            onToChange={setTo}
          />

          <AuditPageState loading={loading} error={error} hasRows={hasRows}>
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <BreakdownPie
                title="Document type"
                data={docTypeData}
                colors={DOC_TYPE_COLORS}
              />
              <BreakdownPie
                title="Outcome"
                data={outcomeData}
                colors={OUTCOME_COLORS}
                lowercaseDominant
              />
              <BreakdownPie
                title="Source"
                data={sourceData}
                colors={SOURCE_COLORS}
                lowercaseDominant
              />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <BreakdownPie
                title="Routing decision"
                data={routingData}
                colors={ROUTING_COLORS}
              />
              <BreakdownPie
                title="By mailbox category"
                data={mailboxData}
                colors={MAILBOX_COLORS}
              />
              <BreakdownPie
                title="Manual review reasons"
                data={reasonData}
                colors={reasonColors.length > 0 ? reasonColors : ["slate"]}
              />
            </section>
          </AuditPageState>

          <AppFooter />
        </div>
      </main>
    </>
  );
}
