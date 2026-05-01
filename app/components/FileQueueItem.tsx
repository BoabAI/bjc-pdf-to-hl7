"use client";

import {
  ConversionResultPanel,
  type ConversionResult,
} from "./ConversionResultPanel";
import type { DocumentType } from "@/lib/domain/types";

export type FileEntryStatus =
  | "queued"
  | "ready"
  | "converting"
  | "done"
  | "failed";

export interface FileEntry {
  id: string;
  file: File;
  detectedType: DocumentType | null;
  status: FileEntryStatus;
  result?: ConversionResult;
}

interface FileQueueItemProps {
  entry: FileEntry;
  onRemove: () => void;
  onDownload: () => void;
}

const STATUS_LABELS: Record<FileEntryStatus, string> = {
  queued: "Queued",
  ready: "Ready",
  converting: "Converting…",
  done: "Done",
  failed: "Failed",
};

const STATUS_BADGES: Record<FileEntryStatus, string> = {
  queued: "bg-[var(--bg-inner)] text-[var(--text-muted)]",
  ready: "bg-[var(--bg-inner)] text-[var(--text-secondary)]",
  converting:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export function FileQueueItem({
  entry,
  onRemove,
  onDownload,
}: FileQueueItemProps) {
  const { file, status, result } = entry;
  const showSpinner = status === "converting";

  const missingPatientData = Boolean(
    result?.success &&
      !result.extractedData?.firstName &&
      !result.extractedData?.lastName &&
      !result.extractedData?.dob
  );

  return (
    <div className="card-inner p-4 space-y-3 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
            {file.name}
          </p>
          <p className="text-xs text-[var(--text-muted)] mono mt-0.5">
            {(file.size / 1024).toFixed(1)} KB
            {entry.detectedType && (
              <span className="ml-2 text-[var(--text-secondary)]">
                · {entry.detectedType.replace(/_/g, " ")}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGES[status]}`}
          >
            {showSpinner && (
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {STATUS_LABELS[status]}
          </span>
          {status !== "converting" && (
            <button
              onClick={onRemove}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
              aria-label={`Remove ${file.name}`}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {result && (
        <ConversionResultPanel
          result={result}
          missingPatientData={missingPatientData}
          onDownload={onDownload}
          onReset={onRemove}
        />
      )}
    </div>
  );
}
