import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PENALTY_2D, powerAt, type GoalArea, type KickInput, type KickOutcome } from "@/Domain/penalty/penaltyKick";
import { clamp } from "@/Domain/math";
import { shirtName } from "@/Domain/shirtName";
import { PenaltyPitch } from "@/GameInterface/Penalty/PenaltyPitch";
import { SCENE, pxToGoal, shotDuration } from "@/GameInterface/Penalty/penaltyScene";

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
  /** Keeper's face (server SVG). */
  keeperFace?: string;
  /** The match is played at night: floodlights and phones in the crowd. */
  night?: boolean;
  /** Seed of the crowd (the same game, the same fans). */
  seed?: string;
}

/** After the kick leaves: the result shows when the ball arrives, the screen closes a while later. */
const RESULT_HOLD_MS = 1700;

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

  const powerRef = useRef(0);
  const finish = useCallback((o: KickOutcome) => {
    setOutcome(o);
    setPhase("flight");
    const arrive = SCENE.RUNUP_MS + shotDuration(powerRef.current) + 60;
    window.setTimeout(() => setPhase("result"), arrive);
    window.setTimeout(() => onDone(o), arrive + RESULT_HOLD_MS);
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
    powerRef.current = p;
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
    const x = ((e.clientX - r.left) / r.width) * SCENE.W;
    const y = ((e.clientY - r.top) / r.height) * SCENE.H;
    return pxToGoal(x, y);
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

        <PenaltyPitch
          phase={phase}
          role={role}
          aim={aim}
          area={area}
          outcome={outcome}
          power={power}
          takerColor={props.takerColor}
          keeperColor={props.keeperColor}
          {...(props.keeperFace ? { keeperFace: props.keeperFace } : {})}
          night={!!props.night}
          seed={props.seed ?? "penalty"}
          resultLabel={phase === "result" && outcome ? t(`penalty2d.result.${outcome.result}`) : null}
          resultClass={outcome && outcome.scored === (role === "kick") ? "text-white" : "text-destructive"}
          svgRef={svgRef}
          onMove={onMove}
          onClick={onClick}
          onAreaHover={setArea}
          onAreaPick={(a) => send({ dive: a })}
        />

        {/* Power bar */}
        {role === "kick" && (
          <div className="flex items-center gap-3">
            <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground w-16">{t("penalty2d.power")}</span>
            <div className="relative flex-1 h-3 rounded bg-border overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${Math.round(power * 100)}%` }} />
              {/* The green zone stays visible over the fill. */}
              <div className="absolute inset-y-0 border-2 border-green-500 bg-green-500/25 rounded-sm" style={{ left: `${green[0] * 100}%`, width: `${(green[1] - green[0]) * 100}%` }} />
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
