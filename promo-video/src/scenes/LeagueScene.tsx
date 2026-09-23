import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  staticFile,
} from "remotion";
import { Trophy, ArrowUp, Crown } from "lucide-react";
import { ClubLogo } from "@game/GameInterface/Components/ClubLogo";
import { ScreenFrame } from "../components/ScreenFrame";
import {
  STANDINGS_BEFORE,
  STANDINGS_AFTER,
  type StandingRow,
} from "../data/standings";

const eo = Easing.bezier(0.16, 1, 0.3, 1);

// Row height in pixels — the climb animation translates the user's row by
// exactly (rankDelta * ROW_H + GAP) so it lands inside the new slot.
const ROW_H = 56;
const ROW_GAP = 4;

const ZONE_BORDER: Record<string, string> = {
  champions: "border-l-blue-500",
  europa: "border-l-orange-500",
  conference: "border-l-cyan-500",
  relegation: "border-l-red-500",
};

const resultColors: Record<"W" | "D" | "L", string> = {
  W: "bg-emerald-500 text-white",
  D: "bg-zinc-600 text-white",
  L: "bg-red-500 text-white",
};

function getZoneByRank(rank: number): string | null {
  if (rank <= 4) return "champions";       // UCL spots
  if (rank <= 6) return "europa";          // Europa
  if (rank === 7) return "conference";     // Conference
  if (rank >= 18) return "relegation";
  return null;
}

export const LeagueScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneOpacity = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const exitOpacity = interpolate(
    frame,
    [fps * 4.0, fps * 4.5],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Phase timings (seconds):
  //   0.0–1.5 : show STANDINGS_BEFORE, RM in 2nd
  //   1.5–1.7 : "MATCH RESULT" banner pulses in
  //   1.7–2.9 : Row climb animation — RM moves up, Barcelona drops
  //   2.9–end : Hold STANDINGS_AFTER, +3 PTS chip glows on the RM row
  const climbStart = fps * 1.7;
  const climbEnd = fps * 2.9;
  const climbProgress = interpolate(frame, [climbStart, climbEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.65, 0, 0.35, 1),
  });

  const bannerIn = interpolate(frame, [fps * 1.4, fps * 1.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });
  const bannerOut = interpolate(frame, [fps * 2.8, fps * 3.2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  const crownIn = interpolate(frame, [climbEnd, climbEnd + fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
  });

  // Find ranks before/after for animating row.
  const rmBeforeIdx = STANDINGS_BEFORE.findIndex((r) => r.isUser);
  const rmAfterIdx = STANDINGS_AFTER.findIndex((r) => r.isUser);
  const rankDelta = rmBeforeIdx - rmAfterIdx; // positive = climbing

  // Rank label that updates mid-climb.
  const animatedRank = climbProgress > 0.5 ? rmAfterIdx + 1 : rmBeforeIdx + 1;

  return (
    <ScreenFrame
      navActive="leagues"
      todayBadge={{ label: "Match Complete", kind: "rest" }}
    >
      <AbsoluteFill style={{ opacity: sceneOpacity * exitOpacity }}>
        <div className="absolute inset-0 px-8 py-6 grid grid-cols-[1fr_320px] gap-6">
          {/* LEFT — standings table with climbing row */}
          <StandingsCard
            frame={frame}
            fps={fps}
            climbProgress={climbProgress}
            rankDelta={rankDelta}
          />

          {/* RIGHT — match result panel + climb summary */}
          <SidePanel
            frame={frame}
            fps={fps}
            climbProgress={climbProgress}
            crownIn={crownIn}
            bannerIn={bannerIn}
            bannerOut={bannerOut}
            animatedRank={animatedRank}
            rankDelta={rankDelta}
          />
        </div>
      </AbsoluteFill>
    </ScreenFrame>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const StandingsCard: React.FC<{
  frame: number;
  fps: number;
  climbProgress: number;
  rankDelta: number;
}> = ({ frame, fps, climbProgress, rankDelta }) => {
  const headerOpacity = interpolate(frame, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: eo,
  });

  const rmBeforeIdx = STANDINGS_BEFORE.findIndex((r) => r.isUser);
  const rmAfterIdx = STANDINGS_AFTER.findIndex((r) => r.isUser);

  return (
    <div className="card-arcade rounded-xl p-6 flex flex-col gap-4 overflow-hidden">
      <div style={{ opacity: headerOpacity }} className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black font-display uppercase tracking-wider m-0 flex items-center gap-3">
            <Trophy className="w-7 h-7 text-primary glow-text" />
            La Liga · 2027/28
          </h2>
          <p className="text-xs text-muted-foreground mt-1 m-0">
            Round 14 of 38 · Updated live
          </p>
        </div>
        <div className="card-arcade rounded-lg px-4 py-2 flex items-center gap-2 text-xs uppercase tracking-widest">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-muted-foreground">UCL</span>
          <div className="w-2 h-2 rounded-full bg-orange-500 ml-2" />
          <span className="text-muted-foreground">Europa</span>
          <div className="w-2 h-2 rounded-full bg-red-500 ml-2" />
          <span className="text-muted-foreground">Drop</span>
        </div>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[40px_1fr_50px_45px_45px_45px_50px_70px_140px] gap-2 px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
        <div className="text-center">#</div>
        <div>Club</div>
        <div className="text-center">MP</div>
        <div className="text-center">W</div>
        <div className="text-center">D</div>
        <div className="text-center">L</div>
        <div className="text-center">GD</div>
        <div className="text-center font-display font-black">PTS</div>
        <div className="text-center">Last 5</div>
      </div>

      {/* Rows — render in the BEFORE order, but the user's row slides into
          its AFTER position. Other rows interpolate between their before/after
          y-positions to make room. */}
      <div className="flex flex-col gap-1 relative">
        {STANDINGS_BEFORE.map((row, beforeIdx) => {
          const afterRow =
            STANDINGS_AFTER.find((r) => r.squadId === row.squadId) ?? row;
          const afterIdx = STANDINGS_AFTER.findIndex(
            (r) => r.squadId === row.squadId,
          );

          // Y delta — interpolated through climbProgress.
          const dy = (afterIdx - beforeIdx) * (ROW_H + ROW_GAP) * climbProgress;

          // Interpolated stats — for the user club + the team that dropped.
          const isAffected =
            row.isUser || row.squadId === STANDINGS_BEFORE[0]!.squadId;
          const showAfter = climbProgress > 0.5;
          const displayRow: StandingRow = showAfter && isAffected ? afterRow : row;

          // Pop highlight as the user's row passes through positions.
          const rowOpacity = interpolate(
            frame,
            [fps * 0.3 + beforeIdx * 2, fps * 0.55 + beforeIdx * 2],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: eo,
            },
          );

          const userGlow = row.isUser ? "border-glow glow-primary-sm" : "";
          const rankCurrent = (afterIdx + 1);
          const zoneKey = showAfter ? getZoneByRank(rankCurrent) : getZoneByRank(beforeIdx + 1);
          const zoneClass = zoneKey ? ZONE_BORDER[zoneKey] : "border-l-transparent";

          return (
            <StandingsRow
              key={row.squadId}
              row={displayRow}
              rank={showAfter ? afterIdx + 1 : beforeIdx + 1}
              dy={dy}
              opacity={rowOpacity}
              zoneClass={zoneClass!}
              userGlow={userGlow}
              isClimbing={!!row.isUser && climbProgress > 0 && climbProgress < 1}
            />
          );
        })}

        {/* Climb arrow indicator next to user's row when moving */}
        {climbProgress > 0 && climbProgress < 1 && rankDelta > 0 && (
          <ClimbArrow climbProgress={climbProgress} rankDelta={rankDelta} fromIdx={rmBeforeIdx} toIdx={rmAfterIdx} />
        )}
      </div>
    </div>
  );
};

const StandingsRow: React.FC<{
  row: StandingRow;
  rank: number;
  dy: number;
  opacity: number;
  zoneClass: string;
  userGlow: string;
  isClimbing: boolean;
}> = ({ row, rank, dy, opacity, zoneClass, userGlow, isClimbing }) => {
  return (
    <div
      className={
        "grid grid-cols-[40px_1fr_50px_45px_45px_45px_50px_70px_140px] gap-2 items-center px-3 py-2.5 rounded-md border-l-4 " +
        zoneClass +
        " " +
        userGlow
      }
      style={{
        opacity,
        height: ROW_H,
        transform: `translateY(${dy}px)`,
        background: row.isUser
          ? "linear-gradient(90deg, oklch(0.20 0.06 var(--team-hue)) 0%, oklch(0.15 0.03 var(--team-hue)) 100%)"
          : "transparent",
        zIndex: isClimbing ? 10 : 1,
        position: "relative",
      }}
    >
      <div
        className={
          "text-center font-display font-black tabular-nums " +
          (row.isUser ? "text-primary glow-text" : "text-muted-foreground")
        }
      >
        {rank}
      </div>

      <div className="flex items-center gap-3 min-w-0">
        {row.logo ? (
          <ClubLogo
            logoUrl={staticFile(row.logo.replace(/^\//, ""))}
            primaryColor={row.colors[0]}
            secondaryColor={row.colors[1]}
            className="w-7 h-7 rounded shrink-0"
          />
        ) : (
          <div
            className="w-7 h-7 rounded shrink-0"
            style={{
              background: `linear-gradient(145deg, ${row.colors[0]}, ${row.colors[1]})`,
            }}
          />
        )}
        <span
          className={
            "font-display font-bold text-sm truncate " +
            (row.isUser ? "text-foreground" : "text-foreground")
          }
        >
          {row.name}
        </span>
      </div>

      <div className="text-center text-sm text-muted-foreground tabular-nums">{row.mp}</div>
      <div className="text-center text-sm text-muted-foreground tabular-nums">{row.w}</div>
      <div className="text-center text-sm text-muted-foreground tabular-nums">{row.d}</div>
      <div className="text-center text-sm text-muted-foreground tabular-nums">{row.l}</div>
      <div
        className={
          "text-center text-sm font-display font-bold tabular-nums " +
          (row.gd >= 0 ? "text-primary" : "text-red-400")
        }
      >
        {row.gd > 0 ? `+${row.gd}` : row.gd}
      </div>
      <div className="text-center text-xl font-display font-black tabular-nums text-primary glow-text">
        {row.pts}
      </div>
      <div className="flex items-center justify-center gap-1">
        {row.form.map((r, i) => (
          <span
            key={i}
            className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${resultColors[r]}`}
          >
            {r}
          </span>
        ))}
      </div>
    </div>
  );
};

const ClimbArrow: React.FC<{
  climbProgress: number;
  rankDelta: number;
  fromIdx: number;
  toIdx: number;
}> = ({ climbProgress, fromIdx }) => {
  const y = fromIdx * (ROW_H + ROW_GAP) + ROW_H / 2;
  const pulse = 0.6 + Math.sin(climbProgress * Math.PI * 4) * 0.4;
  return (
    <div
      className="absolute -left-8 flex items-center justify-center"
      style={{
        top: y - 14,
        width: 28,
        height: 28,
        opacity: pulse,
      }}
    >
      <div className="rounded-full bg-primary glow-primary p-1.5">
        <ArrowUp className="w-4 h-4 text-primary-foreground" />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const SidePanel: React.FC<{
  frame: number;
  fps: number;
  climbProgress: number;
  crownIn: number;
  bannerIn: number;
  bannerOut: number;
  animatedRank: number;
  rankDelta: number;
}> = ({ frame, fps, climbProgress, crownIn, bannerIn, bannerOut, animatedRank, rankDelta }) => {
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
      className="flex flex-col gap-4"
      style={{ opacity: o, transform: `translateX(${tx}px)` }}
    >
      {/* MATCH RESULT pulse banner */}
      <div
        className="card-arcade border-glow rounded-xl p-4 flex flex-col gap-2"
        style={{ opacity: bannerIn * bannerOut }}
      >
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Match Result
        </div>
        <div className="flex items-center gap-3">
          <ClubLogo
            logoUrl={staticFile("logos/la_liga/real_madrid.svg")}
            primaryColor="#FFFFFF"
            secondaryColor="#FEBE10"
            className="w-9 h-9 rounded-md"
          />
          <div className="flex items-center gap-2 flex-1">
            <span className="text-2xl font-display font-black tabular-nums text-primary glow-text">
              2
            </span>
            <span className="text-muted-foreground">–</span>
            <span className="text-2xl font-display font-black tabular-nums text-foreground">
              1
            </span>
          </div>
          <ClubLogo
            logoUrl={staticFile("logos/la_liga/barcelona.svg")}
            primaryColor="#A50044"
            secondaryColor="#004D98"
            className="w-9 h-9 rounded-md"
          />
        </div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          La Liga · R14 · Camp Nou
        </div>
      </div>

      {/* Climb summary card */}
      <div className="card-arcade rounded-xl p-5 flex flex-col gap-4">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          League Standings
        </div>

        <div className="flex items-center justify-center gap-4">
          {/* Old rank */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Was
            </span>
            <span
              className="text-5xl font-display font-black tabular-nums"
              style={{
                color: climbProgress < 0.4 ? "oklch(0.95 0 0)" : "oklch(0.50 0.04 var(--team-hue))",
                opacity: 1 - climbProgress * 0.5,
              }}
            >
              2<span className="text-xl">nd</span>
            </span>
          </div>

          <div className="flex flex-col items-center justify-center">
            <ArrowUp
              className="w-8 h-8 text-primary glow-text"
              style={{ opacity: climbProgress }}
            />
            <span
              className="text-[10px] uppercase tracking-widest text-primary glow-text font-display font-bold"
              style={{ opacity: climbProgress }}
            >
              +{rankDelta}
            </span>
          </div>

          {/* New rank — crown when climb finishes */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-widest text-primary glow-text font-display font-bold">
              Now
            </span>
            <div className="relative">
              <span
                className="text-5xl font-display font-black tabular-nums text-primary glow-text"
                style={{ opacity: climbProgress }}
              >
                {animatedRank}<span className="text-xl">{animatedRank === 1 ? "st" : "nd"}</span>
              </span>
              <Crown
                className="absolute -top-6 left-1/2 -translate-x-1/2 w-8 h-8 text-primary glow-text"
                style={{
                  opacity: crownIn,
                  transform: `translateX(-50%) scale(${0.6 + crownIn * 0.4}) rotate(${(1 - crownIn) * -15}deg)`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="grid grid-cols-2 gap-3">
          <PointsDelta label="Points" before="28" after="31" delta="+3" active={climbProgress > 0.5} />
          <PointsDelta label="GD" before="+13" after="+14" delta="+1" active={climbProgress > 0.5} />
        </div>
      </div>

      {/* Bottom callout */}
      <div className="card-arcade border-glow rounded-xl p-4 flex items-center gap-3 glow-primary-sm">
        <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Title Race
          </div>
          <div className="text-sm font-display font-black text-foreground">
            +2 pts ahead of Barça
          </div>
        </div>
      </div>
    </div>
  );
};

const PointsDelta: React.FC<{
  label: string;
  before: string;
  after: string;
  delta: string;
  active: boolean;
}> = ({ label, before, after, delta, active }) => (
  <div className="card-arcade rounded-lg p-3">
    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
      {label}
    </div>
    <div className="flex items-baseline gap-2 mt-0.5">
      <span
        className={
          "text-2xl font-display font-black tabular-nums " +
          (active ? "text-primary glow-text" : "text-foreground")
        }
      >
        {active ? after : before}
      </span>
      <span
        className="text-xs font-display font-bold text-primary glow-text"
        style={{ opacity: active ? 1 : 0 }}
      >
        {delta}
      </span>
    </div>
  </div>
);
