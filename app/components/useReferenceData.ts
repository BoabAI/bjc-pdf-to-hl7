"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_BJC_DOCTORS,
  DEFAULT_CARRIER,
  DEFAULT_CARRIERS,
  type Carrier,
  type Doctor,
} from "@/lib/conversion-config";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface UseReferenceDataResult {
  doctors: Doctor[];
  carriers: Carrier[];
  carrier: string;
  setCarrier: (value: string) => void;
  loaded: boolean;
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
 * falls back to bundled defaults if the API is unreachable.
 */
export function useReferenceData(): UseReferenceDataResult {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [carrier, setCarrier] = useState(DEFAULT_CARRIER);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/reference-data", { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;
        if (data.success) {
          setDoctors(data.doctors as Doctor[]);
          setCarriers(data.carriers as Carrier[]);
          const def = (data.carriers as Carrier[]).find((c) => c.isDefault);
          if (def) setCarrier(def.value);
        } else {
          setDoctors(DEFAULT_BJC_DOCTORS);
          setCarriers(DEFAULT_CARRIERS);
        }
      } catch {
        if (cancelled) return;
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

  const putDoctor = async (item: Doctor) => {
    await fetch("/api/reference-data", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "DOCTOR", item }),
    });
  };

  const putCarrier = async (item: Carrier) => {
    await fetch("/api/reference-data", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "CARRIER", item }),
    });
  };

  const deleteRow = async (kind: "DOCTOR" | "CARRIER", id: string) => {
    await fetch(
      `/api/reference-data?kind=${kind}&id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
  };

  const addDoctor = useCallback(async (name: string, providerNumber: string) => {
    const doctor: Doctor = { id: newId(), name, providerNumber };
    setDoctors((prev) => [...prev, doctor]);
    try {
      await putDoctor(doctor);
    } catch (error) {
      console.error("Failed to save doctor:", error);
    }
  }, []);

  const updateDoctor = useCallback(
    async (id: string, patch: { name: string; providerNumber: string }) => {
      let updated: Doctor | null = null;
      setDoctors((prev) =>
        prev.map((d) => {
          if (d.id !== id) return d;
          updated = { ...d, name: patch.name, providerNumber: patch.providerNumber };
          return updated;
        })
      );
      if (!updated) return;
      try {
        await putDoctor(updated);
      } catch (error) {
        console.error("Failed to update doctor:", error);
      }
    },
    []
  );

  const removeDoctor = useCallback(async (id: string) => {
    setDoctors((prev) => prev.filter((d) => d.id !== id));
    try {
      await deleteRow("DOCTOR", id);
    } catch (error) {
      console.error("Failed to delete doctor:", error);
    }
  }, []);

  const resetDoctors = useCallback(async () => {
    const previous = doctors;
    setDoctors(DEFAULT_BJC_DOCTORS);
    try {
      await Promise.all(previous.map((d) => deleteRow("DOCTOR", d.id)));
      await Promise.all(DEFAULT_BJC_DOCTORS.map((d) => putDoctor(d)));
    } catch (error) {
      console.error("Failed to reset doctors:", error);
    }
  }, [doctors]);

  const addCarrier = useCallback(async (value: string, label: string) => {
    const item: Carrier = { id: newId(), value, label };
    setCarriers((prev) => [...prev, item]);
    try {
      await putCarrier(item);
    } catch (error) {
      console.error("Failed to save carrier:", error);
    }
  }, []);

  const updateCarrier = useCallback(
    async (id: string, patch: { value: string; label: string }) => {
      let updated: Carrier | null = null;
      let oldValue = "";
      setCarriers((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          oldValue = c.value;
          updated = { ...c, value: patch.value, label: patch.label };
          return updated;
        })
      );
      if (!updated) return;
      // Keep the active carrier selection in sync if its value just changed.
      if (carrier === oldValue && oldValue !== patch.value) {
        setCarrier(patch.value);
      }
      try {
        await putCarrier(updated);
      } catch (error) {
        console.error("Failed to update carrier:", error);
      }
    },
    [carrier]
  );

  const removeCarrier = useCallback(
    async (id: string) => {
      const target = carriers.find((c) => c.id === id);
      if (target?.isDefault) return;
      setCarriers((prev) => prev.filter((c) => c.id !== id));
      if (target && carrier === target.value) {
        const fallback = carriers.find((c) => c.id !== id && c.isDefault);
        setCarrier(fallback?.value ?? DEFAULT_CARRIER);
      }
      try {
        await deleteRow("CARRIER", id);
      } catch (error) {
        console.error("Failed to delete carrier:", error);
      }
    },
    [carriers, carrier]
  );

  const setDefaultCarrier = useCallback(
    async (id: string) => {
      const updated = carriers.map((c) => ({ ...c, isDefault: c.id === id }));
      setCarriers(updated);
      const newDefault = updated.find((c) => c.id === id);
      if (newDefault) setCarrier(newDefault.value);
      try {
        await Promise.all(updated.map((c) => putCarrier(c)));
      } catch (error) {
        console.error("Failed to update default carrier:", error);
      }
    },
    [carriers]
  );

  const resetCarriers = useCallback(async () => {
    const previous = carriers;
    setCarriers(DEFAULT_CARRIERS);
    const def = DEFAULT_CARRIERS.find((c) => c.isDefault);
    if (def) setCarrier(def.value);
    try {
      await Promise.all(previous.map((c) => deleteRow("CARRIER", c.id)));
      await Promise.all(DEFAULT_CARRIERS.map((c) => putCarrier(c)));
    } catch (error) {
      console.error("Failed to reset carriers:", error);
    }
  }, [carriers]);

  return {
    doctors,
    carriers,
    carrier,
    setCarrier,
    loaded,
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
