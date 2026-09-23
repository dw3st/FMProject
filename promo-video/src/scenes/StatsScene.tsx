import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { BarChart3, Trophy } from "lucide-react";
import { ScreenFrame } from "../components/ScreenFrame";
import { MATCH_SNAPSHOT } from "../data/matchSnapshot";

const eo = Easing.bezier(0.16, 1, 0.3, 1);

const STAT_ROWS: {
  label: string;
  key: keyof typeof MATCH_SNAPSHOT.stats;
  format?: (v: number) => string;
  suffix?: string;
}[] = [
  { label: "Possession",     key: "possession",     suffix: "%" },
  { label: "Shots",          key: "shots" },
  { label: "Shots on Target", key: "shotsOnTarget" },
  { label: "Expected Goals", key: "xg", format: (v) => v.toFixed(1) },
  { label: "Passes",         key: "passes" },
  { label: "Pass Accuracy",  key: "passAccuracy", suffix: "%" },
  { label: "Through Balls",  key: "throughBalls" },
  { label: "Tackles",        key: "tackles" },
  { label: "Interceptions",  key: "interceptions" },
  { label: "Corners",        key: "corners" },
];

export const StatsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneOpacity = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const exitOpacity = interpolate(
    frame,
    [fps * 3.0, fps * 3.5],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <ScreenFrame
      navActive="stats"
      todayBadge={{ label: "Match Complete", kind: "rest" }}
    >
      <AbsoluteFill style={{ opacity: sceneOpacity * exitOpacity }}>
        <div className="absolute inset-0 px-8 py-6 grid grid-cols-[1fr_360px] gap-6">
          {/* Stats panel */}
          <StatsPanel frame={frame} fps={fps} />
          {/* Player ratings */}
          <RatingsPanel frame={frame} fps={fps} />
        </div>
      </AbsoluteFill>
    </ScreenFrame>
  );
};

const StatsPanel: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const o = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  return (
    <div
      className="card-arcade rounded-xl p-6 flex flex-col gap-4"
      style={{ opacity: o }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black font-display uppercase tracking-wider m-0 flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-primary glow-text" />
            Match Stats
          </h2>
          <p className="text-xs text-muted-foreground mt-1 m-0">
            La Liga · Round 14 · Camp Nou · FT
          </p>
        </div>

        {/* Score recap */}
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-widest font-display font-bold text-foreground">
            Real Madrid
          </span>
          <div className="card-arcade border-glow rounded-lg px-4 py-2 flex items-center gap-3">
            <span className="text-2xl font-display font-black tabular-nums text-primary glow-text">
              {MATCH_SNAPSHOT.finalScoreA}
            </span>
            <span className="text-muted-foreground">–</span>
            <span className="text-2xl font-display font-black tabular-nums text-foreground">
              {MATCH_SNAPSHOT.finalScoreB}
            </span>
          </div>
          <span className="text-xs uppercase tracking-widest font-display font-bold text-foreground">
            Barcelona
          </span>
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="flex flex-col gap-3">
        {STAT_ROWS.map((row, i) => {
          const [a, b] = MATCH_SNAPSHOT.stats[row.key];
          const start = fps * 0.3 + i * 2.5;
          const fillA = interpolate(
            frame,
            [start, start + fps * 0.6],
            [0, a],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: eo,
            },
          );
          const fillB = interpolate(
            frame,
            [start, start + fps * 0.6],
            [0, b],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: eo,
            },
          );

          const fmt = row.format ?? ((v: number) => Math.round(v).toString());
          const total = a + b;
          const pctA = total > 0 ? a / total : 0.5;

          return (
            <div key={row.label}>
              <div className="grid grid-cols-[70px_1fr_70px] gap-3 items-center mb-1">
                <span className="text-lg font-display font-black tabular-nums text-foreground text-right">
                  {fmt(fillA)}{row.suffix ?? ""}
                </span>
                <span className="text-[11px] uppercase tracking-widest font-display font-bold text-muted-foreground text-center">
                  {row.label}
                </span>
                <span className="text-lg font-display font-black tabular-nums text-foreground text-left">
                  {fmt(fillB)}{row.suffix ?? ""}
                </span>
              </div>

              <div className="h-2 rounded-full overflow-hidden bg-secondary flex">
                <div
                  className="h-full"
                  style={{
                    width: `${pctA * 100}%`,
                    background: "oklch(0.75 0.18 var(--team-hue))",
                  }}
                />
                <div
                  className="h-full"
                  style={{
                    width: `${(1 - pctA) * 100}%`,
                    background: "oklch(0.45 0.04 var(--team-hue))",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RatingsPanel: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const o = interpolate(frame, [fps * 0.15, fps * 0.55], [0, 1], {
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
      className="card-arcade rounded-xl p-5 flex flex-col gap-4 overflow-hidden"
      style={{ opacity: o, transform: `translateX(${tx}px)` }}
    >
      <h3 className="text-base font-display font-black uppercase tracking-wider m-0 flex items-center gap-3">
        <Trophy className="w-5 h-5 text-primary glow-text" />
        Top Performers
      </h3>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground -mt-2">
        Event-driven 0–10 scale
      </p>

      <div className="flex flex-col gap-2">
        {MATCH_SNAPSHOT.topRatings.map((p, i) => {
          const start = fps * 0.4 + i * 3;
          const rowO = interpolate(
            frame,
            [start, start + fps * 0.4],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: eo },
          );
          const ratingFill = interpolate(
            frame,
            [start, start + fps * 0.7],
            [0, p.rating],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: eo },
          );

          const teamColor = p.team === "A" ? MATCH_SNAPSHOT.homeColor : MATCH_SNAPSHOT.awayColor;
          const isTop = i === 0;

          return (
            <div
              key={p.name}
              className={
                "rounded-lg p-3 flex items-center gap-3 " +
                (isTop ? "card-arcade border-glow glow-primary-sm" : "bg-secondary/30")
              }
              style={{ opacity: rowO }}
            >
              <div
                className="w-1 h-12 rounded"
                style={{ background: teamColor }}
              />

              <div className="flex flex-col flex-1 min-w-0">
                <span className={
                  "text-sm font-display font-bold truncate " +
                  (isTop ? "text-primary glow-text" : "text-foreground")
                }>
                  {p.name}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {p.position} · {p.team === "A" ? "Real Madrid" : "Barcelona"}
                </span>
              </div>

              <div className="flex flex-col items-end gap-1">
                <span className={
                  "text-2xl font-display font-black tabular-nums " +
                  (isTop ? "text-primary glow-text" : "text-foreground")
                }>
                  {ratingFill.toFixed(1)}
                </span>
                <div className="w-14 h-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(ratingFill / 10) * 100}%`,
                      background: isTop
                        ? "oklch(0.85 0.20 var(--team-hue))"
                        : "oklch(0.65 0.10 var(--team-hue))",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card-arcade rounded-lg p-3 mt-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Match Awarded
        </div>
        <div className="text-base font-display font-black text-foreground">
          J. Bellingham
        </div>
        <div className="text-[11px] text-muted-foreground italic">
          Goal · Assist · 92% pass accuracy
        </div>
      </div>
    </div>
  );
};
