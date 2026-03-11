"use client";

import { useState, useCallback } from "react";
import Image from "next/image";

interface ConversionResult {
  success: boolean;
  filename?: string;
  hl7Content?: string;
  extractedData?: {
    firstName: string;
    lastName: string;
    dob: string;
    sex: string;
    medicareNo: string;
  };
  extractionMethod?: "vision";
  error?: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [documentType, setDocumentType] = useState<"auto" | "consent_form" | "referral_letter" | "gp_referral" | "generic">("auto");
  const [detectedType, setDetectedType] = useState<string | null>(null);
  const [autoFile, setAutoFile] = useState(true);
  const [sendToDoctor, setSendToDoctor] = useState(false);
  const [providerNumber, setProviderNumber] = useState("");

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
      if (sendToDoctor && providerNumber.trim()) {
        formData.append("orderingProvider", providerNumber.trim());
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

        {/* ── Logo strip ── */}
        <div className="logo-strip animate-fade-in-up">
          <Image
            src="/bjc_health_logo.png"
            alt="BJC Health - Connected Care"
            width={220}
            height={63}
            className="h-12 w-auto"
            priority
          />
          <div className="logo-divider" />
          <Image
            src="/smec_ai_logo_horizontal.png"
            alt="SMEC AI"
            width={180}
            height={42}
            className="h-10 w-auto"
            priority
          />
        </div>

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

          <div className="divider-subtle" />

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
            </div>

            {/* ── Upload zone ── */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`upload-zone p-8 text-center ${isDragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
            >
              {file ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2.5 text-[var(--success)]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-semibold text-sm">{file.name}</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mono">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <button
                    onClick={handleReset}
                    className="text-xs text-[var(--error)] hover:underline transition-colors"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[var(--blue-50)] border border-[var(--blue-200)]">
                      <svg className="w-5 h-5 text-[var(--bjc-blue)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      Drag and drop your PDF here
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">or</p>
                  </div>
                  <label className="inline-block">
                    <span className="btn-primary inline-block text-sm">
                      Browse Files
                    </span>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-[var(--text-faint)] tracking-wide uppercase">
                    PDF files only &middot; Max 10MB
                  </p>
                </div>
              )}
            </div>

            {/* ── Conversion options ── */}
            {file && !result && (
              <div className="card-inner p-5 space-y-4 animate-fade-in">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  Conversion Options
                </h3>

                {/* Document Type */}
                <div className="space-y-1.5">
                  <label htmlFor="documentType" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    Document Type
                    {isDetecting && (
                      <span className="badge badge-blue text-[11px]">
                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        detecting
                      </span>
                    )}
                    {detectedType && !isDetecting && (
                      <span className="badge badge-success text-[11px]">auto-detected</span>
                    )}
                  </label>
                  <select
                    id="documentType"
                    value={documentType}
                    onChange={(e) => {
                      setDocumentType(e.target.value as "auto" | "consent_form" | "referral_letter" | "gp_referral" | "generic");
                      setDetectedType(null);
                    }}
                    disabled={isDetecting}
                    className="select-field w-full max-w-xs disabled:opacity-50 disabled:cursor-wait"
                  >
                    <option value="auto">Auto-detect</option>
                    <option value="consent_form">Consent Form</option>
                    <option value="referral_letter">Specialist Referral Letter</option>
                    <option value="gp_referral">GP Referral Letter</option>
                    <option value="generic">Other Document</option>
                  </select>
                </div>

                <div className="divider-subtle" />

                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={autoFile}
                    onChange={(e) => setAutoFile(e.target.checked)}
                    className="checkbox-custom"
                  />
                  <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                    Auto-file to patient record
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">(Final result)</span>
                </label>

                <div className="space-y-2.5">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={sendToDoctor}
                      onChange={(e) => setSendToDoctor(e.target.checked)}
                      className="checkbox-custom"
                    />
                    <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                      Send to specific doctor
                    </span>
                  </label>

                  {sendToDoctor && (
                    <div className="ml-[30px] animate-fade-in">
                      <input
                        type="text"
                        placeholder="Medicare Provider Number (e.g., 1234567A)"
                        value={providerNumber}
                        onChange={(e) => setProviderNumber(e.target.value)}
                        className="input-field max-w-xs text-sm"
                      />
                    </div>
                  )}
                </div>
              </div>
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

            {/* ── Extraction Failed ── */}
            {result && !result.success && (
              <div className="space-y-5 animate-fade-in-up">
                <div className="p-5 rounded-xl bg-[var(--error-bg)] border border-[var(--error-border)]">
                  <div className="flex items-center gap-2.5 mb-3">
                    <svg className="w-5 h-5 text-[var(--error)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <h3 className="font-semibold text-sm text-[var(--error)]">
                      Extraction Failed
                    </h3>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {result.error}
                  </p>
                </div>

                <div className="flex gap-3 justify-center">
                  <button onClick={handleReset} className="btn-primary">
                    Try Another File
                  </button>
                </div>
              </div>
            )}

            {/* ── Success ── */}
            {result?.success && (
              <div className="space-y-5 animate-fade-in-up">
                <div className={`p-5 rounded-xl border ${missingPatientData ? "bg-[var(--error-bg)] border-[var(--error-border)]" : "bg-[var(--success-bg)] border-[var(--success-border)]"}`}>
                  <div className="flex items-center gap-2.5 mb-3">
                    {missingPatientData ? (
                      <svg className="w-5 h-5 text-[var(--error)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-[var(--success)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    <h3 className={`font-semibold text-sm ${missingPatientData ? "text-[var(--error)]" : "text-[var(--success)]"}`}>
                      {missingPatientData ? "Could not extract patient data" : "Conversion Successful"}
                    </h3>
                    {!missingPatientData && result.extractionMethod === "vision" && (
                      <span className="badge text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700">
                        AI Vision
                      </span>
                    )}
                  </div>
                  {missingPatientData && (
                    <p className="text-sm text-[var(--error)]">
                      The patient name and date of birth could not be found in this PDF. Please check the document format or try a different file.
                    </p>
                  )}
                  {result.extractedData && (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <span className="text-[var(--text-muted)] text-xs">Patient</span>
                        <p className="text-[var(--text-primary)] font-medium">
                          {result.extractedData.firstName} {result.extractedData.lastName}
                        </p>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)] text-xs">DOB</span>
                        <p className="text-[var(--text-primary)] font-medium mono">{result.extractedData.dob}</p>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)] text-xs">Sex</span>
                        <p className="text-[var(--text-primary)] font-medium">{result.extractedData.sex}</p>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)] text-xs">Medicare</span>
                        <p className="text-[var(--text-primary)] font-medium mono">{result.extractedData.medicareNo}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 justify-center">
                  {!missingPatientData && (
                    <button onClick={handleDownload} className="btn-success">
                      Download HL7 File
                    </button>
                  )}
                  <button onClick={handleReset} className="btn-secondary">
                    Convert Another
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className="mt-6 text-center animate-fade-in stagger-3">
          <p className="text-[11px] text-[var(--text-muted)] tracking-wide">
            HL7 v2.4 &middot; Genie Compatible &middot; AI hosted in Sydney, Australia
          </p>
        </footer>
      </div>
    </main>
  );
}
