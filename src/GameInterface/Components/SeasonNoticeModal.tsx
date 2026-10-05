import { useTranslation } from "react-i18next";
import type { LeagueData } from "@/types/playerTypes";
import { Modal } from "@/GameInterface/Components/Modal";
import { Icon } from "@/GameInterface/Icons";
import type { FastForwardProgress, SeasonNotice } from "@/GameInterface/useAdvanceDay";

function leagueNameOf(slug: string, leagues: LeagueData[]): string {
  return leagues.find((l) => l.slug === slug)?.name ?? slug;
}

/** End of the player's country season: champion (if it was the player), promotion/relegation. */
export function SeasonNoticeModal({
  notice,
  leagues,
  currentLeagueName,
  onDismiss,
}: {
  notice: SeasonNotice;
  leagues: LeagueData[];
  /** Shown when the club stayed in its division. */
  currentLeagueName: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const move = notice.playerMove;

  return (
    <Modal open onClose={onDismiss} size="sm">
      <div className="p-6 flex flex-col gap-4">
        <h2 className="font-display font-black uppercase text-xl leading-none m-0">
          {notice.archiveYear != null
            ? t("seasonNotice.titleYear", { year: notice.archiveYear })
            : t("seasonNotice.title")}
        </h2>

        {notice.playerChampionOf && (
          <p className="flex items-center gap-2 text-sm font-bold text-primary">
            <Icon name="trophy" size={18} />
            {t("seasonNotice.champion", { league: leagueNameOf(notice.playerChampionOf, leagues) })}
          </p>
        )}

        {move ? (
          <p
            className={`flex items-center gap-2 text-sm font-bold ${
              move.kind === "promoted" ? "text-primary" : "text-destructive"
            }`}
          >
            <Icon name={move.kind === "promoted" ? "trend-up" : "trend-down"} size={18} />
            {t(move.kind === "promoted" ? "seasonNotice.promoted" : "seasonNotice.relegated", {
              league: leagueNameOf(move.to, leagues),
            })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("seasonNotice.stayed", { league: currentLeagueName })}
          </p>
        )}

        {notice.moves.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("seasonNotice.moves", { count: notice.moves.length })}
          </p>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="self-end px-4 h-10 rounded bg-primary text-primary-foreground text-sm font-semibold cursor-pointer border-0 px-5"
        >
          {t("seasonNotice.ok")}
        </button>
      </div>
    </Modal>
  );
}

/** Progress of "advance to next match": days done / days to the target, with a Stop button. */
export function FastForwardModal({
  progress,
  onStop,
  onDismiss,
  unemployed = false,
}: {
  progress: FastForwardProgress;
  onStop: () => void;
  onDismiss: () => void;
  /** Without a club the fast-forward runs until the next job offers, not a match. */
  unemployed?: boolean;
}) {
  const { t } = useTranslation();
  const total = Math.max(1, progress.totalDays);
  const pct = Math.min(100, Math.round((progress.daysAdvanced / total) * 100));
  const failed = progress.error !== null;

  return (
    <Modal open onClose={failed ? onDismiss : () => {}} size="sm">
      <div className="p-6 flex flex-col gap-4">
        <h2 className="font-display font-black uppercase text-xl leading-none m-0 flex items-center gap-2">
          <Icon name="fast-forward" size={18} className="text-primary" />
          {t(unemployed ? "fastForward.titleOffers" : "fastForward.title")}
        </h2>

        <div className="h-2 w-full rounded-full bg-border overflow-hidden">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t("fastForward.progress", { done: progress.daysAdvanced, total })}</span>
          <span>{t("fastForward.currentDate", { date: progress.currentDate })}</span>
        </div>

        {failed && (
          <p className="text-sm text-destructive">{t("fastForward.error", { error: progress.error })}</p>
        )}

        <button
          type="button"
          onClick={failed ? onDismiss : onStop}
          disabled={!failed && progress.stopping}
          className="self-end px-4 py-2 rounded-lg border border-border bg-foreground/5 text-sm font-bold uppercase tracking-[0.08em] text-foreground cursor-pointer transition-all hover:bg-foreground/10 disabled:opacity-50 disabled:cursor-not-allowed font-display"
        >
          {failed ? t("seasonNotice.ok") : progress.stopping ? t("fastForward.stopping") : t("fastForward.stop")}
        </button>
      </div>
    </Modal>
  );
}
