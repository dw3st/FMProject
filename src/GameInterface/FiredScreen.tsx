import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";

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

      <div className="relative z-10 max-w-2xl w-full">
        <div className="card-arcade rounded-md border-2 border-destructive/50 p-8 text-center space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center border border-destructive">
              <Icon name="xcircle" size={32} className="text-destructive" />
            </div>
          </div>

          {/* Title */}
          <div>
            <h1 className="font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none m-0 text-destructive">
              {t("fired.youveFired")}
            </h1>
            <p className="text-muted-foreground mt-2 m-0">
              {t("fired.boardTerminated")} <span className="text-foreground font-semibold">{data.clubName}</span> {t("fired.boardTerminated2")}
            </p>
          </div>

          {/* Reason */}
          <div className="card-arcade rounded-md p-4 border border-destructive/30">
            <p className="text-sm text-muted-foreground m-0">
              "{data.boardReason}"
            </p>
            <p className="text-[13px] text-destructive mt-2 font-bold uppercase tracking-[0.08em] m-0 font-display">
              {t("fired.chairmanQuote")}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-arcade rounded-lg p-3">
              <Icon name="calendar" className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold font-display tabular-nums m-0">{data.tenure}</p>
              <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">{t("fired.tenure")}</p>
            </div>
            <div className="card-arcade rounded-lg p-3">
              <Icon name="trophy" className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold font-display tabular-nums m-0">{data.matchesManaged}</p>
              <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">{t("fired.matches")}</p>
            </div>
            <div className="card-arcade rounded-lg p-3">
              <Icon name="trend-down" className="w-5 h-5 text-destructive mx-auto mb-1" />
              <p className="text-lg font-bold font-display tabular-nums m-0">{data.winRate}%</p>
              <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">{t("fired.winRate")}</p>
            </div>
            <div className="card-arcade rounded-lg p-3">
              <p className="text-lg font-bold font-display tabular-nums text-destructive m-0">{data.lastPosition}th</p>
              <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground mt-1 m-0">{t("fired.finalPosition")}</p>
            </div>
          </div>

          {/* Record */}
          <div className="flex justify-center gap-6 text-sm">
            <div>
              <span className="text-primary font-bold">{data.wins}</span>
              <span className="text-muted-foreground ml-1">{t("fired.wins")}</span>
            </div>
            <div>
              <span className="text-chart-4 font-bold">{data.draws}</span>
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
              <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground tracking-[0.08em] m-0 font-display font-bold">{t("fired.achievementsDuringTenure")}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {data.achievements.map((achievement, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded border border-primary/40 text-primary text-sm"
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
              className="flex-1 h-10 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground font-semibold text-sm no-underline"
            >
              {t("fired.returnToMenu")}
            </a>
            <a
              href="/coming-soon"
              className="flex-1 h-10 rounded bg-primary text-primary-foreground font-semibold text-sm no-underline inline-flex items-center justify-center gap-2"
            >
              {t("fired.findNewClub")}
              <Icon name="arrow-right" size={16} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
