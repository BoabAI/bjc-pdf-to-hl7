"use client";

import type { ReactNode } from "react";

interface AuditPageStateProps {
  loading: boolean;
  error: string | null;
  hasRows: boolean;
  /** Custom message rendered when no rows match the filter. */
  emptyMessage?: string;
  /** Content to render when data is ready and non-empty. */
  children: ReactNode;
}

/**
 * Shared loading / error / empty wrapper for the audit log and stats pages.
 * Renders `children` only once `!loading && !error && hasRows`.
 */
export function AuditPageState({
  loading,
  error,
  hasRows,
  emptyMessage = "No conversions logged in this date range.",
  children,
}: AuditPageStateProps) {
  if (error) {
    return (
      <div className="card p-4 border-l-4 border-[var(--error)]">
        <p className="text-sm text-[var(--error)] font-medium">
          Failed to load audit logs
        </p>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card p-6">
        <p className="text-sm text-[var(--text-secondary)]">
          Loading audit data…
        </p>
      </div>
    );
  }

  if (!hasRows) {
    return (
      <div className="card p-10 text-center">
        <p className="text-base text-[var(--text-secondary)]">{emptyMessage}</p>
      </div>
    );
  }

  return <>{children}</>;
}
