"use client";

import { useEffect, useRef, useState } from "react";
import type { Carrier, Doctor } from "@/lib/conversion-config";
import {
  AddBlock,
  EmptyState,
  SectionHeader,
} from "./ui/SectionHeader";
import {
  IdCardIcon,
  PencilIcon,
  ResetIcon,
  TrashIcon,
  UserGroupIcon,
} from "./ui/icons";

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

function getInitials(fullName: string): string {
  const stripped = fullName.replace(/^Dr\.?\s+/i, "").trim();
  if (!stripped) return "•";
  const parts = stripped.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1][0] ?? "";
  return (first + last).toUpperCase();
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
      <div className="px-3 py-3 bg-[var(--bg-card)] space-y-2.5">
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Doctor name
          </span>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="input-field w-full text-sm py-1.5"
            placeholder="Dr First Last"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Provider number
          </span>
          <input
            type="text"
            value={providerNumber}
            onChange={(e) => setProviderNumber(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="input-field w-full text-sm font-mono py-1.5"
            placeholder="9000001Z"
          />
        </label>
        {duplicate && (
          <p className="text-[11px] text-[var(--error)]">
            Another doctor already has that name.
          </p>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancelEdit}
            className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-1 rounded-md hover:bg-[var(--bg-inner)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSave}
            className="btn-primary text-[12px] px-3 py-1 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-card)] transition-colors">
      <span className="w-8 h-8 rounded-full bg-[var(--blue-50)] text-[var(--bjc-blue)] text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
        {getInitials(doctor.name)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[var(--text-primary)] truncate leading-tight">
          {doctor.name}
        </div>
        <div className="mt-0.5 inline-block text-[11px] font-mono text-[var(--text-muted)] bg-[var(--bg-inner)] border border-[var(--border-light)] rounded px-1.5 py-px">
          {doctor.providerNumber}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onStartEdit} className="icon-btn" title="Edit">
          <PencilIcon />
        </button>
        <button onClick={onRemove} className="icon-btn icon-btn-danger" title="Remove">
          <TrashIcon />
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
      <div className="px-3 py-3 bg-[var(--bg-card)] space-y-2.5">
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Value (MSH-3)
          </span>
          <input
            ref={valueRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="input-field w-full text-sm font-mono uppercase py-1.5"
            placeholder="SMECAI"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            Display label
          </span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="input-field w-full text-sm py-1.5"
            placeholder="SMEC AI"
          />
        </label>
        {duplicate && (
          <p className="text-[11px] text-[var(--error)]">
            Another carrier already uses that value.
          </p>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onCancelEdit}
            className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-1 rounded-md hover:bg-[var(--bg-inner)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSave}
            className="btn-primary text-[12px] px-3 py-1 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-card)] transition-colors">
      <span className="font-mono text-[11px] text-[var(--text-secondary)] bg-[var(--bg-card)] border border-[var(--border-light)] rounded-md px-2 py-1 flex-shrink-0">
        {carrier.value}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm text-[var(--text-primary)] truncate">
          {carrier.label}
        </span>
        {carrier.isDefault && (
          <span className="badge badge-success text-[10px] flex-shrink-0">default</span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {!carrier.isDefault && (
          <button
            onClick={onSetDefault}
            className="text-[11px] text-[var(--bjc-blue)] hover:underline px-2 py-1 rounded-md hover:bg-[var(--blue-50)] transition-colors"
          >
            Set default
          </button>
        )}
        <button onClick={onStartEdit} className="icon-btn" title="Edit">
          <PencilIcon />
        </button>
        <button
          onClick={onRemove}
          disabled={carrier.isDefault}
          className="icon-btn icon-btn-danger"
          title={
            carrier.isDefault
              ? "Set another carrier as default before removing"
              : "Remove"
          }
        >
          <TrashIcon />
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
    <div className="space-y-10 animate-fade-in">
      {/* Doctors */}
      <section className="space-y-4">
        <SectionHeader
          icon={<UserGroupIcon />}
          title="Doctors"
          count={doctors.length}
          description="Names drive AI addressee resolution on referral letters. Provider numbers route the HL7 message to the correct doctor's Genie inbox."
        />

        <AddBlock label="Add doctor">
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
              className="btn-primary text-sm px-5 py-2 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </AddBlock>

        {doctors.length === 0 ? (
          <EmptyState
            icon={<UserGroupIcon />}
            message="No doctors configured. Add doctors above or reset to defaults."
          />
        ) : (
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
          </div>
        )}
      </section>

      {/* Carriers */}
      <section className="space-y-4">
        <SectionHeader
          icon={<IdCardIcon />}
          title="Carriers"
          count={carriers.length}
          description="The selected carrier is written into MSH-3 (Sending Application) on every HL7 message. Mark one as default to set the initial dropdown selection."
          action={
            <button
              onClick={onResetCarriers}
              className="inline-flex items-center gap-1.5 text-[11px] text-[var(--bjc-blue)] hover:bg-[var(--blue-50)] px-2 py-1 rounded-md transition-colors flex-shrink-0"
            >
              <ResetIcon />
              Reset to defaults
            </button>
          }
        />

        <AddBlock label="Add carrier">
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
              className="btn-primary text-sm px-5 py-2 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </AddBlock>

        {carriers.length === 0 ? (
          <EmptyState
            icon={<IdCardIcon />}
            message="No carriers configured. Add carriers above or reset to defaults."
          />
        ) : (
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
          </div>
        )}
      </section>
    </div>
  );
}
