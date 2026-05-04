import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Brand } from "../lib/branding";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { FilmGrain } from "../components/FilmGrain";

/**
 * Hook — opening shot. Stack of PDFs floating in across the frame as the
 * narrator says "every clinic gets the same flood". Three labeled cards
 * (Referrals, Pathology, Radiology) cascade onto the screen.
 *
 * Layout: full-bleed with cascading floating cards.
 */
export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cards = [
    { label: "Referral", file: "REF-2348.pdf", x: 22, y: 38, rot: -8 },
    { label: "Pathology", file: "PATH-9821.pdf", x: 38, y: 30, rot: 4 },
    { label: "Radiology", file: "RAD-5417.pdf", x: 54, y: 42, rot: -3 },
    { label: "Consent", file: "CONSENT-712.pdf", x: 70, y: 32, rot: 6 },
    { label: "GP Letter", file: "GP-4112.pdf", x: 14, y: 54, rot: 9 },
    { label: "Pathology", file: "PATH-3201.pdf", x: 62, y: 58, rot: -6 },
  ];

  const headlineOpacity = interpolate(frame, [4, 14], [0, 1], { extrapolateRight: "clamp" });
  const headlineY = interpolate(frame, [4, 14], [30, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <AnimatedBackground />

      {/* Distant glow blob */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "60%",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${Brand.colors.accentSolid}30 0%, transparent 65%)`,
          filter: "blur(80px)",
        }}
      />

      {/* Floating PDF cards */}
      {cards.map((c, i) => {
        const delay = i * 3;
        const opacity = interpolate(frame, [delay, delay + 10], [0, 1], { extrapolateRight: "clamp" });
        const scale = spring({
          frame: frame - delay,
          fps,
          config: { stiffness: 180, mass: 0.6 },
          from: 0.7,
          to: 1,
        });
        // Subtle bob
        const bob = Math.sin((frame - delay) / 26) * 6;
        return (
          <div
            key={c.file}
            style={{
              position: "absolute",
              left: `${c.x}%`,
              top: `${c.y}%`,
              transform: `translate(-50%, -50%) rotate(${c.rot}deg) scale(${scale}) translateY(${bob}px)`,
              opacity,
              width: 240,
              height: 320,
              borderRadius: 14,
              background: `linear-gradient(160deg, ${Brand.colors.bgSecondary}f0 0%, ${Brand.colors.bgPrimary}e0 100%)`,
              border: `1.5px solid ${Brand.colors.accentSolid}40`,
              boxShadow: `0 25px 60px ${Brand.colors.accentSolid}25, 0 0 0 1px ${Brand.colors.accentSolid}20`,
              padding: 22,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              backdropFilter: "blur(8px)",
            }}
          >
            <div>
              {/* Document icon stripe */}
              <div
                style={{
                  width: 38,
                  height: 48,
                  borderRadius: 4,
                  background: Brand.colors.accentSolid,
                  marginBottom: 18,
                  position: "relative",
                  boxShadow: `0 0 24px ${Brand.colors.accentSolid}90`,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -2,
                    width: 16,
                    height: 16,
                    background: Brand.colors.bgPrimary,
                    transform: "rotate(45deg) translate(8px,-8px)",
                  }}
                />
              </div>
              <div
                style={{
                  fontFamily: `${Brand.font.body}, sans-serif`,
                  fontSize: 22,
                  fontWeight: 700,
                  color: Brand.colors.textPrimary,
                  letterSpacing: 0.3,
                  marginBottom: 6,
                }}
              >
                {c.label}
              </div>
              <div
                style={{
                  fontFamily: `${Brand.font.body}, monospace`,
                  fontSize: 15,
                  color: Brand.colors.textSecondary,
                  letterSpacing: 0.4,
                }}
              >
                {c.file}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  style={{
                    height: 6,
                    width: n === 5 ? "40%" : "100%",
                    borderRadius: 2,
                    background: `${Brand.colors.textSecondary}33`,
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Eyebrow + headline */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", padding: "0 0 110px 0" }}>
        <div
          style={{
            opacity: headlineOpacity,
            transform: `translateY(${headlineY}px)`,
            textAlign: "center",
            maxWidth: 1300,
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "8px 22px",
              borderRadius: 999,
              border: `1.5px solid ${Brand.colors.accentSolid}66`,
              background: `${Brand.colors.accentSolid}15`,
              fontFamily: `${Brand.font.body}, sans-serif`,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: Brand.colors.accentSolid,
              marginBottom: 28,
            }}
          >
            Every clinic, every day
          </div>
          <h1
            style={{
              fontFamily: `${Brand.font.display}, sans-serif`,
              fontSize: 96,
              fontWeight: 700,
              color: Brand.colors.textPrimary,
              margin: 0,
              lineHeight: 1.05,
              letterSpacing: -1.4,
              textShadow: `0 0 40px ${Brand.colors.accentSolid}50`,
            }}
          >
            A flood of <span style={{ color: Brand.colors.accentSolid }}>PDFs</span>.
          </h1>
        </div>
      </AbsoluteFill>

      <FilmGrain />
    </AbsoluteFill>
  );
};
