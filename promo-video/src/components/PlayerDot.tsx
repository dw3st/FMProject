import React from "react";
import { THEME } from "../theme";

type PlayerDotProps = {
  // Absolute screen coordinates (in px).
  x: number;
  y: number;
  team: "A" | "B";
  label?: string;
  scale?: number;
  glow?: number; // 0..1
  highlight?: boolean;
};

export const PlayerDot: React.FC<PlayerDotProps> = ({
  x,
  y,
  team,
  label,
  scale = 1,
  glow = 0.7,
  highlight = false,
}) => {
  const color = team === "A" ? THEME.teamA : THEME.teamB;
  const glowColor = team === "A" ? THEME.teamAGlow : THEME.teamBGlow;
  const radius = 18 * scale;

  return (
    <div
      style={{
        position: "absolute",
        left: x - radius,
        top: y - radius,
        width: radius * 2,
        height: radius * 2,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: radius * 2,
          height: radius * 2,
          borderRadius: "50%",
          background: `radial-gradient(circle at 30% 30%, ${glowColor} 0%, ${color} 70%)`,
          boxShadow: highlight
            ? `0 0 ${28 * scale}px ${glowColor}, 0 0 ${60 * scale}px ${glowColor}80`
            : `0 0 ${16 * scale * glow}px ${glowColor}80`,
          border: highlight
            ? `2px solid ${THEME.accent}`
            : `1.5px solid rgba(255,255,255,0.4)`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          color: "white",
          fontSize: 12 * scale,
          fontWeight: 700,
          fontFamily: "Inter, system-ui, sans-serif",
          letterSpacing: 0.2,
        }}
      >
        {label}
      </div>
    </div>
  );
};

type BallProps = {
  x: number;
  y: number;
  scale?: number;
  trail?: number; // 0..1 intensity of trail
};

export const Ball: React.FC<BallProps> = ({ x, y, scale = 1, trail = 0 }) => {
  const r = 9 * scale;
  return (
    <div
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 30%, #ffffff 0%, #facc15 70%, #f59e0b 100%)`,
        boxShadow: `
          0 0 ${20 * scale + trail * 40}px ${THEME.ballGlow},
          0 0 ${40 * scale + trail * 80}px ${THEME.ballGlow}80,
          0 2px 4px rgba(0,0,0,0.6)
        `,
        border: "1.5px solid rgba(255,255,255,0.95)",
        pointerEvents: "none",
      }}
    />
  );
};
