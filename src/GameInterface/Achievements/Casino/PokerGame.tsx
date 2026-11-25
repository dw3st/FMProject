import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CASINO } from "@/Domain/casino/casinoConfig";
import type { PokerTableView } from "@/Domain/casino/poker";
import { HAND_NAMES, evaluate7, handCategory } from "@/Domain/casino/pokerEval";
import { FeltTable, PlayingCard } from "@/GameInterface/Achievements/Casino/PlayingCard";
import { casinoMoney as formatFee } from "@/GameInterface/Achievements/Casino/StakeControl";
import { type PokerMove, pokerAction, pokerLeave, pokerSit } from "@/GameInterface/Achievements/Casino/casinoApi";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import type { CasinoView } from "@/types/casinoTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-white/80 m-0";

/** Buy-ins on offer: shares of the day's loss room, in MIN_BUY_IN steps, never above the wallet. */
export function buyInOptions(view: CasinoView): number[] {
  const room = Math.min(view.wallet, view.limits.lossCap - view.limits.lost);
  const step = CASINO.POKER.MIN_BUY_IN;
  const out = CASINO.POKER.BUY_IN_SHARES.map((s) => Math.floor((room * s) / step) * step).filter((v) => v >= step);
  return [...new Set(out)];
}

function Seat({ table, i, name }: { table: PokerTableView; i: number; name: string }) {
  const { t } = useTranslation();
  const s = table.seats[i]!;
  const shown = table.result?.shown[i];
  const hole = i === 0 ? s.hole : shown ?? [];
  const won = table.result?.pots.some((p) => p.winners.includes(i));
  const last = [...table.events].reverse().find((e) => e.seat === i && e.street === table.street);
  return (
    <div className={`flex flex-col items-center gap-1 rounded-md px-3 py-2 bg-black/25 ${table.toAct === i ? "ring-2 ring-star-gold" : ""} ${s.folded ? "opacity-50" : ""}`}>
      <p className={LABEL}>{name}{i === table.button ? ` · ${t("casino.poker.button")}` : ""}</p>
      <div className="flex gap-1">
        {s.folded && i !== 0 ? null : hole.length ? hole.map((c, k) => <PlayingCard key={k} card={c} size="sm" />) : [0, 1].map((k) => <PlayingCard key={k} card={null} size="sm" />)}
      </div>
      <p className="font-display font-bold tabular-nums text-base m-0 text-white">{formatFee(s.stack)}</p>
      <p className={`text-sm m-0 tabular-nums ${won ? "text-star-gold font-semibold" : "text-white/80"}`}>
        {won ? t("casino.poker.winner") : s.folded ? t("casino.poker.ev.fold") : s.allIn ? t("casino.poker.ev.allin") : s.bet > 0 ? formatFee(s.bet) : last ? t(`casino.poker.ev.${last.kind}`) : " "}
      </p>
    </div>
  );
}

interface Props { saveId: string; view: CasinoView; onView: (v: CasinoView) => void }

/** Texas Hold'em, no limit, against three bots. The buy-in leaves the wallet at the sit, the stack comes back at the leave. */
export function PokerGame({ saveId, view, onView }: Props) {
  const { t } = useTranslation();
  const options = buyInOptions(view);
  const [buyIn, setBuyIn] = useState<string>(String(options[0] ?? CASINO.POKER.MIN_BUY_IN));
  const [raiseTo, setRaiseTo] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const table = view.poker;

  const run = async (p: Promise<{ ok: true; data: { view: CasinoView } } | { ok: false; error: string }>) => {
    setBusy(true);
    setError(null);
    const r = await p;
    setBusy(false);
    if (!r.ok) { setError(t(`casino.errors.${r.error}`, { defaultValue: t("casino.errors.generic") })); return; }
    setRaiseTo(0);
    onView(r.data.view);
  };
  const move = (m: PokerMove) => run(pokerAction(saveId, m));

  if (!table) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <FeltTable className="min-h-[360px]">
          <div className="flex flex-col items-center justify-center gap-3 text-white min-h-[240px]">
            <p className="font-display font-black uppercase text-xl m-0">{t("casino.poker.title")}</p>
            <p className="text-sm text-white/80 m-0 text-center max-w-md">{t("casino.poker.intro")}</p>
          </div>
        </FeltTable>
        <div className="rounded-md border border-border bg-card p-4 flex flex-col gap-3 self-start">
          <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">{t("casino.poker.buyIn")}</p>
          {options.length ? (
            <OptionChips className="tabular-nums" aria-label={t("casino.poker.buyIn")} value={buyIn} onChange={setBuyIn} disabled={busy}
              options={options.map((v) => ({ key: String(v), label: formatFee(v) }))} />
          ) : <p className="text-sm text-muted-foreground m-0 tabular-nums">{t("casino.poker.noRoom", { amount: formatFee(CASINO.POKER.MIN_BUY_IN) })}</p>}
          <Button disabled={busy || !options.length} onClick={() => run(pokerSit(saveId, Number(buyIn)))}>{t("casino.poker.sit")}</Button>
          {error && <p className="text-sm text-destructive m-0">{error}</p>}
        </div>
      </div>
    );
  }

  const legal = table.legal;
  const you = table.seats[0]!;
  const pot = table.seats.reduce((s, x) => s + x.committed, 0);
  const handName = you.hole.length && table.board.length >= 3 ? HAND_NAMES[handCategory(evaluate7([...you.hole, ...table.board]))] : null;
  const raise = legal ? Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, raiseTo || legal.minRaiseTo)) : 0;
  const names = [t("casino.poker.you"), ...table.seats.slice(1).map((s, k) => t("casino.poker.bot", { n: k + 1, style: t(`casino.poker.style.${s.style}`) }))];
  const youResult = table.result ? table.result.youWon - table.result.youCommitted : null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
      <FeltTable className="min-h-[460px]">
        <div className="grid grid-cols-3 grid-rows-[auto_auto_auto] gap-4 items-center justify-items-center text-white">
          <div className="col-start-2"><Seat table={table} i={2} name={names[2]!} /></div>
          <div className="col-start-1 row-start-2"><Seat table={table} i={1} name={names[1]!} /></div>
          <div className="col-start-2 row-start-2 flex flex-col items-center gap-2">
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }, (_, k) => table.board[k] !== undefined ? <PlayingCard key={k} card={table.board[k]!} /> : <span key={k} className="w-14 h-20 rounded-md border border-white/25" />)}
            </div>
            <p className={`${LABEL} tabular-nums`}>{t("casino.poker.pot", { amount: formatFee(pot) })} · {t(`casino.poker.street.${table.street}`)}</p>
          </div>
          <div className="col-start-3 row-start-2"><Seat table={table} i={3} name={names[3]!} /></div>
          <div className="col-start-2 row-start-3"><Seat table={table} i={0} name={names[0]!} /></div>
        </div>
      </FeltTable>

      <div className="rounded-md border border-border bg-card p-4 flex flex-col gap-3 self-start">
        <p className="text-sm text-muted-foreground m-0 tabular-nums">
          {t("casino.poker.blinds", { small: formatFee(table.smallBlind), big: formatFee(table.bigBlind), hand: table.handNo })}
        </p>
        {handName && <p className="text-sm m-0">{t("casino.poker.yourHand", { hand: t(`casino.poker.hand.${handName}`) })}</p>}
        {legal ? (
          <>
            <div className="grid grid-cols-2 gap-2 tabular-nums">
              <Button variant="secondary" disabled={busy} onClick={() => move({ kind: "fold" })}>{t("casino.poker.fold")}</Button>
              {legal.canCheck
                ? <Button disabled={busy} onClick={() => move({ kind: "check" })}>{t("casino.poker.check")}</Button>
                : <Button disabled={busy} onClick={() => move({ kind: "call" })}>{t("casino.poker.call", { amount: formatFee(legal.toCall) })}</Button>}
            </div>
            {legal.canRaise && (
              <div className="flex flex-col gap-2 tabular-nums">
                <input type="range" min={legal.minRaiseTo} max={legal.maxRaiseTo} step={table.bigBlind} value={raise} disabled={busy}
                  onChange={(e) => setRaiseTo(Number(e.target.value))} aria-label={t("casino.poker.raiseTo")} className="w-full accent-primary" />
                <Button disabled={busy} onClick={() => move(raise >= legal.maxRaiseTo ? { kind: "allin" } : { kind: "raise", to: raise })}>
                  {raise >= legal.maxRaiseTo ? t("casino.poker.allin", { amount: formatFee(raise) }) : t("casino.poker.raise", { amount: formatFee(raise) })}
                </Button>
              </div>
            )}
          </>
        ) : table.street === "done" ? (
          <>
            {youResult !== null && (
              <p className={`text-sm m-0 tabular-nums ${youResult > 0 ? "text-primary font-semibold" : youResult < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {youResult > 0 ? t("casino.poker.handWon", { amount: formatFee(youResult) }) : youResult < 0 ? t("casino.poker.handLost", { amount: formatFee(-youResult) }) : t("casino.poker.handEven")}
              </p>
            )}
            <Button disabled={busy || you.stack <= 0} onClick={() => move({ kind: "next" })}>{t("casino.poker.next")}</Button>
          </>
        ) : <p className="text-sm text-muted-foreground m-0">{t("casino.poker.waiting")}</p>}
        <Button variant="secondary" className="tabular-nums" disabled={busy || !!legal} onClick={() => run(pokerLeave(saveId))}>{t("casino.poker.leave", { amount: formatFee(you.stack) })}</Button>
        {error && <p className="text-sm text-destructive m-0">{error}</p>}
      </div>
    </div>
  );
}
