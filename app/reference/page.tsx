"use client";

import { AppNav } from "../components/AppNav";
import { LogoStrip } from "../components/LogoStrip";
import { ReferenceDataTab } from "../components/ReferenceDataTab";
import { useReferenceData } from "../components/useReferenceData";

export default function ReferenceDataPage(): JSX.Element {
  const ref = useReferenceData();

  return (
    <>
      <AppNav />
      <main className="min-h-screen px-4 py-8 md:py-10">
        <div className="mx-auto w-full max-w-[680px] space-y-6">
          <LogoStrip />

          <div className="card animate-fade-in-up">
            <div className="px-7 pt-7 pb-5 border-b border-[var(--border-light)]">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Reference Data
              </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                Manage BJC Health doctors and HL7 carriers used by the converter.
                Changes save automatically.
              </p>
            </div>

            <div className="px-7 py-6">
              {ref.loaded ? (
                <ReferenceDataTab
                  doctors={ref.doctors}
                  carriers={ref.carriers}
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
        </div>
      </main>
    </>
  );
}
