"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { AppFooter } from "../../components/AppFooter";
import { AppNav } from "../../components/AppNav";
import { LogoStrip } from "../../components/LogoStrip";
import { UploadZone } from "../../components/UploadZone";

/** Mirrors `hashPdfContent` in lib/audit.ts: sha256(bytes) → first 12 hex. */
async function sha256First12(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 12);
}

interface HashedFile {
  name: string;
  sizeBytes: number;
  hash: string;
}

export default function FileHashHelpPage(): JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const [results, setResults] = useState<HashedFile[]>([]);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const hashFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const hashed = await Promise.all(
      list.map(async (file) => ({
        name: file.name,
        sizeBytes: file.size,
        hash: await sha256First12(await file.arrayBuffer()),
      }))
    );
    setResults((prev) => [...hashed, ...prev]);
  }, []);

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
      if (e.dataTransfer.files.length > 0) void hashFiles(e.dataTransfer.files);
    },
    [hashFiles]
  );
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) void hashFiles(e.target.files);
      e.target.value = "";
    },
    [hashFiles]
  );

  const handleCopy = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      setTimeout(() => setCopiedHash(null), 1500);
    } catch {
      // Clipboard may be blocked in some browsers — silently ignore.
    }
  };

  return (
    <>
      <AppNav />
      <main className="min-h-screen px-4 py-10">
        <div className="mx-auto w-full max-w-[680px] space-y-6">
          <LogoStrip />

          <div className="card animate-fade-in-up">
            <div className="px-7 pt-7 pb-5 border-b border-[var(--border-light)]">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Check a File Hash
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                The audit log stores a short fingerprint of each PDF&apos;s{" "}
                <strong>contents</strong> instead of its filename or any patient
                details. Drop the original PDF below to see its fingerprint and
                find the matching row in the log. The file never leaves your
                browser — the hash is computed locally.
              </p>
            </div>

            <div className="px-7 py-6 space-y-6 text-sm text-[var(--text-primary)] leading-relaxed">
              <section className="space-y-3">
                <UploadZone
                  isDragging={isDragging}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onFileChange={handleFileChange}
                />
                <p className="text-xs text-[var(--text-secondary)]">
                  Use the <strong>original</strong> attachment (e.g. saved
                  straight from the email). A copy that was printed to PDF,
                  re-saved, or edited has different contents and a different
                  hash.
                </p>
              </section>

              {results.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-base font-semibold">Hash</h2>
                  <ul className="space-y-2">
                    {results.map((r, i) => (
                      <li
                        key={`${r.hash}-${i}`}
                        className="flex items-center gap-3 flex-wrap p-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-inner)]"
                      >
                        <code className="mono text-base px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-light)] rounded-md">
                          {r.hash}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopy(r.hash)}
                          className="text-xs px-3 py-1.5 border border-[var(--border-light)] rounded-md hover:bg-[var(--bg-card)]"
                        >
                          {copiedHash === r.hash ? "Copied" : "Copy"}
                        </button>
                        <span className="text-xs text-[var(--text-secondary)] truncate max-w-full">
                          {r.name} · {(r.sizeBytes / 1024).toFixed(0)} KB
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Compare this against the <strong>File Hash</strong> column in
                    the{" "}
                    <Link href="/log" className="text-[var(--bjc-blue)] hover:underline">
                      audit log
                    </Link>
                    . The same PDF submitted twice shows the same hash, so a
                    repeated hash means the document was processed more than
                    once.
                  </p>
                </section>
              )}

              <section className="space-y-3 pt-2 border-t border-[var(--border-light)]">
                <h2 className="text-base font-semibold">
                  Or check it yourself in a terminal
                </h2>
                <p className="text-[var(--text-secondary)]">
                  The hash is the first 12 characters of the file&apos;s{" "}
                  <code className="mono">SHA-256</code> checksum — the standard
                  one built into Windows and macOS. No software to install.
                </p>
                <div className="space-y-2">
                  <p className="font-medium">Windows</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Right-click the folder holding the PDF → <em>Open in
                    Terminal</em>, then:
                  </p>
                  <pre className="mono text-xs p-3 rounded-md bg-[var(--bg-inner)] border border-[var(--border-light)] overflow-x-auto">
Get-FileHash .\fax.pdf</pre>
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Mac</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Open <em>Terminal</em>, type the command below, drag the PDF
                    into the window, then press Enter:
                  </p>
                  <pre className="mono text-xs p-3 rounded-md bg-[var(--bg-inner)] border border-[var(--border-light)] overflow-x-auto">
shasum -a 256 fax.pdf</pre>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Both print a long 64-character code. Only the{" "}
                  <strong>first 12 characters</strong> need to match the audit
                  log (Windows shows them in upper case — that&apos;s fine).
                </p>
              </section>

              <div className="pt-2">
                <Link
                  href="/log"
                  className="text-sm text-[var(--bjc-blue)] hover:underline"
                >
                  ← Back to Audit Log
                </Link>
              </div>
            </div>
          </div>

          <AppFooter />
        </div>
      </main>
    </>
  );
}
