import { useEffect, useMemo, useRef } from "react";
import { GOAL_AREAS, areaCentre } from "@/Domain/penalty/penaltyKick";
import { SCENE, goalToPx, shotDuration } from "@/GameInterface/Penalty/penaltyScene";
import { rigPlan, rigScene, type KeeperLook, type RigPlan, type TakerLook } from "@/GameInterface/Penalty/penaltyRig";
import type { PenaltyPitchProps } from "@/GameInterface/Penalty/PenaltyPitch";

/**
 * The 2D penalty with the new art (art plan phase 6): the painted backdrop of the weather, the keeper and the taker
 * as the art's articulated figures (`penaltyRig.ts`), the ball with panels and spin, the net that bulges. Same props
 * and flow as `PenaltyPitch`; the outcome comes from `penaltyKick.ts`. One requestAnimationFrame loop rewrites the
 * figures' group (no React render per frame).
 */
export function PenaltyArtScene(props: PenaltyPitchProps & { backdrop: string }) {
  const live = useRef(props);
  live.current = props;
  const sceneRef = useRef<SVGGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const id = useMemo(() => `pa${Math.random().toString(36).slice(2, 8)}`, []);

  useEffect(() => {
    let raf = 0;
    let shotStart: number | null = null;
    let plan: RigPlan | null = null;
    let shook = false;
    const step = (nowMs: number) => {
      const p = live.current;
      const o = p.outcome;
      if (o && (p.phase === "flight" || p.phase === "result") && shotStart === null) {
        shotStart = nowMs;
        plan = rigPlan(o, SCENE.RUNUP_MS / 1000, shotDuration(p.power) / 1000);
      }
      const t = shotStart === null ? 0 : (nowMs - shotStart) / 1000;
      const keeper: KeeperLook = { shirt: p.keeperColor, trim: "#1e1e22", shorts: "#1e1e22", socks: p.keeperColor, skin: "#c99a6e", ...(p.keeperFace ? { face: p.keeperFace } : {}) };
      const taker: TakerLook = { shirt: p.takerColor, trim: "#ffffff", shorts: "#f4f6fa", socks: p.takerColor, skin: "#a66f4f", hair: "#1e130c", number: "" };
      if (sceneRef.current) sceneRef.current.innerHTML = rigScene(t, nowMs / 1000, plan, keeper, taker, id);
      // A goal shakes the picture once.
      if (plan && !shook && !plan.saved && !plan.post && !plan.miss && t > plan.kick + plan.dur) {
        shook = true;
        wrapRef.current?.animate(
          [{ transform: "translate(0,0)" }, { transform: "translate(-3px,1px)" }, { transform: "translate(3px,-1px)" }, { transform: "translate(0,0)" }],
          { duration: 380, easing: "cubic-bezier(.36,.07,.19,.97)" },
        );
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [id]);

  useEffect(() => {
    if (!props.resultLabel) return;
    resultRef.current?.animate(
      [{ opacity: 0, transform: "scale(.4)" }, { opacity: 1, transform: "scale(1.15)", offset: 0.6 }, { opacity: 1, transform: "scale(1)" }],
      { duration: 450, easing: "cubic-bezier(.2,.8,.3,1.2)", fill: "forwards" },
    );
  }, [props.resultLabel]);

  const { phase, area } = props;
  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-md">
      <svg viewBox={`0 0 ${SCENE.W} ${SCENE.H}`} className="block w-full" aria-hidden="true">
        <image href={props.backdrop} x="0" y="0" width={SCENE.W} height={SCENE.H} preserveAspectRatio="xMidYMid slice" />
        <g ref={sceneRef} />
        {phase === "dive" && GOAL_AREAS.map((a) => {
          const c = goalToPx(areaCentre(a));
          const on = a === area;
          return (
            <rect
              key={a}
              x={c.x - SCENE.HALF_W / 3 + 2} y={c.y - SCENE.GOAL_H / 4 + 2} width={(SCENE.HALF_W * 2) / 3 - 4} height={SCENE.GOAL_H / 2 - 4} rx="4"
              fill={on ? "#facc15" : "#ffffff"} fillOpacity={on ? 0.32 : 0.07}
              stroke={on ? "#facc15" : "#ffffff"} strokeOpacity={on ? 0.9 : 0.25}
              className="cursor-pointer"
              onMouseEnter={() => props.onAreaHover(a)}
              onClick={(e) => { e.stopPropagation(); props.onAreaPick(a); }}
            />
          );
        })}
      </svg>
      {props.resultLabel && (
        <div className="pointer-events-none absolute inset-x-0 top-[22%] flex justify-center">
          <div
            ref={resultRef}
            className={`font-display font-black uppercase text-5xl md:text-7xl leading-none opacity-0 [text-shadow:0_3px_12px_rgba(0,0,0,.6)] ${props.resultClass}`}
          >
            {props.resultLabel}
          </div>
        </div>
      )}
    </div>
  );
}
