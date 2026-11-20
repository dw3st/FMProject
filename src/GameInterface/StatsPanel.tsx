import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { emptyPlayerStats, getAllPlayerStats, getTeamStats } from "@/GameEngine/Domain/Statistics";
import type { PlayerStats, TeamStats } from "@/GameEngine/Domain/Statistics";
import type { GamePlayer, SubstitutionRecord } from "@/GameEngine/types";
import { kitDotStyle } from "@/GameInterface/matchTeamColors";
import { getPlayerRating, getRatingTally } from "@/GameEngine/Domain/PlayerRating";
import { ratingParts } from "@/GameEngine/Domain/RatingModel";
import { MomentumBar } from "@/GameInterface/Momentum/MomentumBar";
import { useMomentum } from "@/GameInterface/Momentum/useMomentum";

interface Col {
  label: string;
  titleKey: string;
  /** `id` is the player (absent on the team total row). */
  value: (s: PlayerStats, id?: number) => number | string;
  /** Tooltip of a player's cell (stage 17: the rating's parts). */
  title?: (id: number) => string;
}

/** Stage 17: a player's rating parts (FM hooks, `ratingParts`) as a one-line tooltip. */
function ratingTitle(id: number): string {
  const tally = getRatingTally(id);
  if (!tally) return "";
  return Object.entries(ratingParts(tally)).filter(([, v]) => Math.abs(v) >= 0.005).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v.toFixed(2)}`).join(" · ");
}

const COLS: Col[] = [
  { label: "RT",   titleKey: "stats.headers.RT",    value: (_s, id) => (id === undefined ? "—" : getPlayerRating(id).toFixed(1)), title: ratingTitle },
  { label: "G",    titleKey: "stats.headers.G",     value: (s) => s.goals },
  { label: "SH",   titleKey: "stats.headers.SH",    value: (s) => s.shots },
  { label: "PA",   titleKey: "stats.headers.PA",    value: (s) => s.passesAttempted },
  { label: "PC",   titleKey: "stats.headers.PC",    value: (s) => s.passesCompleted },
  {
    label: "ACC%",
    titleKey: "stats.headers.ACC",
    value: (s) =>
      s.passesAttempted > 0
        ? `${Math.round((s.passesCompleted / s.passesAttempted) * 100)}%`
        : "—",
  },
  { label: "TB",   titleKey: "stats.headers.TB",    value: (s) => s.throughBallsAttempted },
  { label: "TBC",  titleKey: "stats.headers.TBC",   value: (s) => s.throughBallsCompleted },
  {
    label: "TB%",
    titleKey: "stats.headers.TBPCT",
    value: (s) =>
      s.throughBallsAttempted > 0
        ? `${Math.round((s.throughBallsCompleted / s.throughBallsAttempted) * 100)}%`
        : "—",
  },
  { label: "TK",   titleKey: "stats.headers.TK",    value: (s) => s.tackles },
  { label: "IN",   titleKey: "stats.headers.IN",    value: (s) => s.interceptions },
  { label: "FL",   titleKey: "stats.headers.FL",    value: (s) => s.fouls },
  { label: "YC",   titleKey: "stats.headers.YC",    value: (s) => s.yellowCards },
  { label: "RC",   titleKey: "stats.headers.RC",    value: (s) => s.redCards },
  { label: "OFF",  titleKey: "stats.headers.OFF",   value: (s) => s.offsides },
  { label: "MR",   titleKey: "stats.headers.MR",    value: (s) => s.lineMisreads },
  { label: "LP",   titleKey: "stats.headers.LP",    value: (s) => s.mindLapsesDefence + s.mindLapsesOffBall },
  { label: "FW",   titleKey: "stats.headers.FW",    value: (s) => s.foulsWonOwnThird + s.foulsWonMidThird + s.foulsWonFinalThird },
  { label: "PEN",  titleKey: "stats.headers.PEN",   value: (s) => s.penaltyGoals },
  { label: "CR",   titleKey: "stats.headers.CR",    value: (s) => s.crosses },
  { label: "AD",   titleKey: "stats.headers.AD",    value: (s) => s.aerialDuelsWon },
  { label: "HG",   titleKey: "stats.headers.HG",    value: (s) => s.headerGoals },
  { label: "LB",   titleKey: "stats.headers.LB",    value: (s) => s.longBalls },
  { label: "KS",   titleKey: "stats.headers.KS",    value: (s) => s.keeperComeOuts },
  { label: "KW",   titleKey: "stats.headers.KW",    value: (s) => s.keeperCollects },
  { label: "KM",   titleKey: "stats.headers.KM",    value: (s) => s.keeperFeetWins },
  { label: "SOT",  titleKey: "stats.headers.SOT",   value: (s) => s.shotsOnTarget },
  { label: "CK",   titleKey: "stats.headers.CK",    value: (s) => s.corners },
  { label: "TI",   titleKey: "stats.headers.TI",    value: (s) => s.throwIns },
  {
    label: "DFK",
    titleKey: "stats.headers.DFK",
    value: (s) => (s.directFreeKickShots > 0 ? `${s.directFreeKickShots} (${s.directFreeKickGoals})` : 0),
  },
  { label: "SPG",  titleKey: "stats.headers.SPG",   value: (s) => s.setPieceGoals },
  { label: "DST",  titleKey: "stats.headers.DST",   value: (s) => Math.round(s.distanceCovered) },
  { label: "SPR",  titleKey: "stats.headers.SPR",   value: (s) => s.sprints },
];

const EMPTY_STATS: PlayerStats = emptyPlayerStats();

function TeamTable({
  team,
  teamName,
  accentColor,
  players,
  substitutions,
  stats,
  side,
}: {
  team: "A" | "B";
  teamName?: string;
  accentColor: string;
  players: GamePlayer[];
  substitutions: SubstitutionRecord[];
  stats: Record<number, PlayerStats>;
  side: "left" | "right";
}) {
  const { t } = useTranslation();
  const teamStat = getTeamStats(team);
  const subbedOff = substitutions.filter((s) => s.team === team);

  return (
    <div className="flex-1 min-w-0">
      <div className={`flex items-center gap-2 px-3 py-2 border-b border-border ${side === "right" ? "flex-row-reverse" : ""}`}>
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={kitDotStyle(accentColor)} />
        <span className="font-bold text-sm text-foreground uppercase tracking-[0.08em] font-display">{teamName ?? t("stats.team", { team, defaultValue: `Team ${team}` })}</span>
      </div>

      <div className="grid grid-cols-[40px_1fr_repeat(7,36px)] gap-1 px-3 py-1.5 text-[13px] font-bold uppercase font-display text-muted-foreground border-b border-border/50">
        <div />
        <div className={side === "right" ? "text-right" : ""}>{t("stats.headers.NAME")}</div>
        {COLS.map((col) => (
          <div key={col.label} className="text-center" title={t(col.titleKey)}>
            {col.label}
          </div>
        ))}
      </div>

      <div className="text-sm">
        {players.map((p) => {
          const s = stats[p.id] ?? EMPTY_STATS;
          return (
            <div
              key={p.id}
              className="grid grid-cols-[40px_1fr_repeat(7,36px)] gap-1 px-3 py-1 border-b border-border/20 hover:bg-secondary/20"
            >
              <div className={`flex items-center gap-1.5 ${side === "right" ? "flex-row-reverse" : ""}`}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={kitDotStyle(accentColor)} />
                <span className="text-sm font-bold text-muted-foreground">{p.role}</span>
              </div>
              <div className={`font-medium text-foreground ${side === "right" ? "text-right" : ""}`}>
                {p.name}
              </div>
              {COLS.map((c) => (
                <div key={c.label} className="text-center text-muted-foreground" title={c.title?.(p.id)}>
                  {c.value(s, p.id)}
                </div>
              ))}
            </div>
          );
        })}

        {/* Substituted-off players — show their accumulated stats before they left */}
        {subbedOff.map((sub) => {
          const s = stats[sub.playerOutId] ?? EMPTY_STATS;
          return (
            <div
              key={`sub-${sub.playerOutId}`}
              className="grid grid-cols-[40px_1fr_repeat(7,36px)] gap-1 px-3 py-1 border-b border-border/20 opacity-50"
              title={t("stats.subbedOff", { minute: sub.matchMinute })}
            >
              <div className={`flex items-center gap-1.5 ${side === "right" ? "flex-row-reverse" : ""}`}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={kitDotStyle(accentColor)} />
                <span className="text-sm font-bold text-muted-foreground">↓</span>
              </div>
              <div className={`font-medium text-foreground/60  ${side === "right" ? "text-right" : ""}`}>
                {sub.playerOutName}
              </div>
              {COLS.map((c) => (
                <div key={c.label} className="text-center text-muted-foreground" title={c.title?.(sub.playerOutId)}>
                  {c.value(s, sub.playerOutId)}
                </div>
              ))}
            </div>
          );
        })}

        <div className="grid grid-cols-[40px_1fr_repeat(7,36px)] gap-1 px-3 py-1.5 bg-secondary/30 font-bold">
          <div />
          <div className={`text-primary ${side === "right" ? "text-right" : ""}`}>{t("common.total")}</div>
          {COLS.map((c) => (
            <div key={c.label} className="text-center text-foreground">
              {c.value(teamStat)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** End-of-match fitness summary — average energy of everyone who appeared + fatigue-driven AI subs. */
function FitnessSummary({ teamA, teamB }: { teamA: TeamStats; teamB: TeamStats }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-4 px-4 py-1.5 border-b border-border/50 text-sm text-muted-foreground">
      <span>
        {t("stats.avgEndEnergy")}:{" "}
        <span className="text-foreground font-bold tabular-nums">{Math.round(teamA.avgEndEnergy)}</span>
        {" – "}
        <span className="text-foreground font-bold tabular-nums">{Math.round(teamB.avgEndEnergy)}</span>
      </span>
      <span>
        {t("stats.fatigueSubs")}:{" "}
        <span className="text-foreground font-bold tabular-nums">{teamA.fatigueSubstitutions}</span>
        {" – "}
        <span className="text-foreground font-bold tabular-nums">{teamB.fatigueSubstitutions}</span>
      </span>
      {(teamA.injuries > 0 || teamB.injuries > 0) && (
        <span>
          {t("stats.injuries")}:{" "}
          <span className="text-destructive font-bold tabular-nums">{teamA.injuries}</span>
          {" – "}
          <span className="text-destructive font-bold tabular-nums">{teamB.injuries}</span>
          {" · "}{t("stats.injuryStops")}:{" "}
          <span className="text-foreground font-bold tabular-nums">{teamA.injuryStoppages} – {teamB.injuryStoppages}</span>
        </span>
      )}
      {(teamA.studyPlans > 0 || teamB.studyPlans > 0) && (
        <span>
          {t("stats.studyPlans", { defaultValue: "Study plan" })}:{" "}
          <span className="text-foreground font-bold tabular-nums">{teamA.studyPlans} – {teamB.studyPlans}</span>
        </span>
      )}
    </div>
  );
}

/** Stage 17: FM's momentum bar and points (engine A on the left, as the tables). */
function MomentumSummary({ colorA, colorB, nameA, nameB }: { colorA: string; colorB: string; nameA?: string; nameB?: string }) {
  const { t } = useTranslation();
  const m = useMomentum();
  return (
    <div className="px-4 border-b border-border/50">
      <MomentumBar bar={m.bar} colorLeft={colorA} colorRight={colorB} nameLeft={nameA} nameRight={nameB} timeline={m.timeline} />
      <p className="m-0 pb-1.5 text-sm text-muted-foreground tabular-nums">{t("stats.momentumPoints", { a: m.points.A, b: m.points.B })}</p>
    </div>
  );
}

/** Extra-time / shootout summary — shown only when the match actually had them. */
function KnockoutSummary({ teamA, teamB }: { teamA: TeamStats; teamB: TeamStats }) {
  const { t } = useTranslation();
  const hadExtraTime = teamA.extraTimePlayed === 1 || teamB.extraTimePlayed === 1;
  if (!hadExtraTime) return null;
  const hadShootout = teamA.penaltiesTaken > 0 || teamB.penaltiesTaken > 0;

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border/50 text-sm">
      <span className="px-2 py-0.5 rounded bg-chart-4/10 text-chart-4 font-semibold">
        {t("stats.extraTime", { defaultValue: "Extra time" })}
      </span>
      {hadShootout && (
        <span className="text-muted-foreground">
          {t("stats.penalties", { defaultValue: "Penalties" })}:{" "}
          <span className="text-foreground font-bold tabular-nums">{teamA.penaltiesScored}</span>
          {" – "}
          <span className="text-foreground font-bold tabular-nums">{teamB.penaltiesScored}</span>
        </span>
      )}
    </div>
  );
}

export function StatsPanel({
  players,
  substitutions = [],
  teamColorA,
  teamColorB,
  teamNameA,
  teamNameB,
}: {
  players: GamePlayer[];
  substitutions?: SubstitutionRecord[];
  teamColorA: string;
  teamColorB: string;
  teamNameA?: string;
  teamNameB?: string;
}) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Record<number, PlayerStats>>(() =>
    Object.fromEntries(getAllPlayerStats()),
  );

  useEffect(() => {
    return gameBus.on("statsUpdated", (s) => setStats({ ...s }));
  }, []);

  const teamA = players.filter((p) => p.team === "A");
  const teamB = players.filter((p) => p.team === "B");
  // Recomputed every render; the `stats` state update above (on "statsUpdated")
  // is what triggers the re-render, and getTeamStats reads the same module-level
  // store that event was just emitted from — so this always reflects the latest.
  const teamAStats = getTeamStats("A");
  const teamBStats = getTeamStats("B");

  return (
    <div className="bg-card/80 backdrop-blur-sm border-t border-border">
      <div className="px-4 py-2 border-b border-border">
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">
          {t("stats.matchStatistics")}
        </h3>
      </div>
      <FitnessSummary teamA={teamAStats} teamB={teamBStats} />
      <MomentumSummary colorA={teamColorA} colorB={teamColorB} nameA={teamNameA} nameB={teamNameB} />
      <KnockoutSummary teamA={teamAStats} teamB={teamBStats} />
      <div className="flex gap-4 p-2">
        <TeamTable team="A" teamName={teamNameA} accentColor={teamColorA} players={teamA} substitutions={substitutions} stats={stats} side="left" />
        <TeamTable team="B" teamName={teamNameB} accentColor={teamColorB} players={teamB} substitutions={substitutions} stats={stats} side="right" />
      </div>
    </div>
  );
}
