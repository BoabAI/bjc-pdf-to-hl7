import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Brand } from "../lib/branding";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { FilmGrain } from "../components/FilmGrain";

/**
 * Closing scene — SMEC AI logo, tagline, URL.
 * Layout: centered-stack with subtle pulsing glow.
 */
export const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { stiffness: 200, mass: 0.4 }, from: 0.94, to: 1 });
  const logoOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  const taglineY = interpolate(frame, [4, 14], [30, 0], { extrapolateRight: "clamp" });
  const taglineOpacity = interpolate(frame, [4, 14], [0, 1], { extrapolateRight: "clamp" });

  const urlOpacity = interpolate(frame, [10, 22], [0, 1], { extrapolateRight: "clamp" });

  // Pulse the glow halo behind the logo
  const pulse = 0.5 + 0.5 * Math.sin(frame / 14);

  return (
    <AbsoluteFill>
      <AnimatedBackground />

      {/* Pulsing halo behind logo */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 720,
          height: 720,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${Brand.colors.accentSolid}${Math.round(35 + 25 * pulse)
            .toString(16)
            .padStart(2, "0")} 0%, transparent 60%)`,
          filter: "blur(60px)",
        }}
      />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 1200 }}>
          <Img
            src={staticFile("logo.svg")}
            style={{
              width: 500,
              height: "auto",
              opacity: logoOpacity,
              transform: `scale(${logoScale})`,
              filter: `drop-shadow(0 0 30px ${Brand.colors.accentSolid}90)`,
              marginBottom: 56,
            }}
          />

          <h2
            style={{
              fontFamily: `${Brand.font.display}, sans-serif`,
              fontSize: 72,
              fontWeight: 700,
              color: Brand.colors.textPrimary,
              margin: 0,
              lineHeight: 1.08,
              letterSpacing: -1.0,
              transform: `translateY(${taglineY}px)`,
              opacity: taglineOpacity,
              textShadow: `0 0 28px ${Brand.colors.accentSolid}50`,
            }}
          >
            In production, the same engine
            <br />
            runs <span style={{ color: Brand.colors.accentSolid }}>unattended</span>.
          </h2>

          <div
            style={{
              marginTop: 48,
              display: "inline-flex",
              alignItems: "center",
              gap: 24,
              padding: "18px 38px",
              borderRadius: 999,
              background: `${Brand.colors.accentSolid}18`,
              border: `1.5px solid ${Brand.colors.accentSolid}55`,
              opacity: urlOpacity,
            }}
          >
            <span
              style={{
                fontFamily: `${Brand.font.body}, sans-serif`,
                fontSize: 28,
                fontWeight: 600,
                color: Brand.colors.accentSolid,
                letterSpacing: 0.4,
              }}
            >
              Sign out — top right
            </span>
          </div>
        </div>
      </AbsoluteFill>

      <FilmGrain />
    </AbsoluteFill>
  );
};
