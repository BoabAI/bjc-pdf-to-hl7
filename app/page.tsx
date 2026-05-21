"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFooter } from "./components/AppFooter";
import { AppNav } from "./components/AppNav";
import { ConversionOptions } from "./components/ConversionOptions";
import { FileQueueItem } from "./components/FileQueueItem";
import { LogoStrip } from "./components/LogoStrip";
import { UploadZone } from "./components/UploadZone";
import { useReferenceData } from "./components/useReferenceData";
import { ConvertActions } from "./components/converter/ConvertActions";
import {
  loadPersistedSimulatedMailbox,
  persistSimulatedMailbox,
  type SimulatedMailbox,
} from "./components/converter/SimulateInboxSelect";
import { SupportedFormatBadges } from "./components/converter/SupportedFormatBadges";
import { useConverterQueue } from "./components/converter/useConverterQueue";
import { SectionHeader } from "./components/ui/SectionHeader";
import { FilesIcon } from "./components/ui/icons";
import type { DocumentTypeOption } from "@/lib/conversion-config";

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentTypeOption>("auto");
  const [autoFile, setAutoFile] = useState(true);
  const [sendToDoctor, setSendToDoctor] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [simulatedMailbox, setSimulatedMailbox] = useState<SimulatedMailbox>("");
  const {
    doctors,
    carriers,
    carrier,
    setCarrier,
    loaded: referenceLoaded,
  } = useReferenceData();

  // Hydrate the simulated-inbox selection from localStorage after mount —
  // doing it lazily in useState would cause a server/client hydration mismatch.
  useEffect(() => {
    setSimulatedMailbox(loadPersistedSimulatedMailbox());
  }, []);

  const handleSimulatedMailboxChange = useCallback((value: SimulatedMailbox) => {
    setSimulatedMailbox(value);
    persistSimulatedMailbox(value);
  }, []);

  const queue = useConverterQueue({
    resolveOptions: () => {
      const selected =
        sendToDoctor && selectedDoctorId
          ? doctors.find((d) => d.id === selectedDoctorId)
          : undefined;
      return {
        documentType,
        autoFile,
        carrier,
        orderingProvider: selected?.providerNumber,
        bjcDoctors: doctors.length > 0 ? doctors.map((d) => d.name) : undefined,
        simulatedMailbox,
      };
    },
    // A multi-file batch should fall back to per-file auto-classification.
    onMultiFileBatch: () => setDocumentType("auto"),
  });
  const { entries, isConverting, skippedNonPdf, skippedOversize } = queue;

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
      queue.addFiles(Array.from(e.dataTransfer.files));
    },
    [queue]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    queue.addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const handleDownload = (entry: (typeof entries)[number]) => {
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
    queue.resetQueue();
    setDocumentType("auto");
  };

  const pendingCount = entries.filter(
    (e) => e.status === "queued" || e.status === "ready"
  ).length;
  const doneCount = entries.filter((e) => e.status === "done").length;
  const failedCount = entries.filter((e) => e.status === "failed").length;
  const completedCount = doneCount + failedCount;
  const showSummary =
    entries.length > 0 && completedCount > 0 && pendingCount === 0 && !isConverting;

  // Use the first detected type for the shared options panel (populated
  // post-conversion since pre-detection is disabled to halve Bedrock cost).
  const firstDetected = entries.find((e) => e.detectedType !== null)?.detectedType ?? null;

  return (
    <>
      <AppNav />
      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-[680px]">
          <LogoStrip />

          <div className="card mt-6 animate-fade-in-up stagger-1">
            <div className="px-7 pt-7 pb-5 border-b border-[var(--border-light)]">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                PDF to HL7 Converter
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                Convert patient documents to HL7 v2.4 format for Genie
              </p>
            </div>

            <div className="px-7 py-6 space-y-5">
              <SupportedFormatBadges />

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

              {(skippedNonPdf > 0 || skippedOversize > 0) && (
                <div
                  role="status"
                  className="flex items-start justify-between gap-3 p-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-inner)] text-xs text-[var(--text-secondary)]"
                >
                  <span>
                    {skippedNonPdf > 0 && (
                      <>
                        {skippedNonPdf} file{skippedNonPdf === 1 ? "" : "s"} skipped — PDFs only.
                      </>
                    )}
                    {skippedNonPdf > 0 && skippedOversize > 0 && " "}
                    {skippedOversize > 0 && (
                      <>
                        {skippedOversize} file{skippedOversize === 1 ? "" : "s"} skipped — over 10 MB limit.
                      </>
                    )}
                  </span>
                  <button
                    onClick={queue.clearSkippedNotice}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              )}

              {entries.length > 0 && (
                <ConversionOptions
                  documentType={documentType}
                  detectedType={firstDetected}
                  showDocumentType={entries.length === 1}
                  carrier={carrier}
                  carriers={carriers}
                  doctors={doctors}
                  autoFile={autoFile}
                  sendToDoctor={sendToDoctor}
                  selectedDoctorId={selectedDoctorId}
                  simulatedMailbox={simulatedMailbox}
                  isConverting={isConverting}
                  onDocumentTypeChange={setDocumentType}
                  onCarrierChange={setCarrier}
                  onAutoFileChange={setAutoFile}
                  onSendToDoctorChange={setSendToDoctor}
                  onSelectedDoctorIdChange={setSelectedDoctorId}
                  onSimulatedMailboxChange={handleSimulatedMailboxChange}
                />
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
                        onRemove={() => queue.removeEntry(entry.id)}
                        onDownload={() => handleDownload(entry)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {entries.length > 0 && (
                <ConvertActions
                  isConverting={isConverting}
                  pendingCount={pendingCount}
                  disabled={isConverting || pendingCount === 0 || !referenceLoaded}
                  onConvert={queue.convertAll}
                  onReset={handleResetAll}
                />
              )}
            </div>
          </div>

          <AppFooter />
        </div>
      </main>
    </>
  );
}

