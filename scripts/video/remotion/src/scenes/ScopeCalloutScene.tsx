import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Brand } from "../lib/branding";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { FilmGrain } from "../components/FilmGrain";

/**
 * Scope callout — split panel showing what this video shows (operator portal)
 * vs how production actually runs (fully automated). Critical mental-model
 * setter so viewers don't think the portal is the only path.
 *
 * Layout: split-screen.
 */
export const ScopeCalloutScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const eyebrowOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  const leftScale = spring({ frame, fps, config: { stiffness: 180, mass: 0.5 }, from: 0.95, to: 1 });
  const leftOpacity = interpolate(frame, [4, 14], [0, 1], { extrapolateRight: "clamp" });

  const arrowOpacity = interpolate(frame, [14, 26], [0, 1], { extrapolateRight: "clamp" });

  const rightScale = spring({
    frame: frame - 12,
    fps,
    config: { stiffness: 180, mass: 0.5 },
    from: 0.95,
    to: 1,
  });
  const rightOpacity = interpolate(frame, [16, 26], [0, 1], { extrapolateRight: "clamp" });

  // Pulse on the right (automation) panel
  const pulse = 0.5 + 0.5 * Math.sin(frame / 14);

  return (
    <AbsoluteFill>
      <AnimatedBackground />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 70 }}>
        <div style={{ width: "100%", maxWidth: 1780, textAlign: "center" }}>
          {/* Eyebrow */}
          <div
            style={{
              opacity: eyebrowOpacity,
              display: "inline-block",
              padding: "10px 28px",
              borderRadius: 999,
              background: `${Brand.colors.accentSolid}20`,
              border: `1.5px solid ${Brand.colors.accentSolid}66`,
              fontFamily: `${Brand.font.body}, sans-serif`,
              fontSize: 22,
              fontWeight: 600,
              color: Brand.colors.accentSolid,
              letterSpacing: 1.8,
              textTransform: "uppercase",
              marginBottom: 28,
            }}
          >
            Heads up
          </div>

          <h2
            style={{
              fontFamily: `${Brand.font.display}, sans-serif`,
              fontSize: 64,
              fontWeight: 700,
              color: Brand.colors.textPrimary,
              margin: "0 0 64px 0",
              lineHeight: 1.1,
              letterSpacing: -0.8,
              opacity: eyebrowOpacity,
            }}
          >
            This video shows the portal. Production is fully automated.
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr", gap: 0, alignItems: "stretch" }}>
            {/* LEFT: Operator portal (this UI) */}
            <div
              style={{
                background: `linear-gradient(160deg, ${Brand.colors.bgSecondary}cc 0%, ${Brand.colors.bgPrimary}aa 100%)`,
                border: `1.5px solid ${Brand.colors.textSecondary}40`,
                borderRadius: 24,
                padding: 56,
                backdropFilter: "blur(18px)",
                opacity: leftOpacity,
                transform: `scale(${leftScale})`,
                textAlign: "left",
                minHeight: 460,
                position: "relative",
              }}
            >
              <div
                style={{
                  fontFamily: `${Brand.font.body}, sans-serif`,
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: Brand.colors.textSecondary,
                  marginBottom: 18,
                }}
              >
                What you'll see
              </div>
              <h3
                style={{
                  fontFamily: `${Brand.font.display}, sans-serif`,
                  fontSize: 50,
                  fontWeight: 700,
                  color: Brand.colors.textPrimary,
                  margin: "0 0 32px 0",
                  letterSpacing: -0.6,
                }}
              >
                Operator portal
              </h3>
              <ul
                style={{
                  fontFamily: `${Brand.font.body}, sans-serif`,
                  fontSize: 24,
                  lineHeight: 1.7,
                  color: Brand.colors.textSecondary,
                  margin: 0,
                  paddingLeft: 24,
                  listStyle: "none",
                }}
              >
                {["One-off uploads", "Spot-checks & overrides", "Manual sign-in"].map((s) => (
                  <li key={s} style={{ marginBottom: 6, position: "relative", paddingLeft: 26 }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 12,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: Brand.colors.textSecondary,
                      }}
                    />
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            {/* ARROW */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: arrowOpacity,
              }}
            >
              <div
                style={{
                  fontSize: 48,
                  color: Brand.colors.accentSolid,
                  fontFamily: `${Brand.font.display}, sans-serif`,
                  fontWeight: 700,
                  letterSpacing: 0,
                }}
              >
                →
              </div>
            </div>

            {/* RIGHT: Lights-out automation */}
            <div
              style={{
                background: `linear-gradient(160deg, ${Brand.colors.accentSolid}25 0%, ${Brand.colors.bgSecondary}aa 100%)`,
                border: `2px solid ${Brand.colors.accentSolid}${Math.round(70 + 60 * pulse).toString(16).padStart(2, "0")}`,
                borderRadius: 24,
                padding: 56,
                backdropFilter: "blur(18px)",
                opacity: rightOpacity,
                transform: `scale(${rightScale})`,
                textAlign: "left",
                minHeight: 460,
                boxShadow: `0 30px 80px ${Brand.colors.accentSolid}${Math.round(20 + 30 * pulse).toString(16).padStart(2, "0")}`,
                position: "relative",
              }}
            >
              <div
                style={{
                  fontFamily: `${Brand.font.body}, sans-serif`,
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: Brand.colors.accentSolid,
                  marginBottom: 18,
                }}
              >
                In production
              </div>
              <h3
                style={{
                  fontFamily: `${Brand.font.display}, sans-serif`,
                  fontSize: 50,
                  fontWeight: 700,
                  color: Brand.colors.textPrimary,
                  margin: "0 0 32px 0",
                  letterSpacing: -0.6,
                  textShadow: `0 0 30px ${Brand.colors.accentSolid}80`,
                }}
              >
                Lights-out automation
              </h3>
              <ul
                style={{
                  fontFamily: `${Brand.font.body}, sans-serif`,
                  fontSize: 24,
                  lineHeight: 1.7,
                  color: Brand.colors.textPrimary,
                  margin: 0,
                  paddingLeft: 0,
                  listStyle: "none",
                }}
              >
                {[
                  "Email arrives → engine fires",
                  "Same vision, same HL7 output",
                  "No clicks, no logins, no humans",
                ].map((s) => (
                  <li key={s} style={{ marginBottom: 6, position: "relative", paddingLeft: 26 }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 12,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: Brand.colors.accentSolid,
                        boxShadow: `0 0 16px ${Brand.colors.accentSolid}`,
                      }}
                    />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </AbsoluteFill>

      <FilmGrain />
    </AbsoluteFill>
  );
};
