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

/**
 * Inline settings panel for the stats page. Lets ops nudge the classification
 * confidence floor without a deploy. Persists to DynamoDB via `/api/settings`;
 * the eligibility gate reads from the same source on the next conversion.
 *
 * Optimistic UI is intentionally *not* used here — settings changes are
 * infrequent and a deliberate confirmation feels safer than silent acceptance.
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

  const dirty = floor !== serverFloor;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ minClassificationConfidence: floor }),
      });
      const data = (await res.json()) as SettingsApiResponse;
      if (!res.ok || !data.success || !data.settings) {
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      setFloor(data.settings.minClassificationConfidence);
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
  }, [floor]);

  const handleReset = useCallback(() => {
    setFloor(serverFloor);
    setError(null);
  }, [serverFloor]);

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
        {savedFlash && (
          <span className="text-xs text-[var(--success)]">Saved.</span>
        )}
      </div>
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
        Documents below this self-reported classification confidence divert to manual
        review instead of producing HL7. Start cautious (75–85); lower it once Nicole
        confirms misroutes are rare. 0 disables the floor.
      </p>

      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={floor}
          onChange={(e) => setFloor(Number(e.target.value))}
          disabled={saving}
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
          disabled={saving}
          className="w-16 input text-right"
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={!dirty || saving}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-[var(--error)]">{error}</p>
      )}
    </div>
  );
}
