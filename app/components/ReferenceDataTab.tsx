"use client";

import { useEffect, useRef, useState } from "react";
import type { Carrier, Doctor } from "@/lib/conversion-config";

interface ReferenceDataTabProps {
  doctors: Doctor[];
  carriers: Carrier[];
  onAddDoctor: (name: string, providerNumber: string) => void;
  onUpdateDoctor: (id: string, patch: { name: string; providerNumber: string }) => void;
  onRemoveDoctor: (id: string) => void;
  onAddCarrier: (value: string, label: string) => void;
  onUpdateCarrier: (id: string, patch: { value: string; label: string }) => void;
  onRemoveCarrier: (id: string) => void;
  onSetDefaultCarrier: (id: string) => void;
  onResetCarriers: () => void;
}

function PencilIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487zm0 0L19.5 7.125" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

interface DoctorRowProps {
  doctor: Doctor;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: { name: string; providerNumber: string }) => void;
  onRemove: () => void;
  isDuplicateName: (name: string) => boolean;
}

function DoctorRow({
  doctor,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
  isDuplicateName,
}: DoctorRowProps) {
  const [name, setName] = useState(doctor.name);
  const [providerNumber, setProviderNumber] = useState(doctor.providerNumber);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setName(doctor.name);
      setProviderNumber(doctor.providerNumber);
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [isEditing, doctor.name, doctor.providerNumber]);

  const trimmedName = name.trim();
  const trimmedProvider = providerNumber.trim();
  const dirty = trimmedName !== doctor.name || trimmedProvider !== doctor.providerNumber;
  const duplicate = trimmedName.length > 0 && isDuplicateName(trimmedName);
  const canSave = trimmedName.length > 0 && trimmedProvider.length > 0 && dirty && !duplicate;

  const submit = () => {
    if (!canSave) return;
    onSave({ name: trimmedName, providerNumber: trimmedProvider });
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-inner)]">
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancelEdit();
          }}
          className="input-field flex-1 text-sm py-1.5"
          placeholder="Dr First Last"
        />
        <input
          type="text"
          value={providerNumber}
          onChange={(e) => setProviderNumber(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancelEdit();
          }}
          className="input-field w-36 text-sm font-mono py-1.5"
          placeholder="9000001Z"
        />
        <button
          onClick={submit}
          disabled={!canSave}
          className="text-[var(--bjc-blue)] hover:text-[var(--bjc-navy)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={duplicate ? "Another doctor already has that name" : "Save"}
        >
          <CheckIcon />
        </button>
        <button
          onClick={onCancelEdit}
          className="text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors"
          title="Cancel"
        >
          <CloseIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 group">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm text-[var(--text-primary)] truncate">{doctor.name}</span>
        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          {doctor.providerNumber}
        </span>
      </div>
      <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onStartEdit}
          className="text-[var(--text-faint)] hover:text-[var(--bjc-blue)] transition-colors"
          title="Edit"
        >
          <PencilIcon />
        </button>
        <button
          onClick={onRemove}
          className="text-[var(--text-faint)] hover:text-[var(--error)] transition-colors"
          title="Remove"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

interface CarrierRowProps {
  carrier: Carrier;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: { value: string; label: string }) => void;
  onRemove: () => void;
  onSetDefault: () => void;
  isDuplicateValue: (value: string) => boolean;
}

function CarrierRow({
  carrier,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onRemove,
  onSetDefault,
  isDuplicateValue,
}: CarrierRowProps) {
  const [value, setValue] = useState(carrier.value);
  const [label, setLabel] = useState(carrier.label);
  const valueRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setValue(carrier.value);
      setLabel(carrier.label);
      valueRef.current?.focus();
      valueRef.current?.select();
    }
  }, [isEditing, carrier.value, carrier.label]);

  const trimmedValue = value.trim().toUpperCase();
  const trimmedLabel = label.trim();
  const dirty = trimmedValue !== carrier.value || trimmedLabel !== carrier.label;
  const duplicate = trimmedValue.length > 0 && isDuplicateValue(trimmedValue);
  const canSave =
    trimmedValue.length > 0 && trimmedLabel.length > 0 && dirty && !duplicate;

  const submit = () => {
    if (!canSave) return;
    onSave({ value: trimmedValue, label: trimmedLabel });
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-inner)]">
        <input
          ref={valueRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancelEdit();
          }}
          className="input-field w-36 text-sm font-mono uppercase py-1.5"
          placeholder="SMECAI"
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancelEdit();
          }}
          className="input-field flex-1 text-sm py-1.5"
          placeholder="SMEC AI"
        />
        <button
          onClick={submit}
          disabled={!canSave}
          className="text-[var(--bjc-blue)] hover:text-[var(--bjc-navy)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={duplicate ? "Another carrier already has that value" : "Save"}
        >
          <CheckIcon />
        </button>
        <button
          onClick={onCancelEdit}
          className="text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors"
          title="Cancel"
        >
          <CloseIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 group">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-mono text-[var(--text-primary)]">{carrier.value}</span>
        <span className="text-sm text-[var(--text-secondary)] truncate">{carrier.label}</span>
        {carrier.isDefault && <span className="badge badge-success text-[10px]">default</span>}
      </div>
      <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
        {!carrier.isDefault && (
          <button
            onClick={onSetDefault}
            className="text-[11px] text-[var(--bjc-blue)] hover:underline"
          >
            Set default
          </button>
        )}
        <button
          onClick={onStartEdit}
          className="text-[var(--text-faint)] hover:text-[var(--bjc-blue)] transition-colors"
          title="Edit"
        >
          <PencilIcon />
        </button>
        <button
          onClick={onRemove}
          disabled={carrier.isDefault}
          className="text-[var(--text-faint)] hover:text-[var(--error)] transition-colors disabled:opacity-0 disabled:cursor-not-allowed"
          title={
            carrier.isDefault
              ? "Set another carrier as default before removing"
              : "Remove"
          }
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

export function ReferenceDataTab({
  doctors,
  carriers,
  onAddDoctor,
  onUpdateDoctor,
  onRemoveDoctor,
  onAddCarrier,
  onUpdateCarrier,
  onRemoveCarrier,
  onSetDefaultCarrier,
  onResetCarriers,
}: ReferenceDataTabProps) {
  const [newDoctorName, setNewDoctorName] = useState("");
  const [newDoctorProvider, setNewDoctorProvider] = useState("");
  const [newCarrierValue, setNewCarrierValue] = useState("");
  const [newCarrierLabel, setNewCarrierLabel] = useState("");
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  const [editingCarrierId, setEditingCarrierId] = useState<string | null>(null);

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
            Doctors
            <span className="ml-2 text-[11px] bg-[var(--bg-inner)] text-[var(--text-muted)] px-1.5 py-0.5 rounded-full">
              {doctors.length}
            </span>
          </h3>
        </div>

        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Names drive AI addressee resolution on referral letters. Provider numbers
          route the HL7 message to the correct doctor&rsquo;s Genie inbox.
        </p>

        <div className="space-y-2">
          <input
            type="text"
            placeholder="Doctor name (e.g. Dr Irwin Lim)"
            value={newDoctorName}
            onChange={(e) => setNewDoctorName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitDoctor()}
            className="input-field w-full text-sm"
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Provider No. (e.g. 9000001Z)"
              value={newDoctorProvider}
              onChange={(e) => setNewDoctorProvider(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitDoctor()}
              className="input-field flex-1 text-sm font-mono"
            />
            <button
              onClick={submitDoctor}
              disabled={!newDoctorName.trim() || !newDoctorProvider.trim()}
              className="btn-primary text-sm px-4 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>

        <div className="card-inner divide-y divide-[var(--border-light)] max-h-[420px] overflow-y-auto">
          {doctors.map((doctor) => (
            <DoctorRow
              key={doctor.id}
              doctor={doctor}
              isEditing={editingDoctorId === doctor.id}
              onStartEdit={() => setEditingDoctorId(doctor.id)}
              onCancelEdit={() => setEditingDoctorId(null)}
              onSave={(patch) => {
                onUpdateDoctor(doctor.id, patch);
                setEditingDoctorId(null);
              }}
              onRemove={() => onRemoveDoctor(doctor.id)}
              isDuplicateName={(name) =>
                doctors.some(
                  (d) =>
                    d.id !== doctor.id &&
                    d.name.toLowerCase() === name.toLowerCase()
                )
              }
            />
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

        <div className="space-y-2">
          <input
            type="text"
            placeholder="Value (e.g. SMECAI)"
            value={newCarrierValue}
            onChange={(e) => setNewCarrierValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCarrier()}
            className="input-field w-full text-sm font-mono uppercase"
          />
          <div className="flex gap-2">
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
        </div>

        <div className="card-inner divide-y divide-[var(--border-light)] max-h-[420px] overflow-y-auto">
          {carriers.map((carrier) => (
            <CarrierRow
              key={carrier.id}
              carrier={carrier}
              isEditing={editingCarrierId === carrier.id}
              onStartEdit={() => setEditingCarrierId(carrier.id)}
              onCancelEdit={() => setEditingCarrierId(null)}
              onSave={(patch) => {
                onUpdateCarrier(carrier.id, patch);
                setEditingCarrierId(null);
              }}
              onRemove={() => onRemoveCarrier(carrier.id)}
              onSetDefault={() => onSetDefaultCarrier(carrier.id)}
              isDuplicateValue={(value) =>
                carriers.some(
                  (c) => c.id !== carrier.id && c.value.toUpperCase() === value
                )
              }
            />
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
