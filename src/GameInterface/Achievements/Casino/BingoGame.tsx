import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BINGO, BINGO_ORDER } from "@/Domain/casino/bingo";
import { prefersReducedMotion } from "@/GraficsEngine/motionPrefs";
import { StakeControl, casinoMoney as formatFee, clampStake } from "@/GameInterface/Achievements/Casino/StakeControl";
import { bingoPlay } from "@/GameInterface/Achievements/Casino/casinoApi";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import type { BingoResultView, CasinoView } from "@/types/casinoTypes";

const LETTERS = ["B", "I", "N", "G", "O"];
const BALL_MS = 160;

function Card({ numbers, drawn, pattern, multiplier, stake }: {
  numbers: number[]; drawn: Set<number>; pattern: string | null; multiplier: number; stake: number;
}) {
  const { t } = useTranslation();
  return (
    <div className={`rounded-md border bg-card p-3 ${pattern ? "border-primary ring-1 ring-primary" : "border-border"}`}>
      <div className="grid grid-cols-5 gap-1">
        {LETTERS.map((l) => <span key={l} className="text-center font-display font-black text-base text-primary">{l}</span>)}
        {numbers.map((n, i) => {
          const hit = n === 0 || drawn.has(n);
          return (
            <span key={i} className={`h-10 flex items-center justify-center rounded font-display font-bold tabular-nums text-base ${hit ? "bg-primary text-primary-foreground" : "bg-secondary/40 text-foreground"}`}>
              {n === 0 ? "★" : n}
            </span>
          );
        })}
      </div>
      <p className={`text-sm m-0 mt-2 tabular-nums ${pattern ? "text-primary font-semibold" : "text-muted-foreground"}`}>
        {pattern ? t("casino.bingo.prize", { pattern: t(`casino.bingo.pattern.${pattern}`), amount: formatFee(Math.floor(stake * multiplier)) }) : t("casino.bingo.noPrize")}
      </p>
    </div>
  );
}

interface Props { saveId: string; view: CasinoView; onView: (v: CasinoView) => void }

/** Bingo 75: up to four cards, 30 balls drawn, the best pattern of each card pays. */
export function BingoGame({ saveId, view, onView }: Props) {
  const { t, i18n } = useTranslation();
  const [cards, setCards] = useState<"1" | "2" | "3" | "4">("1");
  const [stake, setStake] = useState(1_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ r: BingoResultView; stake: number } | null>(null);
  const [shown, setShown] = useState(0);
  const timer = useRef(0);
  useEffect(() => () => clearInterval(timer.current), []);

  const n = Number(cards);
  const max = Math.floor(view.limits.maxStake / n);
  const value = clampStake(stake, max);
  const total = BINGO.DRAWN;

  const play = async () => {
    setBusy(true);
    setError(null);
    const r = await bingoPlay(saveId, n, value);
    if (!r.ok) { setBusy(false); setError(t(`casino.errors.${r.error}`, { defaultValue: t("casino.errors.generic") })); return; }
    setResult({ r: r.data.result, stake: value });
    const finish = () => { setShown(total); setBusy(false); onView(r.data.view); };
    if (prefersReducedMotion()) { finish(); return; }
    setShown(0);
    let k = 0;
    timer.current = window.setInterval(() => {
      k += 1;
      setShown(k);
      if (k >= total) { clearInterval(timer.current); finish(); }
    }, BALL_MS);
  };

  const balls = result ? result.r.balls.slice(0, shown) : [];
  const drawn = new Set(balls);
  const complete = !!result && shown >= total;
  const fmtX = (m: number) => `${m.toLocaleString(i18n.language)}×`;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-border bg-card p-4">
          <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">
            {t("casino.bingo.balls", { shown: balls.length, total })}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2 min-h-9">
            {balls.map((b) => (
              <span key={b} className="w-9 h-9 rounded-full bg-star-gold text-black flex items-center justify-center font-display font-bold tabular-nums text-sm">{b}</span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {result
            ? result.r.cards.map((c, i) => <Card key={i} numbers={c.card} drawn={drawn} pattern={complete ? c.pattern : null} multiplier={c.multiplier} stake={result.stake} />)
            : <p className="text-sm text-muted-foreground m-0">{t("casino.bingo.idle")}</p>}
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-4 flex flex-col gap-3 self-start">
        <p className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground m-0">{t("casino.bingo.cards")}</p>
        <OptionChips aria-label={t("casino.bingo.cards")} value={cards} onChange={setCards} disabled={busy}
          options={(["1", "2", "3", "4"] as const).map((k) => ({ key: k, label: k }))} />
        <StakeControl value={value} max={max} disabled={busy} onChange={setStake} />
        <p className="text-sm text-muted-foreground m-0 tabular-nums">{t("casino.bingo.cost", { amount: formatFee(value * n) })}</p>
        <Button onClick={play} disabled={busy || max < view.limits.minStake}>{t("casino.bingo.play")}</Button>
        {error && <p className="text-sm text-destructive m-0">{error}</p>}
        {complete && (
          <p className={`text-sm m-0 tabular-nums ${result!.r.payout > 0 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
            {result!.r.payout > 0 ? t("casino.bingo.won", { amount: formatFee(result!.r.payout) }) : t("casino.bingo.lost")}
          </p>
        )}
        <div className="flex flex-col gap-1 pt-2 border-t border-border">
          {BINGO_ORDER.map((p) => (
            <div key={p} className="flex justify-between text-sm tabular-nums">
              <span>{t(`casino.bingo.pattern.${p}`)}</span>
              <span className="font-display font-bold text-primary">{fmtX(BINGO.PAYS[p])}</span>
            </div>
          ))}
          <p className="text-sm text-muted-foreground m-0 mt-1">{t("casino.bingo.rules", { drawn: total })}</p>
        </div>
      </div>
    </div>
  );
}
