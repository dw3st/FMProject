import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CLASSIC_PAYS, CLASSIC_STRIP, CLASSIC_TWO_CHERRIES, type ClassicSymbol } from "@/Domain/casino/classicSlot";
import { STADIUM_LINES, STADIUM_PAYS, STADIUM_STRIPS, STADIUM_SYMBOLS, type StadiumSymbol } from "@/Domain/casino/stadiumSlot";

import { prefersReducedMotion } from "@/GraficsEngine/motionPrefs";
import { ClassicSymbolArt, StadiumSymbolArt } from "@/GameInterface/Achievements/Casino/CasinoSymbols";
import { StakeControl, casinoMoney as formatFee, clampStake } from "@/GameInterface/Achievements/Casino/StakeControl";
import { spinSlot } from "@/GameInterface/Achievements/Casino/casinoApi";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import type { CasinoView, SlotMachine as Machine, SlotSpinView } from "@/types/casinoTypes";

const REPEATS = 6;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** One reel: the strip repeated, moved by a CSS transform and stopped on the server's result. */
function Reel({ length, stop, spin, duration, cell, render }: {
  length: number; stop: number; spin: number; duration: number; cell: number; render: (i: number) => React.ReactNode;
}) {
  const [anim, setAnim] = useState({ pos: length + mod(stop - 1, length), dur: 0 });
  const posRef = useRef(anim.pos);
  posRef.current = anim.pos;
  useEffect(() => {
    if (spin === 0) return;
    const r = mod(stop - 1, length);
    if (duration === 0) { setAnim({ pos: length + r, dur: 0 }); return; }
    setAnim({ pos: length + mod(posRef.current, length), dur: 0 });
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setAnim({ pos: 3 * length + r, dur: duration })); });
    const done = setTimeout(() => setAnim({ pos: length + r, dur: 0 }), duration + 40);
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); clearTimeout(done); };
    // A new spin starts only when `spin` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spin]);
  return (
    <div className="overflow-hidden" style={{ height: cell * 3 }}>
      <div
        style={{
          transform: `translateY(${-anim.pos * cell}px)`,
          transition: anim.dur ? `transform ${anim.dur}ms cubic-bezier(0.15, 0.6, 0.25, 1.02)` : "none",
        }}
      >
        {Array.from({ length: length * REPEATS }, (_, i) => (
          <div key={i} className="flex items-center justify-center" style={{ height: cell }}>
            {render(i % length)}
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  saveId: string;
  machine: Machine;
  view: CasinoView;
  onView: (v: CasinoView) => void;
}

/** The two slot machines: the classic (3 reels, 1 line) and the stadium (5 × 3, 10 lines). */
export function SlotMachine({ saveId, machine, view, onView }: Props) {
  const { t, i18n } = useTranslation();
  const classic = machine === "classic";
  const reels = classic ? 3 : 5;
  const length = classic ? CLASSIC_STRIP.length : STADIUM_STRIPS[0]!.length;
  const cell = classic ? 112 : 92;
  const [stake, setStake] = useState(1_000);
  const [spins, setSpins] = useState<"1" | "5" | "10">("1");
  const [stops, setStops] = useState<number[]>(() => Array.from({ length: reels }, (_, i) => i * 3));
  const [spinKey, setSpinKey] = useState(0);
  const [current, setCurrent] = useState<SlotSpinView | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<{ done: number; total: number; won: number } | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((x) => clearTimeout(x)), []);

  const max = view.limits.maxStake;
  const value = clampStake(stake, max);
  const reduced = prefersReducedMotion();
  // An auto-spin series runs quicker, so ten spins never take half a minute.
  const [pace, setPace] = useState(1);
  const spinMs = (reel: number) => (reduced ? 0 : Math.round((900 + reel * 260) * pace));

  const spin = async () => {
    setBusy(true);
    setError(null);
    setRevealed(false);
    const r = await spinSlot(saveId, machine, value, Number(spins));
    if (!r.ok) { setBusy(false); setError(t(`casino.errors.${r.error}`, { defaultValue: t("casino.errors.generic") })); return; }
    const { results, stopped, view: next } = r.data;
    const speed = results.length > 1 ? 0.55 : 1;
    setPace(speed);
    const stopAt = reduced ? 0 : Math.round((900 + (reels - 1) * 260) * speed) + 60;
    const gap = results.length > 1 ? 500 : 900;
    let won = 0;
    results.forEach((res, i) => {
      timers.current.push(window.setTimeout(() => {
        setRevealed(false);
        setStops(res.stops);
        setCurrent(res);
        setSpinKey((k) => k + 1);
      }, i * (stopAt + gap)));
      timers.current.push(window.setTimeout(() => {
        won += res.payout;
        setRevealed(true);
        setSeries(results.length > 1 ? { done: i + 1, total: results.length, won } : null);
        if (i === results.length - 1) {
          setBusy(false);
          onView(next);
          if (stopped) setError(t(`casino.errors.${stopped}`, { defaultValue: t("casino.errors.generic") }));
        }
      }, i * (stopAt + gap) + stopAt));
    });
  };

  const winLines = revealed && current?.wins ? current.wins : [];
  const symbolAt = (reel: number, i: number) => classic
    ? <ClassicSymbolArt symbol={CLASSIC_STRIP[i]!} className="w-[84px] h-[84px]" />
    : <StadiumSymbolArt symbol={STADIUM_STRIPS[reel]![i]!} className="w-[70px] h-[70px]" />;
  const won = revealed && current && current.payout > 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
      <div className="flex flex-col gap-4">
        <div className={`relative rounded-md border bg-card p-4 ${won ? "border-primary ring-1 ring-primary" : "border-border"}`}>
          <div className="relative grid gap-2 mx-auto" style={{ gridTemplateColumns: `repeat(${reels}, ${cell}px)`, width: reels * cell + (reels - 1) * 8 }}>
            {Array.from({ length: reels }, (_, reel) => (
              <div key={reel} className="rounded bg-background border border-border">
                <Reel length={length} stop={stops[reel] ?? 0} spin={spinKey} duration={spinMs(reel)} cell={cell} render={(i) => symbolAt(reel, i)} />
              </div>
            ))}
            {classic && (
              <div className={`pointer-events-none absolute inset-x-0 rounded border-2 ${won ? "border-primary" : "border-star-gold/50"}`} style={{ top: cell, height: cell }} />
            )}
            {!classic && winLines.length > 0 && (
              <svg className="pointer-events-none absolute inset-0 w-full h-full" viewBox={`0 0 ${reels * cell + (reels - 1) * 8} ${cell * 3}`} aria-hidden="true">
                {winLines.map((w) => (
                  <polyline
                    key={w.line}
                    points={STADIUM_LINES[w.line]!.slice(0, w.count).map((row, reel) => `${reel * (cell + 8) + cell / 2},${row * cell + cell / 2}`).join(" ")}
                    className="stroke-star-gold"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    opacity="0.9"
                  />
                ))}
              </svg>
            )}
          </div>
          <div className="mt-4 flex items-center justify-center min-h-[40px]" aria-live="polite">
            {revealed && current ? (
              current.payout > 0
                ? <p className="font-display font-black uppercase text-2xl tabular-nums text-primary m-0">{t("casino.won", { value: formatFee(current.payout), x: current.multiplier.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</p>
                : <p className="text-sm text-muted-foreground m-0">{t("casino.noWin")}</p>
            ) : <p className="text-sm text-muted-foreground m-0">{busy ? t("casino.spinning") : t("casino.pickStake")}</p>}
          </div>
          {series && <p className="text-sm text-muted-foreground text-center tabular-nums m-0">{t("casino.series", { done: series.done, total: series.total, value: formatFee(series.won) })}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <StakeControl value={value} max={max} disabled={busy} onChange={setStake} />
          <OptionChips
            aria-label={t("casino.spins")}
            options={(["1", "5", "10"] as const).map((k) => ({ key: k, label: t("casino.spinsN", { count: Number(k) }) }))}
            value={spins}
            onChange={setSpins}
            disabled={busy}
          />
          <Button className="ml-auto" disabled={busy || max < 1_000} onClick={() => void spin()}>{t("casino.spin")}</Button>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums m-0">
          {t(classic ? "casino.classicLine" : "casino.stadiumLines", { value: formatFee(value), line: formatFee(Math.floor(value / 10)) })}
        </p>
        {error && <p role="alert" className="text-sm text-destructive m-0">{error}</p>}
      </div>

      <div className="self-start"><Paytable machine={machine} /></div>
    </div>
  );
}

function Paytable({ machine }: { machine: Machine }) {
  const { t } = useTranslation();
  if (machine === "classic") {
    const rows = (Object.entries(CLASSIC_PAYS) as [ClassicSymbol, number][]).sort((a, b) => b[1] - a[1]);
    return (
      <div className={TABLE_STYLE.shell}>
        <div className={`${TABLE_STYLE.head} flex justify-between px-4 py-3`}><span>{t("casino.paytable")}</span><span>{t("casino.pays")}</span></div>
        <div className={TABLE_STYLE.body}>
          {rows.map(([s, pay]) => (
            <div key={s} className="flex items-center justify-between px-4 py-2">
              <span className="flex gap-1">{[0, 1, 2].map((i) => <ClassicSymbolArt key={i} symbol={s} className="w-7 h-7" />)}</span>
              <span className="font-display font-black text-primary tabular-nums">×{pay}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-2">
            <span className="flex items-center gap-1">
              <ClassicSymbolArt symbol="cherry" className="w-7 h-7" /><ClassicSymbolArt symbol="cherry" className="w-7 h-7" />
              <span className="text-sm text-muted-foreground ml-1">{t("casino.anyThird")}</span>
            </span>
            <span className="font-display font-black text-primary tabular-nums">×{CLASSIC_TWO_CHERRIES}</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className={TABLE_STYLE.shell}>
        <div className={`${TABLE_STYLE.head} grid grid-cols-[1fr_52px_52px_60px] px-4 py-3`}>
          <span>{t("casino.paytable")}</span><span className="text-center">×3</span><span className="text-center">×4</span><span className="text-center">×5</span>
        </div>
        <div className={TABLE_STYLE.body}>
          {(STADIUM_SYMBOLS as readonly StadiumSymbol[]).map((s) => (
            <div key={s} className="grid grid-cols-[1fr_52px_52px_60px] items-center px-4 py-1.5 tabular-nums">
              <span className="flex items-center gap-2 min-w-0">
                <StadiumSymbolArt symbol={s} className="w-8 h-8 shrink-0" />
                <span className="text-sm truncate">{t(`casino.symbol.${s}`)}</span>
              </span>
              {STADIUM_PAYS[s].map((p, i) => <span key={i} className={`text-center text-sm ${i === 2 ? "font-display font-black text-primary" : "text-muted-foreground"}`}>{p}</span>)}
            </div>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground m-0">{t("casino.stadiumRules")}</p>
      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {STADIUM_LINES.map((rows, i) => (
          <svg key={i} viewBox="0 0 50 30" className="w-[50px] h-[30px] rounded border border-border bg-card">
            <polyline points={rows.map((r, reel) => `${reel * 10 + 5},${r * 10 + 5}`).join(" ")} className="stroke-star-gold" strokeWidth="2" fill="none" />
          </svg>
        ))}
      </div>
    </div>
  );
}
