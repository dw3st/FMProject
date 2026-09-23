import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  staticFile,
} from "remotion";
import { Calendar, Trophy, Wallet, Users, Star, ChevronRight } from "lucide-react";
import { ClubLogo } from "@game/GameInterface/Components/ClubLogo";
import { ScreenFrame } from "../components/ScreenFrame";
import { REAL_MADRID } from "../data/clubs";
import { UPCOMING_FIXTURES, CURRENT_DATE } from "../data/fixtures";

const eo = Easing.bezier(0.16, 1, 0.3, 1);

const positionColor = (pos: string): string => {
  if (pos === "Goalkeeper" || pos === "GK") return "text-chart-4";
  if (pos === "Defender") return "text-blue-400";
  if (pos === "Midfielder") return "text-primary";
  if (pos === "Forward") return "text-destructive";
  return "text-muted-foreground";
};

const positionAbbr = (pos: string): string => {
  if (pos === "Goalkeeper" || pos === "GK") return "GK";
  if (pos === "Defender") return "DEF";
  if (pos === "Midfielder") return "MID";
  if (pos === "Forward") return "FWD";
  return "—";
};

export const DashboardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Whole scene fade-in.
  const sceneOpacity = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  // Scene exit at end.
  const exitOpacity = interpolate(
    frame,
    [fps * 3.5, fps * 4.0],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Build a 10-row roster: 11-XI + 1 bench row, but trim to 10 for layout.
  const roster = [
    ...REAL_MADRID.starting11,
    ...REAL_MADRID.bench.slice(0, 2),
  ].slice(0, 10);

  return (
    <ScreenFrame
      navActive="squad"
      todayBadge={{ label: "vs Barcelona", kind: "match" }}
    >
      <AbsoluteFill style={{ opacity: sceneOpacity * exitOpacity }}>
        <div className="absolute inset-0 px-8 py-6 grid grid-cols-[280px_1fr_320px] gap-6">
          {/* LEFT: Club sidebar */}
          <ClubSidebarMock frame={frame} fps={fps} />

          {/* CENTER: Squad table */}
          <SquadTableMock frame={frame} fps={fps} roster={roster} />

          {/* RIGHT: Week calendar */}
          <WeekCalendarMock frame={frame} fps={fps} />
        </div>
      </AbsoluteFill>
    </ScreenFrame>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Left sidebar: club identity + KPIs + next match
// ─────────────────────────────────────────────────────────────────────────────

const ClubSidebarMock: React.FC<{ frame: number; fps: number }> = ({
  frame,
  fps,
}) => {
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

  const nextFixture = UPCOMING_FIXTURES[1]; // Barcelona vs Real Madrid

  return (
    <div
      className="card-arcade rounded-xl p-6 flex flex-col gap-5"
      style={{ opacity, transform: `translateX(${tx}px)` }}
    >
      {/* Crest + name */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-20 h-20 rounded-xl border-glow flex items-center justify-center p-1.5">
          <ClubLogo
            logoUrl={staticFile("logos/la_liga/real_madrid.svg")}
            primaryColor={REAL_MADRID.colors[0]}
            secondaryColor={REAL_MADRID.colors[1]}
            className="w-full h-full"
          />
        </div>
        <div className="text-center">
          <div className="font-display font-black uppercase tracking-wider text-lg text-foreground leading-tight">
            {REAL_MADRID.name}
          </div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mt-1">
            Founded {REAL_MADRID.founded}
          </div>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<Wallet className="w-4 h-4" />} label="Balance" value="€247M" />
        <KPI icon={<Users className="w-4 h-4" />} label="Fans" value="178M" />
        <KPI icon={<Trophy className="w-4 h-4" />} label="League" value="2nd" />
        <KPI icon={<Star className="w-4 h-4" />} label="Form" value="W W D W L" small />
      </div>

      <div className="h-px bg-border" />

      {/* Next match */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
          Next Match
        </div>
        <div className="card-arcade border-glow rounded-lg p-3 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {nextFixture.competition} · Round {nextFixture.round}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-display font-bold uppercase tracking-wider truncate">
              {nextFixture.home}
            </span>
            <span className="text-xs text-muted-foreground">vs</span>
            <span className="text-sm font-display font-bold uppercase tracking-wider truncate text-primary glow-text">
              {nextFixture.away}
            </span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground text-center">
            Sat · Nov 19 · 21:00
          </div>
        </div>
      </div>
    </div>
  );
};

const KPI: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  small?: boolean;
}> = ({ icon, label, value, small }) => (
  <div className="card-arcade rounded-lg p-3 flex flex-col gap-1">
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon}
      <span className="text-[9px] uppercase tracking-widest">{label}</span>
    </div>
    <div
      className={
        "font-display font-black text-foreground " +
        (small ? "text-xs tracking-wider" : "text-lg")
      }
    >
      {value}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Center: squad roster table
// ─────────────────────────────────────────────────────────────────────────────

type RowPlayer = (typeof REAL_MADRID)["starting11"][number];

const SquadTableMock: React.FC<{
  frame: number;
  fps: number;
  roster: RowPlayer[];
}> = ({ frame, fps, roster }) => {
  const opacity = interpolate(frame, [fps * 0.1, fps * 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  return (
    <div
      className="card-arcade rounded-xl p-6 flex flex-col gap-3 overflow-hidden"
      style={{ opacity }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-black uppercase tracking-wider text-2xl text-foreground m-0">
            First Team
          </h2>
          <p className="text-xs text-muted-foreground mt-1 m-0">
            {REAL_MADRID.starting11.length + REAL_MADRID.bench.length} players · Avg age 26
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-widest">
            Filter
          </span>
          <span className="card-arcade rounded-md px-3 py-1.5 text-[11px] uppercase tracking-widest text-primary border-glow">
            All Positions
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[24px_36px_1fr_60px_60px_60px_60px] gap-3 px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
        <div>#</div>
        <div />
        <div>Player</div>
        <div className="text-center">Pos</div>
        <div className="text-center">Age</div>
        <div className="text-center">Rat</div>
        <div className="text-center">Fit</div>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-1.5">
        {roster.map((p, i) => {
          const start = fps * 0.3 + i * 2; // 2-frame stagger
          const rowO = interpolate(
            frame,
            [start, start + fps * 0.35],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: eo,
            },
          );
          const rowY = interpolate(
            frame,
            [start, start + fps * 0.35],
            [10, 0],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: eo,
            },
          );

          const mainPos = p.positions[0]!;
          const fitness = 70 + ((p.rating ?? 0) * 4); // pseudo fitness
          const rating = (p.rating ?? 0) * 1.4 + 4.5; // map to 0–10 scale

          return (
            <div
              key={p.id}
              className="grid grid-cols-[24px_36px_1fr_60px_60px_60px_60px] gap-3 items-center px-3 py-2.5 rounded-md hover:bg-secondary/40 border border-transparent"
              style={{
                opacity: rowO,
                transform: `translateY(${rowY}px)`,
                background: i % 2 === 0 ? "oklch(0.13 0.02 var(--team-hue))" : "transparent",
              }}
            >
              <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-display font-bold uppercase text-muted-foreground">
                {p.name
                  .split(" ")
                  .map((s) => s[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-display font-bold text-foreground truncate">
                  {p.name}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {p.profile.archetype}
                </span>
              </div>
              <div className="text-center">
                <span
                  className={`text-[10px] uppercase tracking-wider font-display font-bold ${positionColor(mainPos)}`}
                >
                  {positionAbbr(mainPos)}
                </span>
              </div>
              <div className="text-center text-sm tabular-nums text-foreground">{p.age}</div>
              <div className="text-center">
                <span className="text-sm font-display font-bold tabular-nums text-primary glow-text">
                  {rating.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-center">
                <div className="w-12 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, fitness)}%`,
                      background: "oklch(0.65 0.15 var(--team-hue))",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Right: week calendar
// ─────────────────────────────────────────────────────────────────────────────

const WeekCalendarMock: React.FC<{ frame: number; fps: number }> = ({
  frame,
  fps,
}) => {
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
      className="card-arcade rounded-xl p-5 flex flex-col gap-4"
      style={{ opacity, transform: `translateX(${tx}px)` }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display font-black uppercase tracking-wider text-foreground m-0 text-sm">
          <Calendar className="w-4 h-4 inline mr-2 -mt-0.5 text-primary" />
          November
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Week 45
        </span>
      </div>

      <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        Today · {formatDate(CURRENT_DATE)}
      </div>

      <div className="flex flex-col gap-2">
        {UPCOMING_FIXTURES.map((f, i) => {
          const start = fps * 0.4 + i * 3;
          const o = interpolate(
            frame,
            [start, start + fps * 0.3],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: eo,
            },
          );
          const y = interpolate(frame, [start, start + fps * 0.3], [8, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: eo,
          });

          const isUser = f.isUserClub !== null;

          return (
            <div
              key={i}
              className={
                "rounded-lg p-3 flex flex-col gap-1.5 " +
                (isUser
                  ? "card-arcade border-glow"
                  : "border border-border bg-secondary/30")
              }
              style={{ opacity: o, transform: `translateY(${y}px)` }}
            >
              <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-muted-foreground">
                <span>{f.competition}</span>
                <span>R{f.round}</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: f.homeColor === "#FFFFFF" ? f.awayColor : f.homeColor }}
                />
                <span className="text-xs font-display font-bold uppercase truncate flex-1">
                  {f.home}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: f.awayColor === "#FFFFFF" ? f.homeColor : f.awayColor }}
                />
                <span className="text-xs font-display font-bold uppercase truncate flex-1">
                  {f.away}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>{formatDate(f.date)}</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const formatDate = (iso: string): string => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
