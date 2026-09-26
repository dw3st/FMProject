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
        <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm">
          <span className="text-white/60">{t("cups.champion")}: </span>
          <span className="font-bold text-amber-300">{name(cup.championId)}</span>
        </div>
      )}
      {[...cup.stages].reverse().map((stage) => {
        const ties = data.fixtures.filter((f) => f.round === stage.round);
        return (
          <section key={stage.round} className="rounded-lg border border-white/10 bg-white/[0.03]">
            <header className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <h3 className="text-sm font-semibold">{t(`cups.stage.${stage.name}`)}</h3>
              <span className="text-xs text-white/40 tabular-nums">{stage.date}</span>
            </header>
            {!stage.drawn ? (
              <p className="px-4 py-3 text-xs text-white/40">{t("cups.notDrawn")}</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {ties.map((f) => {
                  const mine = f.home === myClubId || f.away === myClubId;
                  const pens = f.decider?.penalties;
                  return (
                    <li
                      key={f.id}
                      className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2 text-sm ${mine ? "bg-primary/10" : ""}`}
                    >
                      <span className="truncate text-right">{name(f.home)}</span>
                      <span className="tabular-nums text-center text-white/80 min-w-16">
                        {f.played && f.result ? `${f.result.home} – ${f.result.away}` : "vs"}
                        {pens && (
                          <span className="block text-[10px] text-white/50">
                            {t("cups.pens", { home: pens.home, away: pens.away })}
                          </span>
                        )}
                        {f.decider && !pens && <span className="block text-[10px] text-white/50">{t("cups.aet")}</span>}
                        {f.neutral && <span className="block text-[10px] text-white/40">{t("cups.neutral")}</span>}
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
