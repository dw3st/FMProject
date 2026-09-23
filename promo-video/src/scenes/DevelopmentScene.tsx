import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { TrendingUp, ArrowUp, ArrowRight, Sparkles, Award } from "lucide-react";
import { ScreenFrame } from "../components/ScreenFrame";
import { REAL_MADRID } from "../data/clubs";

const eo = Easing.bezier(0.16, 1, 0.3, 1);

// We feature Franco Mastantuono — the 18-year-old forward, classic "young
// star" beat. His real stats come from the extracted Real Madrid roster.
const SUBJECT_NAME = "Franco Mastantuono";

export const DevelopmentScene: React.FC = () => {
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

  const subject =
    REAL_MADRID.starting11.find((p) => p.name === SUBJECT_NAME) ??
    REAL_MADRID.bench.find((p) => p.name === SUBJECT_NAME) ??
    REAL_MADRID.starting11[8]; // fallback to the natural FW slot

  const otherPlayers = REAL_MADRID.starting11.filter((p) => p.name !== SUBJECT_NAME);

  return (
    <ScreenFrame
      navActive="development"
      todayBadge={{ label: "Training", kind: "training" }}
    >
      <AbsoluteFill style={{ opacity: sceneOpacity * exitOpacity }}>
        <div className="absolute inset-0 px-8 py-6 grid grid-cols-[320px_1fr_280px] gap-6">
          {/* LEFT — player profile */}
          <ProfileCard frame={frame} fps={fps} subject={subject} />

          {/* CENTER — animated attribute bars */}
          <AttributesPanel frame={frame} fps={fps} subject={subject} />

          {/* RIGHT — player selector */}
          <PlayerSelector frame={frame} fps={fps} others={otherPlayers} subjectName={subject.name} />
        </div>
      </AbsoluteFill>
    </ScreenFrame>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const ProfileCard: React.FC<{
  frame: number;
  fps: number;
  subject: (typeof REAL_MADRID)["starting11"][number];
}> = ({ frame, fps, subject }) => {
  const opacity = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const tx = interpolate(frame, [0, fps * 0.4], [-30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  // The "+0.4 PASSING" feedback chip — pops in halfway through the scene.
  const chipIn = interpolate(frame, [fps * 1.6, fps * 1.95], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const chipScale = interpolate(frame, [fps * 1.6, fps * 1.95], [0.6, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
  });

  return (
    <div
      className="card-arcade rounded-xl p-6 flex flex-col gap-4 relative"
      style={{ opacity, transform: `translateX(${tx}px)` }}
    >
      {/* Pop chip — Δ on an attribute */}
      <div
        className="absolute -top-3 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-display font-black uppercase tracking-wider glow-primary"
        style={{ opacity: chipIn, transform: `scale(${chipScale})` }}
      >
        <ArrowUp className="w-3 h-3" />
        +0.4 Passing
      </div>

      <div className="flex flex-col items-center gap-4">
        {/* Player initials avatar — clearly about the PLAYER, not the team */}
        <div
          className="w-28 h-28 rounded-full border-glow flex items-center justify-center font-display font-black text-foreground glow-primary-sm"
          style={{
            fontSize: 44,
            letterSpacing: "0.02em",
            background:
              "radial-gradient(circle at 35% 30%, oklch(0.30 0.06 var(--team-hue)) 0%, oklch(0.16 0.03 var(--team-hue)) 100%)",
            border: "2px solid oklch(0.55 0.12 var(--team-hue))",
          }}
        >
          {subject.name
            .split(" ")
            .map((s) => s[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </div>

        {/* Player name — the headline of this card */}
        <div className="text-center">
          <div className="font-display font-black uppercase tracking-wider text-2xl text-foreground leading-tight">
            {subject.name}
          </div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-primary glow-text mt-2">
            {subject.profile.archetype}
          </div>
        </div>

        {/* Tiny meta strip — club is supporting info only */}
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>#30</span>
          <span>·</span>
          <span>{REAL_MADRID.name}</span>
          <span>·</span>
          <span>{subject.preferredFoot} foot</span>
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="grid grid-cols-2 gap-3">
        <ProfileStat label="Age" value={subject.age.toString()} />
        <ProfileStat label="Phase" value="Developing" />
        <ProfileStat label="Foot" value={subject.preferredFoot} />
        <ProfileStat label="Rating" value={(subject.rating * 1.4 + 4.5).toFixed(1)} />
      </div>

      <div className="h-px bg-border" />

      {/* Sparkline trend */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
          Recent Form
        </div>
        <TrendSparkline frame={frame} fps={fps} />
      </div>

      <div className="text-xs text-muted-foreground italic leading-relaxed mt-1">
        Young and developing well. Regular playing time is accelerating
        growth in key areas.
      </div>
    </div>
  );
};

const ProfileStat: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="card-arcade rounded-lg p-3">
    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
      {label}
    </div>
    <div className="text-base font-display font-black text-foreground capitalize">
      {value}
    </div>
  </div>
);

const TrendSparkline: React.FC<{ frame: number; fps: number }> = ({
  frame,
  fps,
}) => {
  // Last 5 rating values, drawn as a connected line.
  const ratings = [6.4, 7.1, 6.8, 7.5, 8.2];
  const W = 220;
  const H = 50;
  const max = 9;
  const min = 5;

  const drawProgress = interpolate(frame, [fps * 0.5, fps * 1.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  const points = ratings.map((r, i) => {
    const x = (i / (ratings.length - 1)) * W;
    const y = H - ((r - min) / (max - min)) * H;
    return { x, y };
  });

  const pathLen = ratings.length * 60;
  const dashOffset = (1 - drawProgress) * pathLen;
  const visibleCount = Math.ceil(drawProgress * ratings.length);

  return (
    <svg width={W} height={H + 20} viewBox={`0 0 ${W} ${H + 20}`}>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.75 0.18 var(--team-hue))" stopOpacity="0.4" />
          <stop offset="100%" stopColor="oklch(0.75 0.18 var(--team-hue))" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Fill area */}
      <path
        d={
          `M ${points[0]!.x} ${H}` +
          points.map((p) => ` L ${p.x} ${p.y}`).join("") +
          ` L ${points[points.length - 1]!.x} ${H} Z`
        }
        fill="url(#sparkFill)"
        opacity={drawProgress}
      />

      {/* Line */}
      <path
        d={`M ${points[0]!.x} ${points[0]!.y}` +
          points.slice(1).map((p) => ` L ${p.x} ${p.y}`).join("")}
        fill="none"
        stroke="oklch(0.75 0.18 var(--team-hue))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={pathLen}
        strokeDashoffset={dashOffset}
      />

      {/* Dots */}
      {points.slice(0, visibleCount).map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === ratings.length - 1 ? 4 : 2.5}
          fill={i === ratings.length - 1 ? "oklch(0.85 0.20 var(--team-hue))" : "oklch(0.75 0.18 var(--team-hue))"}
        />
      ))}

      {/* Latest value */}
      <text
        x={points[points.length - 1]!.x - 18}
        y={points[points.length - 1]!.y - 8}
        fill="oklch(0.95 0 0)"
        fontSize="11"
        fontWeight="800"
        opacity={drawProgress}
      >
        {ratings[ratings.length - 1]!.toFixed(1)}
      </text>
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const AttributesPanel: React.FC<{
  frame: number;
  fps: number;
  subject: (typeof REAL_MADRID)["starting11"][number];
}> = ({ frame, fps, subject }) => {
  const sceneOpacity = interpolate(frame, [fps * 0.15, fps * 0.55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  // Visible attributes for a forward.
  const attrs: { label: string; value: number; focus: "primary" | "secondary" | "limited" }[] = [
    { label: "Finishing",    value: subject.stats.finishing,    focus: "primary" },
    { label: "Dribbling",    value: subject.stats.dribbling,    focus: "primary" },
    { label: "Speed",        value: subject.stats.speed,        focus: "primary" },
    { label: "Acceleration", value: subject.stats.acceleration, focus: "primary" },
    { label: "Vision",       value: subject.stats.vision,       focus: "secondary" },
    { label: "Passing",      value: subject.stats.passing,      focus: "secondary" },
    { label: "Strength",     value: subject.stats.strength,     focus: "secondary" },
    { label: "Tackling",     value: subject.stats.tackling,     focus: "limited" },
    { label: "Pressing",     value: subject.stats.pressing,     focus: "limited" },
    { label: "Stamina",      value: subject.stats.stamina,      focus: "secondary" },
  ];

  const focusColor: Record<string, string> = {
    primary: "text-primary glow-text",
    secondary: "text-blue-400",
    limited: "text-muted-foreground",
  };

  const focusBg: Record<string, string> = {
    primary: "oklch(0.75 0.18 var(--team-hue))",
    secondary: "oklch(0.65 0.15 240)",
    limited: "oklch(0.45 0.04 var(--team-hue))",
  };

  return (
    <div
      className="card-arcade rounded-xl p-6 flex flex-col gap-4"
      style={{ opacity: sceneOpacity }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-black uppercase tracking-wider text-2xl text-foreground m-0 flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-primary glow-text" />
            Attributes
          </h2>
          <p className="text-xs text-muted-foreground mt-1 m-0">
            Match-driven development · Position-weighted growth
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">Primary</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-muted-foreground">Secondary</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-muted" />
            <span className="text-muted-foreground">Limited</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {attrs.map((a, i) => {
          const start = fps * 0.4 + i * 2;
          const fill = interpolate(
            frame,
            [start, start + fps * 0.6],
            [0, a.value],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: eo,
            },
          );
          const rowOpacity = interpolate(
            frame,
            [start, start + fps * 0.4],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: eo,
            },
          );

          // Pulse if this is the "+0.4 passing" attribute mid-scene
          const isPassing = a.label === "Passing";
          const pulse = isPassing
            ? interpolate(
                frame,
                [fps * 1.7, fps * 1.95, fps * 2.4],
                [0, 1, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              )
            : 0;

          return (
            <div
              key={a.label}
              className="flex flex-col gap-1"
              style={{ opacity: rowOpacity }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-widest font-display font-bold text-foreground">
                  {a.label}
                </span>
                <span className={`text-sm tabular-nums font-display font-black ${focusColor[a.focus]}`}>
                  {fill.toFixed(1)}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(fill / 10) * 100}%`,
                    background: focusBg[a.focus],
                    boxShadow: isPassing && pulse > 0
                      ? `0 0 ${10 + pulse * 20}px oklch(0.85 0.20 var(--team-hue))`
                      : undefined,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom callout */}
      <div className="mt-2 card-arcade border-glow rounded-lg p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-widest font-display font-bold text-foreground">
            Development tip
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            Featuring this player in big matches accelerates passing & vision growth.
          </div>
        </div>
        <Award className="w-5 h-5 text-primary" />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const PlayerSelector: React.FC<{
  frame: number;
  fps: number;
  others: (typeof REAL_MADRID)["starting11"];
  subjectName: string;
}> = ({ frame, fps, others, subjectName }) => {
  const opacity = interpolate(frame, [fps * 0.15, fps * 0.55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const tx = interpolate(frame, [fps * 0.15, fps * 0.55], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  return (
    <div
      className="card-arcade rounded-xl p-5 flex flex-col gap-3 overflow-hidden"
      style={{ opacity, transform: `translateX(${tx}px)` }}
    >
      <h3 className="font-display font-black uppercase tracking-wider text-sm text-foreground m-0">
        Squad
      </h3>
      <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        Select Player
      </div>

      {/* Active player */}
      <div className="card-arcade border-glow rounded-lg p-3 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-display font-bold text-foreground">
            {subjectName}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-primary">
            18 · Developing
          </span>
        </div>
        <ArrowRight className="w-4 h-4 text-primary" />
      </div>

      <div className="flex flex-col gap-1.5 mt-1">
        {others.slice(0, 7).map((p, i) => {
          const start = fps * 0.4 + i * 1.5;
          const o = interpolate(
            frame,
            [start, start + fps * 0.3],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: eo },
          );
          return (
            <div
              key={p.id}
              className="px-3 py-2 rounded-md flex items-center justify-between hover:bg-secondary/40"
              style={{ opacity: o }}
            >
              <div className="flex flex-col">
                <span className="text-xs font-display font-bold text-foreground truncate">
                  {p.name}
                </span>
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  {p.positions[0]} · {p.age}
                </span>
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {(p.rating * 1.4 + 4.5).toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
