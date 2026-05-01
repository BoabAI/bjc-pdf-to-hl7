import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { Brand } from "../lib/branding";

/**
 * Layer 1 background — animated gradient mesh in the brand's dark cinematic palette.
 * Always visible motion, never static.
 */
export const AnimatedBackground: React.FC = () => {
  const frame = useCurrentFrame();

  // Slowly drifting orb positions (-20% to +20% across the frame).
  const drift = (phase: number) =>
    Math.sin((frame + phase) / 90) * 12;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(140deg, ${Brand.colors.bgPrimary} 0%, ${Brand.colors.bgSecondary} 100%)`,
      }}
    >
      {/* Glow orb 1 — accent solid, top-left */}
      <div
        style={{
          position: "absolute",
          top: `${15 + drift(0)}%`,
          left: `${10 + drift(45)}%`,
          width: 760,
          height: 760,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${Brand.colors.accentSolid}30 0%, transparent 60%)`,
          filter: "blur(60px)",
          mixBlendMode: "screen",
        }}
      />
      {/* Glow orb 2 — accent secondary, bottom-right */}
      <div
        style={{
          position: "absolute",
          bottom: `${10 + drift(120)}%`,
          right: `${8 + drift(180)}%`,
          width: 680,
          height: 680,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${Brand.colors.accentSecondary}25 0%, transparent 60%)`,
          filter: "blur(70px)",
          mixBlendMode: "screen",
        }}
      />
      {/* Subtle grid lines for cinematic structure */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(${Brand.colors.textPrimary}08 1px, transparent 1px), linear-gradient(90deg, ${Brand.colors.textPrimary}08 1px, transparent 1px)`,
          backgroundSize: "120px 120px",
          opacity: interpolate(frame, [0, 30], [0, 0.4], { extrapolateRight: "clamp" }),
        }}
      />
    </AbsoluteFill>
  );
};
