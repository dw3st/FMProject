import { useTranslation } from "react-i18next";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { AwardBadge } from "@/GameInterface/Awards/AwardBadge";
import { competitionName } from "@/Domain/world/labels";
import type { AwardKind } from "@/types/awardTypes";
import type { LeagueData, PlayerHistoryRow } from "@/types/playerTypes";

const SHOWN = 6;

export interface AwardOnRow { kind: AwardKind; title: string; key: string }

/** Every award of the history rows, most recent first, with its "league season" / year title. */
export function awardsOfHistory(rows: PlayerHistoryRow[] | undefined, leagueName: (slug: string) => string): AwardOnRow[] {
  const out: AwardOnRow[] = [];
  (rows ?? []).forEach((r, i) => {
    (r.awards ?? []).forEach((a, j) => {
      const title = a.year !== undefined ? String(a.year) : `${leagueName(a.league ?? r.league)} ${r.season}`;
      out.push({ kind: a.kind, title, key: `${i}-${j}` });
    });
  });
  return out.reverse();
}

/** Award badges on the player's page (up to six, the most recent first, then "+N"). */
export function PlayerAwards({ history, leagues }: { history: PlayerHistoryRow[] | undefined; leagues: LeagueData[] }) {
  const { t, i18n } = useTranslation();
  const all = awardsOfHistory(history, (slug) => competitionName(slug, leagues, i18n.language));
  if (all.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>{t("awards.title")}</SectionTitle>
      <div className="flex flex-wrap items-center gap-2">
        {all.slice(0, SHOWN).map((a) => <AwardBadge key={a.key} kind={a.kind} title={a.title} />)}
        {all.length > SHOWN && (
          <span className="text-sm text-muted-foreground tabular-nums" title={all.slice(SHOWN).map((a) => `${t(`awards.kind.${a.kind}`)} · ${a.title}`).join("\n")}>
            {t("awards.more", { count: all.length - SHOWN })}
          </span>
        )}
      </div>
    </section>
  );
}
