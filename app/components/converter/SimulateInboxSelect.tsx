"use client";

/**
 * Inbox simulation dropdown.
 *
 * Lets Nicole (or any operator) rehearse a fax / admin mailbox arrival from
 * the web UI without standing up the PAD pipeline. The selected sentinel maps
 * to a MailboxCategory (`results` / `letters` / `none`) via
 * `mailboxCategoryFor()` in `lib/conversion-config.ts`. The client sends the
 * raw sentinel as `x-source-mailbox`.
 *
 * Selection persists in localStorage so a refresh keeps the operator's pick.
 */

export type SimulatedMailbox = "" | "simulated:fax" | "simulated:admin";

interface SimulateInboxSelectProps {
  value: SimulatedMailbox;
  onChange: (value: SimulatedMailbox) => void;
  /** Disabled while a conversion is in flight (the queue is mid-batch). */
  disabled?: boolean;
}

const OPTIONS: Array<{ value: SimulatedMailbox; label: string; hint: string }> = [
  {
    value: "",
    label: "None — let AI decide (web upload)",
    hint: "Free classification across the full taxonomy.",
  },
  {
    value: "simulated:fax",
    label: "Fax inbox (results expected)",
    hint: "Constrains classification to pathology / radiology.",
  },
  {
    value: "simulated:admin",
    label: "Admin inbox (referrals / consult letters expected)",
    hint: "Constrains classification to referral / consult letter.",
  },
];

export function SimulateInboxSelect({
  value,
  onChange,
  disabled = false,
}: SimulateInboxSelectProps) {
  const hint = OPTIONS.find((o) => o.value === value)?.hint;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="simulate-inbox"
        className="text-sm text-[var(--text-secondary)]"
      >
        Inbox
      </label>
      <select
        id="simulate-inbox"
        value={value}
        onChange={(e) => onChange(e.target.value as SimulatedMailbox)}
        disabled={disabled}
        aria-label="Inbox"
        className="select-field w-full"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint && (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}

const STORAGE_KEY = "bjc.simulatedMailbox";
const VALID = new Set<SimulatedMailbox>([
  "",
  "simulated:fax",
  "simulated:admin",
]);

/** Returns the persisted selection or `""` (None) if unset / invalid / SSR. */
export function loadPersistedSimulatedMailbox(): SimulatedMailbox {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && VALID.has(raw as SimulatedMailbox)) {
      return raw as SimulatedMailbox;
    }
  } catch {
    // Storage may be disabled (private browsing). Fall through to default.
  }
  return "";
}

export function persistSimulatedMailbox(value: SimulatedMailbox): void {
  if (typeof window === "undefined") return;
  try {
    if (value === "") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // Ignored — feature is non-critical.
  }
}

/** Friendly label for the resolved category badge on the queue row.
 *  Accepts `string` (not just `SimulatedMailbox`) because the queue stores
 *  the raw sentinel as a plain string for forward-compat with future
 *  mailbox addresses sent by PAD. */
export function simulatedMailboxBadgeLabel(value: string): string | null {
  if (value === "simulated:fax") return "Fax inbox";
  if (value === "simulated:admin") return "Admin inbox";
  return null;
}
