import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { THEME } from "../theme";

const FEATURES = [
  {
    title: "Tactical Intents",
    body: "Counter-attack. Hold shape. Press now. Live tactics that adapt to the match.",
    icon: "TACT",
  },
  {
    title: "11 v 11 Engine",
    body: "xG-based shots, through balls, off-ball runs, role-aware positioning.",
    icon: "ENG",
  },
  {
    title: "Player Development",
    body: "Match-driven growth, age curves, role weights — every player has a story.",
    icon: "DEV",
  },
  {
    title: "Career Mode",
    body: "Transfers, finances, season calendar, AI clubs with budgets and depth.",
    icon: "CAR",
  },
];

export const FeaturesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const eo = Easing.bezier(0.16, 1, 0.3, 1);

  // Heading.
  const headingOpacity = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const headingY = interpolate(frame, [0, fps * 0.5], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  // Scene fade out.
  const exitOpacity = interpolate(frame, [fps * 2.8, fps * 3.2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, ${THEME.bg} 0%, ${THEME.bgDeep} 80%)`,
        opacity: exitOpacity,
        padding: 80,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Background grid lines for texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Heading */}
      <div
        style={{
          opacity: headingOpacity,
          transform: `translateY(${headingY}px)`,
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 800,
          fontSize: 72,
          letterSpacing: "0.04em",
          color: THEME.text,
          textAlign: "center",
          marginBottom: 16,
        }}
      >
        Built for <span style={{ color: THEME.accent }}>tacticians</span>.
      </div>
      <div
        style={{
          opacity: headingOpacity,
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 500,
          fontSize: 22,
          letterSpacing: "0.5em",
          color: THEME.textMuted,
          textTransform: "uppercase",
          marginBottom: 64,
        }}
      >
        — Every Decision Matters —
      </div>

      {/* Feature grid (2×2) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 28,
          width: 1400,
          maxWidth: "100%",
        }}
      >
        {FEATURES.map((f, i) => {
          const start = fps * 0.4 + i * 6;
          const cardOpacity = interpolate(
            frame,
            [start, start + fps * 0.4],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: eo,
            },
          );
          const cardY = interpolate(frame, [start, start + fps * 0.4], [40, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: eo,
          });

          return (
            <div
              key={i}
              style={{
                opacity: cardOpacity,
                transform: `translateY(${cardY}px)`,
                padding: "32px 36px",
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 16,
                boxShadow:
                  "0 12px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Accent stripe */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 4,
                  height: "100%",
                  background: `linear-gradient(180deg, ${THEME.accent}, ${THEME.accent}00)`,
                }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 12 }}>
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 10,
                    border: `1px solid ${THEME.accent}60`,
                    background: `${THEME.accent}12`,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontWeight: 800,
                    fontSize: 16,
                    color: THEME.accent,
                    letterSpacing: "0.1em",
                  }}
                >
                  {f.icon}
                </div>
                <div
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontWeight: 800,
                    fontSize: 34,
                    letterSpacing: "0.02em",
                    color: THEME.text,
                  }}
                >
                  {f.title}
                </div>
              </div>
              <div
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontWeight: 400,
                  fontSize: 22,
                  lineHeight: 1.45,
                  color: THEME.textMuted,
                  letterSpacing: "0.01em",
                }}
              >
                {f.body}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
