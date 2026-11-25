import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { casinoMoney as formatFee } from "@/GameInterface/Achievements/Casino/StakeControl";
import { ClassicSymbolArt, PlaneArt, StadiumSymbolArt } from "@/GameInterface/Achievements/Casino/CasinoSymbols";
import { CrashGame } from "@/GameInterface/Achievements/Casino/CrashGame";
import { SlotMachine } from "@/GameInterface/Achievements/Casino/SlotMachine";
import { BingoGame } from "@/GameInterface/Achievements/Casino/BingoGame";
import { BlackjackGame } from "@/GameInterface/Achievements/Casino/BlackjackGame";
import { PokerGame } from "@/GameInterface/Achievements/Casino/PokerGame";
import { PlayingCard } from "@/GameInterface/Achievements/Casino/PlayingCard";
import { CAR_COLORS, RaceGame } from "@/GameInterface/Achievements/Casino/RaceGame";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { casinoView } from "@/GameInterface/Achievements/Casino/casinoApi";
import { useGameSave } from "@/GameInterface/GameSaveProvider";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import { SectionTitle } from "@/GameInterface/ui/SectionTitle";
import type { CasinoGame, CasinoView } from "@/types/casinoTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0";
const KPI = "font-display font-bold tabular-nums text-2xl m-0 mt-1";
const GAMES: CasinoGame[] = ["classic", "stadium", "crash", "race", "blackjack", "bingo", "poker"];

function GameArt({ game }: { game: CasinoGame }) {
  if (game === "classic") return <span className="flex">{(["seven", "seven", "seven"] as const).map((s, i) => <ClassicSymbolArt key={i} symbol={s} className="w-7 h-7 shrink-0" />)}</span>;
  if (game === "stadium") return <span className="flex">{(["ball", "crest", "trophy"] as const).map((s) => <StadiumSymbolArt key={s} symbol={s} className="w-7 h-7 shrink-0" />)}</span>;
  if (game === "crash") return <PlaneArt className="w-[72px] h-9" />;
  if (game === "race") {
    return newVisualOn()
      ? <img src={gameArtUrl("casino/car-1-1.webp")} alt="" className="w-[72px] h-9 object-contain" />
      : <span className="w-[72px] h-9 flex items-center gap-1">{CAR_COLORS.slice(0, 3).map((c) => <span key={c} className="w-5 h-5 rounded-full" style={{ backgroundColor: c }} />)}</span>;
  }
  if (game === "bingo") {
    return <span className="w-[72px] h-9 flex items-center gap-1">{[7, 23, 48].map((n) => <span key={n} className="w-6 h-6 rounded-full bg-star-gold text-black flex items-center justify-center font-display font-bold text-sm tabular-nums">{n}</span>)}</span>;
  }
  // blackjack: ace and king of spades; poker: two aces
  const cards = game === "blackjack" ? [12, 11] : [12, 25];
  return <span className="flex gap-0.5">{cards.map((c) => <PlayingCard key={c} card={c} size="sm" />)}</span>;
}

function GameScreen({ game, saveId, view, onView }: { game: CasinoGame; saveId: string; view: CasinoView; onView: (v: CasinoView) => void }) {
  switch (game) {
    case "crash": return <CrashGame saveId={saveId} view={view} onView={onView} />;
    case "race": return <RaceGame saveId={saveId} view={view} onView={onView} />;
    case "blackjack": return <BlackjackGame saveId={saveId} view={view} onView={onView} />;
    case "bingo": return <BingoGame saveId={saveId} view={view} onView={onView} />;
    case "poker": return <PokerGame saveId={saveId} view={view} onView={onView} />;
    default: return <SlotMachine key={game} saveId={saveId} machine={game} view={view} onView={onView} />;
  }
}

/** The manager's casino (`.claude/rules/game/casino.md`): two slot machines, the crash game, the car race, blackjack, bingo and poker, with his own money. */
export function CasinoTab() {
  const { t, i18n } = useTranslation();
  const { session } = useGameSave();
  const saveId = session?.saveId;
  const [view, setView] = useState<CasinoView | null>(null);
  const [failed, setFailed] = useState(false);
  const [game, setGame] = useState<CasinoGame>("classic");

  const load = useCallback(async () => {
    if (!saveId) return;
    const r = await casinoView(saveId);
    if (r.ok) { setView(r.data); setFailed(false); } else setFailed(true);
  }, [saveId]);
  useEffect(() => { void load(); }, [load]);

  if (failed) return <p className="text-sm text-muted-foreground m-0">{t("casino.loadFailed")}</p>;
  if (!view || !saveId) return <p className="text-sm text-muted-foreground m-0">{t("achievements.loading")}</p>;

  const { limits } = view;
  const net = view.casinoNet;
  const fmtX = (m: number) => `${m.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className={LABEL}>{t("casino.kpi.wallet")}</p>
          <p className={`tabular-nums ${KPI} text-star-green`}>{formatFee(view.wallet)}</p>
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className={LABEL}>{t("casino.kpi.net")}</p>
          <p className={`tabular-nums ${KPI} ${net > 0 ? "text-primary" : net < 0 ? "text-destructive" : ""}`}>{net > 0 ? "+" : ""}{formatFee(net)}</p>
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className={LABEL}>{t("casino.kpi.lost")}</p>
          <p className={`tabular-nums ${KPI}`}>{formatFee(limits.lost)}<span className="text-muted-foreground text-base"> / {formatFee(limits.lossCap)}</span></p>
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className={LABEL}>{t("casino.kpi.rounds")}</p>
          <p className={`tabular-nums ${KPI}`}>{limits.rounds}<span className="text-muted-foreground text-base"> / {limits.maxRounds}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {GAMES.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={game === g}
            onClick={() => setGame(g)}
            className={`flex items-center gap-3 text-left rounded-md border bg-card p-3 cursor-pointer ${game === g ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50"}`}
          >
            <span className="w-[92px] h-14 shrink-0 flex items-center justify-center overflow-hidden"><GameArt game={g} /></span>
            <span className="min-w-0">
              <span className="block font-display font-black uppercase text-base leading-none">{t(`casino.games.${g}.name`)}</span>
              <span className="block text-sm text-muted-foreground mt-1">{t(`casino.games.${g}.desc`)}</span>
            </span>
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground m-0 tabular-nums">
        {t("casino.limitsLine", { min: formatFee(limits.minStake), max: limits.maxStake >= limits.minStake ? formatFee(limits.maxStake) : "—" })}
      </p>

      <GameScreen game={game} saveId={saveId} view={view} onView={setView} />

      <section className="flex flex-col gap-2">
        <SectionTitle>{t("casino.recent")}</SectionTitle>
        {view.history.length === 0
          ? <p className="text-sm text-muted-foreground m-0">{t("casino.noHistory")}</p>
          : (
            <div className={TABLE_STYLE.shell}>
              <div className={`${TABLE_STYLE.head} grid grid-cols-[1fr_120px_140px_120px] px-4 py-3`}>
                <span>{t("casino.col.game")}</span><span className="text-right">{t("casino.col.stake")}</span><span className="text-right">{t("casino.col.mult")}</span><span className="text-right">{t("casino.col.payout")}</span>
              </div>
              <div className={TABLE_STYLE.body}>
                {view.history.slice(0, 10).map((r) => (
                  <div key={`${r.game}:${r.id}`} className="grid grid-cols-[1fr_120px_140px_120px] items-center px-4 py-2.5 tabular-nums">
                    <span className="font-semibold truncate">{t(`casino.games.${r.game}.name`)}{r.crash !== undefined && <span className="text-sm text-muted-foreground font-normal"> · {t("casino.crash.flewShort", { x: fmtX(r.crash) })}</span>}</span>
                    <span className="text-right text-muted-foreground">{formatFee(r.stake)}</span>
                    <span className="text-right text-muted-foreground">{r.payout > 0 ? fmtX(r.multiplier) : "—"}</span>
                    <span className={`text-right font-display font-black ${r.payout > 0 ? "text-primary" : "text-muted-foreground"}`}>{r.payout > 0 ? formatFee(r.payout) : "€0"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
      </section>
    </div>
  );
}
