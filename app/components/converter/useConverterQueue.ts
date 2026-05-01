"use client";

import { useCallback, useState } from "react";
import { isDocumentType } from "@/lib/conversion-config";
import type { FileEntry } from "../FileQueueItem";
import { convertPdf, type ConvertOptions } from "./convertClient";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

interface UseConverterQueueOptions {
  /** Resolves the per-conversion request options at submit time. */
  resolveOptions: () => ConvertOptions;
  /** Called the first time a multi-file batch is added. Lets the page reset
   *  the per-file documentType override. Optional. */
  onMultiFileBatch?: () => void;
}

export interface UseConverterQueueResult {
  entries: FileEntry[];
  isConverting: boolean;
  /** Count of non-PDF files dropped on the most recent `addFiles` call. */
  skippedNonPdf: number;
  /** Clears the skipped-files notice. */
  clearSkippedNotice: () => void;
  addFiles: (files: File[]) => void;
  removeEntry: (id: string) => void;
  resetQueue: () => void;
  convertAll: () => Promise<void>;
}

/**
 * Owns the converter file queue: adding files, sequential conversion, and
 * cleanup. Conversion runs sequentially to stay under Bedrock rate limits.
 */
export function useConverterQueue(
  options: UseConverterQueueOptions
): UseConverterQueueResult {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [skippedNonPdf, setSkippedNonPdf] = useState(0);

  const updateEntry = useCallback(
    (id: string, patch: Partial<FileEntry>) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
      );
    },
    []
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      const pdfs = incoming.filter(isPdf);
      const skipped = incoming.length - pdfs.length;
      if (skipped > 0) {
        setSkippedNonPdf((prev) => prev + skipped);
      }
      if (pdfs.length === 0) return;

      const newEntries: FileEntry[] = pdfs.map((file) => ({
        id: newId(),
        file,
        detectedType: null,
        status: "ready",
      }));

      setEntries((prev) => {
        const next = [...prev, ...newEntries];
        if (next.length > 1) {
          options.onMultiFileBatch?.();
        }
        return next;
      });
    },
    [options]
  );

  const clearSkippedNotice = useCallback(() => {
    setSkippedNonPdf(0);
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const resetQueue = useCallback(() => {
    setEntries([]);
    setSkippedNonPdf(0);
  }, []);

  const convertEntry = useCallback(
    async (entry: FileEntry) => {
      updateEntry(entry.id, { status: "converting", result: undefined });
      try {
        const data = await convertPdf(entry.file, options.resolveOptions());
        if (data.success) {
          const detected = isDocumentType(data.documentType)
            ? data.documentType
            : entry.detectedType;
          updateEntry(entry.id, {
            status: "done",
            result: data,
            detectedType: detected,
          });
        } else {
          updateEntry(entry.id, {
            status: "failed",
            result: { success: false, error: data.error || "Conversion failed" },
          });
        }
      } catch {
        updateEntry(entry.id, {
          status: "failed",
          result: { success: false, error: "Network error. Please try again." },
        });
      }
    },
    [options, updateEntry]
  );

  const convertAll = useCallback(async () => {
    if (isConverting) return;
    // Snapshot pending entries — files added mid-batch don't restart the loop.
    const pending = entries.filter(
      (e) => e.status === "queued" || e.status === "ready"
    );
    if (pending.length === 0) return;

    setIsConverting(true);
    try {
      for (const entry of pending) {
        await convertEntry(entry);
      }
    } finally {
      setIsConverting(false);
    }
  }, [entries, isConverting, convertEntry]);

  return {
    entries,
    isConverting,
    skippedNonPdf,
    clearSkippedNotice,
    addFiles,
    removeEntry,
    resetQueue,
    convertAll,
  };
}
