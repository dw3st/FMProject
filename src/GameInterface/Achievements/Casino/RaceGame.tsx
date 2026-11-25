import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import type { RaceKind } from "@/Domain/casino/race";
import { prefersReducedMotion } from "@/GraficsEngine/motionPrefs";
import { StakeControl, casinoMoney as formatFee, clampStake } from "@/GameInterface/Achievements/Casino/StakeControl";
import { raceBet } from "@/GameInterface/Achievements/Casino/casinoApi";
import { TRACK, laneOf, racePositions, trackPoint } from "@/GameInterface/Achievements/Casino/raceTrack";
import { Button } from "@/GameInterface/ui/Button";
import { OptionChips } from "@/GameInterface/ui/OptionChips";
import { TABLE_STYLE } from "@/GameInterface/ui/leagueTableStyle";
import type { CasinoView, RaceResultView } from "@/types/casinoTypes";

/** Colours of cars 1..8, as painted (`build_games_hall.py`). */
export const CAR_COLORS = ["#dc3232", "#f5af23", "#3c78e6", "#32af5f", "#9655d2", "#f57323", "#d7dce4", "#2d2d34"];
const RACE_MS = 9_000;
const CAR_W = 92;

function CarSprite({ n, className = "" }: { n: number; className?: string }) {
  if (newVisualOn()) return <img src={gameArtUrl(`casino/car-${n}-1.webp`)} alt="" draggable={false} className={`object-contain ${className}`} />;
  return <span className={`block rounded-full border-2 border-black/40 ${className}`} style={{ backgroundColor: CAR_COLORS[n - 1] }} />;
}

/** The race track and the cars on it at `t` (0 = start, 1 = the winner on the line). */
function Track({ order, t }: { order: number[] | null; t: number }) {
  const painted = newVisualOn();
  const pos = order ? racePositions(order, t) : null;
  return (
    <div className="relative w-full overflow-hidden rounded-md border border-border bg-[#467d3c]" style={{ aspectRatio: `${TRACK.W} / ${TRACK.H}` }}>
      {painted
        ? <img src={gameArtUrl("casino/race-track-1.webp")} alt="" draggable={false} className="absolute inset-0 w-full h-full" />
        : (
          <svg viewBox={`0 0 ${TRACK.W} ${TRACK.H}`} className="absolute inset-0 w-full h-full" aria-hidden="true">
            <rect x={TRACK.X0 - TRACK.R - TRACK.HALF} y={TRACK.CY - TRACK.R - TRACK.HALF} width={TRACK.X1 - TRACK.X0 + 2 * (TRACK.R + TRACK.HALF)} height={2 * (TRACK.R + TRACK.HALF)} rx={TRACK.R + TRACK.HALF} fill="#36383e" />
            <rect x={TRACK.X0 - TRACK.R + TRACK.HALF} y={TRACK.CY - TRACK.R + TRACK.HALF} width={TRACK.X1 - TRACK.X0 + 2 * (TRACK.R - TRACK.HALF)} height={2 * (TRACK.R - TRACK.HALF)} rx={TRACK.R - TRACK.HALF} fill="#4e8a42" />
            <rect x={TRACK.FINISH_X} y={TRACK.CY - TRACK.R - TRACK.HALF} width={14} height={2 * TRACK.HALF} fill="#eeeeee" />
          </svg>
        )}
      {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => {
        const p = trackPoint(pos ? pos.get(n) ?? 0 : -40, laneOf(n));
        return (
          <div
            key={n}
            className="absolute"
            style={{
              left: `${(p.x / TRACK.W) * 100}%`, top: `${(p.y / TRACK.H) * 100}%`, width: `${(CAR_W / TRACK.W) * 100}%`,
              aspectRatio: "2 / 1", transform: `translate(-50%, -50%) rotate(${p.angle}deg)`,
            }}
          >
            <CarSprite n={n} className="w-full h-full" />
          </div>
        );
      })}
    </div>
  );
}

interface Props { saveId: string; view: CasinoView; onView: (v: CasinoView) => void }

/** Car race: pick a car, bet it wins or makes the podium, watch three laps. */
export function RaceGame({ saveId, view, onView }: Props) {
  const { t, i18n } = useTranslation();
  const [car, setCar] = useState(1);
  const [kind, setKind] = useState<RaceKind>("win");
  const [stake, setStake] = useState(1_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<{ result: RaceResultView; next: CasinoView } | null>(null);
  const [tNow, setTNow] = useState(0);
  const [shown, setShown] = useState<RaceResultView | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const card = run && !shown ? run.result.card : view.race;
  const value = clampStake(stake, view.limits.maxStake);
  const fmtX = (m: number) => `${m.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;

  const go = async () => {
    setBusy(true);
    setError(null);
    setShown(null);
    const r = await raceBet(saveId, car, kind, value);
    if (!r.ok) { setBusy(false); setError(t(`casino.errors.${r.error}`, { defaultValue: t("casino.errors.generic") })); return; }
    setRun({ result: r.data.result, next: r.data.view });
    const finish = () => { setTNow(1); setShown(r.data.result); setBusy(false); onView(r.data.view); };
    if (prefersReducedMotion()) { finish(); return; }
    const start = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - start) / RACE_MS);
      setTNow(u);
      if (u < 1) raf.current = requestAnimationFrame(step); else finish();
    };
    raf.current = requestAnimationFrame(step);
  };

  const odds = (c: { winOdds: number; top3Odds: number }) => (kind === "win" ? c.winOdds : c.top3Odds);
  const picked = card.cars.find((c) => c.n === car)!;
  const won = shown && shown.payout > 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
      <div className="flex flex-col gap-4">
        <div className={`rounded-md border bg-card p-4 ${won ? "border-primary ring-1 ring-primary" : "border-border"}`}>
          <Track order={run ? run.result.order : null} t={run ? tNow : 0} />
          <p className="text-sm text-muted-foreground m-0 mt-3 tabular-nums">
            {busy ? t("casino.race.running") : t("casino.race.card", { no: card.no })}
          </p>
        </div>
        {shown && (
          <div className={TABLE_STYLE.shell}>
            <div className={`${TABLE_STYLE.head} grid grid-cols-[56px_1fr_120px] px-4 py-3`}>
              <span>{t("casino.race.pos")}</span><span>{t("casino.race.car")}</span><span className="text-right">{t("casino.race.oddsWin")}</span>
            </div>
            <div className={TABLE_STYLE.body}>
              {shown.order.map((n, i) => {
                const c = shown.card.cars.find((x) => x.n === n)!;
                return (
                  <div key={n} className={`grid grid-cols-[56px_1fr_120px] items-center px-4 py-2.5 tabular-nums ${n === shown.car ? "bg-primary/10" : ""}`}>
                    <span className="font-bold text-muted-foreground">{i + 1}º</span>
                    <span className="flex items-center gap-3 font-semibold"><CarSprite n={n} className="w-12 h-6" />{c.name}</span>
                    <span className="text-right text-muted-foreground">{fmtX(c.winOdds)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-border bg-card p-4 flex flex-col gap-3">
          <OptionChips
            aria-label={t("casino.race.kind")}
            value={kind}
            onChange={setKind}
            disabled={busy}
            options={[{ key: "win", label: t("casino.race.win") }, { key: "top3", label: t("casino.race.top3") }]}
          />
          <div className="flex flex-col gap-1">
            {card.cars.map((c) => (
              <button
                key={c.n}
                type="button"
                disabled={busy}
                aria-pressed={car === c.n}
                onClick={() => setCar(c.n)}
                className={`flex items-center gap-3 h-10 px-2 rounded border text-left cursor-pointer disabled:cursor-not-allowed ${car === c.n ? "border-primary bg-primary/10" : "border-transparent hover:border-border"}`}
              >
                <CarSprite n={c.n} className="w-12 h-6" />
                <span className="flex-1 font-semibold truncate">{c.name}</span>
                <span className="font-display font-bold tabular-nums text-primary">{fmtX(odds(c))}</span>
              </button>
            ))}
          </div>
          <StakeControl value={value} max={view.limits.maxStake} disabled={busy} onChange={setStake} />
          <p className="text-sm text-muted-foreground m-0 tabular-nums">
            {t("casino.race.returns", { name: picked.name, amount: formatFee(Math.floor(value * odds(picked))) })}
          </p>
          <Button onClick={go} disabled={busy || view.limits.maxStake < view.limits.minStake}>{t("casino.race.go")}</Button>
          {error && <p className="text-sm text-destructive m-0">{error}</p>}
          {shown && (
            <p className={`text-sm m-0 tabular-nums ${won ? "text-primary font-semibold" : "text-muted-foreground"}`}>
              {won ? t("casino.race.won", { amount: formatFee(shown.payout) }) : t("casino.race.lost", { pos: shown.order.indexOf(shown.car) + 1 })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
