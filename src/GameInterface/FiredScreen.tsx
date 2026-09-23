import { useTranslation } from "react-i18next";
import { XCircle, TrendingDown, Calendar, Trophy, ArrowRight } from "lucide-react";

export interface FiringData {
  clubName: string;
  tenure: string;
  matchesManaged: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  lastPosition: number;
  boardReason: string;
  achievements: string[];
}

const mockData: FiringData = {
  clubName: "FC Augsburg",
  tenure: "1 year, 2 months",
  matchesManaged: 48,
  wins: 18,
  draws: 12,
  losses: 18,
  winRate: 37.5,
  lastPosition: 14,
  boardReason: "Failure to meet board expectations. The team finished in the relegation zone for two consecutive months.",
  achievements: [
    "DFB-Pokal Quarter-Finals 2026",
  ],
};

export function FiredScreen() {
  const { t } = useTranslation();
  const data = mockData;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden opacity-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-destructive blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-destructive/50 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-2xl w-full">
        <div className="card-arcade rounded-2xl border-2 border-destructive/50 p-8 text-center space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full bg-destructive/20 flex items-center justify-center border-2 border-destructive">
              <XCircle className="w-12 h-12 text-destructive" />
            </div>
          </div>

          {/* Title */}
          <div>
            <h1 className="text-4xl font-black font-display uppercase tracking-wider text-destructive m-0">
              {t("fired.youveFired")}
            </h1>
            <p className="text-muted-foreground mt-2 m-0">
              {t("fired.boardTerminated")} <span className="text-foreground font-semibold">{data.clubName}</span> {t("fired.boardTerminated2")}
            </p>
          </div>

          {/* Reason */}
          <div className="card-arcade rounded-xl p-4 border border-destructive/30">
            <p className="text-sm italic text-muted-foreground m-0">
              "{data.boardReason}"
            </p>
            <p className="text-xs text-destructive mt-2 font-semibold uppercase tracking-wider m-0">
              {t("fired.chairmanQuote")}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-arcade rounded-lg p-3 border-glow">
              <Calendar className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold font-display m-0">{data.tenure}</p>
              <p className="text-xs text-muted-foreground uppercase m-0">{t("fired.tenure")}</p>
            </div>
            <div className="card-arcade rounded-lg p-3 border-glow">
              <Trophy className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold font-display m-0">{data.matchesManaged}</p>
              <p className="text-xs text-muted-foreground uppercase m-0">{t("fired.matches")}</p>
            </div>
            <div className="card-arcade rounded-lg p-3 border-glow">
              <TrendingDown className="w-5 h-5 text-destructive mx-auto mb-1" />
              <p className="text-lg font-bold font-display m-0">{data.winRate}%</p>
              <p className="text-xs text-muted-foreground uppercase m-0">{t("fired.winRate")}</p>
            </div>
            <div className="card-arcade rounded-lg p-3 border-glow">
              <p className="text-lg font-bold font-display text-destructive m-0">{data.lastPosition}th</p>
              <p className="text-xs text-muted-foreground uppercase mt-1 m-0">{t("fired.finalPosition")}</p>
            </div>
          </div>

          {/* Record */}
          <div className="flex justify-center gap-6 text-sm">
            <div>
              <span className="text-primary font-bold">{data.wins}</span>
              <span className="text-muted-foreground ml-1">{t("fired.wins")}</span>
            </div>
            <div>
              <span className="text-yellow-500 font-bold">{data.draws}</span>
              <span className="text-muted-foreground ml-1">{t("fired.draws")}</span>
            </div>
            <div>
              <span className="text-destructive font-bold">{data.losses}</span>
              <span className="text-muted-foreground ml-1">{t("fired.losses")}</span>
            </div>
          </div>

          {/* Achievements */}
          {data.achievements.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider m-0">{t("fired.achievementsDuringTenure")}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {data.achievements.map((achievement, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium border border-primary/30"
                  >
                    {achievement}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <a
              href="/start"
              className="flex-1 py-3 rounded-xl border border-border text-foreground hover:border-primary font-bold text-sm uppercase tracking-wider transition-all no-underline text-center"
            >
              {t("fired.returnToMenu")}
            </a>
            <a
              href="/coming-soon"
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wider glow-primary hover:scale-[1.02] transition-all no-underline text-center inline-flex items-center justify-center gap-2"
            >
              {t("fired.findNewClub")}
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
