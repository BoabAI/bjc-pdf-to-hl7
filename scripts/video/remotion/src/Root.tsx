import React from "react";
import { Composition } from "remotion";
import { loadFont as loadUrbanist } from "@remotion/google-fonts/Urbanist";
import { loadFont as loadDmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadOutfit } from "@remotion/google-fonts/Outfit";
import { ExplainerVideo } from "./ExplainerVideo";
import { Timing } from "./lib/timing";

// Load fonts at module scope (do not call inside a component).
loadUrbanist();
loadDmSans();
loadOutfit();

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  const totalSec = Timing.totalDuration;
  const durationInFrames = Math.ceil(totalSec * FPS);

  return (
    <>
      <Composition
        id="ExplainerVideo"
        component={ExplainerVideo}
        durationInFrames={durationInFrames}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
