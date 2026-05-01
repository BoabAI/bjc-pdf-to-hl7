"use client";

interface AuditDateRangeHeaderProps {
  /** Page title shown on the left. */
  title: string;
  /** Subtitle / description; the `from`/`to` interpolations are the caller's job. */
  subtitle: string;
  from: string;
  to: string;
  /** Today's Sydney date — caps both inputs so the user can't pick the future. */
  today: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

/**
 * Header band shared by the audit log and stats pages: page title on the left,
 * From/To date inputs on the right.
 */
export function AuditDateRangeHeader({
  title,
  subtitle,
  from,
  to,
  today,
  onFromChange,
  onToChange,
}: AuditDateRangeHeaderProps) {
  return (
    // `<section>` rather than `<header>` — the page already has a top-level
    // `<header>` (AppNav). Two banner landmarks per page is a screen-reader
    // smell; this band is page content, not site chrome.
    <section
      aria-labelledby="audit-range-title"
      className="card p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
    >
      <div>
        <h1 id="audit-range-title" className="text-2xl font-bold text-[var(--text-primary)]">{title}</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{subtitle}</p>
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
            onChange={(e) => onFromChange(e.target.value)}
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
            onChange={(e) => onToChange(e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
