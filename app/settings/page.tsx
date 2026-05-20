"use client";

import { AppNav } from "../components/AppNav";
import { LogoStrip } from "../components/LogoStrip";
import { SettingsPanel } from "../components/dashboard/SettingsPanel";

export default function SettingsPage(): JSX.Element {
  return (
    <>
      <AppNav />
      <main className="min-h-screen px-4 py-8 md:py-10">
        <div className="mx-auto w-full max-w-[680px] space-y-6">
          <LogoStrip />

          <div className="card animate-fade-in-up">
            <div className="px-7 pt-7 pb-5 border-b border-[var(--border-light)]">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Runtime settings
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                Operational dials that change converter behaviour without a deploy.
                Changes persist in DynamoDB and apply to the next conversion.
              </p>
            </div>

            <div className="px-7 py-6">
              <SettingsPanel />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
