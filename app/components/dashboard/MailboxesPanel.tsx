"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LINKED_FOLDER,
  INBOX_FOLDER,
  LAST_ENABLED_ERROR,
  describeMailboxChange,
  leavesNoEnabledMailbox,
  mailboxWarnings,
  validateMailboxInput,
  type MailboxConfig,
  type MailboxesResponse,
} from "@/lib/mailbox-config";
import { PencilIcon, TrashIcon } from "../ui/icons";
import { Toast, type ToastMessage } from "../ui/Toast";

// Well above the 64-char folder-name limit, so an over-long paste shows the
// validation error instead of being silently cut to a valid-looking name.
const FOLDER_INPUT_MAX = 200;
const EDIT_OPEN_HINT = "Save or cancel the open edit first";

const LABEL_CLASS =
  "block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1";

/** "Inbox/HL7" → "Inbox › HL7" — matches how staff see the tree in Outlook. */
function folderLabel(folder: string): string {
  return folder.split("/").join(" › ");
}

/** "mailbox x@y: source A → B" → "source A → B" for display under the row. */
function changeSummary(text: string): string {
  return text.replace(/^mailbox [^:]+: /, "");
}

async function putMailboxRequest(mailbox: MailboxConfig): Promise<string | null> {
  try {
    const res = await fetch("/api/mailboxes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mailbox),
    });
    const data = (await res.json()) as MailboxesResponse;
    return res.ok && data.success ? null : data.error ?? `Save failed (${res.status})`;
  } catch {
    return "Save failed — check your connection and try again.";
  }
}

async function deleteMailboxRequest(id: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/mailboxes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = (await res.json()) as MailboxesResponse;
    return res.ok && data.success ? null : data.error ?? `Remove failed (${res.status})`;
  } catch {
    return "Remove failed — check your connection and try again.";
  }
}

interface EditorProps {
  initial: MailboxConfig | null;
  all: MailboxConfig[];
  saving: boolean;
  onSave: (mailbox: MailboxConfig) => Promise<string | null>;
  onCancel: () => void;
}

function MailboxEditor({ initial, all, saving, onSave, onCancel }: EditorProps): JSX.Element {
  const [address, setAddress] = useState(initial?.address ?? "");
  const [sourceFolder, setSourceFolder] = useState(initial?.sourceFolder ?? INBOX_FOLDER);
  const [linkedFolder, setLinkedFolder] = useState(initial?.linkedFolder ?? DEFAULT_LINKED_FOLDER);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [serverError, setServerError] = useState<string | null>(null);

  const check = validateMailboxInput({ address, sourceFolder, linkedFolder, enabled });
  const next = check.ok ? check.value : null;
  const previous = initial ?? undefined;

  let blockError: string | null = null;
  if (!check.ok) blockError = check.error;
  else if (!initial && all.some((m) => m.id === check.value.id)) {
    blockError = "This mailbox is already in the list. Edit it instead.";
  } else if (leavesNoEnabledMailbox(all, { type: "put", value: check.value })) {
    blockError = LAST_ENABLED_ERROR;
  }

  const change = next && previous ? changeSummary(describeMailboxChange(previous, next)) : null;
  const unchanged = change === "no change";
  const warnings = next && !blockError && !unchanged ? mailboxWarnings(previous, next) : [];
  const shownError = serverError ?? (address || initial ? blockError : null);

  const canSave = next !== null && blockError === null && !unchanged && !saving;

  const submit = async (): Promise<void> => {
    if (!next || !canSave) return;
    setServerError(await onSave(next));
  };

  // Escape cancels. Enter saves only a warning-free change: with warnings
  // showing, the user has to click "Save anyway" deliberately.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      if (warnings.length === 0) void submit();
    }
  };

  return (
    <div className="px-3 py-3 bg-[var(--bg-card)] space-y-2.5" onKeyDown={onKeyDown}>
      <label className="block">
        <span className={LABEL_CLASS}>Mailbox address</span>
        <input
          type="email"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={initial !== null}
          className="input-field w-full text-sm font-mono py-1.5 disabled:opacity-60"
          placeholder="doctor@bjchealth.com.au"
          maxLength={254}
          aria-label="Mailbox address"
        />
      </label>
      <label className="block">
        <span className={LABEL_CLASS}>Poll emails from</span>
        <input
          type="text"
          value={sourceFolder}
          onChange={(e) => setSourceFolder(e.target.value)}
          className="input-field w-full text-sm font-mono py-1.5"
          placeholder="Inbox/HL7"
          maxLength={FOLDER_INPUT_MAX}
          aria-label="Source folder"
        />
      </label>
      <label className="block">
        <span className={LABEL_CLASS}>Move filed emails to</span>
        <input
          type="text"
          value={linkedFolder}
          onChange={(e) => setLinkedFolder(e.target.value)}
          className="input-field w-full text-sm font-mono py-1.5"
          placeholder={DEFAULT_LINKED_FOLDER}
          maxLength={FOLDER_INPUT_MAX}
          aria-label="Linked folder"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-[var(--bjc-blue)]"
        />
        Enabled
      </label>
      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        Use <span className="font-mono">Inbox</span> for fax mailboxes, or{" "}
        <span className="font-mono">Inbox/HL7</span> where the team chooses what to upload.
        Folders must sit directly under the Inbox and already exist in the mailbox.
      </p>
      {change && !unchanged && !blockError && (
        <p className="text-[11px] text-[var(--text-secondary)]">
          <span className="font-semibold">Changes:</span> {change}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 space-y-1 text-[11px] text-[var(--warning)] leading-relaxed list-disc list-inside">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {shownError && <p className="text-[11px] text-[var(--error)]">{shownError}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-1 rounded-md hover:bg-[var(--bg-inner)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => void submit()}
          disabled={!canSave}
          className="btn-primary text-[12px] px-3 py-1 disabled:opacity-40"
        >
          {saving ? "Saving…" : warnings.length > 0 ? "Save anyway" : "Save"}
        </button>
      </div>
    </div>
  );
}

/**
 * Settings section listing the mailboxes the PAD email pipeline polls, and
 * which folder each is polled from. PAD reads this via /api/pad-config at the
 * start of each run, so a change applies from the next scheduled run.
 */
export function MailboxesPanel(): JSX.Element {
  const [mailboxes, setMailboxes] = useState<MailboxConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = not editing, "new" = adding, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/mailboxes", { signal });
      const data = (await res.json()) as MailboxesResponse;
      if (!res.ok || !data.success || !data.mailboxes) {
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      setMailboxes(data.mailboxes);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load mailboxes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /** Runs an undo request, then reloads and confirms — or shows why it failed. */
  const runUndo = useCallback(
    async (request: () => Promise<string | null>) => {
      setToast(null);
      const failure = await request();
      await load();
      if (failure) setError(`Undo failed: ${failure}`);
      else setToast({ id: Date.now(), text: "Undone." });
    },
    [load]
  );

  const save = useCallback(
    async (mailbox: MailboxConfig): Promise<string | null> => {
      const previous = mailboxes.find((m) => m.id === mailbox.id);
      setSaving(true);
      const failure = await putMailboxRequest(mailbox);
      setSaving(false);
      if (failure) return failure;
      setEditing(null);
      await load();
      setToast({
        id: Date.now(),
        text: previous
          ? `${mailbox.address} saved: ${changeSummary(describeMailboxChange(previous, mailbox))}.`
          : `${mailbox.address} added.`,
        action: {
          label: "Undo",
          onClick: () =>
            void runUndo(() =>
              previous ? putMailboxRequest(previous) : deleteMailboxRequest(mailbox.id)
            ),
        },
      });
      return null;
    },
    [mailboxes, load, runUndo]
  );

  const remove = useCallback(
    async (mailbox: MailboxConfig) => {
      setConfirmRemove(null);
      const failure = await deleteMailboxRequest(mailbox.id);
      if (failure) {
        setError(failure);
        return;
      }
      await load();
      setToast({
        id: Date.now(),
        text: `${mailbox.address} removed.`,
        action: { label: "Undo", onClick: () => void runUndo(() => putMailboxRequest(mailbox)) },
      });
    },
    [load, runUndo]
  );

  if (loading) {
    return (
      <div className="card-inner p-5 text-sm text-[var(--text-muted)]">Loading mailboxes…</div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        The mailboxes the converter checks for PDFs, and the folder it checks in each. Fax
        mailboxes use the Inbox. Email mailboxes where the team chooses what to upload use
        Inbox › HL7. Changes apply from the converter&rsquo;s next run (within about 15 minutes).
      </p>

      <div className="card-inner divide-y divide-[var(--border-light)]">
        {mailboxes.map((m) => {
          if (editing === m.id) {
            return (
              <MailboxEditor
                key={m.id}
                initial={m}
                all={mailboxes}
                saving={saving}
                onSave={save}
                onCancel={() => setEditing(null)}
              />
            );
          }
          const isLastEnabled = leavesNoEnabledMailbox(mailboxes, { type: "delete", id: m.id });
          return (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-mono truncate leading-tight ${
                    m.enabled ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] line-through"
                  }`}
                >
                  {m.address}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <span
                    className={`rounded px-1.5 py-px border ${
                      m.sourceFolder === INBOX_FOLDER
                        ? "bg-[var(--bg-inner)] border-[var(--border-light)]"
                        : "bg-[var(--blue-50)] border-[var(--blue-50)] text-[var(--bjc-blue)] font-semibold"
                    }`}
                  >
                    {folderLabel(m.sourceFolder)}
                  </span>
                  <span>→ {folderLabel(m.linkedFolder)}</span>
                  {!m.enabled && <span className="italic">· disabled</span>}
                </div>
              </div>
              {confirmRemove === m.id ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setConfirmRemove(null)}
                    className="text-[12px] text-[var(--text-secondary)] px-2 py-1 rounded-md hover:bg-[var(--bg-inner)]"
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => void remove(m)}
                    className="text-[12px] text-[var(--error)] font-semibold px-2 py-1 rounded-md hover:bg-[var(--bg-inner)]"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditing(m.id)}
                    disabled={editing !== null}
                    className="icon-btn disabled:opacity-30 disabled:cursor-not-allowed"
                    title={editing !== null ? EDIT_OPEN_HINT : "Edit"}
                    aria-label={`Edit ${m.address}`}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    onClick={() => setConfirmRemove(m.id)}
                    disabled={isLastEnabled}
                    className="icon-btn icon-btn-danger disabled:opacity-30 disabled:cursor-not-allowed"
                    title={isLastEnabled ? LAST_ENABLED_ERROR : "Remove"}
                    aria-label={`Remove ${m.address}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {editing === "new" && (
          <MailboxEditor
            initial={null}
            all={mailboxes}
            saving={saving}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>

      <Toast toast={toast} onDismiss={dismissToast} />

      {editing !== "new" && (
        <button
          onClick={() => setEditing("new")}
          disabled={editing !== null}
          title={editing !== null ? EDIT_OPEN_HINT : undefined}
          className="btn-primary text-sm px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add mailbox
        </button>
      )}

      {error && <p className="text-xs text-[var(--error)]">{error}</p>}
    </div>
  );
}
