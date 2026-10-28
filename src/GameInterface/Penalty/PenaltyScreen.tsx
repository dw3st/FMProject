import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  GOAL_AREAS, PENALTY_2D, areaCentre, powerAt, type GoalArea, type KickInput, type KickOutcome,
} from "@/Domain/penalty/penaltyKick";
import { clamp } from "@/Domain/math";
import { shirtName } from "@/Domain/shirtName";

/**
 * A penalty in 2D (`docs/superpowers/specs/2026-10-28-penalty-2d-design.md`), seen from behind the taker.
 * `role` "kick": the manager aims (click or arrows + Enter) and releases the power bar (click or space).
 * `role` "save": he picks one of six areas before the clock runs out (click or arrows + Enter).
 * `choose` turns his choice into the outcome: resolved in the browser (solo) or by the server (two managers).
 */

export interface PenaltyScreenProps {
  role: "kick" | "save";
  takerName: string;
  keeperName: string | null;
  /** Kit colours (hex) of the taker's and the keeper's team. */
  takerColor: string;
  keeperColor: string;
  /** Shootout so far (null: a penalty in the match). Home side first. */
  shootout: { homeName: string; awayName: string; home: (boolean | null)[]; away: (boolean | null)[] } | null;
  choose: (choice: { kick: KickInput } | { dive: GoalArea }) => Promise<KickOutcome>;
  onDone: (outcome: KickOutcome) => void;
}

// Goal drawn in a 400 × 240 box: the mouth from x 60 to 340, the bar at y 56, the line at y 150.
const GX = 200, HALF_W = 140, LINE_Y = 150, GOAL_H = 94;
const toPx = (p: { x: number; y: number }) => ({ x: GX + p.x * HALF_W, y: LINE_Y - p.y * GOAL_H });
const fromPx = (x: number, y: number) => ({ x: (x - GX) / HALF_W, y: (LINE_Y - y) / GOAL_H });
const BALL_START = { x: GX, y: 214 };

type Phase = "aim" | "power" | "dive" | "flight" | "result";

export function PenaltyScreen(props: PenaltyScreenProps) {
  const { t } = useTranslation();
  const { role, choose, onDone } = props;
  const [phase, setPhase] = useState<Phase>(role === "kick" ? "aim" : "dive");
  const [aim, setAim] = useState<{ x: number; y: number }>({ x: 0, y: 0.35 });
  const [power, setPower] = useState(0);
  const [area, setArea] = useState<GoalArea>("low-mid");
  const [outcome, setOutcome] = useState<KickOutcome | null>(null);
  const [left, setLeft] = useState<number>(PENALTY_2D.DIVE_WINDOW_S);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const startRef = useRef(0);
  const busy = useRef(false);

  const finish = useCallback((o: KickOutcome) => {
    setOutcome(o);
    setPhase("flight");
    window.setTimeout(() => setPhase("result"), 750);
    window.setTimeout(() => onDone(o), 2300);
  }, [onDone]);

  const send = useCallback((choice: { kick: KickInput } | { dive: GoalArea }) => {
    if (busy.current) return;
    busy.current = true;
    void choose(choice).then(finish);
  }, [choose, finish]);

  // Power bar: a triangle wave while the manager holds the shot.
  useEffect(() => {
    if (phase !== "power") return;
    startRef.current = performance.now();
    let raf = 0;
    const step = () => {
      setPower(powerAt((performance.now() - startRef.current) / 1000));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Dive clock: no pick in time = he stays in the middle.
  useEffect(() => {
    if (phase !== "dive") return;
    const end = performance.now() + PENALTY_2D.DIVE_WINDOW_S * 1000;
    const id = window.setInterval(() => {
      const s = Math.max(0, (end - performance.now()) / 1000);
      setLeft(s);
      if (s <= 0) { window.clearInterval(id); send({ dive: "low-mid" }); }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, send]);

  const release = useCallback(() => {
    const p = powerAt((performance.now() - startRef.current) / 1000);
    setPower(p);
    send({ kick: { aim, power: p } });
  }, [aim, send]);

  // Keyboard: arrows move the aim / the area, Enter confirms, space releases the power bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "aim") {
        const d = 0.1;
        if (e.key === "ArrowLeft") setAim((a) => ({ ...a, x: clamp(a.x - d, -1.1, 1.1) }));
        else if (e.key === "ArrowRight") setAim((a) => ({ ...a, x: clamp(a.x + d, -1.1, 1.1) }));
        else if (e.key === "ArrowUp") setAim((a) => ({ ...a, y: clamp(a.y + d, 0, 1.1) }));
        else if (e.key === "ArrowDown") setAim((a) => ({ ...a, y: clamp(a.y - d, 0, 1.1) }));
        else if (e.key === "Enter" || e.key === " ") setPhase("power");
        else return;
        e.preventDefault();
      } else if (phase === "power" && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        release();
      } else if (phase === "dive") {
        const [row, col] = area.split("-") as [string, string];
        const cols = ["left", "mid", "right"];
        const ci = cols.indexOf(col);
        if (e.key === "ArrowLeft") setArea(`${row}-${cols[Math.max(0, ci - 1)]}` as GoalArea);
        else if (e.key === "ArrowRight") setArea(`${row}-${cols[Math.min(2, ci + 1)]}` as GoalArea);
        else if (e.key === "ArrowUp") setArea(`high-${col}` as GoalArea);
        else if (e.key === "ArrowDown") setArea(`low-${col}` as GoalArea);
        else if (e.key === "Enter" || e.key === " ") send({ dive: area });
        else return;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, area, release, send]);

  const pointOf = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 400;
    const y = ((e.clientY - r.top) / r.height) * 240;
    return fromPx(x, y);
  };
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (phase !== "aim") return;
    const p = pointOf(e);
    if (p) setAim({ x: clamp(p.x, -1.1, 1.1), y: clamp(p.y, 0, 1.1) });
  };
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (phase === "aim") {
      const p = pointOf(e);
      if (p) setAim({ x: clamp(p.x, -1.1, 1.1), y: clamp(p.y, 0, 1.1) });
      setPhase("power");
    } else if (phase === "power") release();
  };

  // Keeper: in the middle until the ball flies, then at the dive area.
  const diveTo = outcome && phase !== "aim" && phase !== "power" && phase !== "dive" ? areaCentre(outcome.dive) : { x: 0, y: 0.32 };
  const keeperPx = toPx(diveTo);
  const tilt = outcome && phase !== "dive" ? (diveTo.x < -0.2 ? -55 : diveTo.x > 0.2 ? 55 : 0) : 0;
  const ballPx = phase === "flight" || phase === "result"
    ? toPx({ x: clamp(outcome!.ball.x, -1.6, 1.6), y: clamp(outcome!.ball.y, 0, 1.5) })
    : BALL_START;
  const aimPx = toPx(aim);
  const green = PENALTY_2D.POWER_GREEN;

  const title = role === "kick"
    ? t("penalty2d.kickTitle", { name: shirtName(props.takerName) })
    : t("penalty2d.saveTitle", { name: shirtName(props.takerName) });
  const hint = phase === "aim" ? t("penalty2d.hintAim")
    : phase === "power" ? t("penalty2d.hintPower")
    : phase === "dive" ? t("penalty2d.hintDive", { s: Math.ceil(left) })
    : "";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/85 px-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-3xl rounded-md border border-border bg-card p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display font-black uppercase text-xl leading-none m-0">{title}</h2>
          {props.keeperName && (
            <span className="text-sm text-muted-foreground">{t("penalty2d.keeper", { name: shirtName(props.keeperName) })}</span>
          )}
        </div>
        {props.shootout && <ShootoutDots {...props.shootout} />}

        <svg
          ref={svgRef}
          viewBox="0 0 400 240"
          className={`w-full rounded-md bg-[#0d3b1e] ${phase === "aim" || phase === "power" ? "cursor-crosshair" : ""}`}
          onMouseMove={onMove}
          onClick={onClick}
          aria-hidden="true"
        >
          {/* Pitch, box line, penalty spot */}
          <rect x="0" y={LINE_Y} width="400" height="90" fill="#155b2e" />
          <line x1="0" y1={LINE_Y} x2="400" y2={LINE_Y} stroke="#ffffff" strokeOpacity="0.7" strokeWidth="1.5" />
          <circle cx={BALL_START.x} cy={BALL_START.y + 6} r="2.5" fill="#ffffff" fillOpacity="0.8" />
          {/* Net */}
          <rect x={GX - HALF_W} y={LINE_Y - GOAL_H} width={HALF_W * 2} height={GOAL_H} fill="#ffffff" fillOpacity="0.06" />
          {Array.from({ length: 15 }, (_, i) => (
            <line key={`v${i}`} x1={GX - HALF_W + (i + 1) * (HALF_W / 8)} y1={LINE_Y - GOAL_H} x2={GX - HALF_W + (i + 1) * (HALF_W / 8)} y2={LINE_Y} stroke="#ffffff" strokeOpacity="0.12" />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <line key={`h${i}`} x1={GX - HALF_W} y1={LINE_Y - GOAL_H + (i + 1) * (GOAL_H / 6)} x2={GX + HALF_W} y2={LINE_Y - GOAL_H + (i + 1) * (GOAL_H / 6)} stroke="#ffffff" strokeOpacity="0.12" />
          ))}
          {/* Dive areas (the manager saving) */}
          {phase === "dive" && GOAL_AREAS.map((a) => {
            const c = toPx(areaCentre(a));
            const on = a === area;
            return (
              <rect
                key={a}
                x={c.x - HALF_W / 3 + 2} y={c.y - GOAL_H / 4 + 2} width={(HALF_W * 2) / 3 - 4} height={GOAL_H / 2 - 4} rx="4"
                fill={on ? "#facc15" : "#ffffff"} fillOpacity={on ? 0.35 : 0.08}
                stroke={on ? "#facc15" : "#ffffff"} strokeOpacity={on ? 0.9 : 0.25}
                className="cursor-pointer"
                onMouseEnter={() => setArea(a)}
                onClick={(e) => { e.stopPropagation(); send({ dive: a }); }}
              />
            );
          })}
          {/* Posts and bar */}
          <path d={`M${GX - HALF_W},${LINE_Y} V${LINE_Y - GOAL_H} H${GX + HALF_W} V${LINE_Y}`} fill="none" stroke="#ffffff" strokeWidth="5" strokeLinejoin="round" />
          {/* Keeper */}
          <g style={{ transform: `translate(${keeperPx.x}px, ${keeperPx.y}px) rotate(${tilt}deg)`, transition: "transform 0.45s ease-out" }}>
            <rect x="-9" y="-6" width="18" height="34" rx="6" fill={props.keeperColor} stroke="#000" strokeOpacity="0.4" />
            <circle cx="0" cy="-13" r="8" fill="#e6c4a0" stroke="#000" strokeOpacity="0.4" />
            <rect x="-24" y="-4" width="15" height="6" rx="3" fill={props.keeperColor} />
            <rect x="9" y="-4" width="15" height="6" rx="3" fill={props.keeperColor} />
          </g>
          {/* Aim mark */}
          {(phase === "aim" || phase === "power") && (
            <g style={{ transform: `translate(${aimPx.x}px, ${aimPx.y}px)` }}>
              <circle r="9" fill="none" stroke="#facc15" strokeWidth="2" />
              <line x1="-13" y1="0" x2="13" y2="0" stroke="#facc15" strokeWidth="1.5" />
              <line x1="0" y1="-13" x2="0" y2="13" stroke="#facc15" strokeWidth="1.5" />
            </g>
          )}
          {/* Taker (back view) */}
          {phase !== "flight" && phase !== "result" && (
            <g style={{ transform: `translate(${BALL_START.x - 26}px, ${BALL_START.y - 18}px)` }}>
              <rect x="-8" y="0" width="16" height="26" rx="5" fill={props.takerColor} stroke="#000" strokeOpacity="0.4" />
              <circle cx="0" cy="-6" r="7" fill="#3b2a1d" />
            </g>
          )}
          {/* Ball */}
          <circle
            r={phase === "flight" || phase === "result" ? 5 : 7}
            fill="#ffffff" stroke="#111" strokeWidth="1"
            style={{ transform: `translate(${ballPx.x}px, ${ballPx.y}px)`, transition: "transform 0.6s cubic-bezier(.2,.7,.3,1)" }}
            cx="0" cy="0"
          />
        </svg>

        {/* Power bar */}
        {role === "kick" && (
          <div className="flex items-center gap-3">
            <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground w-16">{t("penalty2d.power")}</span>
            <div className="relative flex-1 h-3 rounded bg-border overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${Math.round(power * 100)}%` }} />
              {/* The green zone stays visible over the fill. */}
              <div className="absolute inset-y-0 border-2 border-chart-2 bg-chart-2/25 rounded-sm" style={{ left: `${green[0] * 100}%`, width: `${(green[1] - green[0]) * 100}%` }} />
            </div>
          </div>
        )}

        <div className="min-h-8 flex items-center justify-between gap-3">
          {phase === "result" && outcome ? (
            <span className={`font-display font-black uppercase text-2xl leading-none ${outcome.scored === (role === "kick") ? "text-chart-2" : "text-destructive"}`}>
              {t(`penalty2d.result.${outcome.result}`)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{hint}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Shootout so far: one mark per kick (filled = scored, cross = missed, empty = to come). */
function ShootoutDots({ homeName, awayName, home, away }: NonNullable<PenaltyScreenProps["shootout"]>) {
  const row = (name: string, kicks: (boolean | null)[]) => (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-foreground w-36 truncate">{name}</span>
      <span className="flex gap-1">
        {kicks.map((k, i) => (
          <span
            key={i}
            className={`w-4 h-4 rounded-full border ${k === true ? "bg-chart-2 border-chart-2" : k === false ? "bg-destructive border-destructive" : "border-border"}`}
          />
        ))}
      </span>
      <span className="font-display font-bold tabular-nums text-foreground">{kicks.filter((k) => k === true).length}</span>
    </div>
  );
  return <div className="flex flex-col gap-1">{row(homeName, home)}{row(awayName, away)}</div>;
}
