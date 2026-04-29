"use client";

import {
  CARRIER_OPTIONS,
  type DocumentTypeOption,
} from "@/lib/conversion-config";

interface ConversionOptionsProps {
  documentType: DocumentTypeOption;
  detectedType: string | null;
  isDetecting: boolean;
  carrier: string;
  autoFile: boolean;
  sendToDoctor: boolean;
  providerNumber: string;
  onDocumentTypeChange: (value: DocumentTypeOption) => void;
  onCarrierChange: (value: string) => void;
  onAutoFileChange: (value: boolean) => void;
  onSendToDoctorChange: (value: boolean) => void;
  onProviderNumberChange: (value: string) => void;
}

export function ConversionOptions({
  documentType,
  detectedType,
  isDetecting,
  carrier,
  autoFile,
  sendToDoctor,
  providerNumber,
  onDocumentTypeChange,
  onCarrierChange,
  onAutoFileChange,
  onSendToDoctorChange,
  onProviderNumberChange,
}: ConversionOptionsProps) {
  return (
    <div className="card-inner p-5 space-y-4 animate-fade-in">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Conversion Options
      </h3>

      <div className="space-y-1.5">
        <label htmlFor="documentType" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          Document Type
          {isDetecting && (
            <span className="badge badge-blue text-[11px]">
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              detecting
            </span>
          )}
          {detectedType && !isDetecting && (
            <span className="badge badge-success text-[11px]">auto-detected</span>
          )}
        </label>
        <select
          id="documentType"
          value={documentType}
          onChange={(e) => onDocumentTypeChange(e.target.value as DocumentTypeOption)}
          disabled={isDetecting}
          className="select-field w-full max-w-xs disabled:opacity-50 disabled:cursor-wait"
        >
          <option value="auto">Auto-detect</option>
          <option value="consent_form">Consent Form</option>
          <option value="referral_letter">Specialist Referral Letter</option>
          <option value="gp_referral">GP Referral Letter</option>
          <option value="pathology_result">Pathology Result</option>
          <option value="radiology_result">Radiology Result</option>
          <option value="generic">Other Document</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="carrier" className="text-sm text-[var(--text-secondary)]">
          Carrier
        </label>
        <select
          id="carrier"
          value={carrier}
          onChange={(e) => onCarrierChange(e.target.value)}
          className="select-field w-full max-w-xs"
        >
          {CARRIER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="divider-subtle" />

      <label className="flex items-center gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={autoFile}
          onChange={(e) => onAutoFileChange(e.target.checked)}
          className="checkbox-custom"
        />
        <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
          Auto-file to patient record
        </span>
        <span className="text-[11px] text-[var(--text-muted)]">(Final result)</span>
      </label>

      <div className="space-y-2.5">
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={sendToDoctor}
            onChange={(e) => onSendToDoctorChange(e.target.checked)}
            className="checkbox-custom"
          />
          <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
            Send to specific doctor
          </span>
        </label>

        {sendToDoctor && (
          <div className="ml-[30px] animate-fade-in">
            <input
              type="text"
              placeholder="Medicare Provider Number (e.g., 1234567A)"
              value={providerNumber}
              onChange={(e) => onProviderNumberChange(e.target.value)}
              className="input-field max-w-xs text-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}
