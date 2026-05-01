import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

/**
 * Layer 4 film grain + vignette overlay. Adds cinematic texture.
 * The grain SVG is data-URI'd so no asset hop is needed.
 */
const grainSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
  <filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter>
  <rect width='100%' height='100%' filter='url(#n)' opacity='0.5'/>
</svg>
`)}`;

export const FilmGrain: React.FC = () => {
  const frame = useCurrentFrame();
  // Slowly shift grain so it doesn't look like a static texture
  const shift = (frame * 7) % 200;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          inset: -100,
          backgroundImage: `url(${grainSvg})`,
          backgroundRepeat: "repeat",
          backgroundPosition: `${shift}px ${shift}px`,
          opacity: 0.12,
          mixBlendMode: "overlay",
        }}
      />
      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
