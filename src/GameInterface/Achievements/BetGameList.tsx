import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { betCompetitions, filterBetGames, groupBetGames, type BetDays, type BetScope } from "@/Domain/bets/gameList";
import { competitionName } from "@/Domain/world/labels";
import type { SlipPick } from "@/GameInterface/Achievements/BetSlip";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { Icon } from "@/GameInterface/Icons";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import type { Bet, BetGame, BetPick, BetSide } from "@/types/betTypes";
import type { LeagueData } from "@/types/playerTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";
const SIDES: BetSide[] = ["home", "draw", "away"];

export const gameKey = (g: Pick<BetGame, "competition" | "fixtureId">) => `${g.competition}:${g.fixtureId}`;
const samePick = (a: BetPick | undefined, b: BetPick) => !!a && JSON.stringify({ ...a, playerName: "" }) === JSON.stringify({ ...b, playerName: "" });

export type GameDetail = BetGame | "loading" | "failed";

/** A price button: the bet365 odds cell (label above, price below). */
function OddsButton({ label, odds, on, disabled, onClick, wide }: { label: string; odds: number | null; on: boolean; disabled: boolean; onClick: () => void; wide?: boolean }) {
  const { i18n } = useTranslation();
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled || odds === null}
      onClick={onClick}
      title={label}
      className={`flex items-center justify-between gap-2 h-10 px-2.5 rounded-md border text-sm font-semibold transition-colors min-w-0 ${wide ? "w-full" : "w-[78px]"} ${
        on ? "border-primary ring-1 ring-primary bg-primary/15 text-primary" : "border-border bg-secondary/20 text-foreground hover:border-primary"
      } disabled:opacity-35 disabled:hover:border-border`}
    >
      <span className={`truncate ${on ? "" : "text-muted-foreground"}`}>{label}</span>
      <span className="tabular-nums">{odds === null ? "—" : odds.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </button>
  );
}

/** The other markets of a game, opened under its row: exact score and scorers of each side. */
function MoreMarkets({ game, detail, slip, taken, onPick }: {
  game: BetGame; detail: GameDetail | undefined; slip: SlipPick | null; taken: (m: BetPick["market"]) => boolean;
  onPick: (game: BetGame, pick: BetPick, odds: number) => void;
}) {
  const { t } = useTranslation();
  if (!detail || detail === "loading") return <p className="text-sm text-muted-foreground m-0 px-4 py-3">{t("bets.loadingMarkets")}</p>;
  if (detail === "failed") return <p role="alert" className="text-sm text-destructive m-0 px-4 py-3">{t("bets.errors.generic")}</p>;
  const sel = slip && gameKey(slip.game) === gameKey(game) ? slip.pick : undefined;
  const side = (s: "home" | "away") => detail.markets.scorers.filter((x) => x.side === s);
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr_1fr] gap-4 px-4 py-3 bg-secondary/10">
      <div className="flex flex-col gap-1.5">
        <p className={LABEL}>{t("bets.market.score")}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {detail.markets.scores.map((s) => {
            const p: BetPick = { market: "score", home: s.home, away: s.away };
            return <OddsButton key={`${s.home}-${s.away}`} wide label={`${s.home}-${s.away}`} odds={s.odds} on={samePick(sel, p)} disabled={taken("score")} onClick={() => onPick(detail, p, s.odds)} />;
          })}
        </div>
      </div>
      {(["home", "away"] as const).map((s) => side(s).length > 0 && (
        <div key={s} className="flex flex-col gap-1.5 min-w-0">
          <p className={`${LABEL} truncate`}>{t("bets.scorerOf", { team: s === "home" ? detail.homeName : detail.awayName })}</p>
          {side(s).map((x) => {
            const p: BetPick = { market: "scorer", playerId: x.playerId, playerName: x.playerName };
            return <OddsButton key={x.playerId} wide label={x.playerName} odds={x.odds} on={samePick(sel, p)} disabled={taken("scorer")} onClick={() => onPick(detail, p, x.odds)} />;
          })}
        </div>
      ))}
    </div>
  );
}

/** Finding a game: club search, days, competitions, then the games by competition and day, odds on the row. */
export function BetGameList({ games, today, mine, open, slip, query, scope, days, expanded, details, leagues, day, nextDate, onQuery, onScope, onDays, onToggle, onPick }: {
  games: BetGame[];
  today: string;
  mine: string[];
  open: Bet[];
  slip: SlipPick | null;
  query: string;
  scope: BetScope;
  days: BetDays;
  expanded: string | null;
  details: Record<string, GameDetail>;
  leagues: LeagueData[];
  day: (d: string) => string;
  nextDate: string | null | undefined;
  onQuery: (q: string) => void;
  onScope: (s: BetScope) => void;
  onDays: (d: BetDays) => void;
  onToggle: (g: BetGame) => void;
  onPick: (game: BetGame, pick: BetPick, odds: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const name = (slug: string) => competitionName(slug, leagues, i18n.language);
  const shown = useMemo(() => filterBetGames(games, { query, scope, days, today, mine }), [games, query, scope, days, today, mine]);
  const groups = useMemo(() => groupBetGames(shown, mine), [shown, mine]);
  const competitionOptions = useMemo(() => [
    { value: "mine", label: t("bets.mine") },
    { value: "all", label: t("bets.allCompetitions") },
    ...betCompetitions(games).map((c) => ({ value: c.competition, label: `${name(c.competition)} (${c.count})`, group: t("bets.withGames") })),
  ], [games, leagues, i18n.language, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const takenOf = (g: BetGame) => (m: BetPick["market"]) => open.some((b) => b.competition === g.competition && b.fixtureId === g.fixtureId && b.pick.market === m);

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 min-w-[220px] flex-1 max-w-sm">
          <span className={LABEL}>{t("bets.search.label")}</span>
          <span className="relative">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={t("bets.search.placeholder")}
              className="w-full h-10 rounded border border-border bg-transparent pl-9 pr-3 text-sm focus:border-primary outline-none"
            />
          </span>
        </label>
        <SelectCombobox label={t("bets.competition")} value={scope} onChange={onScope} options={competitionOptions} className="w-full sm:w-72" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <OptionChips<BetDays>
          aria-label={t("bets.days.label")}
          value={days}
          onChange={onDays}
          options={[{ key: "tomorrow", label: t("bets.days.tomorrow") }, { key: "three", label: t("bets.days.three") }, { key: "week", label: t("bets.days.week") }]}
        />
        <OptionChips<"mine" | "all">
          aria-label={t("bets.competition")}
          value={!query.trim() && (scope === "mine" || scope === "all") ? scope : null}
          onChange={onScope}
          options={[{ key: "mine", label: t("bets.mine") }, { key: "all", label: t("bets.allCompetitions") }]}
        />
        <span className="text-sm text-muted-foreground tabular-nums">{t("bets.gamesCount", { count: shown.length })}</span>
      </div>
      {query.trim() && <p className="text-sm text-muted-foreground m-0">{t("bets.search.everywhere")}</p>}

      {games.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{nextDate ? t("bets.noGamesNext", { date: day(nextDate) }) : t("bets.noGames")}</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground m-0">{scope === "mine" && !query.trim() ? t("bets.noneMine") : t("bets.noneFiltered")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((grp) => (
            <section key={grp.competition} className="card-arcade rounded-md overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-secondary/30 border-b border-border">
                <p className="font-display font-black uppercase text-base leading-none m-0 truncate">{name(grp.competition)}</p>
                <span className="text-sm text-muted-foreground tabular-nums shrink-0">{t("bets.gamesCount", { count: grp.count })}</span>
              </div>
              {grp.days.map((d) => (
                <div key={d.date}>
                  <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border/50">
                    <p className={`${LABEL} flex-1`}>{day(d.date)}</p>
                    <div className="hidden sm:flex gap-1.5 pr-[124px]">
                      {["1", "X", "2"].map((h) => <span key={h} className={`${LABEL} w-[78px] text-center`}>{h}</span>)}
                    </div>
                  </div>
                  {d.games.map((g) => {
                    const key = gameKey(g);
                    const taken = takenOf(g);
                    const sel = slip && gameKey(slip.game) === key ? slip.pick : undefined;
                    const isOpen = expanded === key;
                    return (
                      <div key={key} className="border-b border-border/50 last:border-b-0">
                        <div className={`flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 px-4 py-2 ${g.own ? "bg-primary/5" : ""}`}>
                          <span className="w-12 shrink-0 text-sm text-muted-foreground tabular-nums">{g.kickoff ?? ""}</span>
                          <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 font-semibold">
                            <span className="flex items-center justify-end gap-2 min-w-0">
                              <span className="truncate text-right">{g.homeName}</span>
                              <ClubLogo logoUrl={squadLogoUrl(g.home)} title={g.homeName} className="w-8 h-8 shrink-0" />
                            </span>
                            <span className="text-sm text-muted-foreground">x</span>
                            <span className="flex items-center gap-2 min-w-0">
                              <ClubLogo logoUrl={squadLogoUrl(g.away)} title={g.awayName} className="w-8 h-8 shrink-0" />
                              <span className="truncate">{g.awayName}</span>
                            </span>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            {SIDES.map((s) => {
                              const r = g.markets.result.find((x) => x.side === s);
                              const p: BetPick = { market: "result", side: s };
                              const label = s === "home" ? "1" : s === "draw" ? "X" : "2";
                              return <OddsButton key={s} label={label} odds={r?.odds ?? null} on={samePick(sel, p)} disabled={taken("result")} onClick={() => r && onPick(g, p, r.odds)} />;
                            })}
                          </div>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() => onToggle(g)}
                            className={`shrink-0 h-10 w-[112px] whitespace-nowrap rounded-md border text-sm font-semibold tabular-nums ${isOpen ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-foreground"}`}
                          >
                            {isOpen ? t("bets.lessMarkets") : t("bets.moreMarkets", { count: g.more ?? 0 })}
                          </button>
                        </div>
                        {isOpen && <MoreMarkets game={g} detail={details[key]} slip={slip} taken={taken} onPick={onPick} />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
