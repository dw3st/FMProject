import { useTranslation } from "react-i18next";
import { Trophy, Medal, Award, Target, Handshake, Star, ArrowRight, Crown } from "lucide-react";

export interface SeasonStanding {
  position: number;
  club: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  isYourTeam: boolean;
}

export interface SeasonAwards {
  bestPlayer: { name: string; club: string; rating: number };
  topScorer: { name: string; club: string; goals: number };
  topAssists: { name: string; club: string; assists: number };
}

export interface SeasonSummary {
  season: string;
  league: string;
  standings: SeasonStanding[];
  awards: SeasonAwards;
  yourStats: {
    finalPosition: number;
    isChampion: boolean;
    matchesManaged: number;
    wins: number;
    draws: number;
    losses: number;
  };
}

const mockData: SeasonSummary = {
  season: "2025/26",
  league: "Bundesliga",
  standings: [
    { position: 1, club: "Bayern Munich", played: 34, won: 25, drawn: 6, lost: 3, gf: 78, ga: 28, gd: 50, points: 81, isYourTeam: true },
    { position: 2, club: "Borussia Dortmund", played: 34, won: 23, drawn: 7, lost: 4, gf: 72, ga: 31, gd: 41, points: 76, isYourTeam: false },
    { position: 3, club: "RB Leipzig", played: 34, won: 22, drawn: 5, lost: 7, gf: 68, ga: 35, gd: 33, points: 71, isYourTeam: false },
  ],
  awards: {
    bestPlayer: { name: "Jamal Musiala", club: "Bayern Munich", rating: 8.2 },
    topScorer: { name: "Harry Kane", club: "Bayern Munich", goals: 29 },
    topAssists: { name: "Florian Wirtz", club: "Leverkusen", assists: 18 },
  },
  yourStats: {
    finalPosition: 1,
    isChampion: true,
    matchesManaged: 34,
    wins: 25,
    draws: 6,
    losses: 3,
  },
};

const positionStyles: Record<number, { bg: string; border: string; text: string; icon: typeof Crown }> = {
  1: { bg: "bg-yellow-500/20", border: "border-yellow-500", text: "text-yellow-500", icon: Crown },
  2: { bg: "bg-slate-300/20", border: "border-slate-300", text: "text-slate-300", icon: Medal },
  3: { bg: "bg-amber-700/20", border: "border-amber-700", text: "text-amber-700", icon: Medal },
};

function ordinal(n: number): string {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

export function SeasonEndScreen() {
  const { t } = useTranslation();
  const data = mockData;

  return (
    <main className="flex-1 p-4 lg:p-8 overflow-auto">
        {data.yourStats.isChampion && (
          <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-yellow-500/10 blur-3xl animate-pulse" />
            <div className="absolute top-1/3 right-1/4 w-96 h-96 rounded-full bg-primary/10 blur-3xl animate-pulse" />
            <div className="absolute bottom-0 left-1/2 w-96 h-96 rounded-full bg-yellow-500/5 blur-3xl animate-pulse" />
          </div>
        )}

        <div className="relative z-10 max-w-5xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground uppercase tracking-widest m-0">{t("seasonEnd.seasonComplete")}</p>
            <h1 className="text-4xl lg:text-5xl font-black font-display uppercase tracking-wider m-0">
              {data.league} <span className="text-primary">{data.season}</span>
            </h1>
            {data.yourStats.isChampion && (
              <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-yellow-500/20 border border-yellow-500 text-yellow-500">
                <Trophy className="w-5 h-5" />
                <span className="font-bold uppercase tracking-wider">{t("seasonEnd.champions")}</span>
                <Trophy className="w-5 h-5" />
              </div>
            )}
          </div>

          {/* Podium */}
          <div className="grid grid-cols-3 gap-4 items-end">
            <div className="order-1">
              <PodiumCard position={2} team={data.standings[1]!} styles={positionStyles[2]!} height="h-40" />
            </div>
            <div className="order-2">
              <PodiumCard position={1} team={data.standings[0]!} styles={positionStyles[1]!} height="h-52" isWinner />
            </div>
            <div className="order-3">
              <PodiumCard position={3} team={data.standings[2]!} styles={positionStyles[3]!} height="h-32" />
            </div>
          </div>

          {/* Awards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AwardCard
              icon={Star}
              iconColor="text-primary"
              iconBg="bg-primary/20"
              iconBorder="border-primary"
              label={t("seasonEnd.bestPlayer")}
              name={data.awards.bestPlayer.name}
              club={data.awards.bestPlayer.club}
              statIcon={Award}
              stat={`${data.awards.bestPlayer.rating} ${t("seasonEnd.avgRating")}`}
              statColor="text-primary"
              statBg="bg-primary/20"
            />
            <AwardCard
              icon={Target}
              iconColor="text-yellow-500"
              iconBg="bg-yellow-500/20"
              iconBorder="border-yellow-500"
              label={t("seasonEnd.topScorer")}
              name={data.awards.topScorer.name}
              club={data.awards.topScorer.club}
              statIcon={Target}
              stat={`${data.awards.topScorer.goals} ${t("seasonEnd.goals")}`}
              statColor="text-yellow-500"
              statBg="bg-yellow-500/20"
            />
            <AwardCard
              icon={Handshake}
              iconColor="text-sky-500"
              iconBg="bg-sky-500/20"
              iconBorder="border-sky-500"
              label={t("seasonEnd.mostAssists")}
              name={data.awards.topAssists.name}
              club={data.awards.topAssists.club}
              statIcon={Handshake}
              stat={`${data.awards.topAssists.assists} ${t("seasonEnd.assists")}`}
              statColor="text-sky-500"
              statBg="bg-sky-500/20"
            />
          </div>

          {/* Your Summary */}
          <div className="card-arcade rounded-xl p-6 border-glow">
            <h3 className="text-lg font-bold font-display uppercase tracking-wider text-primary mb-4 m-0">
              {t("seasonEnd.yourSeasonSummary")}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <p className="text-2xl font-black font-display text-primary m-0">
                  {data.yourStats.finalPosition}{ordinal(data.yourStats.finalPosition)}
                </p>
                <p className="text-xs text-muted-foreground uppercase m-0">{t("seasonEnd.finalPosition")}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black font-display m-0">{data.yourStats.matchesManaged}</p>
                <p className="text-xs text-muted-foreground uppercase m-0">{t("seasonEnd.matches")}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black font-display text-primary m-0">{data.yourStats.wins}</p>
                <p className="text-xs text-muted-foreground uppercase m-0">{t("seasonEnd.wins")}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black font-display text-yellow-500 m-0">{data.yourStats.draws}</p>
                <p className="text-xs text-muted-foreground uppercase m-0">{t("seasonEnd.draws")}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black font-display text-destructive m-0">{data.yourStats.losses}</p>
                <p className="text-xs text-muted-foreground uppercase m-0">{t("seasonEnd.losses")}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/leagues"
              className="px-8 py-3 rounded-xl border border-border text-foreground hover:border-primary font-bold text-sm uppercase tracking-wider transition-all no-underline text-center"
            >
              {t("seasonEnd.viewFullStandings")}
            </a>
            <a
              href="/dashboard"
              className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider glow-primary hover:scale-[1.02] transition-all no-underline text-center inline-flex items-center justify-center gap-2"
            >
              {t("seasonEnd.continueNextSeason")}
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
    </main>
  );
}

function PodiumCard({
  position,
  team,
  styles,
  height,
  isWinner = false,
}: {
  position: number;
  team: SeasonStanding;
  styles: { bg: string; border: string; text: string; icon: typeof Crown };
  height: string;
  isWinner?: boolean;
}) {
  const { t } = useTranslation();
  const Icon = styles.icon;
  const posLabel = position === 1 ? t("seasonEnd.champion") : position === 2 ? t("seasonEnd.2ndPlace") : t("seasonEnd.3rdPlace");

  return (
    <div className={`card-arcade rounded-xl ${height} p-4 flex flex-col justify-between border-2 ${styles.border} ${team.isYourTeam ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} relative`}>
      <div className="text-center">
        <div className={`w-10 h-10 rounded-full ${styles.bg} flex items-center justify-center mx-auto mb-2 border ${styles.border}`}>
          <Icon className={`w-5 h-5 ${styles.text}`} />
        </div>
        <p className={`text-xs uppercase tracking-wider ${styles.text} font-bold m-0`}>
          {posLabel}
        </p>
      </div>

      <div className="text-center">
        <p className={`font-bold font-display text-sm lg:text-base m-0 ${team.isYourTeam ? "text-primary" : "text-foreground"}`}>
          {team.club}
        </p>
        <p className={`text-2xl lg:text-3xl font-black font-display m-0 ${styles.text}`}>
          {team.points} <span className="text-xs text-muted-foreground">{t("common.pts")}</span>
        </p>
      </div>

      {isWinner && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Trophy className="w-8 h-8 text-yellow-500 drop-shadow-lg" />
        </div>
      )}
    </div>
  );
}

function AwardCard({
  icon: Icon,
  iconColor,
  iconBg,
  iconBorder,
  label,
  name,
  club,
  statIcon: StatIcon,
  stat,
  statColor,
  statBg,
}: {
  icon: typeof Star;
  iconColor: string;
  iconBg: string;
  iconBorder: string;
  label: string;
  name: string;
  club: string;
  statIcon: typeof Star;
  stat: string;
  statColor: string;
  statBg: string;
}) {
  return (
    <div className="card-arcade rounded-xl p-5 border-glow text-center space-y-3">
      <div className={`w-14 h-14 rounded-full ${iconBg} flex items-center justify-center mx-auto border ${iconBorder}`}>
        <Icon className={`w-7 h-7 ${iconColor}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 m-0">{label}</p>
        <p className="text-lg font-bold font-display m-0">{name}</p>
        <p className="text-sm text-muted-foreground m-0">{club}</p>
      </div>
      <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full ${statBg} ${statColor} text-sm font-bold`}>
        <StatIcon className="w-4 h-4" />
        {stat}
      </div>
    </div>
  );
}
