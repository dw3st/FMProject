import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  staticFile,
} from "remotion";
import { LayoutGrid, Zap, Shield, ArrowDown, Compass } from "lucide-react";
import { ClubLogo } from "@game/GameInterface/Components/ClubLogo";
import { ScreenFrame } from "../components/ScreenFrame";
import { REAL_MADRID } from "../data/clubs";

const eo = Easing.bezier(0.16, 1, 0.3, 1);

// Pitch is rendered in normalised (0..1) coords inside an aspect 3/4 frame.
// Each tactic shifts the lineup by per-role deltas — values come from the
// engine's tactics-as-intents rules so the motion is engine-faithful.

type Tactic = "balanced" | "high_press" | "low_block";

const TACTIC_META: Record<Tactic, { label: string; icon: React.ComponentType<any>; tagline: string }> = {
  balanced:   { label: "Balanced",    icon: Compass, tagline: "Stay compact. React to play." },
  high_press: { label: "High Press",  icon: Zap,     tagline: "Win it high. Force the error." },
  low_block:  { label: "Low Block",   icon: Shield,  tagline: "Hold shape. Strike on the break." },
};

// Real Madrid 4-3-3 base slots in normalised pitch coords (0..1).
// x is along the attack axis (0 = own goal, 1 = opponent goal).
// y is left-to-right (0 = top, 1 = bottom).
const BASE_LINEUP: { name: string; role: string; pos: { x: number; y: number } }[] = [
  { name: "Courtois",       role: "GK",  pos: { x: 0.05, y: 0.50 } },
  { name: "Mendy",          role: "LB",  pos: { x: 0.22, y: 0.15 } },
  { name: "Militão",        role: "CB",  pos: { x: 0.20, y: 0.36 } },
  { name: "Alaba",          role: "CB",  pos: { x: 0.20, y: 0.64 } },
  { name: "Alexander-Arnold", role: "RB", pos: { x: 0.22, y: 0.85 } },
  { name: "Valverde",       role: "CDM", pos: { x: 0.36, y: 0.50 } },
  { name: "Bellingham",     role: "CM",  pos: { x: 0.48, y: 0.32 } },
  { name: "Güler",          role: "CAM", pos: { x: 0.50, y: 0.68 } },
  { name: "Vinícius",       role: "LW",  pos: { x: 0.72, y: 0.12 } },
  { name: "Mbappé",         role: "ST",  pos: { x: 0.78, y: 0.50 } },
  { name: "Rodrygo",        role: "RW",  pos: { x: 0.72, y: 0.88 } },
];

// Per-role x/y deltas per tactic. Values are normalised pitch coords.
const TACTIC_DELTAS: Record<Tactic, Record<string, { dx: number; dy: number }>> = {
  balanced: Object.fromEntries(BASE_LINEUP.map((p) => [p.role, { dx: 0, dy: 0 }])),
  high_press: {
    GK: { dx: 0.05, dy: 0 },
    LB: { dx: 0.12, dy: -0.02 },
    CB: { dx: 0.14, dy: 0 },
    RB: { dx: 0.12, dy: 0.02 },
    CDM: { dx: 0.10, dy: 0 },
    CM: { dx: 0.06, dy: 0 },
    CAM: { dx: 0.04, dy: 0 },
    LW: { dx: 0.05, dy: -0.02 },
    ST: { dx: 0.02, dy: 0 },
    RW: { dx: 0.05, dy: 0.02 },
  },
  low_block: {
    GK: { dx: -0.02, dy: 0 },
    LB: { dx: -0.07, dy: 0.05 },
    CB: { dx: -0.05, dy: 0 },
    RB: { dx: -0.07, dy: -0.05 },
    CDM: { dx: -0.06, dy: 0 },
    CM: { dx: -0.08, dy: 0.04 },
    CAM: { dx: -0.06, dy: -0.04 },
    LW: { dx: -0.08, dy: 0.06 },
    ST: { dx: -0.04, dy: 0 },
    RW: { dx: -0.08, dy: -0.06 },
  },
};

const tacticOrder: Tactic[] = ["balanced", "high_press", "low_block"];

export const FormationScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneOpacity = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const exitOpacity = interpolate(
    frame,
    [fps * 3.5, fps * 4.0],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // 3 tactical phases — players ease between them.
  // Tactic 0 from 0–1.3s, 1 from 1.3–2.6s, 2 from 2.6–3.9s
  const phase0Start = fps * 0.6;
  const phase1Start = fps * 1.9;
  const phase2Start = fps * 3.2;

  const activeTactic: Tactic =
    frame < phase1Start
      ? "balanced"
      : frame < phase2Start
        ? "high_press"
        : "low_block";

  // Lerp factors so motion is smooth between phases.
  const lerpToHighPress = interpolate(
    frame,
    [phase1Start - fps * 0.3, phase1Start + fps * 0.4],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: eo,
    },
  );
  const lerpToLowBlock = interpolate(
    frame,
    [phase2Start - fps * 0.3, phase2Start + fps * 0.4],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: eo,
    },
  );

  // Combine deltas: balanced → high_press for the first leg, then → low_block.
  const computePos = (role: string, base: { x: number; y: number }) => {
    const dHigh = TACTIC_DELTAS.high_press[role] ?? { dx: 0, dy: 0 };
    const dLow = TACTIC_DELTAS.low_block[role] ?? { dx: 0, dy: 0 };

    // Stage 1 lerp: balanced → high_press
    let x = base.x + dHigh.dx * lerpToHighPress;
    let y = base.y + dHigh.dy * lerpToHighPress;
    // Stage 2 lerp: high_press → low_block
    x = x + (dLow.dx - dHigh.dx) * lerpToLowBlock;
    y = y + (dLow.dy - dHigh.dy) * lerpToLowBlock;
    return { x, y };
  };

  return (
    <ScreenFrame
      navActive="formation"
      todayBadge={{ label: "vs Barcelona", kind: "match" }}
    >
      <AbsoluteFill style={{ opacity: sceneOpacity * exitOpacity }}>
        <div className="absolute inset-0 px-8 py-6 grid grid-cols-[260px_1fr_320px] gap-6">
          {/* LEFT — formation pick */}
          <LeftPanel frame={frame} fps={fps} />

          {/* CENTER — pitch */}
          <PitchPanel
            frame={frame}
            fps={fps}
            computePos={computePos}
          />

          {/* RIGHT — tactic chips */}
          <TacticPanel frame={frame} fps={fps} active={activeTactic} />
        </div>
      </AbsoluteFill>
    </ScreenFrame>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const LeftPanel: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const o = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const tx = interpolate(frame, [0, fps * 0.4], [-30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const formations = ["4-3-3", "4-4-2", "3-5-2", "4-2-3-1", "5-3-2", "4-1-4-1"];

  return (
    <div className="card-arcade rounded-xl p-5 flex flex-col gap-4" style={{ opacity: o, transform: `translateX(${tx}px)` }}>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg border-glow flex items-center justify-center p-1">
          <ClubLogo
            logoUrl={staticFile("logos/la_liga/real_madrid.svg")}
            primaryColor={REAL_MADRID.colors[0]}
            secondaryColor={REAL_MADRID.colors[1]}
            className="w-full h-full"
          />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Tactics for
          </div>
          <div className="font-display font-black uppercase tracking-wider text-base text-foreground">
            Real Madrid
          </div>
        </div>
      </div>

      <div className="h-px bg-border" />

      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
          Formation
        </div>
        <div className="grid grid-cols-3 gap-2">
          {formations.map((f) => (
            <div
              key={f}
              className={
                "rounded-lg py-2 text-center text-xs font-display font-bold uppercase tracking-wider " +
                (f === "4-3-3"
                  ? "card-arcade border-glow text-primary glow-text glow-primary-sm"
                  : "bg-secondary/40 text-muted-foreground")
              }
            >
              {f}
            </div>
          ))}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
          Width
        </div>
        <SegmentedControl options={["Narrow", "Normal", "Wide"]} active="Wide" />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
          Build-up
        </div>
        <SegmentedControl options={["Direct", "Balanced", "Possession"]} active="Possession" />
      </div>
    </div>
  );
};

const SegmentedControl: React.FC<{ options: string[]; active: string }> = ({ options, active }) => (
  <div className="flex gap-1 p-1 bg-secondary/40 rounded-lg">
    {options.map((o) => (
      <div
        key={o}
        className={
          "flex-1 text-center text-[10px] uppercase tracking-widest font-display font-bold py-1.5 rounded " +
          (o === active ? "card-arcade text-primary glow-text" : "text-muted-foreground")
        }
      >
        {o}
      </div>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

const PitchPanel: React.FC<{
  frame: number;
  fps: number;
  computePos: (role: string, base: { x: number; y: number }) => { x: number; y: number };
}> = ({ frame, fps, computePos }) => {
  // Bounds — leaving headroom for the legend.
  const W = 800;
  const H = W * 0.66; // looks good in 16:9 frame.

  const sceneIn = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  return (
    <div className="card-arcade rounded-xl p-6 flex flex-col items-center justify-center gap-3" style={{ opacity: sceneIn }}>
      <h2 className="font-display font-black uppercase tracking-wider text-xl text-foreground m-0 flex items-center gap-2 self-start">
        <LayoutGrid className="w-5 h-5 text-primary glow-text" />
        4–3–3 · Real Madrid
      </h2>

      <div
        className="relative rounded-xl overflow-hidden border-glow"
        style={{
          width: W,
          height: H,
          background:
            "linear-gradient(180deg, oklch(0.27 0.10 145) 0%, oklch(0.20 0.09 145) 100%)",
        }}
      >
        {/* Grass stripes */}
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 80px)",
          }}
        />

        {/* Pitch lines */}
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0">
          <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2">
            <rect x="3" y="3" width={W - 6} height={H - 6} rx="6" />
            <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
            <circle cx={W / 2} cy={H / 2} r={H * 0.12} />
            <circle cx={W / 2} cy={H / 2} r="3" fill="rgba(255,255,255,0.55)" />

            {/* Left penalty box */}
            <rect x={0} y={H * 0.25} width={W * 0.16} height={H * 0.5} />
            <rect x={0} y={H * 0.36} width={W * 0.06} height={H * 0.28} />

            {/* Right penalty box */}
            <rect x={W - W * 0.16} y={H * 0.25} width={W * 0.16} height={H * 0.5} />
            <rect x={W - W * 0.06} y={H * 0.36} width={W * 0.06} height={H * 0.28} />
          </g>
        </svg>

        {/* Players */}
        {BASE_LINEUP.map((p, i) => {
          const target = computePos(p.role, p.pos);
          const start = fps * 0.2 + i * 1.5;
          const inO = interpolate(frame, [start, start + fps * 0.4], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: eo,
          });
          return (
            <PlayerDot
              key={p.name}
              name={p.name}
              role={p.role}
              x={target.x * W}
              y={target.y * H}
              opacity={inO}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between w-full text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>Own goal</span>
        <span className="flex items-center gap-2 text-primary glow-text">
          <ArrowDown className="w-3 h-3 -rotate-90" />
          Direction of play
        </span>
        <span>Opp goal</span>
      </div>
    </div>
  );
};

const PlayerDot: React.FC<{
  name: string;
  role: string;
  x: number;
  y: number;
  opacity: number;
}> = ({ name, role, x, y, opacity }) => {
  const isGK = role === "GK";
  const dotSize = 32;

  return (
    <div
      style={{
        position: "absolute",
        left: x - dotSize / 2,
        top: y - dotSize / 2,
        opacity,
        // CSS transition replaces frame-by-frame redraw — but Remotion forbids
        // CSS transitions. Instead the parent's `computePos` is already lerped
        // per-frame, so the dot is at the right place every frame.
      }}
      className="flex flex-col items-center"
    >
      <div
        className="rounded-full flex items-center justify-center font-display font-black text-[10px] uppercase tracking-wider glow-primary-sm"
        style={{
          width: dotSize,
          height: dotSize,
          background: isGK ? "#FEBE10" : "#FFFFFF",
          color: isGK ? "#0a0a0a" : "#0a3d2b",
          border: "2px solid oklch(0.40 0.08 var(--team-hue))",
        }}
      >
        {role}
      </div>
      <div
        className="text-[9px] font-display font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-1 whitespace-nowrap"
        style={{
          background: "rgba(0,0,0,0.6)",
          color: "rgba(255,255,255,0.95)",
        }}
      >
        {name}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const TacticPanel: React.FC<{
  frame: number;
  fps: number;
  active: Tactic;
}> = ({ frame, fps, active }) => {
  const o = interpolate(frame, [fps * 0.1, fps * 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const tx = interpolate(frame, [fps * 0.1, fps * 0.5], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  return (
    <div
      className="card-arcade rounded-xl p-5 flex flex-col gap-4"
      style={{ opacity: o, transform: `translateX(${tx}px)` }}
    >
      <h3 className="font-display font-black uppercase tracking-wider text-sm text-foreground m-0">
        Pressing Style
      </h3>

      <div className="flex flex-col gap-2">
        {tacticOrder.map((t) => {
          const meta = TACTIC_META[t];
          const Icon = meta.icon;
          const isActive = t === active;
          return (
            <div
              key={t}
              className={
                "card-arcade rounded-lg p-3 flex items-center gap-3 " +
                (isActive ? "border-glow glow-primary-sm" : "")
              }
              style={{ opacity: isActive ? 1 : 0.6 }}
            >
              <div
                className={
                  "w-10 h-10 rounded-lg flex items-center justify-center " +
                  (isActive
                    ? "bg-primary/15 border border-primary/30"
                    : "bg-secondary/40 border border-border")
                }
              >
                <Icon className={isActive ? "w-5 h-5 text-primary" : "w-5 h-5 text-muted-foreground"} />
              </div>
              <div className="flex-1">
                <div
                  className={
                    "text-sm font-display font-black uppercase tracking-wider " +
                    (isActive ? "text-foreground glow-text" : "text-muted-foreground")
                  }
                >
                  {meta.label}
                </div>
                <div className="text-[10px] text-muted-foreground italic mt-0.5">
                  {meta.tagline}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card-arcade border-glow rounded-lg p-3 mt-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Current Intent
        </div>
        <div className="text-sm font-display font-black text-primary glow-text uppercase tracking-wider">
          {TACTIC_META[active].label}
        </div>
        <div className="text-[11px] text-muted-foreground italic mt-1">
          Players shift live as the tactic changes.
        </div>
      </div>
    </div>
  );
};
