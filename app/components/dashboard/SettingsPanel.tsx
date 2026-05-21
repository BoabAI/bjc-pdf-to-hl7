"use client";

import { useCallback, useEffect, useState } from "react";

interface RuntimeSettings {
  minClassificationConfidence: number;
  updatedAt?: string;
  updatedBy?: string;
}

interface SettingsApiResponse {
  success: boolean;
  settings?: RuntimeSettings;
  error?: string;
}

const AUTOSAVE_DEBOUNCE_MS = 700;

/**
 * Settings panel for the dedicated /settings page. Lets ops nudge the
 * classification confidence floor without a deploy. Persists to DynamoDB via
 * `/api/settings`; the eligibility gate reads from the same source on the next
 * conversion.
 *
 * Changes auto-save — there is no explicit Save button. The PUT is debounced so
 * a continuous slider drag results in a single write once the user settles.
 */
export function SettingsPanel(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [floor, setFloor] = useState<number>(75);
  const [serverFloor, setServerFloor] = useState<number>(75);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [updatedBy, setUpdatedBy] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const loadSettings = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/settings", { signal });
      const data = (await res.json()) as SettingsApiResponse;
      if (!res.ok || !data.success || !data.settings) {
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      setFloor(data.settings.minClassificationConfidence);
      setServerFloor(data.settings.minClassificationConfidence);
      setUpdatedAt(data.settings.updatedAt);
      setUpdatedBy(data.settings.updatedBy);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSettings(controller.signal);
    return () => controller.abort();
  }, [loadSettings]);

  const saveFloor = useCallback(async (value: number) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ minClassificationConfidence: value }),
      });
      const data = (await res.json()) as SettingsApiResponse;
      if (!res.ok || !data.success || !data.settings) {
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      // Only sync the persisted baseline — leave `floor` alone in case the user
      // nudged it again while this request was in flight (the effect re-saves).
      setServerFloor(data.settings.minClassificationConfidence);
      setUpdatedAt(data.settings.updatedAt);
      setUpdatedBy(data.settings.updatedBy);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, []);

  // Debounced auto-save: fires once the value settles and differs from the
  // persisted baseline. Holds off while a save is in flight, then re-checks.
  useEffect(() => {
    if (loading || saving) return;
    if (floor === serverFloor) return;
    const id = setTimeout(() => void saveFloor(floor), AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [floor, serverFloor, loading, saving, saveFloor]);

  if (loading) {
    return (
      <div className="card-inner p-5 text-sm text-[var(--text-muted)]">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="card-inner p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Auto-route confidence floor
        </h2>
        <span className="text-xs" aria-live="polite">
          {saving ? (
            <span className="text-[var(--text-muted)]">Saving…</span>
          ) : savedFlash ? (
            <span className="text-[var(--success)]">Saved.</span>
          ) : null}
        </span>
      </div>
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        When the AI&rsquo;s own confidence in classifying a document falls below this
        threshold, it&rsquo;s routed to manual review instead of being converted to HL7.
        Start cautious (75–85); set to 0 to disable the floor.
      </p>

      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={floor}
          onChange={(e) => setFloor(Number(e.target.value))}
          className="flex-1 accent-[var(--bjc-blue)]"
          aria-label="Minimum classification confidence"
        />
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={floor}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) setFloor(Math.max(0, Math.min(100, Math.trunc(v))));
          }}
          className="input-field text-right"
          style={{ width: "4.5rem" }}
          aria-label="Minimum classification confidence (numeric)"
        />
        <span className="text-xs text-[var(--text-muted)]">%</span>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[11px] text-[var(--text-muted)]">
          {updatedAt
            ? `Last changed ${new Date(updatedAt).toLocaleString()}${
                updatedBy ? ` by ${updatedBy}` : ""
              }`
            : "Never changed since deploy."}
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">Changes save automatically</p>
      </div>

      {error && (
        <p className="text-xs text-[var(--error)]">{error}</p>
      )}
    </div>
  );
}
