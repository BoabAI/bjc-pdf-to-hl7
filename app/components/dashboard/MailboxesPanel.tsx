"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LINKED_FOLDER,
  INBOX_FOLDER,
  validateMailboxInput,
  type MailboxConfig,
  type MailboxesResponse,
} from "@/lib/mailbox-config";
import { PencilIcon, TrashIcon } from "../ui/icons";

const HL7_FOLDER = "Inbox/HL7";
const CUSTOM = "__custom__";

const LABEL_CLASS =
  "block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1";

/** "Inbox/HL7" → "Inbox › HL7" — matches how staff see the tree in Outlook. */
function folderLabel(folder: string): string {
  return folder.split("/").join(" › ");
}

interface EditorProps {
  initial: MailboxConfig | null;
  saving: boolean;
  onSave: (input: unknown) => Promise<string | null>;
  onCancel: () => void;
}

function MailboxEditor({ initial, saving, onSave, onCancel }: EditorProps): JSX.Element {
  const initialSource = initial?.sourceFolder ?? INBOX_FOLDER;
  const isPreset = initialSource === INBOX_FOLDER || initialSource === HL7_FOLDER;
  const [address, setAddress] = useState(initial?.address ?? "");
  const [sourceChoice, setSourceChoice] = useState(isPreset ? initialSource : CUSTOM);
  const [customSource, setCustomSource] = useState(isPreset ? "Inbox/" : initialSource);
  const [linkedFolder, setLinkedFolder] = useState(initial?.linkedFolder ?? DEFAULT_LINKED_FOLDER);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);

  const sourceFolder = sourceChoice === CUSTOM ? customSource : sourceChoice;
  const input = { address, sourceFolder, linkedFolder, enabled };
  const check = validateMailboxInput(input);

  const submit = async (): Promise<void> => {
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(await onSave(input));
  };

  return (
    <div className="px-3 py-3 bg-[var(--bg-card)] space-y-2.5">
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
        <select
          value={sourceChoice}
          onChange={(e) => setSourceChoice(e.target.value)}
          className="input-field w-full text-sm py-1.5"
          aria-label="Source folder"
        >
          <option value={INBOX_FOLDER}>Inbox — every email that arrives (fax mailboxes)</option>
          <option value={HL7_FOLDER}>Inbox › HL7</option>
          <option value={CUSTOM}>Another folder under Inbox…</option>
        </select>
      </label>
      {sourceChoice === CUSTOM && (
        <label className="block">
          <span className={LABEL_CLASS}>Custom source folder</span>
          <input
            type="text"
            value={customSource}
            onChange={(e) => setCustomSource(e.target.value)}
            className="input-field w-full text-sm font-mono py-1.5"
            placeholder="Inbox/FolderName"
            maxLength={70}
            aria-label="Custom source folder"
          />
        </label>
      )}
      <label className="block">
        <span className={LABEL_CLASS}>Move filed emails to</span>
        <input
          type="text"
          value={linkedFolder}
          onChange={(e) => setLinkedFolder(e.target.value)}
          className="input-field w-full text-sm font-mono py-1.5"
          placeholder={DEFAULT_LINKED_FOLDER}
          maxLength={70}
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
        Enabled — the converter polls this mailbox
      </label>
      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        Folders must sit directly under the Inbox and already exist in the mailbox.
      </p>
      {(error ?? (!check.ok && address ? check.error : null)) && (
        <p className="text-[11px] text-[var(--error)]">
          {error ?? (!check.ok ? check.error : null)}
        </p>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2.5 py-1 rounded-md hover:bg-[var(--bg-inner)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => void submit()}
          disabled={!check.ok || saving}
          className="btn-primary text-[12px] px-3 py-1 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
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

  const save = useCallback(
    async (input: unknown): Promise<string | null> => {
      setSaving(true);
      try {
        const res = await fetch("/api/mailboxes", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = (await res.json()) as MailboxesResponse;
        if (!res.ok || !data.success) return data.error ?? `Save failed (${res.status})`;
        setEditing(null);
        await load();
        return null;
      } catch {
        return "Save failed — check your connection and try again.";
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  const remove = useCallback(
    async (id: string) => {
      setConfirmRemove(null);
      try {
        const res = await fetch(`/api/mailboxes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        const data = (await res.json()) as MailboxesResponse;
        if (!res.ok || !data.success) throw new Error(data.error ?? `Failed (${res.status})`);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove mailbox");
      }
    },
    [load]
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
        {mailboxes.map((m) =>
          editing === m.id ? (
            <MailboxEditor
              key={m.id}
              initial={m}
              saving={saving}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          ) : (
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
                    onClick={() => void remove(m.id)}
                    className="text-[12px] text-[var(--error)] font-semibold px-2 py-1 rounded-md hover:bg-[var(--bg-inner)]"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditing(m.id)}
                    className="icon-btn"
                    title="Edit"
                    aria-label={`Edit ${m.address}`}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    onClick={() => setConfirmRemove(m.id)}
                    className="icon-btn icon-btn-danger"
                    title="Remove"
                    aria-label={`Remove ${m.address}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
          )
        )}
        {editing === "new" && (
          <MailboxEditor initial={null} saving={saving} onSave={save} onCancel={() => setEditing(null)} />
        )}
      </div>

      {editing !== "new" && (
        <button onClick={() => setEditing("new")} className="btn-primary text-sm px-4 py-1.5">
          Add mailbox
        </button>
      )}

      {error && <p className="text-xs text-[var(--error)]">{error}</p>}
    </div>
  );
}
