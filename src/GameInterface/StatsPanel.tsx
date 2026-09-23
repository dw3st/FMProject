import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { getAllPlayerStats, getTeamStats } from "@/GameEngine/Domain/Statistics";
import type { PlayerStats } from "@/GameEngine/Domain/Statistics";
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
};

function TeamTable({
  team,
  accentColor,
  players,
  substitutions,
  stats,
  side,
}: {
  team: "A" | "B";
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
        <span className="font-bold text-sm text-foreground uppercase tracking-wider">{t("stats.team", { team, defaultValue: `Team ${team}` })}</span>
      </div>

      <div className="grid grid-cols-[40px_1fr_repeat(7,36px)] gap-1 px-3 py-1.5 text-[10px] font-bold uppercase text-muted-foreground border-b border-border/50">
        <div />
        <div className={side === "right" ? "text-right" : ""}>{t("stats.headers.NAME")}</div>
        {COLS.map((col) => (
          <div key={col.label} className="text-center" title={t(col.titleKey)}>
            {col.label}
          </div>
        ))}
      </div>

      <div className="text-xs">
        {players.map((p) => {
          const s = stats[p.id] ?? EMPTY_STATS;
          return (
            <div
              key={p.id}
              className="grid grid-cols-[40px_1fr_repeat(7,36px)] gap-1 px-3 py-1 border-b border-border/20 hover:bg-secondary/20"
            >
              <div className={`flex items-center gap-1.5 ${side === "right" ? "flex-row-reverse" : ""}`}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accentColor }} />
                <span className="text-[10px] font-bold text-muted-foreground">{p.role}</span>
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
                <span className="text-[10px] font-bold text-muted-foreground">↓</span>
              </div>
              <div className={`font-medium text-foreground/60 italic ${side === "right" ? "text-right" : ""}`}>
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

export function StatsPanel({
  players,
  substitutions = [],
  teamColorA,
  teamColorB,
}: {
  players: GamePlayer[];
  substitutions?: SubstitutionRecord[];
  teamColorA: string;
  teamColorB: string;
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

  return (
    <div className="bg-card/80 backdrop-blur-sm border-t border-border">
      <div className="px-4 py-2 border-b border-border">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t("stats.matchStatistics")}
        </h3>
      </div>
      <div className="flex gap-4 p-2">
        <TeamTable team="A" accentColor={teamColorA} players={teamA} substitutions={substitutions} stats={stats} side="left" />
        <TeamTable team="B" accentColor={teamColorB} players={teamB} substitutions={substitutions} stats={stats} side="right" />
      </div>
    </div>
  );
}
