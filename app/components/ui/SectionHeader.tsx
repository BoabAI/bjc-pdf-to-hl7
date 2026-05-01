"use client";

import type { ReactNode } from "react";

interface SectionHeaderProps {
  icon: ReactNode;
  title: string;
  count?: number;
  description?: string;
  action?: ReactNode;
  /** Heading level for the section title. Defaults to h2 — set explicitly when
   *  nesting under another section to keep the document outline well-formed. */
  as?: "h2" | "h3";
}

export function SectionHeader({
  icon,
  title,
  count,
  description,
  action,
  as: HeadingTag = "h2",
}: SectionHeaderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-[var(--blue-50)] text-[var(--bjc-blue)] flex items-center justify-center flex-shrink-0">
            {icon}
          </span>
          <HeadingTag className="text-base font-semibold text-[var(--text-primary)]">
            {title}
          </HeadingTag>
          {count !== undefined && <span className="section-pill">{count}</span>}
        </div>
        {action}
      </div>
      {description && (
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed pl-[42px]">
          {description}
        </p>
      )}
    </div>
  );
}

interface AddBlockProps {
  label: string;
  children: ReactNode;
}

export function AddBlock({ label, children }: AddBlockProps) {
  return (
    <div className="card-inner p-3 space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </div>
      {children}
    </div>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  message: string;
}

export function EmptyState({ icon, message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 border-2 border-dashed border-[var(--border-medium)] rounded-xl bg-[var(--bg-inner)]">
      <span className="w-10 h-10 rounded-full bg-[var(--bg-card)] text-[var(--text-faint)] flex items-center justify-center">
        {icon}
      </span>
      <p className="text-xs text-[var(--text-muted)] text-center max-w-xs">
        {message}
      </p>
    </div>
  );
}
