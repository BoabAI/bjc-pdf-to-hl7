"use client";

interface DoctorsTabProps {
  doctors: string[];
  newDoctorName: string;
  onNewDoctorNameChange: (value: string) => void;
  onAddDoctor: () => void;
  onRemoveDoctor: (index: number) => void;
  onResetDoctors: () => void;
}

export function DoctorsTab({
  doctors,
  newDoctorName,
  onNewDoctorNameChange,
  onAddDoctor,
  onRemoveDoctor,
  onResetDoctors,
}: DoctorsTabProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          BJC Health Doctors
        </h3>
        <button
          onClick={onResetDoctors}
          className="text-[11px] text-[var(--bjc-blue)] hover:underline transition-colors"
        >
          Reset to defaults
        </button>
      </div>

      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        The AI uses this list to identify which doctor on a referral letter belongs to BJC Health for correct Genie routing.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Dr First Last"
          value={newDoctorName}
          onChange={(e) => onNewDoctorNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAddDoctor()}
          className="input-field flex-1 text-sm"
        />
        <button
          onClick={onAddDoctor}
          disabled={!newDoctorName.trim()}
          className="btn-primary text-sm px-4 disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <div className="card-inner divide-y divide-[var(--border-light)] max-h-[400px] overflow-y-auto">
        {doctors.map((name, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5 group">
            <span className="text-sm text-[var(--text-primary)]">{name}</span>
            <button
              onClick={() => onRemoveDoctor(i)}
              className="text-[var(--text-faint)] hover:text-[var(--error)] transition-colors opacity-0 group-hover:opacity-100"
              title="Remove"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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
    </div>
  );
}
