import { useTranslation } from "react-i18next";
import type { Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";

export interface CupBracketData {
  meta: LeagueSeasonMeta;
  fixtures: Fixture[];
  names: Record<string, string>;
}

/** Stage-by-stage list of a national cup: date, ties, results (with extra time / penalties), champion. */
export function CupBracket({ data, myClubId }: { data: CupBracketData; myClubId: string }) {
  const { t } = useTranslation();
  const cup = data.meta.cup!;
  const name = (id: string) => data.names[id] ?? id;

  return (
    <div className="space-y-4">
      {cup.championId && (
        <div className="rounded-lg border border-chart-4/40 bg-chart-4/10 px-4 py-3 text-sm">
          <span className="text-muted-foreground">{t("cups.champion")}: </span>
          <span className="font-bold text-chart-4">{name(cup.championId)}</span>
        </div>
      )}
      {[...cup.stages].reverse().map((stage) => {
        const ties = data.fixtures.filter((f) => f.round === stage.round);
        return (
          <section key={stage.round} className="rounded-lg border border-border bg-foreground/5">
            <header className="flex items-center justify-between px-4 py-2 border-b border-border">
              <h3 className="font-display font-black uppercase text-xl leading-none m-0">{t(`cups.stage.${stage.name}`)}</h3>
              <span className="text-sm text-muted-foreground tabular-nums">{stage.date}</span>
            </header>
            {!stage.drawn ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">{t("cups.notDrawn")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {ties.map((f) => {
                  const mine = f.home === myClubId || f.away === myClubId;
                  const pens = f.decider?.penalties;
                  return (
                    <li
                      key={f.id}
                      className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2 text-sm ${mine ? "bg-primary/10" : ""}`}
                    >
                      <span className="truncate text-right">{name(f.home)}</span>
                      <span className="tabular-nums text-center text-foreground min-w-16">
                        {f.played && f.result ? `${f.result.home} – ${f.result.away}` : "vs"}
                        {pens && (
                          <span className="block text-sm text-muted-foreground">
                            {t("cups.pens", { home: pens.home, away: pens.away })}
                          </span>
                        )}
                        {f.decider && !pens && <span className="block text-sm text-muted-foreground">{t("cups.aet")}</span>}
                        {f.neutral && <span className="block text-sm text-muted-foreground">{t("cups.neutral")}</span>}
                      </span>
                      <span className="truncate">{name(f.away)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
