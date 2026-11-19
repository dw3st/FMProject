import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BETS } from "@/Domain/bets/betsConfig";
import { filterBetGames, type BetDays, type BetScope } from "@/Domain/bets/gameList";
import { formatFee } from "@/Domain/money";
import { BetDashboard, oddsText, signedMoney, toneOf } from "@/GameInterface/Achievements/BetDashboard";
import { BetGameList, gameKey, type GameDetail } from "@/GameInterface/Achievements/BetGameList";
import { BetSlip, type SlipPick } from "@/GameInterface/Achievements/BetSlip";
import { pickLabel } from "@/GameInterface/Achievements/betText";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { SegmentedTabs } from "@/GameInterface/ui/SegmentedTabs";
import { useLeagueCatalog } from "@/GameInterface/World/useLeagueCatalog";
import type { Bet, BetGame, BetPick, BetsView } from "@/types/betTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";
const KPI = "font-display font-bold tabular-nums text-2xl m-0 mt-1";

type BetsSection = "games" | "open" | "stats";
const money = (v: number) => (v === 0 ? "€0" : formatFee(v));

function OpenBets({ bets, game }: { bets: Bet[]; game: (b: Bet) => string }) {
  const { t, i18n } = useTranslation();
  if (bets.length === 0) return <p className="text-sm text-muted-foreground m-0">{t("bets.noOpen")}</p>;
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
              <p className="font-semibold m-0">{formatFee(b.stake)} · {oddsText(b.odds, i18n.language)}</p>
              <p className="text-sm text-muted-foreground m-0">{t("bets.toReturn", { value: formatFee(Math.round(b.stake * b.odds)) })}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The manager's bets (`docs/superpowers/specs/2026-11-10-manager-bets-design.md`): every game of the week with the
 * 1X2 on the row and a slip beside it, the open bets and the record (tester reports).
 */
export function BetsTab() {
  const { t, i18n } = useTranslation();
  const { session } = useGameSave();
  const saveId = session?.saveId;
  const leagues = useLeagueCatalog();
  const [view, setView] = useState<BetsView | null>(null);
  const [failed, setFailed] = useState(false);
  const [section, setSection] = useState<BetsSection>("games");
  // A friend's card opens the tab on his competition (`?competition=`, 8.9.9).
  const [urlCompetition] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("competition") : null));
  const [scope, setScope] = useState<BetScope>(urlCompetition || "mine");
  const scopeTouched = useRef(!!urlCompetition);
  const [query, setQuery] = useState("");
  const [days, setDays] = useState<BetDays>("week");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, GameDetail>>({});
  const [slip, setSlip] = useState<SlipPick | null>(null);
  const [stake, setStake] = useState<number>(BETS.MIN_STAKE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!saveId) return;
    const call = ++latest.current;
    try {
      const res = await fetch(`/api/saves/${saveId}/bets?scope=all`);
      if (!res.ok) throw new Error(String(res.status));
      const next = await res.json() as BetsView;
      if (call !== latest.current) return;
      setView(next);
      setFailed(false);
      // His own competitions open first; with none of their games this week, every competition (tester report).
      if (!scopeTouched.current) {
        scopeTouched.current = true;
        const mine = filterBetGames(next.games, { query: "", scope: "mine", days: "week", today: next.today ?? "", mine: next.mine ?? [] });
        if (mine.length === 0) setScope("all");
      }
    } catch {
      if (call === latest.current) setFailed(true);
    }
  }, [saveId]);
  useEffect(() => { void load(); }, [load]);

  const loadDetail = useCallback(async (g: BetGame) => {
    const key = gameKey(g);
    setDetails((d) => ({ ...d, [key]: "loading" }));
    try {
      const res = await fetch(`/api/saves/${saveId}/bets?competition=${encodeURIComponent(g.competition)}&fixture=${encodeURIComponent(g.fixtureId)}`);
      if (!res.ok) throw new Error(String(res.status));
      const one = (await res.json() as BetsView).games[0];
      setDetails((d) => ({ ...d, [key]: one ?? "failed" }));
    } catch {
      setDetails((d) => ({ ...d, [key]: "failed" }));
    }
  }, [saveId]);

  const day = (d: string) => new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

  if (failed) return <p role="alert" className="text-sm text-destructive m-0">{t("bets.errors.generic")}</p>;
  if (!view) return <p className="text-sm text-muted-foreground m-0">{t("bets.loading")}</p>;

  const gameText = (b: Bet) => `${b.homeName} x ${b.awayName} · ${day(b.date)}`;
  const toggle = (g: BetGame) => {
    const key = gameKey(g);
    if (expanded === key) { setExpanded(null); return; }
    setExpanded(key);
    const d = details[key];
    if (!d || d === "failed") void loadDetail(g);
  };
  const choose = (game: BetGame, pick: BetPick, odds: number) => { setSlip({ game, pick, odds }); setError(null); setNotice(null); };

  async function place() {
    if (!slip || !view) return;
    const value = Math.min(view.maxStake, Math.max(BETS.MIN_STAKE, stake));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/saves/${saveId}/bets`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competition: slip.game.competition, fixtureId: slip.game.fixtureId, pick: slip.pick, stake: value, odds: slip.odds }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; odds?: number };
        setError(t(`bets.errors.${body.error}`, { defaultValue: t("bets.errors.generic") }));
        // A new price stays on the slip to confirm again; a closed game leaves it.
        if (body.error === "oddsChanged" && typeof body.odds === "number") setSlip({ ...slip, odds: body.odds });
        if (body.error === "closed") { setSlip(null); await load(); }
        return;
      }
      setNotice(t("bets.slip.placed", { pick: pickLabel(t, slip.pick, slip.game.homeName, slip.game.awayName) }));
      setSlip(null);
      await load();
    } catch {
      setError(t("bets.errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card-arcade rounded-md px-4 py-3"><p className={LABEL}>{t("bets.wallet")}</p><p className={KPI}>{money(view.wallet)}</p></div>
        <div className="card-arcade rounded-md px-4 py-3"><p className={LABEL}>{t("bets.openTotal")}</p><p className={KPI}>{money(view.openTotal)}</p></div>
        <div className="card-arcade rounded-md px-4 py-3">
          <p className={LABEL}>{t("bets.profit")}</p>
          <p className={`${KPI} ${toneOf(view.betNet)}`}>{signedMoney(view.betNet)}</p>
        </div>
      </div>
      <SegmentedTabs<BetsSection>
        compact
        aria-label={t("bets.sections")}
        active={section}
        onChange={setSection}
        tabs={[
          { key: "games", label: t("bets.tabs.games") },
          { key: "open", label: t("bets.tabs.open", { count: view.open.length }) },
          { key: "stats", label: t("bets.tabs.stats") },
        ]}
      />
      {section === "games" && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
          <BetGameList
            games={view.games}
            today={view.today ?? ""}
            mine={view.mine ?? []}
            open={view.open}
            slip={slip}
            query={query}
            scope={scope}
            days={days}
            expanded={expanded}
            details={details}
            leagues={leagues}
            day={day}
            nextDate={view.nextDate}
            onQuery={setQuery}
            onScope={(s) => { setScope(s); scopeTouched.current = true; }}
            onDays={setDays}
            onToggle={toggle}
            onPick={choose}
          />
          <aside className="lg:sticky lg:top-[72px]">
            <BetSlip
              slip={slip}
              stake={stake}
              maxStake={view.maxStake}
              busy={busy}
              error={error}
              notice={notice}
              leagues={leagues}
              day={day}
              onStake={setStake}
              onClear={() => { setSlip(null); setError(null); }}
              onPlace={() => void place()}
            />
          </aside>
        </div>
      )}
      {section === "open" && <OpenBets bets={view.open} game={gameText} />}
      {section === "stats" && <BetDashboard settled={view.settled} gameText={gameText} />}
    </div>
  );
}
