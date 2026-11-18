import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CASINO } from "@/Domain/casino/casinoConfig";
import { multiplierAt } from "@/Domain/casino/crash";
import { PlaneArt } from "@/GameInterface/Achievements/Casino/CasinoSymbols";
import { StakeControl, casinoMoney as formatFee, clampStake } from "@/GameInterface/Achievements/Casino/StakeControl";
import { casinoView, crashBet, crashCashOut } from "@/GameInterface/Achievements/Casino/casinoApi";
import { Button } from "@/GameInterface/ui/Button";
import type { CasinoView } from "@/types/casinoTypes";

const H = 340;
const PAD = { l: 52, r: 24, t: 24, b: 34 };
const LABEL = "font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground";

type Phase = "idle" | "flying" | "cashed" | "crashed";

interface Round { id: string; startedAt: number; offset: number; stake: number; auto: number | null }

/** Screen position of (t seconds, multiplier m) in a chart that fits `tMax` × `mMax`. */
function toXY(t: number, m: number, tMax: number, mMax: number, W: number) {
  const x = PAD.l + (t / tMax) * (W - PAD.l - PAD.r);
  const y = H - PAD.b - ((m - 1) / (mMax - 1)) * (H - PAD.t - PAD.b);
  return { x, y };
}

/** The crash game (Aviator style): the server draws the crash point at the bet and keeps it until the end. */
export function CrashGame({ saveId, view, onView }: { saveId: string; view: CasinoView; onView: (v: CasinoView) => void }) {
  const { t, i18n } = useTranslation();
  const fmt = (m: number) => `${m.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
  const [stake, setStake] = useState(1_000);
  const [autoText, setAutoText] = useState("");
  const [round, setRound] = useState<Round | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [crash, setCrash] = useState<number | null>(null);
  const [cashed, setCashed] = useState<{ multiplier: number; payout: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cashing = useRef(false);
  // The chart is drawn in pixels of its box (no scaling: the plane keeps its size).
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(760);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(320, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A round still open when the page opens (reload in mid-flight) carries on.
  useEffect(() => {
    if (view.open && !round) {
      setRound({ id: view.open.roundId, startedAt: view.open.startedAt, offset: view.now - Date.now(), stake: view.open.stake, auto: view.open.auto });
      setPhase("flying");
    }
  }, [view.open, view.now, round]);

  const finish = useCallback((crashPoint: number, win: { multiplier: number; payout: number } | null, next?: CasinoView) => {
    setCrash(crashPoint);
    if (win) setCashed(win);
    else setElapsed(Math.log(Math.max(1, crashPoint)) / CASINO.CRASH.GROWTH);
    setPhase(win ? "cashed" : "crashed");
    if (next) onView(next);
  }, [onView]);

  // Clock of the flight.
  useEffect(() => {
    if (!round || (phase !== "flying" && phase !== "cashed")) return;
    let raf = 0;
    const tick = () => {
      const s = (Date.now() + round.offset - round.startedAt) / 1000;
      setElapsed(crash !== null ? Math.min(s, Math.log(crash) / CASINO.CRASH.GROWTH) : s);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [round, phase, crash]);

  const cashOut = useCallback(async () => {
    if (!round || cashing.current) return;
    cashing.current = true;
    const r = await crashCashOut(saveId, round.id);
    cashing.current = false;
    if (!r.ok) { setError(t(`casino.errors.${r.error}`, { defaultValue: t("casino.errors.generic") })); return; }
    finish(r.data.crash, r.data.won ? { multiplier: r.data.multiplier, payout: r.data.payout } : null, r.data.view);
    if (!r.data.view) void casinoView(saveId).then((v) => v.ok && onView(v.data));
  }, [round, saveId, finish, onView, t]);

  // The auto cash-out, and a poll that learns the crash when he did not leave.
  const m = multiplierAt(elapsed);
  useEffect(() => {
    if (phase === "flying" && round?.auto && m >= round.auto) void cashOut();
  }, [phase, round, m, cashOut]);
  useEffect(() => {
    if (!round || phase !== "flying") return;
    const id = window.setInterval(async () => {
      const v = await casinoView(saveId);
      if (!v.ok || v.data.open?.roundId === round.id) return;
      const done = v.data.history.find((h) => h.id === round.id);
      if (done) finish(done.crash ?? 1, done.payout > 0 ? { multiplier: done.multiplier, payout: done.payout } : null, v.data);
    }, 600);
    return () => clearInterval(id);
  }, [round, phase, saveId, finish]);

  // After the crash the plane keeps climbing to the crash point (a cash-out ends before it), then the round is over.
  const flownOff = crash !== null && m >= crash;
  const shownM = crash !== null && phase === "crashed" ? crash : m;

  const bet = async () => {
    setBusy(true);
    setError(null);
    const auto = autoText.trim() === "" ? null : Number(autoText.replace(",", "."));
    if (auto !== null && (!Number.isFinite(auto) || auto < CASINO.CRASH.MIN_AUTO)) {
      setBusy(false);
      setError(t("casino.errors.invalidAuto"));
      return;
    }
    const value = clampStake(stake, view.limits.maxStake);
    const r = await crashBet(saveId, value, auto);
    setBusy(false);
    if (!r.ok) { setError(t(`casino.errors.${r.error}`, { defaultValue: t("casino.errors.generic") })); return; }
    setCrash(null);
    setCashed(null);
    setElapsed(0);
    setRound({ id: r.data.roundId, startedAt: r.data.startedAt, offset: r.data.view.now - Date.now(), stake: value, auto });
    setPhase("flying");
    onView(r.data.view);
  };

  // Chart.
  const tMax = Math.max(10, elapsed * 1.25);
  const mMax = Math.max(2, shownM * 1.6);
  const pts: string[] = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const ti = (elapsed * i) / steps;
    const p = toXY(ti, Math.exp(CASINO.CRASH.GROWTH * ti), tMax, mMax, W);
    pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  const head = toXY(elapsed, Math.exp(CASINO.CRASH.GROWTH * elapsed), tMax, mMax, W);
  const prev = toXY(Math.max(0, elapsed - 0.4), Math.exp(CASINO.CRASH.GROWTH * Math.max(0, elapsed - 0.4)), tMax, mMax, W);
  const angle = (Math.atan2(head.y - prev.y, head.x - prev.x) * 180) / Math.PI;
  const lineClass = phase === "crashed" ? "stroke-destructive" : phase === "cashed" ? "stroke-star-green" : "stroke-primary";
  const yTicks = [1, ...[1.5, 2, 3, 5, 10, 20, 50, 100, 200, 500].filter((v) => v < mMax)].slice(-5);
  const flying = phase === "flying" && round !== null;
  const value = clampStake(stake, view.limits.maxStake);

  return (
    <div className="flex flex-col gap-4">
      <div ref={box} className="relative rounded-md border border-border bg-card overflow-hidden">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" aria-hidden="true">
          {yTicks.map((v) => {
            const y = toXY(0, v, tMax, mMax, W).y;
            return <line key={v} x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} className="stroke-border" strokeWidth="1" strokeDasharray="4 6" />;
          })}
          <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className="stroke-border" strokeWidth="1.5" />
          {round && elapsed > 0 && (
            <>
              <polygon points={`${PAD.l},${H - PAD.b} ${pts.join(" ")} ${head.x.toFixed(1)},${H - PAD.b}`} className={phase === "crashed" ? "fill-destructive/10" : "fill-primary/10"} />
              <polyline points={pts.join(" ")} className={lineClass} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
          {round && !flownOff && phase !== "crashed" && (
            <g transform={`translate(${head.x} ${head.y}) rotate(${angle})`}>
              <foreignObject x="-46" y="-24" width="80" height="40"><PlaneArt className="w-[80px] h-[40px]" /></foreignObject>
            </g>
          )}
        </svg>
        {yTicks.map((v) => (
          <span key={v} className="pointer-events-none absolute left-2 text-sm text-muted-foreground tabular-nums -translate-y-1/2" style={{ top: toXY(0, v, tMax, mMax, W).y }}>
            {fmt(v)}
          </span>
        ))}
        <div className="pointer-events-none absolute inset-x-0 top-8 flex flex-col items-center gap-1">
          <span className={`font-display font-black tabular-nums leading-none text-6xl ${phase === "crashed" ? "text-destructive" : phase === "cashed" ? "text-star-green" : "text-foreground"}`}>
            {round ? fmt(shownM) : fmt(1)}
          </span>
          <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {phase === "crashed" && t("casino.crash.flewAway", { x: fmt(crash ?? 1) })}
            {phase === "cashed" && cashed && t("casino.crash.cashedAt", { x: fmt(cashed.multiplier), value: formatFee(cashed.payout) })}
            {phase === "cashed" && flownOff && crash !== null && ` · ${t("casino.crash.flewAway", { x: fmt(crash) })}`}
            {phase === "idle" && t("casino.crash.idle")}
            {flying && round && t("casino.crash.potential", { value: formatFee(Math.floor(round.stake * m)) })}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>{t("casino.stake")}</span>
          <StakeControl value={value} max={view.limits.maxStake} disabled={flying || busy} onChange={setStake} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t("casino.crash.auto")}</span>
          <input
            type="text"
            inputMode="decimal"
            value={autoText}
            disabled={flying || busy}
            placeholder={t("casino.crash.autoOff")}
            onChange={(e) => setAutoText(e.target.value)}
            className="h-10 w-[140px] rounded border border-border bg-transparent px-3 text-sm tabular-nums focus:border-primary outline-none disabled:opacity-50"
          />
        </label>
        <div className="ml-auto flex gap-2">
          {flying
            ? <Button className="tabular-nums" onClick={() => void cashOut()}>{t("casino.crash.cashOut", { value: formatFee(Math.floor((round?.stake ?? 0) * m)) })}</Button>
            : <Button disabled={busy || view.limits.maxStake < CASINO.MIN_STAKE} onClick={() => void bet()}>{t("casino.crash.bet")}</Button>}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive m-0">{error}</p>}

      <div className="flex flex-col gap-2">
        <span className={LABEL}>{t("casino.crash.last")}</span>
        {view.crashHistory.length === 0
          ? <p className="text-sm text-muted-foreground m-0">{t("casino.crash.none")}</p>
          : (
            <div className="flex flex-wrap gap-2">
              {view.crashHistory.map((c, i) => (
                <span key={i} className={`px-2 py-0.5 rounded border text-sm font-semibold tabular-nums ${c >= 2 ? "border-star-green/50 text-star-green" : "border-border text-muted-foreground"}`}>{fmt(c)}</span>
              ))}
            </div>
          )}
        <p className="text-sm text-muted-foreground m-0">{t("casino.crash.rules")}</p>
      </div>
    </div>
  );
}
