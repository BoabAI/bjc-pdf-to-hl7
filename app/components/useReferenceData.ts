"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_BJC_DOCTORS,
  DEFAULT_CARRIER,
  DEFAULT_CARRIERS,
  type Carrier,
  type Doctor,
} from "@/lib/conversion-config";
import {
  AuthExpiredError,
  deleteCarrier as apiDeleteCarrier,
  deleteDoctor as apiDeleteDoctor,
  getReferenceData,
  putCarrier as apiPutCarrier,
  putDoctor as apiPutDoctor,
} from "./referenceDataClient";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/**
 * Redirect to /login with a return path so the user lands back here after
 * signing in. Server-rendered fallback: do nothing (we're not in a browser).
 */
function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const returnTo = encodeURIComponent(window.location.pathname);
  window.location.assign(`/login?returnTo=${returnTo}`);
}

export interface UseReferenceDataResult {
  doctors: Doctor[];
  carriers: Carrier[];
  carrier: string;
  setCarrier: (value: string) => void;
  loaded: boolean;
  /** True while a mutation is in flight. UI should disable destructive actions. */
  saving: boolean;
  /** Last save error, or null. Cleared on the next successful save. */
  error: string | null;
  addDoctor: (name: string, providerNumber: string) => Promise<void>;
  updateDoctor: (id: string, patch: { name: string; providerNumber: string }) => Promise<void>;
  removeDoctor: (id: string) => Promise<void>;
  resetDoctors: () => Promise<void>;
  addCarrier: (value: string, label: string) => Promise<void>;
  updateCarrier: (id: string, patch: { value: string; label: string }) => Promise<void>;
  removeCarrier: (id: string) => Promise<void>;
  setDefaultCarrier: (id: string) => Promise<void>;
  resetCarriers: () => Promise<void>;
}

/**
 * Centralised reference-data state for the converter and reference pages.
 * Loads from /api/reference-data on mount, persists every mutation, and
 * rolls back optimistic updates when persistence fails.
 */
export function useReferenceData(): UseReferenceDataResult {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [carrier, setCarrier] = useState(DEFAULT_CARRIER);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { doctors: ds, carriers: cs } = await getReferenceData();
        if (cancelled) return;
        setDoctors(ds);
        setCarriers(cs);
        const def = cs.find((c) => c.isDefault);
        if (def) setCarrier(def.value);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof AuthExpiredError) {
          redirectToLogin();
          return;
        }
        // Bundled defaults are intentional fallback when the API is unreachable.
        setDoctors(DEFAULT_BJC_DOCTORS);
        setCarriers(DEFAULT_CARRIERS);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Run an optimistic mutation. The optimistic state is applied immediately
   * via `apply()`; on persistence failure we restore the snapshot via
   * `rollback()` and surface the error.
   */
  const runOptimistic = useCallback(
    async (
      apply: () => void,
      rollback: () => void,
      persist: () => Promise<void>
    ): Promise<void> => {
      apply();
      setSaving(true);
      try {
        await persist();
        setError(null);
      } catch (err) {
        rollback();
        if (err instanceof AuthExpiredError) {
          // Don't surface a banner — the redirect will land them on /login
          // where they'll see the sign-in screen instead.
          redirectToLogin();
          return;
        }
        setError(errorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const addDoctor = useCallback(
    async (name: string, providerNumber: string) => {
      const doctor: Doctor = { id: newId(), name, providerNumber };
      const previous = doctors;
      await runOptimistic(
        () => setDoctors((prev) => [...prev, doctor]),
        () => setDoctors(previous),
        () => apiPutDoctor(doctor)
      );
    },
    [doctors, runOptimistic]
  );

  const updateDoctor = useCallback(
    async (id: string, patch: { name: string; providerNumber: string }) => {
      const previous = doctors;
      const target = previous.find((d) => d.id === id);
      if (!target) return;
      const updated: Doctor = { ...target, name: patch.name, providerNumber: patch.providerNumber };
      await runOptimistic(
        () =>
          setDoctors((prev) => prev.map((d) => (d.id === id ? updated : d))),
        () => setDoctors(previous),
        () => apiPutDoctor(updated)
      );
    },
    [doctors, runOptimistic]
  );

  const removeDoctor = useCallback(
    async (id: string) => {
      const previous = doctors;
      await runOptimistic(
        () => setDoctors((prev) => prev.filter((d) => d.id !== id)),
        () => setDoctors(previous),
        () => apiDeleteDoctor(id)
      );
    },
    [doctors, runOptimistic]
  );

  const resetDoctors = useCallback(async () => {
    const previous = doctors;
    await runOptimistic(
      () => setDoctors(DEFAULT_BJC_DOCTORS),
      () => setDoctors(previous),
      async () => {
        await Promise.all(previous.map((d) => apiDeleteDoctor(d.id)));
        await Promise.all(DEFAULT_BJC_DOCTORS.map((d) => apiPutDoctor(d)));
      }
    );
  }, [doctors, runOptimistic]);

  const addCarrier = useCallback(
    async (value: string, label: string) => {
      const item: Carrier = { id: newId(), value, label };
      const previous = carriers;
      await runOptimistic(
        () => setCarriers((prev) => [...prev, item]),
        () => setCarriers(previous),
        () => apiPutCarrier(item)
      );
    },
    [carriers, runOptimistic]
  );

  const updateCarrier = useCallback(
    async (id: string, patch: { value: string; label: string }) => {
      const previous = carriers;
      const target = previous.find((c) => c.id === id);
      if (!target) return;
      const updated: Carrier = { ...target, value: patch.value, label: patch.label };
      const previousActive = carrier;
      const oldValue = target.value;
      await runOptimistic(
        () => {
          setCarriers((prev) => prev.map((c) => (c.id === id ? updated : c)));
          if (carrier === oldValue && oldValue !== patch.value) {
            setCarrier(patch.value);
          }
        },
        () => {
          setCarriers(previous);
          setCarrier(previousActive);
        },
        () => apiPutCarrier(updated)
      );
    },
    [carriers, carrier, runOptimistic]
  );

  const removeCarrier = useCallback(
    async (id: string) => {
      const previous = carriers;
      const target = previous.find((c) => c.id === id);
      if (!target || target.isDefault) return;
      const previousActive = carrier;
      await runOptimistic(
        () => {
          setCarriers((prev) => prev.filter((c) => c.id !== id));
          if (carrier === target.value) {
            const fallback = previous.find((c) => c.id !== id && c.isDefault);
            setCarrier(fallback?.value ?? DEFAULT_CARRIER);
          }
        },
        () => {
          setCarriers(previous);
          setCarrier(previousActive);
        },
        () => apiDeleteCarrier(id)
      );
    },
    [carriers, carrier, runOptimistic]
  );

  const setDefaultCarrier = useCallback(
    async (id: string) => {
      const previous = carriers;
      const previousActive = carrier;
      const updated = previous.map((c) => ({ ...c, isDefault: c.id === id }));
      const newDefault = updated.find((c) => c.id === id);
      await runOptimistic(
        () => {
          setCarriers(updated);
          if (newDefault) setCarrier(newDefault.value);
        },
        () => {
          setCarriers(previous);
          setCarrier(previousActive);
        },
        async () => {
          await Promise.all(updated.map((c) => apiPutCarrier(c)));
        }
      );
    },
    [carriers, carrier, runOptimistic]
  );

  const resetCarriers = useCallback(async () => {
    const previous = carriers;
    const previousActive = carrier;
    const def = DEFAULT_CARRIERS.find((c) => c.isDefault);
    await runOptimistic(
      () => {
        setCarriers(DEFAULT_CARRIERS);
        if (def) setCarrier(def.value);
      },
      () => {
        setCarriers(previous);
        setCarrier(previousActive);
      },
      async () => {
        await Promise.all(previous.map((c) => apiDeleteCarrier(c.id)));
        await Promise.all(DEFAULT_CARRIERS.map((c) => apiPutCarrier(c)));
      }
    );
  }, [carriers, carrier, runOptimistic]);

  return {
    doctors,
    carriers,
    carrier,
    setCarrier,
    loaded,
    saving,
    error,
    addDoctor,
    updateDoctor,
    removeDoctor,
    resetDoctors,
    addCarrier,
    updateCarrier,
    removeCarrier,
    setDefaultCarrier,
    resetCarriers,
  };
}
