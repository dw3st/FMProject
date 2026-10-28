import { useEffect, useMemo, useRef } from "react";
import { GOAL_AREAS, areaCentre, type GoalArea, type KickOutcome } from "@/Domain/penalty/penaltyKick";
import { clamp } from "@/Domain/math";
import {
  SCENE, armPath, ballHeight, crowdFans, crowdPhones, curveAt, easeOut, goalToPx, grassStripes, keeperArms,
  keeperDive, keeperPose, keeperStance, netPaths, shotControl, shotDuration, takerPose, takerSpot,
  type ArmPose, type KeeperPose, type LegPose, type Pt,
} from "@/GameInterface/Penalty/penaltyScene";

/**
 * The scene of a 2D penalty (4.39): crowd behind the goal, grass in perspective, a net that bulges, posts with volume,
 * the keeper swaying and diving in three beats, the taker's run-up and the ball's curve with its shadow. Drawn in SVG;
 * the animation writes attributes from one requestAnimationFrame loop (no React render per frame).
 */
export interface PenaltyPitchProps {
  phase: "aim" | "power" | "dive" | "flight" | "result";
  role: "kick" | "save";
  aim: Pt;
  area: GoalArea;
  outcome: KickOutcome | null;
  power: number;
  takerColor: string;
  keeperColor: string;
  /** Keeper's face (server SVG); absent = a drawn face. */
  keeperFace?: string;
  night: boolean;
  seed: string;
  /** Big text over the scene at the result ("GOL!"), and its colour class. */
  resultLabel: string | null;
  resultClass: string;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onClick: (e: React.MouseEvent<SVGSVGElement>) => void;
  onAreaHover: (a: GoalArea) => void;
  onAreaPick: (a: GoalArea) => void;
}

const { GX, LINE_Y, HALF_W, GOAL_H, NET_DEPTH, BALL_START } = SCENE;
const SKIN = "#c99a6e";
const SKIN_DARK = "#8d5a3b";

const mix = (hex: string, toward: string, t: number): string => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex.length === 7 ? hex : "#888888"), b = p(toward);
  return `#${a.map((v, i) => Math.round(v + (b[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
};

/** A keeper's leg group [thigh, shin + sock, boot]. */
function setLeg(g: SVGGElement | null, l: LegPose) {
  if (!g) return;
  const [thigh, shin, boot] = Array.from(g.children) as SVGElement[];
  thigh?.setAttribute("d", `M${l.hip.x.toFixed(1)},${l.hip.y.toFixed(1)} L${l.knee.x.toFixed(1)},${l.knee.y.toFixed(1)}`);
  shin?.setAttribute("d", `M${l.knee.x.toFixed(1)},${l.knee.y.toFixed(1)} L${l.foot.x.toFixed(1)},${l.foot.y.toFixed(1)}`);
  boot?.setAttribute("cx", l.foot.x.toFixed(1));
  boot?.setAttribute("cy", l.foot.y.toFixed(1));
}

/** An arm group [sleeve, forearm, hand]: the sleeve from the shoulder to the elbow, the bare forearm on to the hand. */
function setArm(g: SVGGElement | null, a: ArmPose) {
  if (!g) return;
  const [sleeve, fore, hand] = Array.from(g.children) as SVGElement[];
  sleeve?.setAttribute("d", `M${a.shoulder.x.toFixed(1)},${a.shoulder.y.toFixed(1)} L${a.elbow.x.toFixed(1)},${a.elbow.y.toFixed(1)}`);
  fore?.setAttribute("d", `M${a.elbow.x.toFixed(1)},${a.elbow.y.toFixed(1)} L${a.hand.x.toFixed(1)},${a.hand.y.toFixed(1)}`);
  hand?.setAttribute("cx", a.hand.x.toFixed(1));
  hand?.setAttribute("cy", a.hand.y.toFixed(1));
}

export function PenaltyPitch(props: PenaltyPitchProps) {
  const live = useRef(props);
  live.current = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const keeperRef = useRef<SVGGElement | null>(null);
  const keeperBodyRef = useRef<SVGGElement | null>(null);
  const keeperShadowRef = useRef<SVGEllipseElement | null>(null);
  const takerRef = useRef<SVGGElement | null>(null);
  const ballRef = useRef<SVGGElement | null>(null);
  const seamsRef = useRef<SVGGElement | null>(null);
  const ballShadowRef = useRef<SVGEllipseElement | null>(null);
  const trailRef = useRef<SVGPathElement | null>(null);
  const netRef = useRef<SVGGElement | null>(null);
  const fxRef = useRef<SVGGElement | null>(null);
  const woodRef = useRef<{ left: SVGRectElement | null; right: SVGRectElement | null; bar: SVGRectElement | null }>({ left: null, right: null, bar: null });
  const takerFansRef = useRef<SVGGElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const kArmL = useRef<SVGPathElement | null>(null);
  const kArmR = useRef<SVGPathElement | null>(null);
  const kGloveL = useRef<SVGCircleElement | null>(null);
  const kGloveR = useRef<SVGCircleElement | null>(null);
  const tArmL = useRef<SVGGElement | null>(null);
  const tArmR = useRef<SVGGElement | null>(null);
  const tLegL = useRef<SVGGElement | null>(null);
  const tLegR = useRef<SVGGElement | null>(null);
  const kLegL = useRef<SVGGElement | null>(null);
  const kLegR = useRef<SVGGElement | null>(null);
  const kTorso = useRef<SVGGElement | null>(null);
  const kHead = useRef<SVGGElement | null>(null);

  const fans = useMemo(() => crowdFans(props.seed), [props.seed]);
  const phones = useMemo(() => crowdPhones(props.seed), [props.seed]);
  const stripes = useMemo(() => grassStripes(), []);
  const ids = useMemo(() => `pk${Math.random().toString(36).slice(2, 8)}`, []);

  useEffect(() => {
    let raf = 0;
    let shotStart: number | null = null;
    let impactDone = false;
    let rebound: { from: Pt; to: Pt; t0: number } | null = null;
    let bulge: (Pt & { strength: number; at: number }) | null = null;
    let rest: Pt & { scale: number } = { ...BALL_START, scale: 1 };
    let parts: { x: number; y: number; vx: number; vy: number; life: number; max: number; node: SVGCircleElement }[] = [];
    let last = performance.now();
    const NS = "http://www.w3.org/2000/svg";

    const burst = (at: Pt, color: string, n: number, speed: number) => {
      const g = fxRef.current;
      if (!g) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
        const node = document.createElementNS(NS, "circle");
        node.setAttribute("r", "1.6");
        node.setAttribute("fill", color);
        g.appendChild(node);
        parts.push({ x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.5, life: 0, max: 0.8 + Math.random() * 0.6, node });
      }
    };
    const shake = () => {
      wrapRef.current?.animate(
        [{ transform: "translate(0,0)" }, { transform: "translate(-3px,1px)" }, { transform: "translate(3px,-1px)" }, { transform: "translate(-2px,0)" }, { transform: "translate(0,0)" }],
        { duration: 420, easing: "cubic-bezier(.36,.07,.19,.97)" },
      );
    };
    const vibrate = (el: Element | null) => el?.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(1.5px)" }, { transform: "translateX(-1.5px)" }, { transform: "translateX(0)" }],
      { duration: 120, iterations: 4 },
    );

    const impact = (o: KickOutcome, to: Pt, now: number) => {
      const p = live.current;
      if (o.result === "goal") {
        bulge = { ...to, strength: 9, at: now };
        shake();
        burst(to, p.role === "kick" ? p.takerColor : p.keeperColor, 36, 60);
        burst(to, "#facc15", 18, 45);
        takerFansRef.current?.animate(
          [{ transform: "translateY(0)" }, { transform: "translateY(-2.5px)" }, { transform: "translateY(0)" }],
          { duration: 380, iterations: 3 },
        );
      } else if (o.result === "saved") {
        burst(to, "#ffffff", 12, 30);
        rebound = { from: to, to: { x: to.x + (to.x >= GX ? 60 : -60), y: to.y + 60 }, t0: now };
      } else if (o.result === "post") {
        const w = woodRef.current;
        vibrate(Math.abs(to.y - (LINE_Y - GOAL_H)) < 8 ? w.bar : to.x > GX ? w.right : w.left);
        burst(to, "#e2e8f0", 10, 25);
        rebound = { from: to, to: { x: to.x - (to.x > GX ? 40 : -40), y: LINE_Y + 70 }, t0: now };
      }
    };

    const step = (now: number) => {
      const p = live.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const o = p.outcome;
      const flying = !!o && (p.phase === "flight" || p.phase === "result");
      if (flying && shotStart === null) shotStart = now;

      // Taker: the run-up to beside the ball, arms swinging and legs lifting in turn, then the kick.
      const runT = shotStart === null ? 0 : clamp((now - shotStart) / SCENE.RUNUP_MS, 0, 1);
      const spot = takerSpot(runT);
      takerRef.current?.setAttribute("transform", `translate(${spot.x.toFixed(1)},${spot.y.toFixed(1)})`);
      const tp = takerPose(runT);
      setArm(tArmL.current, tp.left);
      setArm(tArmR.current, tp.right);
      tLegL.current?.setAttribute("transform", `translate(0,${(-tp.legL).toFixed(1)})`);
      tLegR.current?.setAttribute("transform", `translate(${(tp.kick * 3).toFixed(1)},${(-tp.legR).toFixed(1)})`);

      // Keeper: sways until the kick leaves, then dives in three beats (crouch, stretch, land).
      const launchAt = shotStart === null ? null : shotStart + SCENE.RUNUP_MS;
      let kx = GX + Math.sin(now / 420) * 6, ky = LINE_Y + 4;
      const bob = Math.sin(now / 210);
      let pose: KeeperPose = keeperStance(bob);
      let body = `translate(0,${(-Math.abs(bob) * 1.2).toFixed(2)})`;
      if (o && launchAt !== null && now >= launchAt) {
        // The dive by body part: crouch, push off with the far leg, fly with the legs trailing, land and curl.
        const d = keeperDive(o.dive);
        const t = clamp((now - launchAt) / SCENE.DIVE_MS, 0, 1);
        pose = keeperPose(o.dive, t);
        kx = GX + (d.x - GX) * pose.travel;
        ky = LINE_Y + 4 + (d.y - LINE_Y - 4) * pose.travel - pose.lift;
        body = "";
      }
      const rot = pose.rot;
      const reach = pose.reach;
      setLeg(kLegL.current, pose.legL);
      setLeg(kLegR.current, pose.legR);
      kTorso.current?.setAttribute("transform", `rotate(${pose.lean.toFixed(1)} 0 -20)`);
      kHead.current?.setAttribute("transform", `rotate(${pose.tilt.toFixed(1)} 0 -47)`);
      const ka = keeperArms(reach, o && launchAt !== null && now >= launchAt ? 0 : bob);
      kArmL.current?.setAttribute("d", armPath(ka.left));
      kArmR.current?.setAttribute("d", armPath(ka.right));
      kGloveL.current?.setAttribute("cx", ka.left.hand.x.toFixed(1));
      kGloveL.current?.setAttribute("cy", ka.left.hand.y.toFixed(1));
      kGloveR.current?.setAttribute("cx", ka.right.hand.x.toFixed(1));
      kGloveR.current?.setAttribute("cy", ka.right.hand.y.toFixed(1));
      keeperRef.current?.setAttribute("transform", `translate(${kx.toFixed(1)},${ky.toFixed(1)}) rotate(${rot.toFixed(1)})`);
      keeperBodyRef.current?.setAttribute("transform", body);
      keeperShadowRef.current?.setAttribute("transform", `rotate(${(-rot).toFixed(1)})`);

      // Ball: on the spot, then the curve to the target, then the rebound (save, post).
      let bx = rest.x, by = rest.y, scale = rest.scale, h = 0;
      if (o && launchAt !== null && now >= launchAt && !impactDone) {
        const to = goalToPx({ x: clamp(o.ball.x, -1.6, 1.6), y: clamp(o.ball.y, 0, 1.5) });
        const ctrl = shotControl(BALL_START, to, p.power);
        const t = clamp((now - launchAt) / shotDuration(p.power), 0, 1);
        const pos = curveAt(BALL_START, ctrl, to, t);
        bx = pos.x; by = pos.y; scale = 1 - 0.42 * t;
        h = ballHeight(BALL_START, to, pos, t);
        seamsRef.current?.setAttribute("transform", `rotate(${((now - launchAt) * 1.6).toFixed(0)})`);
        trailRef.current?.setAttribute("d", `M${BALL_START.x},${BALL_START.y} Q${ctrl.x.toFixed(1)},${ctrl.y.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`);
        trailRef.current?.setAttribute("opacity", p.power > 0.72 ? (0.25 * (1 - t)).toFixed(2) : "0");
        if (t >= 1) {
          impactDone = true;
          rest = { ...to, scale };
          trailRef.current?.setAttribute("opacity", "0");
          impact(o, to, now);
        }
      } else if (rebound) {
        const t = clamp((now - rebound.t0) / SCENE.REBOUND_MS, 0, 1), e = easeOut(t);
        const ctrl = { x: (rebound.from.x + rebound.to.x) / 2, y: rebound.from.y - 10 };
        const pos = curveAt(rebound.from, ctrl, rebound.to, e);
        bx = pos.x; by = pos.y; scale = 0.58 + 0.32 * e;
        seamsRef.current?.setAttribute("transform", `rotate(${((now - rebound.t0) * 1.2).toFixed(0)})`);
        if (t >= 1) { rest = { ...rebound.to, scale }; rebound = null; }
      }
      ballRef.current?.setAttribute("transform", `translate(${bx.toFixed(1)},${by.toFixed(1)}) scale(${scale.toFixed(3)})`);
      const sh = ballShadowRef.current;
      if (sh) {
        sh.setAttribute("cx", (bx + h * 0.15).toFixed(1));
        sh.setAttribute("cy", (by + h + 5 * scale).toFixed(1));
        sh.setAttribute("rx", (6 * scale * (1 + h / 80)).toFixed(2));
        sh.setAttribute("opacity", Math.max(0.08, 0.35 - h / 300).toFixed(2));
      }

      // Net: redrawn only while a bulge settles.
      const net = netRef.current;
      if (net && bulge) {
        const age = (now - bulge.at) / 1000;
        const paths = netPaths(bulge, age);
        net.querySelectorAll("path").forEach((el, i) => el.setAttribute("d", paths[i] ?? ""));
        if (age > 2.5) bulge = null;
      }

      // Particles (confetti, chips of the ball on a save or the post).
      parts = parts.filter((q) => {
        q.life += dt; q.vy += 90 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.life > q.max) { q.node.remove(); return false; }
        q.node.setAttribute("cx", q.x.toFixed(1));
        q.node.setAttribute("cy", q.y.toFixed(1));
        q.node.setAttribute("opacity", (1 - q.life / q.max).toFixed(2));
        return true;
      });

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      for (const q of parts) q.node.remove();
    };
  }, []);

  // The result text pops in.
  useEffect(() => {
    if (!props.resultLabel) return;
    resultRef.current?.animate(
      [{ opacity: 0, transform: "scale(.4)" }, { opacity: 1, transform: "scale(1.15)", offset: 0.6 }, { opacity: 1, transform: "scale(1)" }],
      { duration: 450, easing: "cubic-bezier(.2,.8,.3,1.2)", fill: "forwards" },
    );
  }, [props.resultLabel]);

  const { phase, area } = props;
  const aimPx = goalToPx(props.aim);
  const takerShirt = [mix(props.takerColor, "#ffffff", 0.15), mix(props.takerColor, "#000000", 0.45)];
  const keeperShirt = [mix(props.keeperColor, "#ffffff", 0.15), mix(props.keeperColor, "#000000", 0.45)];
  const initialNet = useMemo(() => netPaths(null, 0), []);
  const initialKeeperArms = keeperArms(0);
  const initialKeeper = keeperStance(0);
  const initialTaker = takerPose(0);
  const initialSpot = takerSpot(0);
  const fanColor = (f: (typeof fans)[number]) =>
    f.team === "neutral" ? (f.shade < 0.6 ? "#e5e7eb" : "#475569") : mix(f.team === "taker" ? props.takerColor : props.keeperColor, "#000000", f.shade * 0.25);

  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-md">
      <svg
        ref={props.svgRef}
        viewBox={`0 0 ${SCENE.W} ${SCENE.H}`}
        className={`block w-full ${phase === "aim" || phase === "power" ? "cursor-crosshair" : ""}`}
        onMouseMove={props.onMove}
        onClick={props.onClick}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`${ids}sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={props.night ? "#04070f" : "#5d86b8"} />
            <stop offset="1" stopColor={props.night ? "#16233b" : "#a9c3df"} />
          </linearGradient>
          <linearGradient id={`${ids}stand`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b2433" /><stop offset="1" stopColor="#2d3a4f" /></linearGradient>
          <linearGradient id={`${ids}post`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#cfd6df" /><stop offset=".45" stopColor="#ffffff" /><stop offset="1" stopColor="#9aa4b1" /></linearGradient>
          <linearGradient id={`${ids}bar`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#aab3bf" /></linearGradient>
          <linearGradient id={`${ids}shirtK`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={keeperShirt[0]} /><stop offset="1" stopColor={keeperShirt[1]} /></linearGradient>
          <linearGradient id={`${ids}shirtT`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={takerShirt[0]} /><stop offset="1" stopColor={takerShirt[1]} /></linearGradient>
          <radialGradient id={`${ids}ball`} cx=".35" cy=".3" r=".75"><stop offset="0" stopColor="#ffffff" /><stop offset=".7" stopColor="#e5e7eb" /><stop offset="1" stopColor="#9ca3af" /></radialGradient>
          <radialGradient id={`${ids}glow`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff6d8" stopOpacity=".9" /><stop offset="1" stopColor="#fff6d8" stopOpacity="0" /></radialGradient>
          <radialGradient id={`${ids}vig`} cx=".5" cy=".55" r=".75"><stop offset=".6" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".55" /></radialGradient>
          <filter id={`${ids}blur`}><feGaussianBlur stdDeviation="0.9" /></filter>
          <clipPath id={`${ids}face`}><circle cx="0" cy="-54" r="9" /></clipPath>
        </defs>

        {/* Sky, stand, crowd (blurred: depth of field), phones at night, ad boards */}
        <rect x="0" y="0" width={SCENE.W} height="120" fill={`url(#${ids}sky)`} />
        <rect x="0" y="40" width={SCENE.W} height="92" fill={`url(#${ids}stand)`} />
        <g filter={`url(#${ids}blur)`}>
          <g>{fans.filter((f) => f.team !== "taker").map((f, i) => <circle key={i} cx={f.x} cy={f.y} r="2.1" fill={fanColor(f)} />)}</g>
          <g ref={takerFansRef}>{fans.filter((f) => f.team === "taker").map((f, i) => <circle key={i} cx={f.x} cy={f.y} r="2.1" fill={fanColor(f)} />)}</g>
        </g>
        {props.night && phones.map((ph, i) => (
          <circle key={i} cx={ph.x} cy={ph.y} r=".9" fill="#f4f7ff">
            <animate attributeName="opacity" values=".3;1;.3" dur={`${ph.dur.toFixed(1)}s`} begin={`${ph.delay.toFixed(1)}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <g key={i}>
            <rect x={i * 50} y="126" width="50" height="10" fill={i % 2 ? "#0f172a" : "#1e3a8a"} />
            <rect x={i * 50 + 12} y="130" width="26" height="2" rx="1" fill="#cbd5e1" opacity=".7" />
          </g>
        ))}
        {props.night && [24, 376].map((x) => (
          <g key={x}>
            <rect x={x - 1} y="6" width="2" height="40" fill="#64748b" />
            <rect x={x - 12} y="2" width="24" height="8" rx="1.5" fill="#fff4d6" />
            <circle cx={x} cy="6" r="60" fill={`url(#${ids}glow)`} />
          </g>
        ))}

        {/* Grass in perspective, lines, penalty spot */}
        {stripes.map((s, i) => <rect key={i} x="0" y={s.y} width={SCENE.W} height={s.h} fill={i % 2 ? "#1f7a3b" : "#238a43"} />)}
        <path d={`M40,${LINE_Y} L360,${LINE_Y}`} stroke="#e8f5e9" strokeWidth="1.6" opacity=".9" />
        <path d={`M120,${LINE_Y} L104,200 L296,200 L280,${LINE_Y}`} stroke="#e8f5e9" strokeWidth="1.4" fill="none" opacity=".85" />
        <ellipse cx={BALL_START.x} cy={BALL_START.y + 4} rx="3.5" ry="1.4" fill="#f1f5f9" opacity=".9" />

        {/* Goal: back of the net, mesh, shadow, posts and bar */}
        <path d={`M${GX - HALF_W + 6},${LINE_Y - NET_DEPTH * 0.4} L${GX - HALF_W + 6},${LINE_Y - GOAL_H + 6} L${GX + HALF_W - 6},${LINE_Y - GOAL_H + 6} L${GX + HALF_W - 6},${LINE_Y - NET_DEPTH * 0.4}`} fill="#0b1a10" fillOpacity=".35" />
        <g ref={netRef} stroke="#ffffff" strokeOpacity=".42" strokeWidth=".55" fill="none">
          {initialNet.map((d, i) => <path key={i} d={d} />)}
        </g>
        <ellipse cx={GX} cy={LINE_Y + 2} rx={HALF_W + 6} ry="3" fill="#000" opacity=".22" />
        <rect ref={(e) => { woodRef.current.left = e; }} x={GX - HALF_W - 3} y={LINE_Y - GOAL_H} width="6" height={GOAL_H} rx="2" fill={`url(#${ids}post)`} />
        <rect ref={(e) => { woodRef.current.right = e; }} x={GX + HALF_W - 3} y={LINE_Y - GOAL_H} width="6" height={GOAL_H} rx="2" fill={`url(#${ids}post)`} />
        <rect ref={(e) => { woodRef.current.bar = e; }} x={GX - HALF_W - 3} y={LINE_Y - GOAL_H - 3} width={HALF_W * 2 + 6} height="6" rx="2" fill={`url(#${ids}bar)`} />

        {/* Dive areas (the manager saving) */}
        {phase === "dive" && GOAL_AREAS.map((a) => {
          const c = goalToPx(areaCentre(a));
          const on = a === area;
          return (
            <rect
              key={a}
              x={c.x - HALF_W / 3 + 2} y={c.y - GOAL_H / 4 + 2} width={(HALF_W * 2) / 3 - 4} height={GOAL_H / 2 - 4} rx="4"
              fill={on ? "#facc15" : "#ffffff"} fillOpacity={on ? 0.32 : 0.07}
              stroke={on ? "#facc15" : "#ffffff"} strokeOpacity={on ? 0.9 : 0.25}
              className="cursor-pointer"
              onMouseEnter={() => props.onAreaHover(a)}
              onClick={(e) => { e.stopPropagation(); props.onAreaPick(a); }}
            />
          );
        })}

        {/* Keeper */}
        <g ref={keeperRef} transform={`translate(${GX},${LINE_Y + 4})`}>
          <ellipse ref={keeperShadowRef} cx="0" cy="0" rx="14" ry="3" fill="#000" opacity=".3" />
          <g ref={keeperBodyRef}>
            {/* Legs: thigh, shin with the sock, boot (each moves on its own) */}
            {(["L", "R"] as const).map((k) => {
              const l = k === "L" ? initialKeeper.legL : initialKeeper.legR;
              return (
                <g key={k} ref={k === "L" ? kLegL : kLegR}>
                  <path d={`M${l.hip.x},${l.hip.y} L${l.knee.x},${l.knee.y}`} stroke={SKIN} strokeWidth="4.6" strokeLinecap="round" fill="none" />
                  <path d={`M${l.knee.x},${l.knee.y} L${l.foot.x},${l.foot.y}`} stroke={keeperShirt[1]} strokeWidth="4.4" strokeLinecap="round" fill="none" />
                  <ellipse cx={l.foot.x} cy={l.foot.y} rx="3.6" ry="1.9" fill="#0b0f19" />
                </g>
              );
            })}
            <path d="M-11,-24 L11,-24 L10,-14 L1,-14 L0,-17 L-1,-14 L-10,-14 Z" fill="#111827" />
            <g ref={kTorso}>
              {/* Shirt */}
              <path d="M-11,-44 Q0,-48 11,-44 L12,-23 Q0,-20 -12,-23 Z" fill={`url(#${ids}shirtK)`} stroke="#000" strokeOpacity=".45" strokeWidth=".8" />
              {/* Arms (sleeves) and gloves */}
              <path ref={kArmL} d={armPath(initialKeeperArms.left)} stroke={`url(#${ids}shirtK)`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path ref={kArmR} d={armPath(initialKeeperArms.right)} stroke={`url(#${ids}shirtK)`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <circle ref={kGloveL} cx={initialKeeperArms.left.hand.x} cy={initialKeeperArms.left.hand.y} r="3.8" fill="#f59e0b" stroke="#78350f" strokeWidth=".6" />
              <circle ref={kGloveR} cx={initialKeeperArms.right.hand.x} cy={initialKeeperArms.right.hand.y} r="3.8" fill="#f59e0b" stroke="#78350f" strokeWidth=".6" />
              {/* Neck and head */}
              <rect x="-2.5" y="-48" width="5" height="5" rx="1.5" fill={SKIN} />
              <g ref={kHead}>
              {props.keeperFace ? (
                <>
                  <circle cx="0" cy="-54" r="9" fill={SKIN} />
                  <image href={props.keeperFace} x="-16" y="-68" width="32" height="32" clipPath={`url(#${ids}face)`} preserveAspectRatio="xMidYMid meet" />
                  <circle cx="0" cy="-54" r="9" fill="none" stroke="#000" strokeOpacity=".35" strokeWidth=".6" />
                </>
              ) : (
                <>
                  <ellipse cx="-8.6" cy="-54" rx="1.6" ry="2.4" fill={SKIN} />
                  <ellipse cx="8.6" cy="-54" rx="1.6" ry="2.4" fill={SKIN} />
                  <circle cx="0" cy="-54" r="8.5" fill={SKIN} stroke="#3b2414" strokeWidth=".5" />
                  <path d="M-8.6,-55.5 Q-8,-64.5 0,-64 Q8,-64.5 8.6,-55.5 Q5,-61 0,-60.5 Q-5,-61 -8.6,-55.5 Z" fill="#1f130a" />
                  <path d="M-5,-57 L-1.6,-57.4 M1.6,-57.4 L5,-57" stroke="#1f130a" strokeWidth=".9" strokeLinecap="round" />
                  <circle cx="-3.2" cy="-55" r="1" fill="#1f130a" />
                  <circle cx="3.2" cy="-55" r="1" fill="#1f130a" />
                  <path d="M0,-54.5 L-.8,-51.8 L.8,-51.8" stroke="#8a5a3c" strokeWidth=".6" fill="none" strokeLinejoin="round" />
                  <path d="M-2.8,-49.6 Q0,-48.2 2.8,-49.6" stroke="#6b3d26" strokeWidth=".8" fill="none" strokeLinecap="round" />
                </>
              )}
              </g>
            </g>
          </g>
        </g>

        {/* Aim mark */}
        {(phase === "aim" || phase === "power") && (
          <g transform={`translate(${aimPx.x.toFixed(1)},${aimPx.y.toFixed(1)})`}>
            <circle r="9" fill="none" stroke="#facc15" strokeWidth="1.8">
              <animate attributeName="r" values="8;11;8" dur="1s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;.5;1" dur="1s" repeatCount="indefinite" />
            </circle>
            <path d="M-14,0 H-5 M5,0 H14 M0,-14 V-5 M0,5 V14" stroke="#facc15" strokeWidth="1.4" />
          </g>
        )}

        {/* Taker (back view), the ball's shadow, trail and the ball */}
        <g ref={takerRef} transform={`translate(${initialSpot.x},${initialSpot.y})`}>
          <ellipse cx="0" cy="2" rx="13" ry="3.5" fill="#000" opacity=".3" />
          {/* Legs: boot, sock, calf (each lifts on its own) */}
          <g ref={tLegL}>
            <rect x="-9" y="-1" width="8" height="4" rx="2" fill="#0b0f19" />
            <rect x="-8" y="-11" width="6" height="11" rx="2" fill="#f8fafc" />
            <rect x="-8" y="-18" width="6" height="8" rx="2" fill={SKIN_DARK} />
          </g>
          <g ref={tLegR}>
            <rect x="1" y="-1" width="8" height="4" rx="2" fill="#0b0f19" />
            <rect x="2" y="-11" width="6" height="11" rx="2" fill="#f8fafc" />
            <rect x="2" y="-18" width="6" height="8" rx="2" fill={SKIN_DARK} />
          </g>
          <path d="M-13,-27 L13,-27 L12,-17 L1,-17 L0,-20 L-1,-17 L-12,-17 Z" fill="#f8fafc" stroke="#000" strokeOpacity=".25" strokeWidth=".6" />
          {/* Arms: sleeve, bare forearm, hand */}
          <g ref={tArmL}>
            <path d={armPath(initialTaker.left)} stroke={`url(#${ids}shirtT)`} strokeWidth="6" strokeLinecap="round" fill="none" />
            <path d="" stroke={SKIN_DARK} strokeWidth="4.2" strokeLinecap="round" fill="none" />
            <circle r="2.4" fill={SKIN_DARK} />
          </g>
          <g ref={tArmR}>
            <path d={armPath(initialTaker.right)} stroke={`url(#${ids}shirtT)`} strokeWidth="6" strokeLinecap="round" fill="none" />
            <path d="" stroke={SKIN_DARK} strokeWidth="4.2" strokeLinecap="round" fill="none" />
            <circle r="2.4" fill={SKIN_DARK} />
          </g>
          <path d="M-14,-56 Q0,-61 14,-56 L13,-25 Q0,-22 -13,-25 Z" fill={`url(#${ids}shirtT)`} stroke="#000" strokeOpacity=".45" strokeWidth=".8" />
          <rect x="-3" y="-61" width="6" height="5" rx="1.5" fill={SKIN_DARK} />
          <ellipse cx="-9.2" cy="-66" rx="1.5" ry="2.4" fill={SKIN_DARK} />
          <ellipse cx="9.2" cy="-66" rx="1.5" ry="2.4" fill={SKIN_DARK} />
          <circle cx="0" cy="-67" r="9.5" fill="#2a1a10" />
        </g>
        <ellipse ref={ballShadowRef} cx={BALL_START.x} cy={BALL_START.y + 5} rx="6" ry="2" fill="#000" opacity=".35" />
        <path ref={trailRef} stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0" />
        <g ref={ballRef} transform={`translate(${BALL_START.x},${BALL_START.y})`}>
          <circle r="6" fill={`url(#${ids}ball)`} stroke="#475569" strokeWidth=".5" />
          <g ref={seamsRef}>
            <polygon points="0,-2.6 2.5,-0.8 1.5,2.1 -1.5,2.1 -2.5,-0.8" fill="#1f2937" />
            <path d="M0,-2.6 L0,-6 M2.5,-0.8 L5.6,-1.9 M1.5,2.1 L3.5,4.8 M-1.5,2.1 L-3.5,4.8 M-2.5,-0.8 L-5.6,-1.9" stroke="#1f2937" strokeWidth=".7" />
          </g>
        </g>

        <g ref={fxRef} />
        {props.night && <rect x="0" y="0" width={SCENE.W} height={SCENE.H} fill="#06142c" opacity=".28" pointerEvents="none" />}
        <rect x="0" y="0" width={SCENE.W} height={SCENE.H} fill={`url(#${ids}vig)`} pointerEvents="none" />
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
