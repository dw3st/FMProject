import type { MatchPhase } from "@/GameEngine/types";
import { ClubLogo } from "@/GameInterface/Components/ClubLogo";

const HALF_DURATION = 2700;

function formatMatchClock(matchTime: number, matchPhase: MatchPhase): string {
  if (matchPhase === "preMatch") return "00:00";
  if (matchPhase === "halfTime") return "HT";
  if (matchPhase === "matchEnd") return "FT";

  const halfOffset = matchPhase === "secondHalf" ? 45 : 0;
  const rawMinutes = matchTime / 60;
  const clampedMin = Math.min(Math.floor(rawMinutes), 45);
  const displayMin = halfOffset + clampedMin;
  const stoppage = rawMinutes > 45 ? Math.ceil(rawMinutes - 45) : 0;
  const displaySec = Math.floor(matchTime % 60);

  if (stoppage > 0) {
    return `${displayMin}+${stoppage}'`;
  }
  return `${String(displayMin).padStart(2, "0")}:${String(displaySec).padStart(2, "0")}`;
}

export interface TeamMeta {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
}

export function ScoreBar({
  scoreA,
  scoreB,
  matchTime,
  matchPhase,
  teamA,
  teamB,
  scoreColorA,
  scoreColorB,
}: {
  scoreA: number;
  scoreB: number;
  matchTime: number;
  matchPhase: MatchPhase;
  teamA?: TeamMeta;
  teamB?: TeamMeta;
  /** Resolved kit colors (pitch / placar). Falls back to each team's primary when omitted. */
  scoreColorA?: string;
  scoreColorB?: string;
}) {
  const clockStr = formatMatchClock(matchTime, matchPhase);
  const isSpecial = matchPhase === "halfTime" || matchPhase === "matchEnd";

  const colorA = scoreColorA ?? teamA?.primaryColor ?? "#3b82f6";
  const colorB = scoreColorB ?? teamB?.primaryColor ?? "#ef4444";
  const nameA = teamA?.name ?? "Team A";
  const nameB = teamB?.name ?? "Team B";

  return (
    <div className="flex items-center gap-0">
      {/* Team A */}
      <div className="flex items-center gap-3 pr-5">
        <ClubLogo
          logoUrl={teamA?.logoUrl}
          primaryColor={teamA?.primaryColor}
          secondaryColor={teamA?.secondaryColor}
          className="w-9 h-9 rounded-lg shrink-0"
          imgClassName="w-full h-full object-contain p-0.5"
        />
        <span className="font-black text-foreground uppercase tracking-wider text-sm hidden sm:block">
          {nameA}
        </span>
      </div>

      {/* Scores + clock */}
      <div className="flex items-center">
        {/* Score A */}
        <div
          className="w-12 h-11 flex items-center justify-center rounded-l-lg"
          style={{ background: `${colorA}22`, borderLeft: `2px solid ${colorA}55`, borderTop: `1px solid ${colorA}33`, borderBottom: `1px solid ${colorA}33` }}
        >
          <span className="text-3xl font-black font-display leading-none" style={{ color: colorA }}>
            {scoreA}
          </span>
        </div>

        {/* Clock */}
        <div
          className={`w-20 h-11 flex items-center justify-center border-y transition-colors ${
            isSpecial ? "bg-primary/15 border-primary/40" : "bg-card/60 border-border"
          }`}
        >
          <span className={`font-display font-black text-base tracking-widest tabular-nums ${isSpecial ? "text-primary" : "text-foreground"}`}>
            {clockStr}
          </span>
        </div>

        {/* Score B */}
        <div
          className="w-12 h-11 flex items-center justify-center rounded-r-lg"
          style={{ background: `${colorB}22`, borderRight: `2px solid ${colorB}55`, borderTop: `1px solid ${colorB}33`, borderBottom: `1px solid ${colorB}33` }}
        >
          <span className="text-3xl font-black font-display leading-none" style={{ color: colorB }}>
            {scoreB}
          </span>
        </div>
      </div>

      {/* Team B */}
      <div className="flex items-center gap-3 pl-5">
        <span className="font-black text-foreground uppercase tracking-wider text-sm hidden sm:block">
          {nameB}
        </span>
        <ClubLogo
          logoUrl={teamB?.logoUrl}
          primaryColor={teamB?.primaryColor}
          secondaryColor={teamB?.secondaryColor}
          className="w-9 h-9 rounded-lg shrink-0"
          imgClassName="w-full h-full object-contain p-0.5"
        />
      </div>
    </div>
  );
}
