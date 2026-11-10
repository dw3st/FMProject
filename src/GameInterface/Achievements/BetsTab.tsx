import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { stepStake } from "@/Domain/bets/bets";
import { BETS } from "@/Domain/bets/betsConfig";
import { formatFee } from "@/Domain/money";
import { competitionName } from "@/Domain/world/labels";
import { pickLabel } from "@/GameInterface/Achievements/betText";
import { ClubLogo, squadLogoUrl } from "@/GameInterface/Components/ClubLogo";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { Button } from "@/GameInterface/ui/Button";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import { useLeagueCatalog } from "@/GameInterface/World/useLeagueCatalog";
import { SelectCombobox } from "@/GameInterface/Components/SelectCombobox";
import { ALL_COMPETITIONS } from "@/Domain/stats/rankings";
import { statsCompetitionOptions } from "@/GameInterface/statsCompetitionOptions";
import countriesRaw from "@/Data/countries.json";
import type { CountryEntry } from "@/types/worldTypes";
import type { Bet, BetGame, BetPick, BetsView } from "@/types/betTypes";

const COUNTRY_BY_NAME = new Map(Object.values(countriesRaw as Record<string, CountryEntry>).map((c) => [c.name, c]));
const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";
const KPI = "font-display font-bold tabular-nums text-2xl m-0 mt-1";
const SECTION = "font-display font-black uppercase text-xl leading-none m-0 mb-2.5";

const money = (v: number) => (v === 0 ? "€0" : formatFee(v));
const samePick = (a: BetPick | null, b: BetPick) => !!a && JSON.stringify({ ...a, playerName: "" }) === JSON.stringify({ ...b, playerName: "" });
const keyOf = (g: BetGame) => `${g.competition}:${g.fixtureId}`;
const logo = (id: string, name: string) => <ClubLogo logoUrl={squadLogoUrl(id)} title={name} className="w-8 h-8 shrink-0" />;

/** A choice with its price: selected like the choice cards of the game. */
function Choice({ label, odds, on, taken, onClick }: { label: string; odds: number; on: boolean; taken: boolean; onClick: () => void }) {
  const { i18n } = useTranslation();
  const price = odds.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <button
      type="button"
      disabled={taken}
      aria-pressed={on}
      onClick={onClick}
      className={`flex shrink-0 items-center justify-between gap-2 h-9 px-3 rounded-md border bg-card text-sm font-semibold min-w-0 transition-colors ${
        on ? "border-primary ring-1 ring-primary text-primary" : "border-border text-foreground hover:border-primary"
      } disabled:opacity-40 disabled:hover:border-border`}
    >
      <span className="truncate">{label}</span>
      <span className={`tabular-nums ${on ? "" : "text-muted-foreground"}`}>{price}</span>
    </button>
  );
}

function BetRows({ bets, game }: { bets: Bet[]; game: (b: Bet) => string }) {
  const { t } = useTranslation();
  return (
    <div className={TABLE_STYLE.shell}>
      <div className={TABLE_STYLE.body}>
        {bets.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="font-semibold m-0 truncate">{pickLabel(t, b.pick, b.homeName, b.awayName)}</p>
              <p className="text-sm text-muted-foreground m-0 truncate">{game(b)}</p>
            </div>
            <div className="text-right shrink-0 tabular-nums">
              <p className="font-semibold m-0">{formatFee(b.stake)} · {b.odds.toFixed(2)}</p>
              {b.status && (
                <p className={`text-sm m-0 ${b.status === "won" ? "text-primary" : b.status === "lost" ? "text-destructive" : "text-muted-foreground"}`}>
                  {b.status === "won" ? `+${formatFee((b.payout ?? 0) - b.stake)}` : t(`bets.status.${b.status}`)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The manager's bets: one game open at a time (`docs/superpowers/specs/2026-11-10-manager-bets-design.md`). */
export function BetsTab() {
  const { t, i18n } = useTranslation();
  const { session } = useGameSave();
  const saveId = session?.saveId;
  const leagues = useLeagueCatalog();
  const [view, setView] = useState<BetsView | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pick, setPick] = useState<{ pick: BetPick; odds: number } | null>(null);
  const [stake, setStake] = useState<number>(BETS.MIN_STAKE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "All" stands for his own competitions, the default list.
  // A friend's card opens the tab on his competition (`?competition=`, 8.9.9).
  const [competition, setCompetition] = useState<string>(
    () => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("competition") : null) || ALL_COMPETITIONS,
  );
  const options = useMemo(
    () => statsCompetitionOptions(leagues, COUNTRY_BY_NAME, i18n.language, t).map((o) => (o.value === ALL_COMPETITIONS ? { ...o, label: t("bets.mine") } : o)),
    [leagues, i18n.language, t],
  );
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!saveId) return;
    const call = ++latest.current;
    try {
      const q = competition === ALL_COMPETITIONS ? "" : `?competition=${encodeURIComponent(competition)}`;
      const res = await fetch(`/api/saves/${saveId}/bets${q}`);
      if (!res.ok) throw new Error(String(res.status));
      const next = await res.json() as BetsView;
      if (call !== latest.current) return;
      setView(next);
      setFailed(false);
    } catch {
      if (call === latest.current) setFailed(true);
    }
  }, [saveId, competition]);
  useEffect(() => { void load(); }, [load]);

  const game = useMemo(() => view?.games.find((g) => keyOf(g) === selected) ?? view?.games[0] ?? null, [view, selected]);
  const day = (d: string) => new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const days = useMemo(() => [...new Set((view?.games ?? []).map((g) => g.date))], [view]);

  if (failed) return <p role="alert" className="text-sm text-destructive m-0">{t("bets.errors.generic")}</p>;
  if (!view) return <p className="text-sm text-muted-foreground m-0">{t("bets.loading")}</p>;

  const max = view.maxStake;
  const value = Math.min(max, Math.max(BETS.MIN_STAKE, stake));
  const taken = (market: BetPick["market"]) => !!game && view.open.some((b) => b.competition === game.competition && b.fixtureId === game.fixtureId && b.pick.market === market);
  const choose = (p: BetPick, odds: number) => { setPick({ pick: p, odds }); setError(null); };
  const selectGame = (g: BetGame) => { setSelected(keyOf(g)); setPick(null); setError(null); };

  async function place() {
    if (!pick || !game) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/bets`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competition: game.competition, fixtureId: game.fixtureId, pick: pick.pick, stake: value, odds: pick.odds }),
      });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        setError(t(`bets.errors.${code}`, { defaultValue: t("bets.errors.generic") }));
        if (code === "oddsChanged" || code === "closed") { setPick(null); await load(); }
        return;
      }
      setPick(null);
      await load();
    } catch {
      setError(t("bets.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const gameText = (b: Bet) => `${b.homeName} x ${b.awayName} · ${day(b.date)}`;
  const canBet = max >= BETS.MIN_STAKE;
  const kpis = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="card-arcade rounded-md px-4 py-3"><p className={LABEL}>{t("bets.wallet")}</p><p className={`${KPI} tabular-nums`}>{money(view.wallet)}</p></div>
      <div className="card-arcade rounded-md px-4 py-3"><p className={LABEL}>{t("bets.openTotal")}</p><p className={`${KPI} tabular-nums`}>{money(view.openTotal)}</p></div>
      <div className="card-arcade rounded-md px-4 py-3">
        <p className={LABEL}>{t("bets.profit")}</p>
        <p className={`${KPI} tabular-nums ${view.betNet > 0 ? "text-primary" : view.betNet < 0 ? "text-destructive" : ""}`}>{view.betNet > 0 ? "+" : ""}{money(view.betNet)}</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {kpis}
      {options.length > 0 && (
        <SelectCombobox
          label={t("bets.competition")}
          value={competition}
          onChange={(v) => { setCompetition(v); setSelected(null); setPick(null); setError(null); }}
          options={options}
          className="max-w-md"
        />
      )}
      {view.games.length === 0 || !game ? (
        <p className="text-sm text-muted-foreground m-0">{view.nextDate ? t("bets.noGamesNext", { date: day(view.nextDate) }) : t("bets.noGames")}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[330px_1fr] gap-4 items-start">
          <div className="card-arcade rounded-md overflow-hidden">
            {days.map((d) => (
              <div key={d}>
                <p className={`${LABEL} px-4 py-3 bg-secondary/30`}>{day(d)}</p>
                {view.games.filter((g) => g.date === d).map((g) => (
                  <button
                    key={keyOf(g)}
                    type="button"
                    aria-pressed={keyOf(g) === keyOf(game)}
                    onClick={() => selectGame(g)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 border-t border-border/50 text-left hover:bg-secondary/30 ${keyOf(g) === keyOf(game) ? "bg-primary/10" : ""}`}
                  >
                    {logo(g.home, g.homeName)}
                    <span className="flex-1 min-w-0 font-semibold">
                      <span className="block truncate">{g.homeName}</span>
                      <span className="block truncate">{g.awayName}</span>
                    </span>
                    {logo(g.away, g.awayName)}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="card-arcade rounded-md overflow-hidden">
            <div className="relative h-[104px] bg-secondary/30 bg-cover bg-[position:30%_62%]" style={newVisualOn() ? { backgroundImage: `url(${gameArtUrl("bets/bets-hero.webp")})` } : undefined}>
              <div className="absolute inset-0 bg-background/55" />
              <div className="absolute inset-0 flex items-center justify-center gap-4 px-4">
                <span className="flex items-center gap-2 min-w-0 font-semibold text-xl"><span className="truncate">{game.homeName}</span>{logo(game.home, game.homeName)}</span>
                <span className={`${LABEL} text-center`}>{competitionName(game.competition, leagues, i18n.language)}<br />{day(game.date)}</span>
                <span className="flex items-center gap-2 min-w-0 font-semibold text-xl">{logo(game.away, game.awayName)}<span className="truncate">{game.awayName}</span></span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_1.25fr_1fr] gap-5 p-4">
              <div>
                <p className={SECTION}>{t("bets.market.result")}</p>
                <div className="flex flex-col gap-1.5">
                  {game.markets.result.map((r) => {
                    const p: BetPick = { market: "result", side: r.side };
                    return <Choice key={r.side} label={r.side === "draw" ? t("bets.draw") : r.side === "home" ? game.homeName : game.awayName} odds={r.odds} on={samePick(pick?.pick ?? null, p)} taken={taken("result")} onClick={() => choose(p, r.odds)} />;
                  })}
                </div>
              </div>
              <div>
                <p className={SECTION}>{t("bets.market.score")}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {game.markets.scores.map((s) => {
                    const p: BetPick = { market: "score", home: s.home, away: s.away };
                    return <Choice key={`${s.home}-${s.away}`} label={`${s.home}-${s.away}`} odds={s.odds} on={samePick(pick?.pick ?? null, p)} taken={taken("score")} onClick={() => choose(p, s.odds)} />;
                  })}
                </div>
              </div>
              <div>
                <p className={SECTION}>{t("bets.market.scorer")}</p>
                <div className="flex flex-col gap-1.5 max-h-[252px] overflow-y-auto">
                  {game.markets.scorers.map((s) => {
                    const p: BetPick = { market: "scorer", playerId: s.playerId, playerName: "" };
                    return <Choice key={s.playerId} label={s.playerName} odds={s.odds} on={samePick(pick?.pick ?? null, p)} taken={taken("scorer")} onClick={() => choose({ ...p, playerName: s.playerName }, s.odds)} />;
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 border-t border-border">
              <div className="flex items-center justify-between w-[220px] h-10 rounded border border-border px-1 font-bold tabular-nums">
                <button type="button" aria-label={t("bets.less")} disabled={!canBet} onClick={() => setStake(stepStake(value, -1, max))} className="w-8 h-8 text-lg hover:text-primary disabled:opacity-40">−</button>
                <span>{formatFee(value)}</span>
                <button type="button" aria-label={t("bets.more")} disabled={!canBet} onClick={() => setStake(stepStake(value, 1, max))} className="w-8 h-8 text-lg hover:text-primary disabled:opacity-40">+</button>
              </div>
              {/* Lowest and highest stake in one click (tester report, 8.9.4). */}
              {(["min", "max"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={!canBet || value === (k === "min" ? BETS.MIN_STAKE : max)}
                  onClick={() => setStake(k === "min" ? BETS.MIN_STAKE : max)}
                  className="h-10 px-3 rounded border border-border bg-card font-display font-bold uppercase tracking-[0.08em] text-sm text-foreground hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-foreground"
                >
                  {t(`bets.${k}`)}
                </button>
              ))}
              <span className="text-sm text-muted-foreground tabular-nums">{canBet ? t("bets.limit", { value: formatFee(max) }) : t("bets.noMoney")}</span>
              <span className="ml-auto text-sm text-muted-foreground">
                {t("bets.return")}
                <b className="ml-1.5 font-display font-bold text-xl tabular-nums text-primary">{pick ? formatFee(Math.round(value * pick.odds)) : "—"}</b>
              </span>
              <Button disabled={!pick || !canBet || busy} onClick={() => void place()}>{t("bets.place")}</Button>
            </div>
            {error && <p role="alert" className="text-sm text-destructive m-0 px-4 pb-3">{error}</p>}
            {game.own && <p className="text-sm text-muted-foreground m-0 px-4 pb-3">{t("bets.ownClub")}</p>}
          </div>
        </div>
      )}

      {view.open.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>{t("bets.open")}</SectionTitle>
          <BetRows bets={view.open} game={gameText} />
        </section>
      )}
      {view.settled.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>{t("bets.history")}</SectionTitle>
          <BetRows bets={view.settled.slice(0, 30)} game={gameText} />
        </section>
      )}
    </div>
  );
}
