import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { Notice } from "@/GameInterface/ui/Notice";
import { TABLE_CELL, TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { formatGameDate } from "@/GameInterface/formatDate";
import { worldApi, type WorldApiError } from "@/GameInterface/World/worldApi";
import type { PublicEditionView } from "@/types/multiplayerTypes";

/**
 * Editions to list: the running one, and finished ones where somebody scored (a deploy shortly after another leaves
 * empty editions behind). Titled by their dates, never the game version (report).
 */
export function shown(editions: PublicEditionView[]): PublicEditionView[] {
  return editions.filter(e => !e.endedAt || e.standings.some(s => s.total !== 0));
}

/** The public world's hall of fame (multiplayer part 5b): the top 10 of every edition, newest first. */
export function HallOfFame() {
  const { t, i18n } = useTranslation();
  const [editions, setEditions] = useState<PublicEditionView[] | null>(null);
  const [error, setError] = useState<WorldApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    void worldApi.publicHall().then((r) => {
      if (cancelled) return;
      if (r.ok) { setEditions(r.data.editions); setError(null); } else setError(r.error);
    });
    return () => { cancelled = true; };
  }, []);

  const period = (e: PublicEditionView) =>
    e.endedAt
      ? t("world.hall.period", { from: formatGameDate(e.startedAt, i18n.language), to: formatGameDate(e.endedAt, i18n.language) })
      : t("world.hall.current", { from: formatGameDate(e.startedAt, i18n.language) });

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{t("world.hall.title")}</SectionTitle>
      <p className="text-sm text-muted-foreground m-0">{t("world.hall.hint")}</p>
      {error && <Notice kind="error">{t(`world.errors.${error}`)}</Notice>}
      {!editions && !error && <p className="text-sm text-muted-foreground m-0">{t("common.loading")}</p>}
      {editions && editions.length === 0 && <p className="text-sm text-muted-foreground m-0">{t("world.hall.empty")}</p>}
      {editions && shown(editions).map((e) => (
        <div key={`${e.version}-${e.startedAt}`} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-display font-black uppercase text-base tabular-nums">{period(e)}</span>
          </div>
          {e.standings.length === 0 ? (
            <p className="text-sm text-muted-foreground m-0">{t("world.hall.noScores")}</p>
          ) : (
            <div className={TABLE_STYLE.shell}>
              <table className="w-full">
                <thead className={TABLE_STYLE.head}>
                  <tr>
                    <th className={`${TABLE_CELL.head} text-center w-12`}>#</th>
                    <th className={`${TABLE_CELL.head} text-left`}>{t("world.hall.nickname")}</th>
                    <th className={`${TABLE_CELL.head} text-left`}>{t("world.hall.club")}</th>
                    <th className={`${TABLE_CELL.head} text-center`}>{t("world.hall.points")}</th>
                  </tr>
                </thead>
                <tbody className={TABLE_STYLE.body}>
                  {e.standings.map((s) => (
                    <tr key={`${s.rank}-${s.nickname ?? ""}-${s.clubName}`} className={TABLE_STYLE.row}>
                      <td className={`${TABLE_CELL.body} ${TABLE_STYLE.rank} tabular-nums`}>{s.rank}</td>
                      <td className={`${TABLE_CELL.body} ${TABLE_STYLE.name}`}>{s.nickname ?? t("world.hall.noNickname")}</td>
                      <td className={`${TABLE_CELL.body} text-sm text-muted-foreground`}>{s.clubName}</td>
                      <td className={`${TABLE_CELL.body} ${TABLE_STYLE.key}`}>{s.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
