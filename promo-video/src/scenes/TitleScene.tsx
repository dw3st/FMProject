import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { THEME } from "../theme";

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const eo = Easing.bezier(0.16, 1, 0.3, 1);

  // Background pulse — a slow expanding radial behind the logo.
  const bgPulse = interpolate(frame, [0, fps * 2], [0.2, 1.1], {
    extrapolateRight: "clamp",
    easing: eo,
  });

  // Logo letter-by-letter reveal.
  const word = "TOUCHLINES";
  const letterDelay = 3; // frames between letters
  const wordLockedAt = letterDelay * word.length + 12;

  const subtitleOpacity = interpolate(
    frame,
    [wordLockedAt, wordLockedAt + fps * 0.6],
    [0, 1],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: eo },
  );

  const tagY = interpolate(
    frame,
    [wordLockedAt, wordLockedAt + fps * 0.6],
    [16, 0],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: eo },
  );

  // Outro fade-out at end of scene.
  const exitOpacity = interpolate(
    frame,
    [fps * 2.0, fps * 2.5],
    [1, 0],
    { extrapolateRight: "clamp", extrapolateLeft: "clamp" },
  );

  // Line above & below.
  const lineProgress = interpolate(frame, [fps * 0.3, fps * 1.2], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
    easing: eo,
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, ${THEME.bg} 0%, ${THEME.bgDeep} 70%)`,
        opacity: exitOpacity,
        overflow: "hidden",
      }}
    >
      {/* Background expanding ring */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 1000 * bgPulse,
          height: 1000 * bgPulse,
          marginLeft: -500 * bgPulse,
          marginTop: -500 * bgPulse,
          borderRadius: "50%",
          border: `1px solid ${THEME.accent}30`,
          opacity: interpolate(bgPulse, [0.2, 1.1], [0, 0.4]),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 600 * bgPulse,
          height: 600 * bgPulse,
          marginLeft: -300 * bgPulse,
          marginTop: -300 * bgPulse,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${THEME.accent}18 0%, transparent 70%)`,
        }}
      />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Top horizontal accent line */}
        <div
          style={{
            width: 700 * lineProgress,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${THEME.accent}, transparent)`,
            marginBottom: 18,
          }}
        />

        {/* Main wordmark */}
        <div
          style={{
            display: "flex",
            fontFamily:
              "'Inter', 'Helvetica Neue', Helvetica, system-ui, sans-serif",
            fontWeight: 900,
            fontSize: 168,
            letterSpacing: "0.06em",
            color: THEME.text,
            lineHeight: 1,
            textShadow: `0 4px 40px ${THEME.accent}40`,
          }}
        >
          {word.split("").map((ch, i) => {
            const start = i * letterDelay;
            const letterOpacity = interpolate(
              frame,
              [start, start + 14],
              [0, 1],
              { extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: eo },
            );
            const letterY = interpolate(frame, [start, start + 14], [40, 0], {
              extrapolateRight: "clamp",
              extrapolateLeft: "clamp",
              easing: eo,
            });
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  opacity: letterOpacity,
                  transform: `translateY(${letterY}px)`,
                  color: ch === "L" ? THEME.accent : THEME.text,
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>

        {/* Bottom horizontal accent line */}
        <div
          style={{
            width: 700 * lineProgress,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${THEME.accent}, transparent)`,
            marginTop: 18,
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            opacity: subtitleOpacity,
            transform: `translateY(${tagY}px)`,
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: 500,
            fontSize: 28,
            letterSpacing: "0.4em",
            textTransform: "uppercase",
            color: THEME.textMuted,
            marginTop: 24,
          }}
        >
          A Tactical Football Simulator
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
