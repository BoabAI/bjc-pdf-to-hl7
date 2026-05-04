import React from "react";
import { AbsoluteFill, Audio, Series, staticFile, useVideoConfig } from "remotion";
import { Timing, durationFor } from "./lib/timing";
import { HookScene } from "./scenes/HookScene";
import { ProblemScene } from "./scenes/ProblemScene";
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
  secondaryShot?: { shotId: string; zoom: number; objectPosition: string };
  splitProgress?: number;
};

const STEPS: StepDef[] = [
  {
    sceneId: "step-signin",
    shotId: "00-login-screen",
    stepLabel: "Sign in",
    caption: "Use the password your administrator gave you. Sessions last seven days.",
  },
  {
    sceneId: "step-options",
    shotId: "04-options",
    stepLabel: "Configure once",
    caption: "Set your carrier code and paste in your clinic's doctor list — saved in your browser.",
  },
  {
    sceneId: "step-drop",
    shotId: "01-drop-zone",
    stepLabel: "Drop a PDF",
    caption: "Referrals, pathology, radiology, consent forms, even mixed batches.",
  },
  {
    sceneId: "step-convert",
    shotId: "05-converting",
    stepLabel: "Hit Convert",
    caption: "Claude vision classifies, extracts, and matches the addressee to the right doctor.",
  },
  {
    sceneId: "step-download",
    shotId: "07-download",
    stepLabel: "Download or auto-file",
    caption: "Pull it from the queue, or drop it straight into the inbound folder.",
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
        <Series.Sequence durationInFrames={durationFor("hook", fps)}>
          <HookScene />
        </Series.Sequence>

        <Series.Sequence durationInFrames={durationFor("problem", fps)}>
          <ProblemScene />
        </Series.Sequence>

        <Series.Sequence durationInFrames={durationFor("title", fps)}>
          <IntroScene />
        </Series.Sequence>

        <Series.Sequence durationInFrames={durationFor("scope-callout", fps)}>
          <ScopeCalloutScene />
        </Series.Sequence>

        {STEPS.map((step, i) => {
          const primary = findShot(step.shotId);
          const secondary = step.secondaryShot
            ? {
                ...findShot(step.secondaryShot.shotId),
                zoom: step.secondaryShot.zoom,
                objectPosition: step.secondaryShot.objectPosition,
              }
            : undefined;
          return (
            <Series.Sequence key={step.sceneId} durationInFrames={durationFor(step.sceneId, fps)}>
              <StepScene
                stepNumber={i + 1}
                stepLabel={step.stepLabel}
                caption={step.caption}
                shot={primary}
                secondaryShot={secondary}
                splitProgress={step.splitProgress}
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
          if (f < fadeIn) return (f / fadeIn) * 0.1;
          if (f > totalFrames - fadeOut) {
            return Math.max(0, (totalFrames - f) / fadeOut) * 0.1;
          }
          return 0.1;
        }}
      />
    </AbsoluteFill>
  );
};
