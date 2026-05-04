import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Brand } from "../lib/branding";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { FilmGrain } from "../components/FilmGrain";

/**
 * Problem — three glassmorphism cards naming the pain points the manual
 * portal flow is supposed to solve. Negative-tinted glow.
 *
 * Layout: card-contained grid of three.
 */
export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cards = [
    {
      icon: "📄",
      title: "Manual reading",
      body: "Each PDF gets opened, skimmed, and classified by a human.",
    },
    {
      icon: "📨",
      title: "Wrong inbox",
      body: "Documents land in the wrong doctor's queue and have to be re-routed.",
    },
    {
      icon: "⏱",
      title: "A day a week",
      body: "Repetitive triage that quietly burns hours of clinical-admin time.",
    },
  ];

  const eyebrowOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const headlineOpacity = interpolate(frame, [4, 14], [0, 1], { extrapolateRight: "clamp" });
  const headlineY = interpolate(frame, [4, 14], [24, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <AnimatedBackground />

      {/* Negative-tinted glow */}
      <div
        style={{
          position: "absolute",
          top: "55%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 1100,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${Brand.colors.negative}25 0%, transparent 65%)`,
          filter: "blur(70px)",
        }}
      />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
        <div style={{ width: "100%", maxWidth: 1700, textAlign: "center" }}>
          <div
            style={{
              opacity: eyebrowOpacity,
              fontFamily: `${Brand.font.body}, sans-serif`,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: Brand.colors.negativeAccent,
              marginBottom: 24,
            }}
          >
            The problem
          </div>

          <h2
            style={{
              fontFamily: `${Brand.font.display}, sans-serif`,
              fontSize: 76,
              fontWeight: 700,
              color: Brand.colors.textPrimary,
              margin: "0 0 80px 0",
              lineHeight: 1.05,
              letterSpacing: -1,
              opacity: headlineOpacity,
              transform: `translateY(${headlineY}px)`,
            }}
          >
            Every document, sorted by <span style={{ color: Brand.colors.negativeAccent }}>hand</span>.
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 36 }}>
            {cards.map((c, i) => {
              const delay = 6 + i * 4;
              const cardOp = interpolate(frame, [delay, delay + 12], [0, 1], { extrapolateRight: "clamp" });
              const cardY = interpolate(frame, [delay, delay + 12], [40, 0], { extrapolateRight: "clamp" });
              const cardScale = spring({
                frame: frame - delay,
                fps,
                config: { stiffness: 200, mass: 0.5 },
                from: 0.95,
                to: 1,
              });
              return (
                <div
                  key={c.title}
                  style={{
                    background: `linear-gradient(160deg, ${Brand.colors.bgSecondary}cc 0%, ${Brand.colors.bgPrimary}aa 100%)`,
                    border: `1.5px solid ${Brand.colors.negative}33`,
                    borderRadius: 22,
                    padding: 56,
                    backdropFilter: "blur(20px)",
                    opacity: cardOp,
                    transform: `translateY(${cardY}px) scale(${cardScale})`,
                    textAlign: "left",
                    boxShadow: `0 30px 60px ${Brand.colors.negative}20`,
                    minHeight: 360,
                  }}
                >
                  <div style={{ fontSize: 64, marginBottom: 24 }}>{c.icon}</div>
                  <h3
                    style={{
                      fontFamily: `${Brand.font.display}, sans-serif`,
                      fontSize: 38,
                      fontWeight: 700,
                      color: Brand.colors.textPrimary,
                      margin: "0 0 18px 0",
                      letterSpacing: -0.4,
                    }}
                  >
                    {c.title}
                  </h3>
                  <p
                    style={{
                      fontFamily: `${Brand.font.body}, sans-serif`,
                      fontSize: 24,
                      lineHeight: 1.45,
                      color: Brand.colors.textSecondary,
                      margin: 0,
                    }}
                  >
                    {c.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>

      <FilmGrain />
    </AbsoluteFill>
  );
};
