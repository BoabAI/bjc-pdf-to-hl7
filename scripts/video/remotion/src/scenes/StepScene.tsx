import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
} from "remotion";
import { Brand } from "../lib/branding";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { DeviceFrame } from "../components/DeviceFrame";
import { FilmGrain } from "../components/FilmGrain";

type StepShot = {
  id: string;
  file: string;
  url: string;
  zoom: number;
  /** CSS object-position for the screenshot. Default "top". Used by
   *  secondary shots to refocus on a specific area of the same image. */
  objectPosition?: string;
};

type Props = {
  stepNumber: number;
  stepLabel: string;
  caption: string;
  shot: StepShot;
  /** Optional second visual beat — crossfades in over the primary shot at
   *  splitProgress. Useful when a long narration window benefits from a
   *  zoomed/repositioned framing of the same screenshot. */
  secondaryShot?: StepShot;
  /** Progress (0..1) of the scene at which the crossfade begins. */
  splitProgress?: number;
};

/**
 * One instructional step — number + label + caption + UI screenshot in a device frame.
 * Layout: asymmetric-left (text left, screenshot right).
 * Slow Ken Burns push on the screenshot, blur-in on text.
 */
export const StepScene: React.FC<Props> = ({
  stepNumber,
  stepLabel,
  caption,
  shot,
  secondaryShot,
  splitProgress = 0.55,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Text animations
  const numberScale = spring({ frame, fps, config: { stiffness: 220, mass: 0.4 }, from: 0.5, to: 1 });
  const numberOpacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" });

  const labelBlur = interpolate(frame, [3, 12], [12, 0], { extrapolateRight: "clamp" });
  const labelOpacity = interpolate(frame, [3, 12], [0, 1], { extrapolateRight: "clamp" });

  const captionY = interpolate(frame, [8, 18], [30, 0], { extrapolateRight: "clamp" });
  const captionOpacity = interpolate(frame, [8, 18], [0, 1], { extrapolateRight: "clamp" });

  // Device frame entrance — scale + slide from right
  const deviceX = interpolate(frame, [0, 14], [80, 0], { extrapolateRight: "clamp" });
  const deviceOpacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });

  // Slow Ken Burns push on the screenshot — modest scale + drift
  const progress = frame / Math.max(durationInFrames, 1);
  const baseScale = shot.zoom;
  const kbScale = baseScale * (1 + 0.06 * progress);
  const kbX = -8 * progress;
  const kbY = -4 * progress;

  return (
    <AbsoluteFill>
      <AnimatedBackground />

      <AbsoluteFill style={{ display: "flex", flexDirection: "row", alignItems: "center", padding: "80px 80px" }}>
        {/* LEFT: text column */}
        <div
          style={{
            width: 580,
            flexShrink: 0,
            paddingRight: 40,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          {/* Step number badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 28,
              transform: `scale(${numberScale})`,
              opacity: numberOpacity,
              transformOrigin: "left center",
            }}
          >
            <div
              style={{
                fontFamily: `${Brand.font.display}, sans-serif`,
                fontSize: 32,
                fontWeight: 800,
                color: Brand.colors.bgPrimary,
                background: Brand.colors.accentSolid,
                width: 64,
                height: 64,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 28px ${Brand.colors.accentSolid}80`,
              }}
            >
              {stepNumber}
            </div>
            <div
              style={{
                fontFamily: `${Brand.font.body}, sans-serif`,
                fontSize: 22,
                fontWeight: 600,
                color: Brand.colors.accentSolid,
                letterSpacing: 2.4,
                textTransform: "uppercase",
              }}
            >
              Step {stepNumber} / 7
            </div>
          </div>

          {/* Step label (the headline) */}
          <h2
            style={{
              fontFamily: `${Brand.font.display}, sans-serif`,
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.05,
              color: Brand.colors.textPrimary,
              margin: 0,
              letterSpacing: -1,
              filter: `blur(${labelBlur}px)`,
              opacity: labelOpacity,
              textShadow: `0 0 28px ${Brand.colors.accentSolid}30`,
            }}
          >
            {stepLabel}
          </h2>

          {/* Caption */}
          <p
            style={{
              fontFamily: `${Brand.font.body}, sans-serif`,
              fontSize: 28,
              fontWeight: 400,
              lineHeight: 1.45,
              color: Brand.colors.textSecondary,
              marginTop: 32,
              marginBottom: 0,
              maxWidth: 520,
              transform: `translateY(${captionY}px)`,
              opacity: captionOpacity,
            }}
          >
            {caption}
          </p>

          {/* Decorative accent bar */}
          <div
            style={{
              width: 80,
              height: 4,
              borderRadius: 2,
              background: `linear-gradient(90deg, ${Brand.colors.accentSolid}, ${Brand.colors.accentSecondary})`,
              marginTop: 36,
              opacity: labelOpacity,
            }}
          />
        </div>

        {/* RIGHT: screenshot column */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `translateX(${deviceX}px)`,
            opacity: deviceOpacity,
          }}
        >
          <DeviceFrame url={shot.url} width={1180} height={730}>
            {/* Primary shot — stays at full opacity behind any secondary shot
             *  so transitions never expose the white DeviceFrame background. */}
            <Img
              src={staticFile(shot.file)}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: shot.objectPosition ?? "top",
                transform: `scale(${kbScale}) translate(${kbX}%, ${kbY}%)`,
                transformOrigin: "center top",
              }}
            />
            {/* Secondary shot — crossfades in on top after splitProgress. */}
            {secondaryShot ? (() => {
              const splitFrame = Math.floor(durationInFrames * splitProgress);
              const fadeFrames = 12;
              const sOpacity = interpolate(
                frame,
                [splitFrame, splitFrame + fadeFrames],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              const sFramesIn = Math.max(0, frame - splitFrame);
              const sProgress =
                sFramesIn / Math.max(durationInFrames - splitFrame, 1);
              const sScale = secondaryShot.zoom * (1 + 0.05 * sProgress);
              return (
                <Img
                  src={staticFile(secondaryShot.file)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: secondaryShot.objectPosition ?? "top",
                    transform: `scale(${sScale})`,
                    transformOrigin: "center center",
                    opacity: sOpacity,
                  }}
                />
              );
            })() : null}
          </DeviceFrame>
        </div>
      </AbsoluteFill>

      <FilmGrain />
    </AbsoluteFill>
  );
};
