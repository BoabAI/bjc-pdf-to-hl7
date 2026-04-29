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

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function UserGroupIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function IdCardIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
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

interface SectionHeaderProps {
  icon: JSX.Element;
  title: string;
  count: number;
  description: string;
  action?: JSX.Element;
}

function SectionHeader({ icon, title, count, description, action }: SectionHeaderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-[var(--blue-50)] text-[var(--bjc-blue)] flex items-center justify-center flex-shrink-0">
            {icon}
          </span>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
          <span className="section-pill">{count}</span>
        </div>
        {action}
      </div>
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed pl-[42px]">
        {description}
      </p>
    </div>
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
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-card)]">
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
          className="input-field w-32 text-sm font-mono py-1.5"
          placeholder="9000001Z"
        />
        <button
          onClick={submit}
          disabled={!canSave}
          className="icon-btn"
          title={duplicate ? "Another doctor already has that name" : "Save"}
        >
          <CheckIcon />
        </button>
        <button
          onClick={onCancelEdit}
          className="icon-btn"
          title="Cancel"
        >
          <CloseIcon />
        </button>
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
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-card)]">
        <input
          ref={valueRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancelEdit();
          }}
          className="input-field w-32 text-sm font-mono uppercase py-1.5"
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
          className="icon-btn"
          title={duplicate ? "Another carrier already has that value" : "Save"}
        >
          <CheckIcon />
        </button>
        <button onClick={onCancelEdit} className="icon-btn" title="Cancel">
          <CloseIcon />
        </button>
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

interface AddBlockProps {
  label: string;
  children: React.ReactNode;
}

function AddBlock({ label, children }: AddBlockProps) {
  return (
    <div className="card-inner p-3 space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </div>
      {children}
    </div>
  );
}

interface EmptyStateProps {
  icon: JSX.Element;
  message: string;
}

function EmptyState({ icon, message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 border-2 border-dashed border-[var(--border-medium)] rounded-xl bg-[var(--bg-inner)]">
      <span className="w-10 h-10 rounded-full bg-[var(--bg-card)] text-[var(--text-faint)] flex items-center justify-center">
        {icon}
      </span>
      <p className="text-xs text-[var(--text-muted)] text-center max-w-xs">{message}</p>
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
