"use client";

import type {
  Carrier,
  Doctor,
  DocumentTypeOption,
} from "@/lib/conversion-config";
import { SectionHeader } from "./ui/SectionHeader";
import { CogIcon } from "./ui/icons";
import {
  SimulateInboxSelect,
  type SimulatedMailbox,
} from "./converter/SimulateInboxSelect";

interface ConversionOptionsProps {
  documentType: DocumentTypeOption;
  detectedType: string | null;
  /** Hide the per-batch Document Type override (true for single-file mode). */
  showDocumentType?: boolean;
  carrier: string;
  carriers: Carrier[];
  doctors: Doctor[];
  autoFile: boolean;
  sendToDoctor: boolean;
  selectedDoctorId: string;
  /** Simulated inbox selection (drives the `x-source-mailbox` header on POST). */
  simulatedMailbox: SimulatedMailbox;
  /** Whether the converter is busy — disables the inbox dropdown mid-run. */
  isConverting?: boolean;
  onDocumentTypeChange: (value: DocumentTypeOption) => void;
  onCarrierChange: (value: string) => void;
  onAutoFileChange: (value: boolean) => void;
  onSendToDoctorChange: (value: boolean) => void;
  onSelectedDoctorIdChange: (value: string) => void;
  onSimulatedMailboxChange: (value: SimulatedMailbox) => void;
}

export function ConversionOptions({
  documentType,
  detectedType,
  showDocumentType = true,
  carrier,
  carriers,
  doctors,
  autoFile,
  sendToDoctor,
  selectedDoctorId,
  simulatedMailbox,
  isConverting = false,
  onDocumentTypeChange,
  onCarrierChange,
  onAutoFileChange,
  onSendToDoctorChange,
  onSelectedDoctorIdChange,
  onSimulatedMailboxChange,
}: ConversionOptionsProps) {
  return (
    <div className="card-inner p-5 space-y-5 animate-fade-in">
      <SectionHeader icon={<CogIcon />} title="Conversion options" />

      <SimulateInboxSelect
        value={simulatedMailbox}
        onChange={onSimulatedMailboxChange}
        disabled={isConverting}
      />

      {showDocumentType ? (
        <div className="space-y-1.5">
          <label htmlFor="documentType" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            Document Type
            {detectedType && (
              <span className="badge badge-success text-[11px]">auto-detected</span>
            )}
          </label>
          <select
            id="documentType"
            value={documentType}
            onChange={(e) => onDocumentTypeChange(e.target.value as DocumentTypeOption)}
            className="select-field w-full"
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
      ) : (
        <p className="text-xs text-[var(--text-muted)] -mt-1">
          Each file will be auto-classified individually during conversion.
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="carrier" className="text-sm text-[var(--text-secondary)]">
          Carrier
        </label>
        <select
          id="carrier"
          value={carrier}
          onChange={(e) => onCarrierChange(e.target.value)}
          className="select-field w-full"
          disabled={carriers.length === 0}
        >
          {carriers.length === 0 && <option value="">Loading…</option>}
          {carriers.map((option) => (
            <option key={option.id} value={option.value}>
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
            disabled={doctors.length === 0}
          />
          <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
            Assign to doctor
          </span>
        </label>

        {sendToDoctor && (
          <div className="ml-[30px] animate-fade-in">
            <select
              value={selectedDoctorId}
              onChange={(e) => onSelectedDoctorIdChange(e.target.value)}
              className="select-field w-full text-sm"
              disabled={doctors.length === 0}
            >
              <option value="">Select a doctor…</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name} — {doctor.providerNumber}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
