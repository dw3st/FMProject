import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { Pitch, yardToPx } from "../components/Pitch";
import { PlayerDot } from "../components/PlayerDot";
import { THEME } from "../theme";

type FormationSlot = {
  role: string;
  x: number; // yards
  y: number; // yards
};

// 4-3-3 formation for Team A (attacking right).
const FORMATION_A: FormationSlot[] = [
  { role: "GK", x: 5, y: 37 },
  { role: "LB", x: 18, y: 11 },
  { role: "CB", x: 22, y: 28 },
  { role: "CB", x: 22, y: 46 },
  { role: "RB", x: 18, y: 63 },
  { role: "CDM", x: 38, y: 37 },
  { role: "CM", x: 50, y: 24 },
  { role: "CM", x: 50, y: 50 },
  { role: "LW", x: 70, y: 8 },
  { role: "RW", x: 70, y: 66 },
  { role: "ST", x: 80, y: 37 },
];

// Mirror onto Team B (attacking left, so x' = 115 - x).
const FORMATION_B: FormationSlot[] = FORMATION_A.map((s) => ({
  role: s.role,
  x: 115 - s.x,
  y: s.y,
}));

export const PitchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const eo = Easing.bezier(0.16, 1, 0.3, 1);

  // 1) Pitch reveal — outlines and inner shapes draw on.
  const reveal = interpolate(frame, [0, fps * 1.4], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: eo,
  });

  // 2) Players cascade in shortly after pitch starts to appear.
  const playerStaggerStart = fps * 0.7;
  const playerStaggerStep = 1.6;
  const playerInDuration = fps * 0.45;

  // 3) Subtle camera "settle" — scale starts slightly larger, eases to 1.
  const camScale = interpolate(frame, [0, fps * 2.5], [1.08, 1.0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: eo,
  });

  // Formation label fades in near the end.
  const labelOpacity = interpolate(
    frame,
    [fps * 1.8, fps * 2.4],
    [0, 1],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: eo },
  );

  // Exit fade.
  const exitOpacity = interpolate(
    frame,
    [fps * 3.0, fps * 3.5],
    [1, 0],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        background: THEME.bgDeep,
        opacity: exitOpacity,
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          transform: `scale(${camScale})`,
          transformOrigin: "center center",
        }}
      >
        <Pitch reveal={reveal} />

        {/* Team A players */}
        {FORMATION_A.map((slot, i) => {
          const start = playerStaggerStart + i * playerStaggerStep;
          const p = interpolate(
            frame,
            [start, start + playerInDuration],
            [0, 1],
            {
              extrapolateRight: "clamp",
              extrapolateLeft: "clamp",
              easing: eo,
            },
          );
          if (p <= 0) return null;
          const { x, y } = yardToPx(slot.x, slot.y);
          return (
            <div
              key={`A-${i}`}
              style={{ position: "absolute", opacity: p, transform: `scale(${p})`, transformOrigin: `${x}px ${y}px` }}
            >
              <PlayerDot x={x} y={y} team="A" scale={1.0} glow={p} />
            </div>
          );
        })}

        {/* Team B players (slightly later for staggered feel) */}
        {FORMATION_B.map((slot, i) => {
          const start = playerStaggerStart + i * playerStaggerStep + 4;
          const p = interpolate(
            frame,
            [start, start + playerInDuration],
            [0, 1],
            {
              extrapolateRight: "clamp",
              extrapolateLeft: "clamp",
              easing: eo,
            },
          );
          if (p <= 0) return null;
          const { x, y } = yardToPx(slot.x, slot.y);
          return (
            <div
              key={`B-${i}`}
              style={{ position: "absolute", opacity: p, transform: `scale(${p})`, transformOrigin: `${x}px ${y}px` }}
            >
              <PlayerDot x={x} y={y} team="B" scale={1.0} glow={p} />
            </div>
          );
        })}
      </AbsoluteFill>

      {/* Formation labels */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 80,
          opacity: labelOpacity,
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 24,
          letterSpacing: "0.3em",
          color: THEME.text,
          textTransform: "uppercase",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: THEME.teamA,
              boxShadow: `0 0 16px ${THEME.teamA}`,
            }}
          />
          <span>4 — 3 — 3</span>
        </div>
        <div
          style={{
            width: 1,
            height: 28,
            background: THEME.textMuted,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span>4 — 3 — 3</span>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: THEME.teamB,
              boxShadow: `0 0 16px ${THEME.teamB}`,
            }}
          />
        </div>
      </div>

      {/* Tactic banner at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: labelOpacity,
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: "0.5em",
          color: THEME.accent,
          textTransform: "uppercase",
        }}
      >
        Formations · Tactics · Intents
      </div>
    </AbsoluteFill>
  );
};
