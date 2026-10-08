/**
 * Input mailboxes polled by the PAD email pipeline, and which folder each one
 * is polled from. Fax mailboxes are polled from `Inbox`; staff-curated email
 * mailboxes (Doctor@) are polled from a subfolder such as `Inbox/HL7` that the
 * team drags ready emails into.
 *
 * Client-safe: imported by the Settings UI and the API routes. No AWS SDK or
 * Node-only imports allowed in this module.
 */

export interface MailboxConfig {
  /** Lowercased address — doubles as the DynamoDB range key. */
  id: string;
  address: string;
  /** Folder PAD polls for new mail, e.g. "Inbox" or "Inbox/HL7". */
  sourceFolder: string;
  /** Folder PAD moves successfully filed mail into, e.g. "Inbox/HL7_linked". */
  linkedFolder: string;
  /** Disabled mailboxes are kept in the list but not returned to PAD. */
  enabled: boolean;
}

/** `/api/mailboxes` response envelope. */
export interface MailboxesResponse {
  success: boolean;
  mailboxes?: MailboxConfig[];
  error?: string;
}

export const INBOX_FOLDER = "Inbox";
export const DEFAULT_LINKED_FOLDER = "Inbox/HL7_linked";

function faxMailbox(address: string): MailboxConfig {
  return {
    id: address,
    address,
    sourceFolder: INBOX_FOLDER,
    linkedFolder: DEFAULT_LINKED_FOLDER,
    enabled: true,
  };
}

/** Seeded on first read — matches what the PAD flow hardcoded before this setting existed. */
export const DEFAULT_MAILBOXES: MailboxConfig[] = [
  faxMailbox("gofax.par@bjchealth.com.au"),
  faxMailbox("gofax.cht@bjchealth.com.au"),
  faxMailbox("gofax.bon@bjchealth.com.au"),
  faxMailbox("gofax.bow@bjchealth.com.au"),
];

const ADDRESS_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const MAX_ADDRESS_LEN = 254;

// PAD's O365 actions resolve folder paths from the Inbox well-known root, so we
// only allow the Inbox itself or ONE subfolder directly under it (a deeper
// nesting caught us out at Bondi). The character set is deliberately narrow:
// the value is pasted into PAD action parameters and a PowerShell pipe format.
const SUBFOLDER_PATTERN = /^Inbox\/[A-Za-z0-9 _-]{1,64}$/;

export function isValidMailFolder(folder: string): boolean {
  return folder === INBOX_FOLDER || SUBFOLDER_PATTERN.test(folder);
}

export function isMailboxConfig(value: unknown): value is MailboxConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.address === "string" &&
    v.address.length > 0 &&
    typeof v.sourceFolder === "string" &&
    typeof v.linkedFolder === "string" &&
    typeof v.enabled === "boolean"
  );
}

export type ValidatedMailbox =
  | { ok: true; value: MailboxConfig }
  | { ok: false; error: string };

/**
 * Validates and normalises a mailbox from an untrusted source (API body).
 * Builds an explicit allowlisted object — never spreads the raw value.
 */
export function validateMailboxInput(value: unknown): ValidatedMailbox {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "Invalid mailbox payload" };
  }
  const v = value as Record<string, unknown>;
  if (
    typeof v.address !== "string" ||
    typeof v.sourceFolder !== "string" ||
    typeof v.linkedFolder !== "string" ||
    typeof v.enabled !== "boolean"
  ) {
    return { ok: false, error: "Invalid mailbox payload" };
  }

  const address = v.address.trim().toLowerCase();
  if (address.length > MAX_ADDRESS_LEN || !ADDRESS_PATTERN.test(address)) {
    return { ok: false, error: "Mailbox address is not a valid email address." };
  }
  const sourceFolder = v.sourceFolder.trim();
  const linkedFolder = v.linkedFolder.trim();
  if (!isValidMailFolder(sourceFolder)) {
    return {
      ok: false,
      error: 'Source folder must be "Inbox" or a folder directly under it, e.g. "Inbox/HL7".',
    };
  }
  if (!isValidMailFolder(linkedFolder) || linkedFolder === INBOX_FOLDER) {
    return {
      ok: false,
      error: 'Linked folder must be a folder directly under Inbox, e.g. "Inbox/HL7_linked".',
    };
  }
  if (linkedFolder === sourceFolder) {
    return { ok: false, error: "Linked folder must differ from the source folder." };
  }

  return {
    ok: true,
    value: { id: address, address, sourceFolder, linkedFolder, enabled: v.enabled },
  };
}

function describeMailbox(m: MailboxConfig): string {
  return `source ${m.sourceFolder}, linked ${m.linkedFolder}, ${m.enabled ? "enabled" : "disabled"}`;
}

/** One-line summary of a change — shown in the editor and toast, and written to the audit log. */
export function describeMailboxChange(previous: MailboxConfig | undefined, next: MailboxConfig): string {
  if (!previous) return `mailbox ${next.address} added (${describeMailbox(next)})`;
  const changes: string[] = [];
  if (previous.sourceFolder !== next.sourceFolder) {
    changes.push(`source ${previous.sourceFolder} → ${next.sourceFolder}`);
  }
  if (previous.linkedFolder !== next.linkedFolder) {
    changes.push(`linked ${previous.linkedFolder} → ${next.linkedFolder}`);
  }
  if (previous.enabled !== next.enabled) {
    changes.push(next.enabled ? "enabled" : "disabled");
  }
  return `mailbox ${next.address}: ${changes.length > 0 ? changes.join(", ") : "no change"}`;
}

export type MailboxChange = { type: "put"; value: MailboxConfig } | { type: "delete"; id: string };

export const LAST_ENABLED_ERROR =
  "At least one mailbox must stay enabled, otherwise the converter checks nothing.";

/**
 * True when `change` would take the list from at least one enabled mailbox to
 * none — PAD would then poll nothing, silently. A list that already had none
 * enabled isn't made worse, so tidying it up is allowed.
 */
export function leavesNoEnabledMailbox(all: MailboxConfig[], change: MailboxChange): boolean {
  if (!all.some((m) => m.enabled)) return false;
  const id = change.type === "put" ? change.value.id : change.id;
  const after = all.filter((m) => m.id !== id);
  if (change.type === "put") after.push(change.value);
  return !after.some((m) => m.enabled);
}

const BJC_DOMAIN = "@bjchealth.com.au";

function isFaxMailbox(address: string): boolean {
  return address.startsWith("gofax.");
}

/**
 * Soft warnings for a change that is valid but easy to get wrong. The UI shows
 * them before saving; they don't block the save.
 */
export function mailboxWarnings(previous: MailboxConfig | undefined, next: MailboxConfig): string[] {
  const warnings: string[] = [];
  const fax = isFaxMailbox(next.address);
  const sourceChanged = previous?.sourceFolder !== next.sourceFolder;

  if (!next.address.endsWith(BJC_DOMAIN)) {
    warnings.push("This isn't a BJC Health address. The converter can only read BJC mailboxes.");
  }
  if (!fax && next.sourceFolder === INBOX_FOLDER && sourceChanged) {
    warnings.push(
      "Every email with a PDF attachment in this Inbox will be converted and filed into Genie. " +
        "Use Inbox/HL7 if the team chooses what to upload."
    );
  }
  if (fax && next.sourceFolder !== INBOX_FOLDER && sourceChanged) {
    warnings.push("Faxes arrive in the Inbox. The converter will stop picking them up.");
  }
  if (previous?.enabled && !next.enabled) {
    warnings.push("The converter will stop checking this mailbox.");
  }
  const folders = [
    sourceChanged ? next.sourceFolder : null,
    previous?.linkedFolder !== next.linkedFolder ? next.linkedFolder : null,
  ].filter((f): f is string => f !== null && f !== INBOX_FOLDER);
  for (const folder of folders) {
    warnings.push(`Check ${folder} exists in the mailbox first. The converter skips the mailbox if it doesn't.`);
  }
  return warnings;
}
