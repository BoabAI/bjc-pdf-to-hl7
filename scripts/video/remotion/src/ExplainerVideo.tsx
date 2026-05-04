import React from "react";
import { AbsoluteFill, Audio, Series, staticFile, useVideoConfig } from "remotion";
import { Timing, durationFor } from "./lib/timing";
import { IntroScene } from "./scenes/IntroScene";
import { ScopeCalloutScene } from "./scenes/ScopeCalloutScene";
import { StepScene } from "./scenes/StepScene";
import { CtaScene } from "./scenes/CtaScene";
import tourPlanRaw from "../../tour-plan.json";

type TourShot = {
  id: string;
  file: string;
  url: string;
  zoom: number;
  label: string;
  objectPosition?: string;
};
const TourPlan = tourPlanRaw as TourShot[];

type StepDef = {
  sceneId: string;
  stepLabel: string;
  caption: string;
  shotId: string;
};

const STEPS: StepDef[] = [
  {
    sceneId: "step-signin",
    shotId: "00-login-screen",
    stepLabel: "Sign in",
    caption: "Password from your administrator.",
  },
  {
    sceneId: "step-converter-drop",
    shotId: "10-nav-converter",
    stepLabel: "Converter — home page",
    caption:
      "Drag a PDF, or click Browse Files. Six document types: consent, specialist + GP referrals, pathology + radiology results.",
  },
  {
    sceneId: "step-converter-options",
    shotId: "04-options",
    stepLabel: "Per-file options",
    caption: "Override doc type, set carrier, choose auto-file or queue for review.",
  },
  {
    sceneId: "step-converter-convert",
    shotId: "05-converting",
    stepLabel: "Convert + download",
    caption:
      "Bedrock vision extracts patient + routing details. Download the HL7, or auto-deliver to the practice software.",
  },
  {
    sceneId: "step-log",
    shotId: "11-nav-log",
    stepLabel: "Log — audit trail",
    caption:
      "One row per conversion: patient initials, doc type, source, outcome, warnings. Date filter + CSV export.",
  },
  {
    sceneId: "step-stats",
    shotId: "12-nav-stats",
    stepLabel: "Stats — charts",
    caption: "Document type, outcome, source. Web vs email pipeline. For monthly reporting.",
  },
  {
    sceneId: "step-reference",
    shotId: "13-nav-reference",
    stepLabel: "Reference Data",
    caption:
      "Doctors with provider numbers route HL7 to the right inbox. Carrier codes too. Auto-saves.",
  },
  {
    sceneId: "step-compliance",
    shotId: "14-nav-compliance",
    stepLabel: "Data Handling",
    caption: "In-memory only, no persistent storage, IRAP PROTECTED AWS in Australia.",
  },
  {
    sceneId: "step-privacy",
    shotId: "15-nav-privacy",
    stepLabel: "Privacy",
    caption: "Full Privacy Policy under the Australian Privacy Act and 13 Privacy Principles.",
  },
];

const findShot = (id: string): TourShot => {
  const s = TourPlan.find((t) => t.id === id);
  if (!s) throw new Error(`Tour shot not found: ${id}`);
  return s;
};

export const ExplainerVideo: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Series>
        <Series.Sequence durationInFrames={durationFor("intro", fps)}>
          <IntroScene />
        </Series.Sequence>

        <Series.Sequence durationInFrames={durationFor("scope-callout", fps)}>
          <ScopeCalloutScene />
        </Series.Sequence>

        {STEPS.map((step, i) => {
          const primary = findShot(step.shotId);
          return (
            <Series.Sequence key={step.sceneId} durationInFrames={durationFor(step.sceneId, fps)}>
              <StepScene
                stepNumber={i + 1}
                stepLabel={step.stepLabel}
                caption={step.caption}
                shot={primary}
              />
            </Series.Sequence>
          );
        })}

        <Series.Sequence durationInFrames={durationFor("cta", fps)}>
          <CtaScene />
        </Series.Sequence>
      </Series>

      {/* Narration — single concatenated track, mounted from frame 0 */}
      <Audio src={staticFile("narration.mp3")} volume={1} />

      {/* Background music — fade in/out, ducked under narration */}
      <Audio
        src={staticFile("music.mp3")}
        volume={(f) => {
          const totalSec = Timing.totalDuration;
          const totalFrames = Math.ceil(totalSec * fps);
          const fadeIn = fps * 1.2;
          const fadeOut = fps * 1.5;
          if (f < fadeIn) return (f / fadeIn) * 0.08;
          if (f > totalFrames - fadeOut) {
            return Math.max(0, (totalFrames - f) / fadeOut) * 0.08;
          }
          return 0.08;
        }}
      />
    </AbsoluteFill>
  );
};
