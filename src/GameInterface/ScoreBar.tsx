import { useTranslation } from "react-i18next";
import type { MatchPhase } from "@/GameEngine/types";
import { ClubLogo } from "@/GameInterface/Components/ClubLogo";
import { readableOnDark } from "@/GameInterface/matchTeamColors";

const PERIOD: Partial<Record<MatchPhase, { offset: number; length: number }>> = {
  firstHalf:       { offset: 0,   length: 45 },
  secondHalf:      { offset: 45,  length: 45 },
  extraTimeFirst:  { offset: 90,  length: 15 },
  extraTimeSecond: { offset: 105, length: 15 },
};

function formatMatchClock(matchTime: number, matchPhase: MatchPhase): string {
  if (matchPhase === "preMatch") return "00:00";
  if (matchPhase === "halfTime") return "HT";
  if (matchPhase === "extraTimeBreak") return "ET";
  if (matchPhase === "penalties") return "PEN";
  if (matchPhase === "matchEnd") return "FT";

  const { offset, length } = PERIOD[matchPhase] ?? { offset: 0, length: 45 };
  const rawMinutes = matchTime / 60;
  const clampedMin = Math.min(Math.floor(rawMinutes), length);
  const displayMin = offset + clampedMin;
  const stoppage = rawMinutes > length ? Math.ceil(rawMinutes - length) : 0;
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
  aggregate,
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
  /** Two-legged tie (cup or continental), 2nd leg only: first-leg goals per side. Renders a small
   *  "agg. X–Y" under the clock, X/Y already including today's live score. */
  aggregate?: { A: number; B: number };
}) {
  const { t } = useTranslation();
  const clockStr = formatMatchClock(matchTime, matchPhase);
  const isSpecial = matchPhase === "halfTime" || matchPhase === "matchEnd"
    || matchPhase === "extraTimeBreak" || matchPhase === "penalties";

  const colorA = readableOnDark(scoreColorA ?? teamA?.primaryColor ?? "#3b82f6");
  const colorB = readableOnDark(scoreColorB ?? teamB?.primaryColor ?? "#ef4444");
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
          className="w-8 h-8 rounded-full shrink-0"
          imgClassName="w-full h-full object-contain p-0.5"
        />
        <span className="font-bold text-foreground uppercase tracking-[0.08em] text-sm hidden sm:block font-display">
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

        {/* Clock (+ aggregate score for a two-legged tie's 2nd leg) */}
        <div className="flex flex-col items-center">
          <div
            className={`w-20 h-11 flex items-center justify-center border-y transition-colors ${
              isSpecial ? "bg-primary/15 border-primary/40" : "bg-card/60 border-border"
            }`}
          >
            <span className={`font-display font-black text-base tracking-[0.08em] tabular-nums ${isSpecial ? "text-primary" : "text-foreground"}`}>
              {clockStr}
            </span>
          </div>
          {aggregate && (
            <span className="text-[13px] text-muted-foreground font-bold tabular-nums mt-0.5">
              {t("continental.aggregate", { home: aggregate.A + scoreA, away: aggregate.B + scoreB })}
            </span>
          )}
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
        <span className="font-bold text-foreground uppercase tracking-[0.08em] text-sm hidden sm:block font-display">
          {nameB}
        </span>
        <ClubLogo
          logoUrl={teamB?.logoUrl}
          primaryColor={teamB?.primaryColor}
          secondaryColor={teamB?.secondaryColor}
          className="w-8 h-8 rounded-full shrink-0"
          imgClassName="w-full h-full object-contain p-0.5"
        />
      </div>
    </div>
  );
}
