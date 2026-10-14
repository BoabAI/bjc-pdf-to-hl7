"use client";

import { useEffect } from "react";
import { CloseIcon } from "./icons";

export interface ToastMessage {
  /** Changes on every new toast so the dismiss timer restarts. */
  id: number;
  text: string;
  action?: { label: string; onClick: () => void };
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
  durationMs?: number;
}

/**
 * Inline confirmation with an optional action (e.g. Undo). One at a time.
 * Rendered in the page flow rather than floating, so it can never cover a button.
 */
export function Toast({ toast, onDismiss, durationMs = 10_000 }: ToastProps): JSX.Element | null {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [toast, onDismiss, durationMs]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-[var(--border-light)] bg-[var(--bg-card)] px-4 py-3 shadow-sm text-sm text-[var(--text-primary)]"
    >
      <p className="flex-1 leading-snug break-words">{toast.text}</p>
      {toast.action && (
        <button
          onClick={toast.action.onClick}
          className="text-[13px] font-semibold text-[var(--bjc-blue)] hover:underline flex-shrink-0"
        >
          {toast.action.label}
        </button>
      )}
      <button onClick={onDismiss} className="icon-btn flex-shrink-0 -mr-1" aria-label="Dismiss">
        <CloseIcon />
      </button>
    </div>
  );
}
