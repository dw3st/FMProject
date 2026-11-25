import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FeltTable, PlayingCard } from "@/GameInterface/Achievements/Casino/PlayingCard";
import { StakeControl, casinoMoney as formatFee, clampStake } from "@/GameInterface/Achievements/Casino/StakeControl";
import { blackjackAction, blackjackDeal } from "@/GameInterface/Achievements/Casino/casinoApi";
import { Button } from "@/GameInterface/ui/Button";
import type { BlackjackAction } from "@/Domain/casino/blackjack";
import type { CasinoView } from "@/types/casinoTypes";

const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-white/80 m-0";
const ACTIONS: BlackjackAction[] = ["hit", "stand", "double", "split"];

interface Props { saveId: string; view: CasinoView; onView: (v: CasinoView) => void }

/** Blackjack against the dealer: six decks, dealer stands on 17, blackjack pays 3:2. */
export function BlackjackGame({ saveId, view, onView }: Props) {
  const { t } = useTranslation();
  const [stake, setStake] = useState(1_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The last finished hand stays on the table until the next deal.
  const [last, setLast] = useState(view.blackjack);
  const hand = view.blackjack ?? last;
  const open = !!view.blackjack && !view.blackjack.result;
  const value = clampStake(stake, view.limits.maxStake);

  const done = (r: { ok: true; data: { hand: NonNullable<CasinoView["blackjack"]>; view: CasinoView } } | { ok: false; error: string }) => {
    setBusy(false);
    if (!r.ok) { setError(t(`casino.errors.${r.error}`, { defaultValue: t("casino.errors.generic") })); return; }
    setLast(r.data.hand);
    onView(r.data.view);
  };
  const deal = async () => { setBusy(true); setError(null); done(await blackjackDeal(saveId, value)); };
  const act = async (a: BlackjackAction) => { setBusy(true); setError(null); done(await blackjackAction(saveId, a)); };

  const result = hand?.result ?? null;
  const net = result ? result.payout - result.staked : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
      <FeltTable className="min-h-[420px]">
        <div className="flex flex-col items-center gap-8 text-white">
          <div className="flex flex-col items-center gap-2">
            <p className={LABEL}>{t("casino.blackjack.dealer")}{hand?.dealerTotal != null ? ` · ${hand.dealerTotal}` : ""}</p>
            <div className="flex gap-2 min-h-20">
              {hand ? (
                <>
                  {hand.dealer.map((c, i) => <PlayingCard key={i} card={c} />)}
                  {hand.dealer.length === 1 && <PlayingCard card={null} />}
                </>
              ) : <><PlayingCard card={null} /><PlayingCard card={null} /></>}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            {(hand?.hands ?? []).map((h, i) => {
              const outcome = result?.outcomes[i];
              const active = open && i === hand!.active;
              return (
                <div key={i} className={`flex flex-col items-center gap-2 rounded-md px-3 py-2 ${active ? "ring-2 ring-star-gold" : ""}`}>
                  <div className="flex gap-2">{h.cards.map((c, k) => <PlayingCard key={k} card={c} />)}</div>
                  <p className={LABEL}>
                    {t("casino.blackjack.total", { total: h.total })}{h.soft && h.total < 21 ? ` · ${t("casino.blackjack.soft")}` : ""}
                    {h.doubled ? ` · ${t("casino.blackjack.doubled")}` : ""}
                  </p>
                  {outcome && <p className={`font-display font-bold uppercase text-base m-0 ${outcome === "win" || outcome === "blackjack" ? "text-star-gold" : outcome === "push" ? "text-white" : "text-red-300"}`}>{t(`casino.blackjack.outcome.${outcome}`)}</p>}
                </div>
              );
            })}
            {!hand && <p className="text-sm text-white/80 m-0">{t("casino.blackjack.idle")}</p>}
          </div>
        </div>
      </FeltTable>

      <div className="rounded-md border border-border bg-card p-4 flex flex-col gap-3 self-start">
        {open ? (
          <div className="grid grid-cols-2 gap-2">
            {ACTIONS.map((a) => (
              <Button key={a} variant={a === "hit" || a === "stand" ? "primary" : "secondary"} disabled={busy || !view.blackjack!.actions.includes(a)} onClick={() => act(a)}>
                {t(`casino.blackjack.action.${a}`)}
              </Button>
            ))}
          </div>
        ) : (
          <>
            <StakeControl value={value} max={view.limits.maxStake} disabled={busy} onChange={setStake} />
            <Button onClick={deal} disabled={busy || view.limits.maxStake < view.limits.minStake}>{t("casino.blackjack.deal")}</Button>
          </>
        )}
        {open && <p className="text-sm text-muted-foreground m-0 tabular-nums">{t("casino.blackjack.stakeOn", { amount: formatFee(view.blackjack!.hands.reduce((s, h) => s + h.stake, 0)) })}</p>}
        {result && !open && (
          <p className={`text-sm m-0 tabular-nums ${net > 0 ? "text-primary font-semibold" : net < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {net > 0 ? t("casino.blackjack.won", { amount: formatFee(net) }) : net < 0 ? t("casino.blackjack.lost", { amount: formatFee(-net) }) : t("casino.blackjack.push")}
          </p>
        )}
        {error && <p className="text-sm text-destructive m-0">{error}</p>}
        <p className="text-sm text-muted-foreground m-0">{t("casino.blackjack.rules")}</p>
      </div>
    </div>
  );
}
