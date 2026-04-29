"use client";

import { useState, useCallback, useEffect } from "react";
import { AppFooter } from "./components/AppFooter";
import { ConversionOptions } from "./components/ConversionOptions";
import {
  ConversionResultPanel,
  type ConversionResult,
} from "./components/ConversionResultPanel";
import { DoctorsTab } from "./components/DoctorsTab";
import { LogoStrip } from "./components/LogoStrip";
import { UploadZone } from "./components/UploadZone";
import {
  DEFAULT_BJC_DOCTORS,
  DEFAULT_CARRIER,
  type DocumentTypeOption,
} from "@/lib/conversion-config";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"converter" | "doctors">("converter");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [documentType, setDocumentType] = useState<DocumentTypeOption>("auto");
  const [detectedType, setDetectedType] = useState<string | null>(null);
  const [autoFile, setAutoFile] = useState(true);
  const [sendToDoctor, setSendToDoctor] = useState(false);
  const [providerNumber, setProviderNumber] = useState("");
  const [carrier, setCarrier] = useState(DEFAULT_CARRIER);
  const [doctors, setDoctors] = useState<string[]>(DEFAULT_BJC_DOCTORS);
  const [newDoctorName, setNewDoctorName] = useState("");

  // Load carrier and doctors from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("hl7_carrier");
    if (saved) setCarrier(saved);
    const savedDoctors = localStorage.getItem("bjc_doctors");
    if (savedDoctors) {
      try {
        setDoctors(JSON.parse(savedDoctors));
      } catch { /* use defaults */ }
    }
  }, []);

  const handleCarrierChange = (value: string) => {
    setCarrier(value);
    localStorage.setItem("hl7_carrier", value);
  };

  const saveDoctors = (updated: string[]) => {
    setDoctors(updated);
    localStorage.setItem("bjc_doctors", JSON.stringify(updated));
  };

  const handleAddDoctor = () => {
    const name = newDoctorName.trim();
    if (!name) return;
    if (doctors.some((d) => d.toLowerCase() === name.toLowerCase())) return;
    saveDoctors([...doctors, name]);
    setNewDoctorName("");
  };

  const handleRemoveDoctor = (index: number) => {
    saveDoctors(doctors.filter((_, i) => i !== index));
  };

  const handleResetDoctors = () => {
    saveDoctors(DEFAULT_BJC_DOCTORS);
  };

  const detectDocumentType = useCallback(async (selectedFile: File) => {
    setIsDetecting(true);
    try {
      const formData = new FormData();
      formData.append("pdf", selectedFile);
      formData.append("detectOnly", "true");

      const response = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success && data.documentType) {
        setDocumentType(data.documentType);
        setDetectedType(data.documentType);
      }
    } catch (error) {
      console.error("Detection error:", error);
      setDocumentType("auto");
      setDetectedType(null);
    } finally {
      setIsDetecting(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === "application/pdf") {
      setFile(droppedFile);
      setResult(null);
      setDetectedType(null);
      detectDocumentType(droppedFile);
    } else {
      alert("Please upload a PDF file");
    }
  }, [detectDocumentType]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setDetectedType(null);
      detectDocumentType(selectedFile);
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    setIsConverting(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("documentType", documentType);
      formData.append("autoFile", autoFile.toString());
      formData.append("carrier", carrier);
      if (sendToDoctor && providerNumber.trim()) {
        formData.append("orderingProvider", providerNumber.trim());
      }
      if (doctors.length > 0) {
        formData.append("bjcDoctors", JSON.stringify(doctors));
      }

      const response = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        setResult({ success: false, error: data.error || "Conversion failed" });
      }
    } catch (error) {
      setResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setIsConverting(false);
    }
  };

  const handleDownload = () => {
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

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setDocumentType("auto");
    setDetectedType(null);
  };

  const missingPatientData =
    result?.success &&
    !result.extractedData?.firstName &&
    !result.extractedData?.lastName &&
    !result.extractedData?.dob;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[580px]">

        <LogoStrip />

        {/* ── Main card ── */}
        <div className="card mt-6 animate-fade-in-up stagger-1">

          {/* Header */}
          <div className="px-7 pt-7 pb-5">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              PDF to HL7 Converter
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
              Convert patient documents to HL7 v2.4 format for Genie
            </p>
          </div>

          {/* Tabs */}
          <div className="px-7 flex gap-1 border-b border-[var(--border-light)]">
            <button
              onClick={() => setActiveTab("converter")}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === "converter"
                  ? "border-[var(--bjc-blue)] text-[var(--bjc-blue)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Converter
            </button>
            <button
              onClick={() => setActiveTab("doctors")}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === "doctors"
                  ? "border-[var(--bjc-blue)] text-[var(--bjc-blue)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Doctors
              <span className="ml-1.5 text-[11px] bg-[var(--bg-inner)] text-[var(--text-muted)] px-1.5 py-0.5 rounded-full">
                {doctors.length}
              </span>
            </button>
          </div>

          {/* Content */}
          <div className="px-7 py-6 space-y-5">

          {/* ── Doctors Tab ── */}
          {activeTab === "doctors" && (
            <DoctorsTab
              doctors={doctors}
              newDoctorName={newDoctorName}
              onNewDoctorNameChange={setNewDoctorName}
              onAddDoctor={handleAddDoctor}
              onRemoveDoctor={handleRemoveDoctor}
              onResetDoctors={handleResetDoctors}
            />
          )}

          {/* ── Converter Tab ── */}
          {activeTab === "converter" && (<>


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
            </div>

            <UploadZone
              file={file}
              isDragging={isDragging}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onFileChange={handleFileChange}
              onReset={handleReset}
            />

            {file && !result && (
              <ConversionOptions
                documentType={documentType}
                detectedType={detectedType}
                isDetecting={isDetecting}
                carrier={carrier}
                autoFile={autoFile}
                sendToDoctor={sendToDoctor}
                providerNumber={providerNumber}
                onDocumentTypeChange={(value) => {
                  setDocumentType(value);
                  setDetectedType(null);
                }}
                onCarrierChange={handleCarrierChange}
                onAutoFileChange={setAutoFile}
                onSendToDoctorChange={setSendToDoctor}
                onProviderNumberChange={setProviderNumber}
              />
            )}

            {/* ── Convert button ── */}
            {file && !result && (
              <div className="text-center pt-1 animate-fade-in">
                <button
                  onClick={handleConvert}
                  disabled={isConverting}
                  className="btn-primary w-full max-w-xs"
                >
                  {isConverting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Converting...
                    </span>
                  ) : (
                    "Convert to HL7"
                  )}
                </button>
              </div>
            )}

            {result && (
              <ConversionResultPanel
                result={result}
                missingPatientData={Boolean(missingPatientData)}
                onDownload={handleDownload}
                onReset={handleReset}
              />
            )}
          </>)}
          </div>
        </div>

        <AppFooter />
      </div>
    </main>
  );
}
