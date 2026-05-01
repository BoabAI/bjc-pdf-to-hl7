import React from "react";

type Props = {
  url: string;
  children: React.ReactNode;
  width?: number;
  height?: number;
};

/**
 * Browser-mockup device frame. White inner background prevents dark
 * screenshots from blending into the dark video background.
 */
export const DeviceFrame: React.FC<Props> = ({ url, children, width = 1680, height = 945 }) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 18,
        overflow: "hidden",
        boxShadow:
          "0 50px 130px rgba(0,0,0,0.55), 0 14px 36px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.08)",
        background: "#1a1622",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          gap: 14,
          background: "linear-gradient(180deg, #1d1828 0%, #15111e 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#febb2e" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              padding: "6px 18px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.05)",
              fontSize: 14,
              color: "rgba(255,255,255,0.65)",
              fontFamily: "Urbanist, sans-serif",
              letterSpacing: 0.2,
              minWidth: 320,
              textAlign: "center",
            }}
          >
            {url}
          </div>
        </div>
        <div style={{ width: 60 }} />
      </div>
      {/* Content area — WHITE background so light/dark screenshots both render correctly */}
      <div style={{ flex: 1, background: "#FFFFFF", overflow: "hidden", position: "relative" }}>
        {children}
      </div>
    </div>
  );
};
