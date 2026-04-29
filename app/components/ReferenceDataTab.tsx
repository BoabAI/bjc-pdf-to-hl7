"use client";

import { useState } from "react";
import type { Carrier, Doctor } from "@/lib/conversion-config";

interface ReferenceDataTabProps {
  doctors: Doctor[];
  carriers: Carrier[];
  onAddDoctor: (name: string, providerNumber: string) => void;
  onRemoveDoctor: (id: string) => void;
  onResetDoctors: () => void;
  onAddCarrier: (value: string, label: string) => void;
  onRemoveCarrier: (id: string) => void;
  onSetDefaultCarrier: (id: string) => void;
  onResetCarriers: () => void;
}

export function ReferenceDataTab({
  doctors,
  carriers,
  onAddDoctor,
  onRemoveDoctor,
  onResetDoctors,
  onAddCarrier,
  onRemoveCarrier,
  onSetDefaultCarrier,
  onResetCarriers,
}: ReferenceDataTabProps) {
  const [newDoctorName, setNewDoctorName] = useState("");
  const [newDoctorProvider, setNewDoctorProvider] = useState("");
  const [newCarrierValue, setNewCarrierValue] = useState("");
  const [newCarrierLabel, setNewCarrierLabel] = useState("");

  const submitDoctor = () => {
    const name = newDoctorName.trim();
    const provider = newDoctorProvider.trim();
    if (!name || !provider) return;
    if (doctors.some((d) => d.name.toLowerCase() === name.toLowerCase())) return;
    onAddDoctor(name, provider);
    setNewDoctorName("");
    setNewDoctorProvider("");
  };

  const submitCarrier = () => {
    const value = newCarrierValue.trim().toUpperCase();
    const label = newCarrierLabel.trim();
    if (!value || !label) return;
    if (carriers.some((c) => c.value.toUpperCase() === value)) return;
    onAddCarrier(value, label);
    setNewCarrierValue("");
    setNewCarrierLabel("");
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Doctors */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            BJC Health Doctors
            <span className="ml-2 text-[11px] bg-[var(--bg-inner)] text-[var(--text-muted)] px-1.5 py-0.5 rounded-full">
              {doctors.length}
            </span>
          </h3>
          <button
            onClick={onResetDoctors}
            className="text-[11px] text-[var(--bjc-blue)] hover:underline transition-colors"
          >
            Reset to defaults
          </button>
        </div>

        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Names drive AI addressee resolution on referral letters. Provider numbers
          route the HL7 message to the correct doctor&rsquo;s Genie inbox.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Dr First Last"
            value={newDoctorName}
            onChange={(e) => setNewDoctorName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitDoctor()}
            className="input-field flex-1 text-sm"
          />
          <input
            type="text"
            placeholder="Provider No. (e.g. 9000001Z)"
            value={newDoctorProvider}
            onChange={(e) => setNewDoctorProvider(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitDoctor()}
            className="input-field w-44 text-sm font-mono"
          />
          <button
            onClick={submitDoctor}
            disabled={!newDoctorName.trim() || !newDoctorProvider.trim()}
            className="btn-primary text-sm px-4 disabled:opacity-40"
          >
            Add
          </button>
        </div>

        <div className="card-inner divide-y divide-[var(--border-light)] max-h-[280px] overflow-y-auto">
          {doctors.map((doctor) => (
            <div
              key={doctor.id}
              className="flex items-center justify-between px-4 py-2.5 group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm text-[var(--text-primary)] truncate">
                  {doctor.name}
                </span>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  {doctor.providerNumber}
                </span>
              </div>
              <button
                onClick={() => onRemoveDoctor(doctor.id)}
                className="text-[var(--text-faint)] hover:text-[var(--error)] transition-colors opacity-0 group-hover:opacity-100"
                title="Remove"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
          {doctors.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
              No doctors configured. Add doctors above or reset to defaults.
            </div>
          )}
        </div>
      </section>

      {/* Carriers */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Carriers
            <span className="ml-2 text-[11px] bg-[var(--bg-inner)] text-[var(--text-muted)] px-1.5 py-0.5 rounded-full">
              {carriers.length}
            </span>
          </h3>
          <button
            onClick={onResetCarriers}
            className="text-[11px] text-[var(--bjc-blue)] hover:underline transition-colors"
          >
            Reset to defaults
          </button>
        </div>

        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          The selected carrier is written into MSH-3 (Sending Application) on every
          HL7 message. Mark one as default to set the initial dropdown selection.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Value (e.g. SMECAI)"
            value={newCarrierValue}
            onChange={(e) => setNewCarrierValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCarrier()}
            className="input-field w-40 text-sm font-mono uppercase"
          />
          <input
            type="text"
            placeholder="Label (e.g. SMEC AI)"
            value={newCarrierLabel}
            onChange={(e) => setNewCarrierLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCarrier()}
            className="input-field flex-1 text-sm"
          />
          <button
            onClick={submitCarrier}
            disabled={!newCarrierValue.trim() || !newCarrierLabel.trim()}
            className="btn-primary text-sm px-4 disabled:opacity-40"
          >
            Add
          </button>
        </div>

        <div className="card-inner divide-y divide-[var(--border-light)] max-h-[280px] overflow-y-auto">
          {carriers.map((carrier) => (
            <div
              key={carrier.id}
              className="flex items-center justify-between px-4 py-2.5 group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-mono text-[var(--text-primary)]">
                  {carrier.value}
                </span>
                <span className="text-sm text-[var(--text-secondary)] truncate">
                  {carrier.label}
                </span>
                {carrier.isDefault && (
                  <span className="badge badge-success text-[10px]">default</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {!carrier.isDefault && (
                  <button
                    onClick={() => onSetDefaultCarrier(carrier.id)}
                    className="text-[11px] text-[var(--bjc-blue)] hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Set default
                  </button>
                )}
                <button
                  onClick={() => onRemoveCarrier(carrier.id)}
                  disabled={carrier.isDefault}
                  className="text-[var(--text-faint)] hover:text-[var(--error)] transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-0 disabled:cursor-not-allowed"
                  title={
                    carrier.isDefault
                      ? "Set another carrier as default before removing"
                      : "Remove"
                  }
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {carriers.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
              No carriers configured. Add carriers above or reset to defaults.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
