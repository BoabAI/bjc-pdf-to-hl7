"use client";

import type {
  ConvertResponse,
  ManualReviewReason,
} from "@/lib/contracts/convert";

interface ConversionResultPanelProps {
  result: ConvertResponse;
  missingPatientData: boolean;
  onDownload: () => void;
}

/**
 * Categorical colour scale for the manual-review reasons. Deliberately mirrors
 * the Tremor donut palette (amber/orange/rose/violet/slate) and Outlook category
 * colours so a reviewer sees the same hue at every surface — these intentionally
 * stay on Tailwind palette hues rather than the brand semantic tokens. The app
 * has no dark mode, so no `dark:` variants.
 */
const REVIEW_REASON_STYLES: Record<
  ManualReviewReason,
  { label: string; rowBg: string; rowBorder: string; text: string }
> = {
  low_confidence: {
    label: "Low confidence",
    rowBg: "bg-yellow-50",
    rowBorder: "border-yellow-300",
    text: "text-yellow-800",
  },
  missing_fields: {
    label: "Missing fields",
    rowBg: "bg-orange-50",
    rowBorder: "border-orange-300",
    text: "text-orange-800",
  },
  mailbox_mismatch: {
    label: "Wrong inbox",
    rowBg: "bg-red-50",
    rowBorder: "border-red-300",
    text: "text-red-800",
  },
  unknown_doc_type: {
    label: "Unknown type",
    rowBg: "bg-purple-50",
    rowBorder: "border-purple-300",
    text: "text-purple-800",
  },
  extraction_failed: {
    label: "Extraction failed",
    rowBg: "bg-zinc-100",
    rowBorder: "border-zinc-400",
    text: "text-zinc-900",
  },
};

export function ConversionResultPanel({
  result,
  missingPatientData,
  onDownload,
}: ConversionResultPanelProps) {
  // The convert-service stitches a duplicate "Mailbox/content mismatch" string
  // into `warnings` whenever `mailboxDisagreement` is true. We render the
  // disagreement as its own callout, so suppress the matching warning to
  // avoid showing the same sentence twice.
  const visibleWarnings = (result.warnings ?? []).filter(
    (w) => !(result.mailboxDisagreement && w.startsWith("Mailbox/content mismatch"))
  );

  if (result.success && result.action === "manual_review" && result.reason) {
    return (
      <ManualReviewBlock
        reason={result.reason}
        suggestedCategory={result.suggestedCategory}
        warnings={visibleWarnings}
        mailboxDisagreement={result.mailboxDisagreement}
      />
    );
  }

  if (!result.success) {
    return (
      <div className="space-y-5 animate-fade-in-up">
        <div className="p-5 rounded-xl bg-[var(--error-bg)] border border-[var(--error-border)]">
          <div className="flex items-center gap-2.5 mb-3">
            <svg className="w-5 h-5 text-[var(--error)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="font-semibold text-sm text-[var(--error)]">
              Extraction Failed
            </h3>
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {result.error}
          </p>
        </div>

        {result.mailboxDisagreement && <MailboxDisagreementCallout />}
        {visibleWarnings.length > 0 && <WarningList warnings={visibleWarnings} />}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className={`p-5 rounded-xl border ${missingPatientData ? "bg-[var(--error-bg)] border-[var(--error-border)]" : "bg-[var(--success-bg)] border-[var(--success-border)]"}`}>
        <div className="flex items-center gap-2.5 mb-3">
          {missingPatientData ? (
            <svg className="w-5 h-5 text-[var(--error)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-[var(--success)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <h3 className={`font-semibold text-sm ${missingPatientData ? "text-[var(--error)]" : "text-[var(--success)]"}`}>
            {missingPatientData ? "Could not extract patient data" : "Conversion Successful"}
          </h3>
          {!missingPatientData && result.extractionMethod === "vision" && (
            <span className="badge badge-ai text-[10px] px-2 py-0.5">
              AI Vision
            </span>
          )}
        </div>
        {missingPatientData && (
          <p className="text-sm text-[var(--error)]">
            The patient name and date of birth could not be found in this PDF. Please check the document format or try a different file.
          </p>
        )}
        {result.extractedData && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <ResultField label="Date" value={result.extractedData.date} mono />
            <ResultField label="Type" value={result.extractedData.messageType} />
            <ResultField label="Surname" value={result.extractedData.lastName} />
            <ResultField label="First Name" value={result.extractedData.firstName} />
            <ResultField label="DOB" value={result.extractedData.dob} mono />
            <ResultField label="Sex" value={result.extractedData.sex} />
            <ResultField label="Medicare" value={result.extractedData.medicareNo} mono />
            <ResultField label="Carrier" value={result.extractedData.carrier} />
            {result.extractedData.sender && (
              <ResultField label="Sender" value={result.extractedData.sender} />
            )}
            {result.extractedData.addressee && (
              <ResultField label="Addressee" value={result.extractedData.addressee} />
            )}
            {result.extractedData.cc && (
              <ResultField label="CC" value={result.extractedData.cc} />
            )}
          </div>
        )}
      </div>

      {result.mailboxDisagreement && <MailboxDisagreementCallout />}
      {visibleWarnings.length > 0 && <WarningList warnings={visibleWarnings} />}

      {!missingPatientData && (
        <div className="flex gap-3 justify-center">
          <button onClick={onDownload} className="btn-success">
            Download HL7 File
          </button>
        </div>
      )}
    </div>
  );
}

function ManualReviewBlock({
  reason,
  suggestedCategory,
  warnings,
  mailboxDisagreement,
}: {
  reason: ManualReviewReason;
  suggestedCategory?: string;
  warnings: string[];
  mailboxDisagreement?: boolean;
}) {
  const style = REVIEW_REASON_STYLES[reason];

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className={`p-5 rounded-xl border ${style.rowBg} ${style.rowBorder}`}>
        <div className="flex items-center gap-2.5 mb-2">
          <svg className={`w-5 h-5 ${style.text}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
          </svg>
          <h3 className={`font-semibold text-sm ${style.text}`}>
            Manual review — {style.label}
          </h3>
        </div>
        <p className={`text-sm leading-relaxed ${style.text}`}>
          No HL7 file produced. {suggestedCategory ?? "This document needs human triage."}
        </p>
      </div>

      {mailboxDisagreement && <MailboxDisagreementCallout />}
      {warnings.length > 0 && <WarningList warnings={warnings} />}
    </div>
  );
}

function MailboxDisagreementCallout() {
  return (
    <div className="p-4 rounded-xl bg-[var(--warning-bg)] border border-[var(--warning-border)]">
      <div className="flex items-start gap-2.5">
        <svg className="w-5 h-5 text-[var(--warning)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm text-[var(--warning)]">
            Mailbox / content mismatch
          </h4>
          <p className="text-xs text-[var(--warning)] mt-1 leading-relaxed">
            The PDF arrived in one mailbox but was classified as a different document
            family. Routing follows the AI verdict — verify before filing.
          </p>
        </div>
      </div>
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  return (
    <div className="p-4 rounded-xl bg-[var(--bg-inner)] border border-[var(--border-light)]">
      <h4 className="font-semibold text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
        Warnings
      </h4>
      <ul className="space-y-1 text-xs text-[var(--text-secondary)] list-disc list-inside">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

function ResultField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-[var(--text-muted)] text-xs">{label}</span>
      <p className={`text-[var(--text-primary)] font-medium ${mono ? "mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}
