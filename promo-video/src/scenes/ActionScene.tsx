import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { Pitch, yardToPx } from "../components/Pitch";
import { PlayerDot, Ball } from "../components/PlayerDot";
import { THEME } from "../theme";

// Stylised attacking sequence: CB → CM → through-ball to ST → shot → goal.
// Coordinates are pitch yards (115 × 74). Team A attacks right.

const KEYFRAMES = {
  cb: { x: 28, y: 37 },
  cm: { x: 55, y: 32 },
  st: { x: 95, y: 36 },
  goal: { x: 115, y: 37 },
};

const DEFENDERS = [
  { x: 88, y: 30 },
  { x: 90, y: 44 },
  { x: 78, y: 22 },
  { x: 80, y: 52 },
  { x: 109, y: 37, isGK: true },
];

// Sub-timings (seconds, relative to scene start).
const SEG = {
  pass1Start: 0.2, // CB → CM
  pass1End: 1.0,
  pass2Start: 1.1, // CM → ST (through ball)
  pass2End: 2.2,
  shotStart: 2.35,
  shotEnd: 2.95,
  goalFlash: 3.0,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const segT = (now: number, start: number, end: number) =>
  Math.max(0, Math.min(1, (now - start) / (end - start)));

export const ActionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const eo = Easing.bezier(0.16, 1, 0.3, 1);
  const eoStrong = Easing.bezier(0.2, 0.8, 0.2, 1);

  // Ball position by phase. Defaults to CB before sequence kicks off.
  let ball = { ...KEYFRAMES.cb };
  let ballScale = 1.0;
  let ballTrail = 0;

  if (t < SEG.pass1Start) {
    ball = KEYFRAMES.cb;
  } else if (t < SEG.pass1End) {
    const k = eo(segT(t, SEG.pass1Start, SEG.pass1End));
    ball.x = lerp(KEYFRAMES.cb.x, KEYFRAMES.cm.x, k);
    ball.y = lerp(KEYFRAMES.cb.y, KEYFRAMES.cm.y, k);
    ballTrail = 0.4;
  } else if (t < SEG.pass2Start) {
    ball = KEYFRAMES.cm;
  } else if (t < SEG.pass2End) {
    const k = eoStrong(segT(t, SEG.pass2Start, SEG.pass2End));
    ball.x = lerp(KEYFRAMES.cm.x, KEYFRAMES.st.x, k);
    ball.y = lerp(KEYFRAMES.cm.y, KEYFRAMES.st.y, k);
    ballTrail = 0.85; // through ball — bigger streak
    ballScale = 1.1;
  } else if (t < SEG.shotStart) {
    ball = KEYFRAMES.st;
  } else if (t < SEG.shotEnd) {
    const k = eoStrong(segT(t, SEG.shotStart, SEG.shotEnd));
    ball.x = lerp(KEYFRAMES.st.x, KEYFRAMES.goal.x, k);
    ball.y = lerp(KEYFRAMES.st.y, KEYFRAMES.goal.y, k);
    ballTrail = 1.0;
    ballScale = 1.2;
  } else {
    ball = KEYFRAMES.goal;
    ballScale = 0;
  }

  // Goal flash intensity.
  const flash =
    t > SEG.goalFlash
      ? interpolate(t, [SEG.goalFlash, SEG.goalFlash + 0.25, SEG.goalFlash + 1.2], [0, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;

  // "GOAL!" text after the flash.
  const goalTextProgress =
    t > SEG.goalFlash
      ? interpolate(t, [SEG.goalFlash + 0.05, SEG.goalFlash + 0.55], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: eo,
        })
      : 0;

  // Camera punch on goal.
  const camScale =
    t > SEG.goalFlash
      ? interpolate(
          t,
          [SEG.goalFlash - 0.05, SEG.goalFlash + 0.15, SEG.goalFlash + 1.6],
          [1.0, 1.06, 1.02],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: eo },
        )
      : 1.0;

  // Pre-action camera nudge tracking the ball.
  const camPanProgress = Math.min(1, t / 2.0);
  const camPanX = lerp(0, -40, eo(camPanProgress));

  // Render players (Team A — attackers).
  const attackers = [
    { ...KEYFRAMES.cb, role: "CB", isCarrier: t < SEG.pass1End },
    { ...KEYFRAMES.cm, role: "CM", isCarrier: t >= SEG.pass1End && t < SEG.pass2End },
    { ...KEYFRAMES.st, role: "ST", isCarrier: t >= SEG.pass2End && t < SEG.shotEnd },
  ];

  // Through-ball trail line (CM → ST).
  const showTBLine = t >= SEG.pass2Start && t < SEG.pass2End + 0.4;
  const tbLineProgress = showTBLine
    ? eo(segT(t, SEG.pass2Start, SEG.pass2End))
    : 0;
  const tbLineFade = showTBLine
    ? 1 - segT(t, SEG.pass2End, SEG.pass2End + 0.4)
    : 0;

  // Shot streak line.
  const showShot = t >= SEG.shotStart && t < SEG.shotEnd + 0.2;
  const shotProgress = showShot ? eoStrong(segT(t, SEG.shotStart, SEG.shotEnd)) : 0;

  // Compute screen positions.
  const cmPx = yardToPx(KEYFRAMES.cm.x, KEYFRAMES.cm.y);
  const stPx = yardToPx(KEYFRAMES.st.x, KEYFRAMES.st.y);
  const goalPx = yardToPx(KEYFRAMES.goal.x, KEYFRAMES.goal.y);
  const ballPx = yardToPx(ball.x, ball.y);

  // Scene fade.
  const sceneOpacity = interpolate(
    frame,
    [0, fps * 0.3, fps * 3.8, fps * 4.2],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ background: THEME.bgDeep, opacity: sceneOpacity }}>
      <AbsoluteFill
        style={{
          transform: `translateX(${camPanX}px) scale(${camScale})`,
          transformOrigin: "60% 50%",
        }}
      >
        <Pitch reveal={1} />

        {/* Defenders (Team B) */}
        {DEFENDERS.map((d, i) => {
          const { x, y } = yardToPx(d.x, d.y);
          return (
            <PlayerDot
              key={`def-${i}`}
              x={x}
              y={y}
              team="B"
              scale={d.isGK ? 1.1 : 1.0}
              label={d.isGK ? "GK" : undefined}
              glow={0.6}
            />
          );
        })}

        {/* Through-ball lane indicator */}
        {showTBLine && (
          <svg
            width={1920}
            height={1080}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            <defs>
              <linearGradient id="tbGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={THEME.accent} stopOpacity="0" />
                <stop offset="50%" stopColor={THEME.accent} stopOpacity="0.95" />
                <stop offset="100%" stopColor={THEME.accent} stopOpacity="0" />
              </linearGradient>
            </defs>
            <line
              x1={cmPx.x}
              y1={cmPx.y}
              x2={lerp(cmPx.x, stPx.x, tbLineProgress)}
              y2={lerp(cmPx.y, stPx.y, tbLineProgress)}
              stroke="url(#tbGrad)"
              strokeWidth={5}
              strokeLinecap="round"
              opacity={tbLineFade}
            />
            {/* Target ring at the destination */}
            <circle
              cx={stPx.x}
              cy={stPx.y}
              r={28 + 12 * (1 - tbLineProgress)}
              fill="none"
              stroke={THEME.accent}
              strokeWidth={2}
              opacity={tbLineFade * 0.7}
              strokeDasharray="4 6"
            />
          </svg>
        )}

        {/* Shot streak */}
        {showShot && (
          <svg
            width={1920}
            height={1080}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            <line
              x1={stPx.x}
              y1={stPx.y}
              x2={lerp(stPx.x, goalPx.x, shotProgress)}
              y2={lerp(stPx.y, goalPx.y, shotProgress)}
              stroke={THEME.ballGlow}
              strokeWidth={6}
              strokeLinecap="round"
              opacity={0.9}
            />
          </svg>
        )}

        {/* Attackers (Team A) */}
        {attackers.map((p, i) => {
          const { x, y } = yardToPx(p.x, p.y);
          return (
            <PlayerDot
              key={`atk-${i}`}
              x={x}
              y={y}
              team="A"
              label={p.role}
              scale={p.isCarrier ? 1.15 : 1.0}
              glow={p.isCarrier ? 1 : 0.6}
              highlight={p.isCarrier}
            />
          );
        })}

        {/* Ball */}
        {ballScale > 0 && (
          <Ball x={ballPx.x} y={ballPx.y} scale={ballScale} trail={ballTrail} />
        )}

        {/* Goal flash overlay */}
        {flash > 0 && (
          <AbsoluteFill
            style={{
              background: `radial-gradient(circle at ${goalPx.x}px ${goalPx.y}px, ${THEME.accent}aa 0%, ${THEME.accent}00 50%)`,
              opacity: flash,
              mixBlendMode: "screen",
            }}
          />
        )}
      </AbsoluteFill>

      {/* "GOAL" overlay text on top of camera-punched view */}
      {goalTextProgress > 0 && (
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 280,
              letterSpacing: "0.04em",
              color: THEME.accent,
              textShadow: `
                0 0 30px ${THEME.accent}aa,
                0 0 80px ${THEME.accent}66,
                0 12px 40px rgba(0,0,0,0.7)
              `,
              opacity: goalTextProgress,
              transform: `scale(${0.7 + goalTextProgress * 0.3})`,
              WebkitTextStroke: `2px ${THEME.text}`,
            }}
          >
            GOAL!
          </div>
        </AbsoluteFill>
      )}

      {/* Bottom subtitle */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: "0.5em",
          color: THEME.textMuted,
          textTransform: "uppercase",
          opacity: interpolate(frame, [fps * 0.4, fps * 0.9], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Through Balls · Off-Ball Runs · xG-Based Shots
      </div>
    </AbsoluteFill>
  );
};
