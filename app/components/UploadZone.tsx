"use client";

interface UploadZoneProps {
  file: File | null;
  isDragging: boolean;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
}

export function UploadZone({
  file,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
  onReset,
}: UploadZoneProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
            onClick={onReset}
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
              onChange={onFileChange}
              className="hidden"
            />
          </label>
          <p className="text-[11px] text-[var(--text-faint)] tracking-wide uppercase">
            PDF files only &middot; Max 10MB
          </p>
        </div>
      )}
    </div>
  );
}
