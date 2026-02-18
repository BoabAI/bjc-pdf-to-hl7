"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.success) {
        router.push("/");
        router.refresh();
      } else {
        setError(data.error || "Invalid password");
        setPassword("");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">

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
            width={120}
            height={28}
            className="h-7 w-auto"
            priority
          />
        </div>

        {/* ── Login card ── */}
        <div className="card mt-6 animate-fade-in-up stagger-1">

          {/* Header */}
          <div className="px-7 pt-7 pb-5 text-center">
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              PDF to HL7 Converter
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1.5">
              Enter password to access the application
            </p>
          </div>

          <div className="divider-subtle" />

          {/* Form */}
          <div className="px-7 py-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  placeholder="Enter access password"
                  disabled={isLoading}
                />
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-[var(--error-bg)] border border-[var(--error-border)] animate-fade-in">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-[var(--error)] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <p className="text-sm text-[var(--error)]">{error}</p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !password}
                className="btn-primary w-full"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Verifying...
                  </span>
                ) : (
                  "Access Application"
                )}
              </button>
            </form>
          </div>
        </div>

        {/* ── Footer ── */}
        <p className="mt-5 text-center text-[11px] text-[var(--text-muted)] tracking-wide animate-fade-in stagger-2">
          Contact your administrator for access credentials
        </p>
      </div>
    </main>
  );
}
