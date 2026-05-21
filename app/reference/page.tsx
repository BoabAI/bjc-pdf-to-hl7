"use client";

import { AppFooter } from "../components/AppFooter";
import { AppNav } from "../components/AppNav";
import { LogoStrip } from "../components/LogoStrip";
import { ReferenceDataTab } from "../components/ReferenceDataTab";
import { useReferenceData } from "../components/useReferenceData";

export default function ReferenceDataPage(): JSX.Element {
  const ref = useReferenceData();

  return (
    <>
      <AppNav />
      <main className="min-h-screen px-4 py-10">
        <div className="mx-auto w-full max-w-[680px] space-y-6">
          <LogoStrip />

          <div className="card animate-fade-in-up">
            <div className="px-7 pt-7 pb-5 border-b border-[var(--border-light)]">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Reference Data
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                Manage doctors and HL7 carriers used by the converter.
                Changes save automatically.
              </p>
            </div>

            <div className="px-7 py-6 space-y-4">
              {ref.error && (
                <div
                  role="alert"
                  className="p-3 rounded-md border border-[var(--error-border)] bg-[var(--error-bg)] text-sm text-[var(--error)]"
                >
                  Save failed: {ref.error}
                </div>
              )}
              {ref.loaded ? (
                <ReferenceDataTab
                  doctors={ref.doctors}
                  carriers={ref.carriers}
                  saving={ref.saving}
                  onAddDoctor={ref.addDoctor}
                  onUpdateDoctor={ref.updateDoctor}
                  onRemoveDoctor={ref.removeDoctor}
                  onAddCarrier={ref.addCarrier}
                  onUpdateCarrier={ref.updateCarrier}
                  onRemoveCarrier={ref.removeCarrier}
                  onSetDefaultCarrier={ref.setDefaultCarrier}
                  onResetCarriers={ref.resetCarriers}
                />
              ) : (
                <div className="py-12 text-center text-sm text-[var(--text-muted)]">
                  Loading reference data…
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
