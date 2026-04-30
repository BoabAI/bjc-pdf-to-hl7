"use client";

import { useState, useCallback } from "react";
import { AppFooter } from "./components/AppFooter";
import { AppNav } from "./components/AppNav";
import { ConversionOptions } from "./components/ConversionOptions";
import { type ConversionResult } from "./components/ConversionResultPanel";
import { FileQueueItem, type FileEntry } from "./components/FileQueueItem";
import { LogoStrip } from "./components/LogoStrip";
import { UploadZone } from "./components/UploadZone";
import { useReferenceData } from "./components/useReferenceData";
import { SectionHeader } from "./components/ui/SectionHeader";
import { FilesIcon } from "./components/ui/icons";
import {
  isDocumentType,
  type DocumentTypeOption,
} from "@/lib/conversion-config";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function Home() {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentTypeOption>("auto");
  const [autoFile, setAutoFile] = useState(true);
  const [sendToDoctor, setSendToDoctor] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const {
    doctors,
    carriers,
    carrier,
    setCarrier,
    loaded: referenceLoaded,
  } = useReferenceData();

  const handleCarrierChange = (value: string) => {
    setCarrier(value);
  };

  const updateEntry = useCallback(
    (id: string, patch: Partial<FileEntry>) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
      );
    },
    []
  );

  const detectDocumentType = useCallback(
    async (entry: FileEntry) => {
      updateEntry(entry.id, { status: "detecting" });
      try {
        const formData = new FormData();
        formData.append("pdf", entry.file);
        formData.append("detectOnly", "true");

        const response = await fetch("/api/convert", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        if (data.success && isDocumentType(data.documentType)) {
          updateEntry(entry.id, {
            detectedType: data.documentType,
            status: "ready",
          });
        } else {
          updateEntry(entry.id, { status: "ready" });
        }
      } catch (error) {
        console.error("Detection error:", error);
        updateEntry(entry.id, { status: "ready" });
      }
    },
    [updateEntry]
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      const pdfs = incoming.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
      const skipped = incoming.length - pdfs.length;
      if (skipped > 0) {
        alert(`${skipped} file(s) skipped — PDFs only.`);
      }
      if (pdfs.length === 0) return;

      const newEntries: FileEntry[] = pdfs.map((file) => ({
        id: newId(),
        file,
        detectedType: null,
        status: "queued",
      }));

      setEntries((prev) => {
        const next = [...prev, ...newEntries];
        // Only pre-detect when there will be exactly one file in the queue.
        // Multi-file batches skip the upfront detection LLM call — the
        // convert step classifies each file anyway, so pre-detection just
        // doubles the Bedrock cost without changing the outcome.
        if (next.length === 1 && newEntries.length === 1) {
          void detectDocumentType(newEntries[0]);
        } else if (next.length > 1) {
          // Reset any prior single-file override so a multi-file batch
          // always classifies per file.
          setDocumentType("auto");
        }
        return next;
      });
    },
    [detectDocumentType]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    // Reset input value so re-selecting the same file works
    e.target.value = "";
  };

  const buildFormData = (file: File): FormData => {
    const formData = new FormData();
    formData.append("pdf", file);
    formData.append("documentType", documentType);
    formData.append("autoFile", autoFile.toString());
    formData.append("carrier", carrier);
    if (sendToDoctor && selectedDoctorId) {
      const selected = doctors.find((d) => d.id === selectedDoctorId);
      if (selected?.providerNumber) {
        formData.append("orderingProvider", selected.providerNumber);
      }
    }
    if (doctors.length > 0) {
      formData.append("bjcDoctors", JSON.stringify(doctors.map((d) => d.name)));
    }
    return formData;
  };

  const convertEntry = async (entry: FileEntry): Promise<void> => {
    updateEntry(entry.id, { status: "converting", result: undefined });
    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        body: buildFormData(entry.file),
      });
      const data: ConversionResult = await response.json();
      if (data.success) {
        updateEntry(entry.id, { status: "done", result: data });
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
  };

  const handleConvert = async () => {
    if (isConverting) return;
    // Snapshot the entries that need conversion at the start of the batch.
    // New files added while converting won't restart the batch.
    const pending = entries.filter(
      (e) => e.status === "queued" || e.status === "ready"
    );
    if (pending.length === 0) return;

    setIsConverting(true);
    try {
      // Sequential to avoid Bedrock rate limits.
      for (const entry of pending) {
        await convertEntry(entry);
      }
    } finally {
      setIsConverting(false);
    }
  };

  const handleRemove = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleDownload = (entry: FileEntry) => {
    const result = entry.result;
    if (!result?.hl7Content || !result.filename) return;

    const blob = new Blob([result.hl7Content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleResetAll = () => {
    setEntries([]);
    setDocumentType("auto");
  };

  const pendingCount = entries.filter(
    (e) => e.status === "queued" || e.status === "ready" || e.status === "detecting"
  ).length;
  const doneCount = entries.filter((e) => e.status === "done").length;
  const failedCount = entries.filter((e) => e.status === "failed").length;
  const completedCount = doneCount + failedCount;
  const showSummary =
    entries.length > 0 && completedCount > 0 && pendingCount === 0 && !isConverting;

  // Use the first detected type for the shared options panel
  const firstDetected = entries.find((e) => e.detectedType !== null)?.detectedType ?? null;
  const anyDetecting = entries.some((e) => e.status === "detecting");

  return (
    <>
    <AppNav />
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[580px]">

        <LogoStrip />

        {/* ── Main card ── */}
        <div className="card mt-6 animate-fade-in-up stagger-1">

          {/* Header */}
          <div className="px-7 pt-7 pb-5 border-b border-[var(--border-light)]">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              PDF to HL7 Converter
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
              Convert patient documents to HL7 v2.4 format for Genie
            </p>
          </div>

          {/* Content */}
          <div className="px-7 py-6 space-y-5">

            {/* Supported formats */}
            <div className="flex flex-wrap gap-2 animate-fade-in stagger-2">
              <span className="badge badge-blue">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                Consent Forms
              </span>
              <span className="badge badge-blue">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                Specialist Referrals
              </span>
              <span className="badge badge-blue">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                GP Referrals
              </span>
              <span className="badge badge-blue">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                Pathology Results
              </span>
              <span className="badge badge-blue">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                Radiology Results
              </span>
            </div>

            <UploadZone
              isDragging={isDragging}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onFileChange={handleFileChange}
            />

            {process.env.NEXT_PUBLIC_TEST_MODE === "true" && (
              <div className="text-center text-xs text-[var(--text-muted)] -mt-2">
                No PDFs handy?{" "}
                <a
                  href="/api/test-pdfs"
                  className="text-[var(--bjc-blue)] hover:underline"
                  download="bjc-test-pdfs.zip"
                >
                  Download a sample test set (.zip)
                </a>
              </div>
            )}

            {entries.length > 0 && (
              <div className="space-y-3">
                <SectionHeader
                  icon={<FilesIcon />}
                  title="Files"
                  count={entries.length}
                  action={
                    showSummary ? (
                      <p className="text-xs text-[var(--text-secondary)] flex-shrink-0">
                        {doneCount} of {entries.length} converted
                        {failedCount > 0 ? ` · ${failedCount} failed` : ""}
                      </p>
                    ) : undefined
                  }
                />
                <div className="space-y-3">
                  {entries.map((entry) => (
                    <FileQueueItem
                      key={entry.id}
                      entry={entry}
                      onRemove={() => handleRemove(entry.id)}
                      onDownload={() => handleDownload(entry)}
                    />
                  ))}
                </div>
              </div>
            )}

            {entries.length > 0 && (
              <ConversionOptions
                documentType={documentType}
                detectedType={firstDetected}
                isDetecting={anyDetecting}
                showDocumentType={entries.length === 1}
                carrier={carrier}
                carriers={carriers}
                doctors={doctors}
                autoFile={autoFile}
                sendToDoctor={sendToDoctor}
                selectedDoctorId={selectedDoctorId}
                onDocumentTypeChange={setDocumentType}
                onCarrierChange={handleCarrierChange}
                onAutoFileChange={setAutoFile}
                onSendToDoctorChange={setSendToDoctor}
                onSelectedDoctorIdChange={setSelectedDoctorId}
              />
            )}

            {/* ── Convert button ── */}
            {entries.length > 0 && (
              <div className="flex flex-col items-center gap-3 pt-1 animate-fade-in">
                <button
                  onClick={handleConvert}
                  disabled={isConverting || pendingCount === 0 || !referenceLoaded}
                  className="btn-primary w-full max-w-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConverting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Converting...
                    </span>
                  ) : pendingCount > 0 ? (
                    `Convert ${pendingCount} file${pendingCount === 1 ? "" : "s"}`
                  ) : (
                    "All converted"
                  )}
                </button>
                <button
                  onClick={handleResetAll}
                  disabled={isConverting}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--error)] transition-colors disabled:opacity-50"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>

        <AppFooter />
      </div>
    </main>
    </>
  );
}
