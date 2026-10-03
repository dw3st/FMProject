import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { competitionName } from "@/Domain/world/labels";
import type { LeagueData } from "@/types/playerTypes";

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
}

/**
 * The end of a career (`.claude/rules/game/board-fans.md`): the board sacked the manager. Reads
 * `meta.ended` (club, reason, record at the club) of the active save.
 */
export function FiredScreen() {
  const { t, i18n } = useTranslation();
  const { save, loading } = useGameSave();
  const [leagues, setLeagues] = useState<LeagueData[]>([]);

  useEffect(() => {
    void fetch("/api/leagues")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: LeagueData[]) => setLeagues(Array.isArray(d) ? d : []))
      .catch(() => setLeagues([]));
  }, []);

  const ended = save?.ended ?? null;
  if (loading) return null;

  if (!ended) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-sm text-muted-foreground m-0">{t("fired.noCareer")}</p>
        <a href="/start" className="h-10 inline-flex items-center rounded px-5 bg-primary text-primary-foreground font-semibold text-sm no-underline">
          {t("fired.returnToMenu")}
        </a>
      </div>
    );
  }

  const { record } = ended;
  const winRate = record.played > 0 ? Math.round((record.wins / record.played) * 1000) / 10 : 0;
  const titles = record.titles.map((title) => competitionName(title.split(":")[1] ?? title, leagues, i18n.language));

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="relative z-10 max-w-2xl w-full">
        <div className="card-arcade rounded-md border-2 border-destructive/50 p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center border border-destructive">
              <Icon name="xcircle" size={32} className="text-destructive" />
            </div>
          </div>

          <div>
            <h1 className="font-display font-black uppercase tracking-tight text-3xl md:text-4xl leading-none m-0 text-destructive">
              {t("fired.youveFired")}
            </h1>
            <p className="text-muted-foreground mt-2 m-0">{t("fired.boardTerminated", { club: ended.clubName })}</p>
          </div>

          <div className="card-arcade rounded-md p-4 border border-destructive/30">
            <p className="text-sm text-muted-foreground m-0">"{t(`fired.reason.${ended.reason}`)}"</p>
            <p className="text-[13px] text-destructive mt-2 font-bold uppercase tracking-[0.08em] m-0 font-display">
              {t("fired.chairmanQuote")}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-arcade rounded-lg p-3">
              <Icon name="calendar" className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold font-display tabular-nums m-0">
                {t("fired.days", { count: daysBetween(record.startDate, ended.date) })}
              </p>
              <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">{t("fired.tenure")}</p>
            </div>
            <div className="card-arcade rounded-lg p-3">
              <Icon name="trophy" className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold font-display tabular-nums m-0">{record.played}</p>
              <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">{t("fired.matches")}</p>
            </div>
            <div className="card-arcade rounded-lg p-3">
              <Icon name="trend-down" className="w-5 h-5 text-destructive mx-auto mb-1" />
              <p className="text-lg font-bold font-display tabular-nums m-0">{winRate}%</p>
              <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">{t("fired.winRate")}</p>
            </div>
            <div className="card-arcade rounded-lg p-3">
              <p className="text-lg font-bold font-display tabular-nums text-destructive m-0">
                {ended.position !== null ? t("fired.positionValue", { n: ended.position }) : "—"}
              </p>
              <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground mt-1 m-0">{t("fired.finalPosition")}</p>
            </div>
          </div>

          <div className="flex justify-center gap-6 text-sm">
            <div>
              <span className="text-primary font-bold">{record.wins}</span>
              <span className="text-muted-foreground ml-1">{t("fired.wins")}</span>
            </div>
            <div>
              <span className="text-chart-4 font-bold">{record.draws}</span>
              <span className="text-muted-foreground ml-1">{t("fired.draws")}</span>
            </div>
            <div>
              <span className="text-destructive font-bold">{record.losses}</span>
              <span className="text-muted-foreground ml-1">{t("fired.losses")}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">
              {t("fired.achievementsDuringTenure")}
            </p>
            {titles.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-2">
                {titles.map((name, i) => (
                  <span key={i} className="px-2 py-0.5 rounded border border-primary/40 text-primary text-sm">{name}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground m-0">{t("fired.noAchievements")}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <a
              href="/start"
              className="flex-1 h-10 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground font-semibold text-sm no-underline"
            >
              {t("fired.returnToMenu")}
            </a>
            <a
              href="/new-game"
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
