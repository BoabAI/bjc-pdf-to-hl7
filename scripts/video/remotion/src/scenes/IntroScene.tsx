import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { LightLeak } from "@remotion/light-leaks";
import { Brand } from "../lib/branding";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { FilmGrain } from "../components/FilmGrain";

/**
 * Title scene — SMEC AI logo + headline establishing what the video teaches.
 * Layout: centered-stack. Quick blur-in entrance.
 */
export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Light leak flash near end of the intro — a quick camera-flare cue
  // marking the cut to the instructional content.
  const flashStart = durationInFrames - 18;
  const leakOpacity = interpolate(
    frame,
    [flashStart, flashStart + 8, flashStart + 16, durationInFrames],
    [0, 0.18, 0.18, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const logoBlur = interpolate(frame, [0, 8], [16, 0], { extrapolateRight: "clamp" });
  const logoOpacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" });
  const logoScale = spring({ frame, fps, config: { stiffness: 200, mass: 0.4 }, from: 0.92, to: 1 });

  const headlineY = interpolate(frame, [4, 12], [40, 0], { extrapolateRight: "clamp" });
  const headlineOpacity = interpolate(frame, [4, 12], [0, 1], { extrapolateRight: "clamp" });

  const subY = interpolate(frame, [10, 20], [20, 0], { extrapolateRight: "clamp" });
  const subOpacity = interpolate(frame, [10, 20], [0, 1], { extrapolateRight: "clamp" });

  // Decorative accent line drawing
  const accentScale = interpolate(frame, [14, 28], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <AnimatedBackground />

      {/* Decorative orb behind logo */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 540,
          height: 540,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${Brand.colors.accentSolid}40 0%, transparent 65%)`,
          filter: "blur(50px)",
        }}
      />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 120 }}>
        <div style={{ maxWidth: 1280, textAlign: "center" }}>
          <Img
            src={staticFile("logo.svg")}
            style={{
              width: 560,
              height: "auto",
              filter: `blur(${logoBlur}px) drop-shadow(0 0 32px ${Brand.colors.accentSolid}80)`,
              opacity: logoOpacity,
              transform: `scale(${logoScale})`,
              marginBottom: 56,
            }}
          />

          <h1
            style={{
              fontFamily: `${Brand.font.display}, sans-serif`,
              fontSize: 96,
              fontWeight: 700,
              color: Brand.colors.textPrimary,
              margin: 0,
              lineHeight: 1.1,
              letterSpacing: -1.5,
              transform: `translateY(${headlineY}px)`,
              opacity: headlineOpacity,
              textShadow: `0 0 38px ${Brand.colors.accentSolid}60`,
            }}
          >
            How to use the
            <br />
            <span style={{ color: Brand.colors.accentSolid }}>PDF → HL7 Converter</span>
          </h1>

          {/* Accent line */}
          <div
            style={{
              width: 240,
              height: 3,
              background: `linear-gradient(90deg, transparent, ${Brand.colors.accentSolid}, transparent)`,
              margin: "40px auto",
              transform: `scaleX(${accentScale})`,
              transformOrigin: "center",
            }}
          />

          <p
            style={{
              fontFamily: `${Brand.font.body}, sans-serif`,
              fontSize: 36,
              fontWeight: 400,
              color: Brand.colors.textSecondary,
              margin: 0,
              transform: `translateY(${subY}px)`,
              opacity: subOpacity,
              letterSpacing: 0.3,
            }}
          >
            A short walkthrough of the converter UI
          </p>
        </div>
      </AbsoluteFill>

      {/* Brief light leak flash at the end — flags the cut to step 1. */}
      {leakOpacity > 0 ? (
        <AbsoluteFill style={{ opacity: leakOpacity, mixBlendMode: "screen", pointerEvents: "none" }}>
          <LightLeak />
        </AbsoluteFill>
      ) : null}

      <FilmGrain />
    </AbsoluteFill>
  );
};
