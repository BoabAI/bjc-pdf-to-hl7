"use client";

interface ConvertActionsProps {
  isConverting: boolean;
  pendingCount: number;
  disabled: boolean;
  onConvert: () => void;
  onReset: () => void;
}

export function ConvertActions({
  isConverting,
  pendingCount,
  disabled,
  onConvert,
  onReset,
}: ConvertActionsProps) {
  return (
    <div className="flex flex-col items-center gap-3 pt-1 animate-fade-in">
      <button
        onClick={onConvert}
        disabled={disabled}
        className="btn-primary w-full max-w-xs disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isConverting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Converting...
          </span>
        ) : pendingCount > 0 ? (
          `Convert ${pendingCount} file${pendingCount === 1 ? "" : "s"}`
        ) : (
          "All converted"
        )}
      </button>
      <button
        onClick={onReset}
        disabled={isConverting}
        className="text-sm text-[var(--text-muted)] hover:text-[var(--error)] transition-colors disabled:opacity-50 px-4 py-2 min-h-[44px]"
      >
        Clear all
      </button>
    </div>
  );
}
