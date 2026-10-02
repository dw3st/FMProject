import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { getAllPlayerStats, getTeamStats } from "@/GameEngine/Domain/Statistics";
import type { PlayerStats, TeamStats } from "@/GameEngine/Domain/Statistics";
import type { GamePlayer, SubstitutionRecord } from "@/GameEngine/types";

interface Col {
  label: string;
  titleKey: string;
  value: (s: PlayerStats) => number | string;
}

const COLS: Col[] = [
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
  { label: "PEN",  titleKey: "stats.headers.PEN",   value: (s) => s.penaltyGoals },
];

const EMPTY_STATS: PlayerStats = {
  passesAttempted: 0,
  passesCompleted: 0,
  passesFailed: 0,
  shots: 0,
  goals: 0,
  assists: 0,
  interceptions: 0,
  tackles: 0,
  xg: 0,
  dribblesWon: 0,
  dribblesLost: 0,
  throughBallsAttempted: 0,
  throughBallsCompleted: 0,
  throughBallsLostInFlight: 0,
  throughBallsLostInRace: 0,
  throughBallsLostInDuel: 0,
  looseBallsWon: 0,
  switchPlays: 0,
  penaltiesTaken: 0,
  penaltiesScored: 0,
  fouls: 0,
  yellowCards: 0,
  redCards: 0,
  penaltiesAwarded: 0,
  penaltiesConceded: 0,
  penaltyGoals: 0,
  offsides: 0,
};

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
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: accentColor }} />
        <span className="font-bold text-sm text-foreground uppercase tracking-[0.08em] font-display">{teamName ?? t("stats.team", { team, defaultValue: `Team ${team}` })}</span>
      </div>

      <div className="grid grid-cols-[40px_1fr_repeat(7,36px)] gap-1 px-3 py-1.5 text-[13px] font-bold uppercase text-muted-foreground border-b border-border/50">
        <div />
        <div className={side === "right" ? "text-right" : ""}>{t("stats.headers.NAME")}</div>
        {COLS.map((col) => (
          <div key={col.label} className="text-center" title={t(col.titleKey)}>
            {col.label}
          </div>
        ))}
      </div>

      <div className="text-[13px]">
        {players.map((p) => {
          const s = stats[p.id] ?? EMPTY_STATS;
          return (
            <div
              key={p.id}
              className="grid grid-cols-[40px_1fr_repeat(7,36px)] gap-1 px-3 py-1 border-b border-border/20 hover:bg-secondary/20"
            >
              <div className={`flex items-center gap-1.5 ${side === "right" ? "flex-row-reverse" : ""}`}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accentColor }} />
                <span className="text-[13px] font-bold text-muted-foreground">{p.role}</span>
              </div>
              <div className={`font-medium text-foreground ${side === "right" ? "text-right" : ""}`}>
                {p.name}
              </div>
              {COLS.map((c) => (
                <div key={c.label} className="text-center text-muted-foreground">
                  {c.value(s)}
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
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accentColor }} />
                <span className="text-[13px] font-bold text-muted-foreground">↓</span>
              </div>
              <div className={`font-medium text-foreground/60  ${side === "right" ? "text-right" : ""}`}>
                {sub.playerOutName}
              </div>
              {COLS.map((c) => (
                <div key={c.label} className="text-center text-muted-foreground">
                  {c.value(s)}
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
    <div className="flex items-center gap-4 px-4 py-1.5 border-b border-border/50 text-[13px] text-muted-foreground">
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
        </span>
      )}
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
    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border/50 text-[13px]">
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
      <KnockoutSummary teamA={teamAStats} teamB={teamBStats} />
      <div className="flex gap-4 p-2">
        <TeamTable team="A" teamName={teamNameA} accentColor={teamColorA} players={teamA} substitutions={substitutions} stats={stats} side="left" />
        <TeamTable team="B" teamName={teamNameB} accentColor={teamColorB} players={teamB} substitutions={substitutions} stats={stats} side="right" />
      </div>
    </div>
  );
}
