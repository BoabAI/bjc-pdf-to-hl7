"use client";

export interface ConversionResult {
  success: boolean;
  filename?: string;
  hl7Content?: string;
  extractedData?: {
    firstName: string;
    lastName: string;
    dob: string;
    sex: string;
    medicareNo: string;
    sender?: string;
    addressee?: string;
    cc?: string;
    date?: string;
    messageType?: string;
    carrier?: string;
  };
  extractionMethod?: "vision";
  documentType?: string;
  error?: string;
}

interface ConversionResultPanelProps {
  result: ConversionResult;
  missingPatientData: boolean;
  onDownload: () => void;
  onReset: () => void;
}

export function ConversionResultPanel({
  result,
  missingPatientData,
  onDownload,
  onReset,
}: ConversionResultPanelProps) {
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

        <div className="flex gap-3 justify-center">
          <button onClick={onReset} className="btn-primary">
            Try Another File
          </button>
        </div>
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
            <span className="badge text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700">
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

      <div className="flex gap-3 justify-center">
        {!missingPatientData && (
          <button onClick={onDownload} className="btn-success">
            Download HL7 File
          </button>
        )}
        <button onClick={onReset} className="btn-secondary">
          Convert Another
        </button>
      </div>
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
