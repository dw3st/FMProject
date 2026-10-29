import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { aiKick, areaTarget, PENALTY_2D, type GoalArea, type KickInput, type KickOutcome } from "@/Domain/penalty/penaltyKick";
import { clamp } from "@/Domain/math";
import { shirtName } from "@/Domain/shirtName";
import { PenaltyPitch } from "@/GameInterface/Penalty/PenaltyPitch";
import type { PenaltyWeather } from "@/GameInterface/Penalty/penaltyRig";
import { SCENE, shotDuration } from "@/GameInterface/Penalty/penaltyScene";

/**
 * A penalty in 2D (`docs/superpowers/specs/2026-10-28-penalty-2d-design.md`), seen from behind the taker.
 * Both sides pick one of the six areas of the goal before the clock runs out (click, or arrows + Enter): `role` "kick"
 * where to shoot (4.39.5: no aim nor power bar), `role` "save" where to dive. The taker's finishing and strength decide
 * the rest (`resolveKick`). `choose` turns the pick into the outcome: in the browser (solo) or on the server (two managers).
 */

export interface PenaltyScreenProps {
  role: "kick" | "save";
  takerName: string;
  keeperName: string | null;
  /** Taker's strength, 0..1: only the pace of the ball in the animation. */
  takerStrength?: number;
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
  /** Weather of the match, for the painted backdrop (art phase 6). */
  weather?: PenaltyWeather;
}

/** After the kick leaves: the result shows when the ball arrives, the screen closes a while later. */
const RESULT_HOLD_MS = 1700;

type Phase = "pick" | "flight" | "result";

export function PenaltyScreen(props: PenaltyScreenProps) {
  const { t } = useTranslation();
  const { role, choose, onDone } = props;
  const kick = role === "kick";
  const [phase, setPhase] = useState<Phase>("pick");
  const [area, setArea] = useState<GoalArea>(kick ? "low-left" : "low-mid");
  const [outcome, setOutcome] = useState<KickOutcome | null>(null);
  const window_s = kick ? PENALTY_2D.KICK_WINDOW_S : PENALTY_2D.DIVE_WINDOW_S;
  const [left, setLeft] = useState<number>(window_s);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const busy = useRef(false);
  // Pace of the ball in the animation: a stronger taker hits it harder.
  const power = 0.6 + 0.25 * clamp(props.takerStrength ?? 0.5, 0, 1);

  const finish = useCallback((o: KickOutcome) => {
    setOutcome(o);
    setPhase("flight");
    const arrive = SCENE.RUNUP_MS + shotDuration(power) + 60;
    window.setTimeout(() => setPhase("result"), arrive);
    window.setTimeout(() => onDone(o), arrive + RESULT_HOLD_MS);
  }, [onDone, power]);

  const pick = useCallback((a: GoalArea) => {
    if (busy.current) return;
    busy.current = true;
    setArea(a);
    void choose(kick ? { kick: { area: a } } : { dive: a }).then(finish);
  }, [choose, finish, kick]);

  // Clock: no pick in time = the AI's area for the taker, the middle for the keeper.
  useEffect(() => {
    if (phase !== "pick") return;
    const end = performance.now() + window_s * 1000;
    const id = window.setInterval(() => {
      const s = Math.max(0, (end - performance.now()) / 1000);
      setLeft(s);
      if (s <= 0) { window.clearInterval(id); pick(kick ? aiKick(Math.random).area : "low-mid"); }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, pick, kick, window_s]);

  // Keyboard: arrows move the area, Enter or space confirms.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "pick") return;
      const [row, col] = area.split("-") as [string, string];
      const cols = ["left", "mid", "right"];
      const ci = cols.indexOf(col);
      if (e.key === "ArrowLeft") setArea(`${row}-${cols[Math.max(0, ci - 1)]}` as GoalArea);
      else if (e.key === "ArrowRight") setArea(`${row}-${cols[Math.min(2, ci + 1)]}` as GoalArea);
      else if (e.key === "ArrowUp") setArea(`high-${col}` as GoalArea);
      else if (e.key === "ArrowDown") setArea(`low-${col}` as GoalArea);
      else if (e.key === "Enter" || e.key === " ") pick(area);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, area, pick]);

  const title = kick
    ? t("penalty2d.kickTitle", { name: shirtName(props.takerName) })
    : t("penalty2d.saveTitle", { name: shirtName(props.takerName) });
  const hint = phase === "pick" ? t(kick ? "penalty2d.hintKick" : "penalty2d.hintDive", { s: Math.ceil(left) }) : "";

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
          phase={phase === "pick" ? "dive" : phase}
          role={role}
          aim={areaTarget(area)}
          area={area}
          outcome={outcome}
          power={power}
          takerColor={props.takerColor}
          keeperColor={props.keeperColor}
          {...(props.keeperFace ? { keeperFace: props.keeperFace } : {})}
          night={!!props.night}
          {...(props.weather ? { weather: props.weather } : {})}
          seed={props.seed ?? "penalty"}
          resultLabel={phase === "result" && outcome ? t(`penalty2d.result.${outcome.result}`) : null}
          resultClass={outcome && outcome.scored === kick ? "text-white" : "text-destructive"}
          svgRef={svgRef}
          onMove={() => {}}
          onClick={() => {}}
          onAreaHover={setArea}
          onAreaPick={pick}
        />

        <div className="min-h-8 flex items-center justify-between gap-3">
          {phase === "result" && outcome ? (
            <span className={`font-display font-black uppercase text-2xl leading-none ${outcome.scored === kick ? "text-chart-2" : "text-destructive"}`}>
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
