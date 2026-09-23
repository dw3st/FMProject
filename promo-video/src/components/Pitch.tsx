import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";
import { PITCH, THEME, pitchDimsPx } from "../theme";

type PitchProps = {
  // 0 → completely hidden, 1 → fully drawn
  reveal?: number;
};

// Top-down tactical pitch. All measurements come from the TouchLines engine
// constants (PITCH.lengthYd × PITCH.widthYd in yards) and are converted
// to pixels via PITCH.scale.
export const Pitch: React.FC<PitchProps> = ({ reveal = 1 }) => {
  const frame = useCurrentFrame();
  const dims = pitchDimsPx();
  const s = PITCH.scale;

  // Slow subtle grass shimmer.
  const shimmer = Math.sin(frame / 40) * 0.04 + 0.96;

  // Animated stroke draw for the outer line.
  const drawTrigger = interpolate(reveal, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const linePerimeter = 2 * (dims.w + dims.h);
  const dashOffset = (1 - drawTrigger) * linePerimeter;

  // Penalty box (18 yds × 44 yds), centred on the goal line in y.
  const pbDepth = 18 * s;
  const pbWidth = 44 * s;
  const pbY = (dims.h - pbWidth) / 2;

  // Six-yard box (6 yds × 20 yds).
  const sbDepth = 6 * s;
  const sbWidth = 20 * s;
  const sbY = (dims.h - sbWidth) / 2;

  // Centre circle (10 yds radius).
  const ccR = 10 * s;

  // Goals — 8 yds wide.
  const goalWidth = 8 * s;
  const goalY = (dims.h - goalWidth) / 2;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        background: THEME.bgDeep,
      }}
    >
      <div
        style={{
          width: dims.w,
          height: dims.h,
          position: "relative",
          background: `
            radial-gradient(ellipse at center, ${THEME.pitch} 0%, ${THEME.pitchDark} 100%)
          `,
          filter: `brightness(${shimmer})`,
          borderRadius: 6,
          boxShadow:
            "0 40px 80px rgba(0,0,0,0.7), inset 0 0 120px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        {/* Grass stripes */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `repeating-linear-gradient(
              90deg,
              rgba(255,255,255,0.03) 0px,
              rgba(255,255,255,0.03) ${10 * s}px,
              rgba(0,0,0,0.04) ${10 * s}px,
              rgba(0,0,0,0.04) ${20 * s}px
            )`,
          }}
        />

        <svg
          width={dims.w}
          height={dims.h}
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          style={{ position: "absolute", inset: 0 }}
        >
          {/* Outer touchline with animated draw */}
          <rect
            x={2}
            y={2}
            width={dims.w - 4}
            height={dims.h - 4}
            fill="none"
            stroke={THEME.pitchLine}
            strokeWidth={3}
            strokeDasharray={linePerimeter}
            strokeDashoffset={dashOffset}
          />

          {/* Halfway line */}
          <line
            x1={dims.w / 2}
            y1={0}
            x2={dims.w / 2}
            y2={dims.h}
            stroke={THEME.pitchLine}
            strokeWidth={3}
            opacity={drawTrigger}
          />

          {/* Centre circle */}
          <circle
            cx={dims.w / 2}
            cy={dims.h / 2}
            r={ccR}
            fill="none"
            stroke={THEME.pitchLine}
            strokeWidth={3}
            opacity={drawTrigger}
          />
          <circle
            cx={dims.w / 2}
            cy={dims.h / 2}
            r={3}
            fill={THEME.pitchLine}
            opacity={drawTrigger}
          />

          {/* Left penalty area */}
          <rect
            x={0}
            y={pbY}
            width={pbDepth}
            height={pbWidth}
            fill="none"
            stroke={THEME.pitchLine}
            strokeWidth={3}
            opacity={drawTrigger}
          />
          <rect
            x={0}
            y={sbY}
            width={sbDepth}
            height={sbWidth}
            fill="none"
            stroke={THEME.pitchLine}
            strokeWidth={3}
            opacity={drawTrigger}
          />
          {/* Left goal */}
          <rect
            x={-6}
            y={goalY}
            width={6}
            height={goalWidth}
            fill={THEME.pitchLine}
            opacity={drawTrigger}
          />
          {/* Left penalty spot */}
          <circle
            cx={12 * s}
            cy={dims.h / 2}
            r={2}
            fill={THEME.pitchLine}
            opacity={drawTrigger}
          />

          {/* Right penalty area */}
          <rect
            x={dims.w - pbDepth}
            y={pbY}
            width={pbDepth}
            height={pbWidth}
            fill="none"
            stroke={THEME.pitchLine}
            strokeWidth={3}
            opacity={drawTrigger}
          />
          <rect
            x={dims.w - sbDepth}
            y={sbY}
            width={sbDepth}
            height={sbWidth}
            fill="none"
            stroke={THEME.pitchLine}
            strokeWidth={3}
            opacity={drawTrigger}
          />
          {/* Right goal */}
          <rect
            x={dims.w}
            y={goalY}
            width={6}
            height={goalWidth}
            fill={THEME.pitchLine}
            opacity={drawTrigger}
          />
          {/* Right penalty spot */}
          <circle
            cx={dims.w - 12 * s}
            cy={dims.h / 2}
            r={2}
            fill={THEME.pitchLine}
            opacity={drawTrigger}
          />
        </svg>
      </div>
    </AbsoluteFill>
  );
};

// Helper for child components: convert pitch yards to absolute on-screen px.
export const yardToPx = (xYd: number, yYd: number) => {
  const dims = pitchDimsPx();
  // Centre the pitch inside the 1920x1080 canvas.
  const offsetX = (1920 - dims.w) / 2;
  const offsetY = (1080 - dims.h) / 2;
  return {
    x: offsetX + xYd * PITCH.scale,
    y: offsetY + yYd * PITCH.scale,
  };
};

// Easing helper used across scenes.
export const easeOut = (t: number) =>
  Easing.bezier(0.16, 1, 0.3, 1)(Math.min(1, Math.max(0, t)));
