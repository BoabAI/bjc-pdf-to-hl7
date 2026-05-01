import React from "react";
import { AbsoluteFill, Audio, Series, staticFile, useVideoConfig } from "remotion";
import { Timing, durationFor } from "./lib/timing";
import { IntroScene } from "./scenes/IntroScene";
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
  /** Optional second visual beat — uses the same screenshot file by default but
   *  overrides zoom + objectPosition to refocus the framing. */
  secondaryShot?: { shotId: string; zoom: number; objectPosition: string };
  splitProgress?: number;
};

const STEPS: StepDef[] = [
  {
    sceneId: "step-drop",
    shotId: "01-drop-zone",
    stepLabel: "Drop a PDF",
    caption: "Drag onto the zone, or click Browse. Up to 10 files at a time, 10 MB each.",
  },
  {
    sceneId: "step-types",
    shotId: "02-supports",
    stepLabel: "Six document types",
    caption:
      "Specialist & GP referrals, pathology & radiology results, consent forms, plus generic medical PDFs.",
    // Beat A: full row of badges. Beat B (after 55%): tighter zoom on the
    // results badges (Pathology Results / Radiology Results) — supports the
    // second half of the narration which moves into "Results — pathology
    // and radiology". The badges sit ~25% from the top of the source frame.
    secondaryShot: { shotId: "02-supports", zoom: 3.0, objectPosition: "center 50%" },
    splitProgress: 0.55,
  },
  {
    sceneId: "step-queue",
    shotId: "03-queue",
    stepLabel: "Files queue up",
    caption: "Each file shows its detected type. Override the type manually for a single file if needed.",
  },
  {
    sceneId: "step-options",
    shotId: "04-options",
    stepLabel: "Set options",
    caption: "Carrier, auto-file vs review, and optional doctor routing for the message.",
  },
  {
    sceneId: "step-convert",
    shotId: "05-converting",
    stepLabel: "Hit Convert",
    caption: "Bedrock vision extracts patient details and builds an HL7 v2.4 message.",
  },
  {
    sceneId: "step-routing",
    shotId: "06-result",
    stepLabel: "One folder, four inboxes",
    caption:
      "Every HL7 file lands in the same Genie drop folder. The message tells Genie which inbox to file it in.",
  },
  {
    sceneId: "step-download",
    shotId: "07-download",
    stepLabel: "Download or auto-file",
    caption: "Pull the HL7 from the queue, or let auto-file deliver it straight into Genie.",
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
        <Series.Sequence durationInFrames={durationFor("title", fps)}>
          <IntroScene />
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
