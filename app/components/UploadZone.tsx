"use client";

import { useRef } from "react";

interface UploadZoneProps {
  isDragging: boolean;
  disabled?: boolean;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function UploadZone({
  isDragging,
  disabled = false,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
}: UploadZoneProps) {
  // Use a real <button> that proxies clicks to the hidden input via ref.
  // The previous `<label>` wrapping a `display:none` input was not keyboard
  // focusable — Tab skipped past it entirely. `sr-only` keeps the input
  // visually hidden but in the accessibility tree, and the button takes
  // keyboard focus.
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`upload-zone p-8 text-center ${isDragging ? "dragging" : ""} ${disabled ? "opacity-60 pointer-events-none" : ""}`}
    >
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
            Drag and drop your PDF files here
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">or</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="btn-primary text-sm"
        >
          Browse Files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={onFileChange}
          className="sr-only"
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
        />
        <p className="text-[11px] text-[var(--text-faint)] tracking-wide uppercase">
          PDF files only &middot; Max 10MB each
        </p>
      </div>
    </div>
  );
}
