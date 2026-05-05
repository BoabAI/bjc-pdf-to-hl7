"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppNav } from "../../components/AppNav";
import { LogoStrip } from "../../components/LogoStrip";

async function sha256First12(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 12);
}

export default function FilenameHashHelpPage(): JSX.Element {
  const [filename, setFilename] = useState("");
  const [hash, setHash] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const trimmed = filename;
    if (!trimmed) {
      setHash("");
      return;
    }
    void sha256First12(trimmed).then((h) => {
      if (!cancelled) setHash(h);
    });
    return () => {
      cancelled = true;
    };
  }, [filename]);

  const handleCopy = async () => {
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked in some browsers — silently ignore.
    }
  };

  return (
    <>
      <AppNav />
      <main className="min-h-screen px-4 py-8 md:py-10">
        <div className="mx-auto w-full max-w-[760px] space-y-6">
          <LogoStrip />

          <div className="card animate-fade-in-up">
            <div className="px-7 pt-7 pb-5 border-b border-[var(--border-light)]">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Look up a Filename Hash
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                The audit log stores a short hash of each uploaded file&apos;s
                filename instead of the filename itself, so the log never
                contains patient-identifying information. Paste the original
                filename below and the matching 12-character hash appears
                instantly. The filename never leaves your browser — the hash is
                computed locally.
              </p>
            </div>

            <div className="px-7 py-6 space-y-6 text-sm text-[var(--text-primary)] leading-relaxed">
              <section className="space-y-3">
                <label
                  htmlFor="filename-input"
                  className="block font-semibold text-base"
                >
                  Filename
                </label>
                <input
                  id="filename-input"
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="e.g. referral_jane_smith.pdf"
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent,#2563eb)]"
                />
                <p className="text-xs text-[var(--text-secondary)]">
                  Use the <strong>exact</strong> original filename, including
                  the extension. Spaces, capitalisation, and punctuation all
                  matter.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-base font-semibold">Hash</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="font-mono text-base px-3 py-2 bg-[var(--surface-muted,#f5f5f5)] border border-[var(--border-light)] rounded-md min-w-[10ch] inline-block">
                    {hash || "—"}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!hash}
                    className="text-xs px-3 py-2 border border-[var(--border-light)] rounded-md hover:bg-[var(--surface-muted,#f5f5f5)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Compare this against the value in the <Link href="/log" className="text-[var(--accent,#2563eb)] hover:underline">audit log</Link>.
                  If it doesn&apos;t match, the file was likely renamed by your
                  email client, browser, or scanner before upload.
                </p>
              </section>

              <section className="space-y-2 pt-2 border-t border-[var(--border-light)]">
                <h2 className="text-base font-semibold">How it works</h2>
                <p className="text-[var(--text-secondary)]">
                  The hash is the first 12 hex characters of{" "}
                  <code className="font-mono">SHA-256</code> of the filename
                  string (not the file&apos;s contents). Re-saving the same PDF
                  under a different name produces a different hash. Standard
                  Windows/Mac &ldquo;file hash&rdquo; tools won&apos;t match,
                  because they hash file <em>contents</em> instead of the
                  filename.
                </p>
              </section>

              <div className="pt-2">
                <Link
                  href="/log"
                  className="text-sm text-[var(--accent,#2563eb)] hover:underline"
                >
                  ← Back to Audit Log
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
