/**
 * The 2D penalty's figures from the art (art plan phase 6, port of `fmproject-art-handoff/reference/penalty-rig.js`):
 * the keeper seen from the front with keyframed joints (set, dive in a ballistic arc, jump, getting up with the ball),
 * the taker seen from behind with depth (run-up, plant, strike, follow-through, reaction), the ball with its panels and
 * spin, the net that bulges. Pure: each function returns SVG markup for the scene's 400 × 300 box (`SCENE`). The
 * outcome is decided elsewhere (`penaltyKick.ts`); this only draws it.
 */
import { SCENE, goalToPx, type Pt } from "@/GameInterface/Penalty/penaltyScene";
import type { KickOutcome } from "@/Domain/penalty/penaltyKick";
import { clamp } from "@/Domain/math";

const G = SCENE.LINE_Y + 4;
const BALL0 = SCENE.BALL_START;
const RAD = Math.PI / 180;
const P = (x: number, y: number): Pt => ({ x, y });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const dir = (a: number) => P(Math.sin(a * RAD), Math.cos(a * RAD));
const add = (p: Pt, d: Pt, l: number) => P(p.x + d.x * l, p.y + d.y * l);
const along = (a: Pt, b: Pt, t: number) => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const f1 = (v: number) => v.toFixed(1);
const OUTLINE = "rgba(10,14,22,.75)";

type Angles = { torso: number; lT: number; lK: number; rT: number; rK: number; lU: number; lE: number; rU: number; rE: number; head: number };
type Key = [number, Angles];

/** Smooth (smoothstep) interpolation between keyframes. */
function track(keys: readonly Key[], t: number): Angles {
  if (t <= keys[0]![0]) return keys[0]![1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i]!, [t1, b] = keys[i + 1]!;
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0), e = u * u * (3 - 2 * u);
      const o = {} as Angles;
      for (const k in a) o[k as keyof Angles] = lerp(a[k as keyof Angles], b[k as keyof Angles], e);
      return o;
    }
  }
  return keys[keys.length - 1]![1];
}

/** A chain of points with radii as tapered capsules. */
function chainShape(pts: Pt[], rs: number[], grow: number): string {
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 0.001, nx = -dy / L, ny = dx / L;
    const ra = rs[i]! + grow, rb = rs[i + 1]! + grow;
    d += `M${f1(a.x + nx * ra)},${f1(a.y + ny * ra)} L${f1(b.x + nx * rb)},${f1(b.y + ny * rb)} L${f1(b.x - nx * rb)},${f1(b.y - ny * rb)} L${f1(a.x - nx * ra)},${f1(a.y - ny * ra)} Z `;
  }
  for (let i = 0; i < pts.length; i++) {
    const r = rs[i]! + grow, p = pts[i]!;
    d += `M${f1(p.x - r)},${f1(p.y)} a${f1(r)},${f1(r)} 0 1 0 ${f1(2 * r)},0 a${f1(r)},${f1(r)} 0 1 0 ${f1(-2 * r)},0 Z `;
  }
  return d;
}

type Seg = { pts: Pt[]; rs: number[]; col: string };
function limbT(segs: Seg[]): string {
  let h = "";
  for (const s of segs) h += `<path d="${chainShape(s.pts, s.rs, 0.85)}" fill="${OUTLINE}"/>`;
  for (const s of segs) h += `<path d="${chainShape(s.pts, s.rs, 0)}" fill="${s.col}"/>`;
  return h;
}

function glove(el: Pt, hand: Pt, col: string, cuff: string): string {
  const ang = (Math.atan2(hand.y - el.y, hand.x - el.x) * 180) / Math.PI;
  return `<g transform="translate(${f1(hand.x)},${f1(hand.y)}) rotate(${f1(ang)})">` +
    `<rect x="-3.2" y="-2.5" width="2.6" height="5" rx="1" fill="${cuff}" stroke="${OUTLINE}" stroke-width=".7"/>` +
    `<path d="M-.8,-2.6 Q2.2,-3 3.4,-2.2 L4.6,-1.8 Q5.4,0 4.6,1.8 L3.4,2.2 Q2.2,3 -.8,2.6 Z" fill="${col}" stroke="${OUTLINE}" stroke-width=".7"/>` +
    `<path d="M2.6,-1.1 L4.4,-1 M2.6,0 L4.7,0 M2.6,1.1 L4.4,1" stroke="rgba(0,0,0,.25)" stroke-width=".45"/>` +
    `<ellipse cx="1.2" cy="-3" rx="1.6" ry=".95" fill="${col}" stroke="${OUTLINE}" stroke-width=".6" transform="rotate(-25 1.2 -3)"/></g>`;
}

function limb(pts: Pt[], col: string, w: number): string {
  const d = "M" + pts.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" L");
  return `<path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="${f1(w + 1.6)}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f1(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// ── Keeper (front view) ──
const KS = { thigh: 16.5, shin: 16, torso: 22, sh: 9, hip: 4.8, up: 13.5, fore: 15 };
const SET: Angles = { torso: 0, lT: 22, lK: -40, rT: -22, rK: 40, lU: 30, lE: -70, rU: -30, rE: 70, head: 0 };

interface Leg { hip: Pt; knee: Pt; foot: Pt }
interface Arm { sh: Pt; el: Pt; hand: Pt }
interface KeeperFK { neck: Pt; head: Pt; L: Leg; R: Leg; AL: Arm; AR: Arm; rot: (x: number, y: number) => Pt }

function keeperFK(root: Pt, a: Angles): KeeperFK {
  const T = a.torso * RAD;
  const rot = (x: number, y: number) => P(root.x + x * Math.cos(T) - y * Math.sin(T), root.y + x * Math.sin(T) + y * Math.cos(T));
  const hipL = rot(-KS.hip, 0), hipR = rot(KS.hip, 0), shL = rot(-KS.sh, -KS.torso), shR = rot(KS.sh, -KS.torso), neck = rot(0, -KS.torso - 2);
  const leg = (hip: Pt, th: number, kn: number): Leg => { const k = add(hip, dir(th), KS.thigh); return { hip, knee: k, foot: add(k, dir(th + kn), KS.shin) }; };
  const arm = (sh: Pt, u: number, e: number): Arm => { const el = add(sh, dir(u - a.torso), KS.up); return { sh, el, hand: add(el, dir(u - a.torso + e), KS.fore) }; };
  return {
    neck, rot,
    L: leg(hipL, -a.lT - a.torso, -a.lK), R: leg(hipR, -a.rT - a.torso, -a.rK),
    AL: arm(shL, -a.lU, -a.lE), AR: arm(shR, -a.rU, -a.rE), head: rot(0, -KS.torso - 13),
  };
}

const DIVE: Key[] = [
  [0, { ...SET }],
  [0.1, { torso: 6, lT: 16, lK: -34, rT: -34, rK: 56, lU: 60, lE: -40, rU: -80, rE: 40, head: 4 }],
  [0.2, { torso: 36, lT: 2, lK: -10, rT: -16, rK: 12, lU: 166, lE: -8, rU: -170, rE: 8, head: 8 }],
  [0.36, { torso: 80, lT: -2, lK: 6, rT: 3, rK: 8, lU: 156, lE: 0, rU: -156, rE: 0, head: 8 }],
  [0.5, { torso: 88, lT: -2, lK: 8, rT: 3, rK: 10, lU: 155, lE: 0, rU: -155, rE: 0, head: 8 }],
  [0.66, { torso: 94, lT: -4, lK: 20, rT: 6, rK: 24, lU: 170, lE: 42, rU: -190, rE: 42, head: 4 }],
  [1.4, { torso: 94, lT: -5, lK: 26, rT: 6, rK: 30, lU: 168, lE: 48, rU: -192, rE: 48, head: 2 }],
];
const JUMP: Key[] = [
  [0, { ...SET }],
  [0.14, { torso: 0, lT: 26, lK: -64, rT: -26, rK: 64, lU: 20, lE: -40, rU: -20, rE: 40, head: 0 }],
  [0.3, { torso: 0, lT: 6, lK: -8, rT: -6, rK: 8, lU: 170, lE: -4, rU: -170, rE: 4, head: -6 }],
  [0.48, { torso: 0, lT: 10, lK: -30, rT: -10, rK: 30, lU: 176, lE: -10, rU: -176, rE: 10, head: -8 }],
  [0.7, { torso: 0, lT: 22, lK: -48, rT: -22, rK: 48, lU: 40, lE: -110, rU: -40, rE: 110, head: 0 }],
  [1.4, { torso: 0, lT: 20, lK: -40, rT: -20, rK: 40, lU: 36, lE: -110, rU: -36, rE: 110, head: 0 }],
];
const HOLD: Angles = { torso: 0, lT: 18, lK: -36, rT: -18, rK: 36, lU: 34, lE: -112, rU: -34, rE: 112, head: 0 };
const mirrorA = (a: Angles): Angles => ({ torso: -a.torso, lT: -a.rT, lK: -a.rK, rT: -a.lT, rK: -a.lK, lU: -a.rU, lE: -a.rE, rU: -a.lU, rE: -a.lE, head: -a.head });

/** A kick as the rig plays it: times in seconds from the shot starting (the taker's run-up). */
export interface RigPlan {
  kick: number;
  dive: number;
  /** Screen side of the dive: −1 left, +1 right, 0 a jump in the middle. */
  side: -1 | 0 | 1;
  ballTo: Pt;
  diveTo: Pt;
  saved: boolean;
  post: boolean;
  miss: boolean;
  dur: number;
  curve: number;
  arc: number;
  /** A beaten keeper falls this much short of the ball. */
  short: number;
  catchAt: number;
}

export interface KeeperState { a: Angles; root: Pt; fk: KeeperFK }

function standY(a: Angles): number {
  const fk = keeperFK(P(0, 0), a);
  return G - Math.max(fk.L.foot.y, fk.R.foot.y) - 1.2;
}

export function keeperAt(t: number, plan: RigPlan | null, now: number): KeeperState {
  const sway = Math.sin(now * 2.4);
  const ready: Angles = { ...SET, torso: sway * 2, lK: SET.lK - Math.max(0, sway) * 6, rK: SET.rK + Math.max(0, -sway) * 6 };
  if (!plan || t < plan.dive) {
    const root = P(SCENE.GX + sway * 1.5, standY(ready));
    return { a: ready, root, fk: keeperFK(root, ready) };
  }
  const e = t - plan.dive, s = plan.side;
  if (s === 0) {
    const a = track(JUMP, e);
    const air = e > 0.26 && e < 0.62 ? Math.sin(((e - 0.26) / 0.36) * Math.PI) * 30 : 0;
    const root = P(SCENE.GX, standY(a) - air);
    return { a, root, fk: keeperFK(root, a) };
  }
  let a = track(DIVE, e);
  if (s < 0) a = mirrorA(a);
  const base = P(SCENE.GX, standY(SET)), take = 0.2, landT = 0.62;
  const aim = plan.diveTo;
  const reachX = aim.x - s * (36 + plan.short), peakY = Math.min(G - 14, aim.y + 4 + (plan.short ? 24 : 0));
  let root: Pt;
  if (e < take) {
    const step = clamp(e / 0.1, 0, 1);
    root = P(base.x + s * (5 * step + 9 * clamp((e - 0.1) / 0.1, 0, 1)), standY(a));
  } else if (e < landT) {
    const u = (e - take) / (landT - take), x0 = base.x + s * 14, y0 = standY(track(DIVE, take));
    const yLand = G - 9, up = 1 - Math.pow(1 - clamp(u / 0.45, 0, 1), 2), down = Math.pow(clamp((u - 0.45) / 0.55, 0, 1), 2);
    root = P(lerp(x0, reachX, 1 - Math.pow(1 - u, 1.6)), u < 0.45 ? lerp(y0, peakY, up) : lerp(peakY, yLand, down));
  } else {
    const settle = clamp((e - landT) / 0.15, 0, 1);
    root = P(reachX + s * 3 * settle, G - 9 + Math.sin(settle * Math.PI) * -1.5);
  }
  if (plan.saved && e > 1.2) {
    const u = clamp((e - 1.2) / 0.7, 0, 1), sm = u * u * (3 - 2 * u);
    const b = {} as Angles;
    for (const k in a) b[k as keyof Angles] = lerp(a[k as keyof Angles], HOLD[k as keyof Angles], k === "torso" ? Math.pow(sm, 0.8) : sm);
    a = b;
    root = P(root.x - s * 6 * sm, lerp(root.y, standY(HOLD), sm));
  }
  return { a, root, fk: keeperFK(root, a) };
}

export interface KeeperLook { shirt: string; trim: string; shorts: string; socks: string; skin: string; face?: string }

export function drawKeeper(K: KeeperState, o: KeeperLook, id: string): string {
  const { fk, a, root } = K;
  let h = "";
  const low = Math.max(fk.L.foot.y, fk.R.foot.y, root.y + 6), air = Math.max(0, G - low);
  h += `<ellipse cx="${f1(root.x)}" cy="${G}" rx="${f1(14 + Math.abs(Math.sin(a.torso * RAD)) * 16)}" ry="3" fill="#000" opacity="${f1(0.32 / (1 + air * 0.05))}"/>`;
  for (const L of [fk.L, fk.R]) {
    h += limbT([{ pts: [L.hip, L.knee], rs: [3.3, 2.5], col: o.skin }, { pts: [L.knee, along(L.knee, L.foot, 0.32), L.foot], rs: [2.45, 2.75, 1.7], col: o.socks }]);
    const fa = (Math.atan2(L.foot.y - L.knee.y, L.foot.x - L.knee.x) * 180) / Math.PI - 90;
    h += `<path d="M-2.6,-1 Q-2.8,2.2 0,2.4 L4.6,2.2 Q5.6,1 4.4,-.4 L1.8,-1.4 Z" fill="#0b0f19" stroke="rgba(255,255,255,.2)" stroke-width=".4" transform="translate(${f1(L.foot.x)},${f1(L.foot.y)}) rotate(${f1(fa)}) scale(${L === fk.L ? -1 : 1},1)"/>`;
  }
  const q = (x: number, y: number) => { const v = fk.rot(x, y); return `${f1(v.x)},${f1(v.y)}`; };
  const mL = along(fk.L.hip, fk.L.knee, 0.5), mR = along(fk.R.hip, fk.R.knee, 0.5);
  h += `<path d="M${q(-7.6, -2)} L${q(7.6, -2)} L${f1(mR.x + 3.5)},${f1(mR.y)} L${f1(mR.x - 3)},${f1(mR.y)} L${q(0, 4)} L${f1(mL.x + 3)},${f1(mL.y)} L${f1(mL.x - 3.5)},${f1(mL.y)} Z" fill="${o.shorts}" stroke="${OUTLINE}" stroke-width=".9" stroke-linejoin="round"/>`;
  h += `<path d="M${q(-10.5, -19)} Q${q(-11, -23)} ${q(-5, -23.5)} L${q(5, -23.5)} Q${q(11, -23)} ${q(10.5, -19)} L${q(8, -2)} Q${q(0, 1)} ${q(-8, -2)} Z" fill="${o.shirt}" stroke="${OUTLINE}" stroke-width="1"/>`;
  h += `<path d="M${q(-4, -23.4)} Q${q(0, -20.5)} ${q(4, -23.4)}" fill="none" stroke="${o.trim}" stroke-width="1.4" stroke-linecap="round"/>`;
  let armsSvg = "";
  for (const A of [fk.AL, fk.AR]) {
    armsSvg += limbT([{ pts: [A.sh, A.el], rs: [2.9, 2.2], col: o.shirt }, { pts: [A.el, along(A.el, A.hand, 0.85)], rs: [2.15, 1.75], col: o.shirt }]);
    armsSvg += glove(A.el, A.hand, "#f1f4f8", o.trim);
  }
  const armsOver = Math.abs(a.torso) > 45;
  if (!armsOver) h += armsSvg;
  const hd = fk.head, ang = a.torso + (a.head || 0);
  h += limb([fk.neck, along(fk.neck, hd, 0.5)], o.skin, 4.6);
  const hs = 1 - 0.12 * clamp((Math.abs(a.torso) - 40) / 40, 0, 1), r = 10 * hs;
  h += `<circle cx="${f1(hd.x)}" cy="${f1(hd.y)}" r="${f1(r)}" fill="${o.skin}" stroke="${OUTLINE}"/>`;
  if (o.face) {
    h += `<clipPath id="${id}kf"><circle cx="${f1(hd.x)}" cy="${f1(hd.y)}" r="${f1(r)}"/></clipPath>` +
      `<image href="${o.face}" x="${f1(hd.x - r * 1.6)}" y="${f1(hd.y - r * 1.55)}" width="${f1(r * 3.2)}" height="${f1(r * 3.2)}" clip-path="url(#${id}kf)" transform="rotate(${f1(ang)} ${f1(hd.x)} ${f1(hd.y)})"/>`;
  }
  if (armsOver) h += armsSvg;
  return h;
}

// ── Taker (seen from behind) ──
const TS = { thigh: 17.5, shin: 17, torso: 23, sh: 10, hip: 5.5, up: 12.5, fore: 11.5 };
interface TLeg { hip: Pt; knee: Pt; foot: Pt; fold: number; flex: number }

function takerLeg(hip: Pt, side: number, flex: number, fold: number, splay: number): TLeg {
  const thighLen = TS.thigh * (1 - 0.55 * Math.max(0, flex)) * (1 + 0.08 * Math.max(0, -flex));
  const knee = P(hip.x + side * splay, hip.y + thighLen);
  const shinDown = TS.shin * Math.cos(fold * Math.PI * 0.5) * (1 - 0.25 * Math.max(0, flex));
  const foot = P(knee.x + side * splay * 0.4, knee.y + shinDown - TS.shin * 0.35 * Math.sin(fold * Math.PI * 0.5));
  return { hip, knee, foot, fold, flex };
}
function takerArm(sh: Pt, side: number, flex: number, out: number): Arm {
  const upLen = TS.up * (1 - 0.4 * Math.abs(flex)), el = P(sh.x + side * (2 + out * 9), sh.y + upLen);
  return { sh, el, hand: P(el.x + side * (1 + out * 9), el.y + TS.fore * (1 - 0.7 * Math.max(0, flex)) - out * 8) };
}

export interface TakerState { root: Pt; roll: number; legs: TLeg[]; arms: Arm[]; ground: number }

/** Where the taker waits and where he plants beside the ball. */
const TAKER_START = P(176, 294);
const PLANT = P(BALL0.x - 14, BALL0.y + 4);

export function takerAt(t: number, plan: RigPlan | null, now: number): TakerState {
  if (!plan) {
    // Waiting: standing behind the ball, a small sway.
    const g = P(TAKER_START.x, TAKER_START.y + Math.sin(now * 1.6) * 0.4);
    const root = P(g.x, g.y - (TS.thigh + TS.shin) * 0.95);
    const legs = [-1, 1].map((sd) => takerLeg(P(root.x + sd * TS.hip, root.y), sd, 0, 0.08, 1.8));
    const arms = [-1, 1].map((sd) => takerArm(P(root.x + sd * TS.sh, root.y - TS.torso), sd, 0, 0.2));
    return { root, roll: Math.sin(now * 1.1) * 1.2, legs, arms, ground: g.y + 2 };
  }
  const kick = plan.kick, ph = t * 9.5, runEnd = Math.max(0.05, kick - 0.26);
  let root: Pt, roll = 0, legs: TLeg[], arms: Arm[], ground: number;
  if (t < runEnd) {
    const u = clamp(t / runEnd, 0, 1), g = P(lerp(TAKER_START.x, PLANT.x - 2, u), lerp(TAKER_START.y, PLANT.y + 12, u));
    const sL = Math.sin(ph), sR = Math.sin(ph + Math.PI), bob = -Math.abs(Math.cos(ph)) * 2.4;
    root = P(g.x, g.y - (TS.thigh + TS.shin) * 0.93 + bob); roll = sL * 2.2; ground = g.y + 2;
    const leg = (side: number, s: number) => takerLeg(P(root.x + side * TS.hip, root.y), side, s > 0 ? s * 0.55 : s * 0.25, s > 0 ? 0.25 + s * 0.7 : 0.12, 1.5);
    legs = [leg(-1, sL), leg(1, sR)];
    arms = [takerArm(P(root.x - TS.sh, root.y - TS.torso), -1, sR * 0.6, 0.38), takerArm(P(root.x + TS.sh, root.y - TS.torso), 1, sL * 0.6, 0.38)];
  } else {
    const e = t - runEnd;
    const plantK = clamp(e / 0.12, 0, 1), back = clamp((e - 0.1) / 0.12, 0, 1), strike = clamp((e - 0.22) / 0.04, 0, 1), thru = clamp((e - 0.26) / 0.24, 0, 1), rec = clamp((e - 0.55) / 0.35, 0, 1);
    const g = P(lerp(PLANT.x - 2, PLANT.x + 3, plantK), PLANT.y + 12 - 3 * plantK);
    root = P(g.x + 4 * strike * (1 - rec), g.y - (TS.thigh + TS.shin) * 0.9 - 2 * thru * (1 - rec));
    roll = (-11 * Math.max(back * 0.6, strike) - 6 * thru) * (1 - rec); ground = g.y + 2;
    const lLeg = takerLeg(P(root.x - TS.hip, root.y), -1, 0.1 * (1 - rec), 0.2 + 0.15 * strike * (1 - rec), 2.5);
    lLeg.foot = P(PLANT.x - 2, PLANT.y + 4);
    const flex = lerp(lerp(-0.35, 0.55, strike), 0.95, thru) * (1 - rec), fold = lerp(lerp(0.95 * back, 0.05, strike), 0.1, thru) * (1 - rec) + 0.1 * rec;
    const rLeg = takerLeg(P(root.x + TS.hip, root.y), 1, flex, fold, 1.5 - 1.2 * strike * (1 - rec));
    if (strike > 0 && thru < 0.2 && rec === 0) rLeg.foot = P(BALL0.x - 1, BALL0.y - 1);
    legs = [lLeg, rLeg];
    const outL = Math.max(back, strike, thru * 0.9) * (1 - rec);
    arms = [takerArm(P(root.x - TS.sh, root.y - TS.torso), -1, -0.2 * outL, 0.38 + outL * 1.1), takerArm(P(root.x + TS.sh, root.y - TS.torso), 1, 0.3 * outL, 0.38 + outL * 0.3)];
  }
  // Reaction once the ball is in: celebrating (arms up, a hop), or hands on the head.
  if (t > plan.kick + plan.dur + 0.14) {
    const r = clamp((t - plan.kick - plan.dur - 0.14) / 0.25, 0, 1);
    const sh = [P(root.x - TS.sh, root.y - TS.torso), P(root.x + TS.sh, root.y - TS.torso)];
    if (!plan.saved && !plan.post && !plan.miss) {
      const hop = Math.abs(Math.sin((t - plan.kick) * 7)) * 5 * r;
      root = P(root.x, root.y - hop);
      legs.forEach((L) => { L.hip = P(L.hip.x, L.hip.y - hop); L.knee = P(L.knee.x, L.knee.y - hop); L.foot = P(L.foot.x, L.foot.y - hop * 0.6); });
      arms = [-1, 1].map((sd, i) => { const s0 = P(sh[i]!.x, sh[i]!.y - hop); return { sh: s0, el: P(s0.x + sd * 6, s0.y - 11 * r + 3), hand: P(s0.x + sd * 9, s0.y - 23 * r + 6) }; });
    } else {
      arms = [-1, 1].map((sd, i) => {
        const s = sh[i]!, el = P(s.x + sd * 9 * r, s.y - 6 * r), hand = P(root.x + sd * 4, root.y - TS.torso - 12 * r);
        return { sh: s, el: P(lerp(s.x + sd * 3, el.x, r), lerp(s.y + 11, el.y, r)), hand: P(lerp(s.x + sd * 4, hand.x, r), lerp(s.y + 22, hand.y, r)) };
      });
    }
  }
  return { root, roll, legs, arms, ground };
}

export interface TakerLook { shirt: string; trim: string; shorts: string; socks: string; skin: string; hair: string; number: string }

export function drawTaker(T: TakerState, o: TakerLook): string {
  const { root, roll, legs, arms, ground } = T;
  const rot = (p: Pt) => { const r = roll * RAD, dx = p.x - root.x, dy = p.y - root.y; return P(root.x + dx * Math.cos(r) - dy * Math.sin(r), root.y + dx * Math.sin(r) + dy * Math.cos(r)); };
  let h = `<ellipse cx="${f1(root.x)}" cy="${f1(ground)}" rx="17" ry="4" fill="#000" opacity=".3"/>`;
  for (const L of legs) {
    h += limbT([{ pts: [L.hip, L.knee], rs: [4, 3], col: o.skin }, { pts: [L.knee, along(L.knee, L.foot, 0.3), L.foot], rs: [2.95, 3.3, 2.1], col: o.socks }]);
    const sole = L.fold > 0.35;
    h += `<ellipse cx="${f1(L.foot.x)}" cy="${f1(L.foot.y + 1)}" rx="5.2" ry="${sole ? 3.6 : 2.8}" fill="${sole ? "#2b2f38" : "#0b0f19"}" stroke="${OUTLINE}" stroke-width=".7"/>`;
  }
  const q = (x: number, y: number) => { const v = rot(P(root.x + x, root.y + y)); return `${f1(v.x)},${f1(v.y)}`; };
  const mL = along(legs[0]!.hip, legs[0]!.knee, 0.5), mR = along(legs[1]!.hip, legs[1]!.knee, 0.5);
  h += `<path d="M${q(-9, -2)} L${q(9, -2)} L${f1(mR.x + 4.5)},${f1(mR.y)} L${f1(mR.x - 4)},${f1(mR.y)} L${q(0, 5)} L${f1(mL.x + 4)},${f1(mL.y)} L${f1(mL.x - 4.5)},${f1(mL.y)} Z" fill="${o.shorts}" stroke="${OUTLINE}" stroke-width=".9"/>`;
  for (const A of arms) {
    const a2 = { sh: rot(A.sh), el: rot(A.el), hand: rot(A.hand) };
    h += limbT([{ pts: [a2.el, a2.hand], rs: [2.4, 1.9], col: o.skin }, { pts: [a2.sh, along(a2.sh, a2.el, 0.7)], rs: [3.4, 3], col: o.shirt }]);
    h += `<ellipse cx="${f1(a2.hand.x)}" cy="${f1(a2.hand.y)}" rx="2.5" ry="2.9" fill="${o.skin}" stroke="${OUTLINE}" stroke-width=".7"/>`;
  }
  h += `<path d="M${q(-12.5, -21)} Q${q(-13, -26)} ${q(-6, -26.5)} L${q(6, -26.5)} Q${q(13, -26)} ${q(12.5, -21)} L${q(9.5, -2)} Q${q(0, 1)} ${q(-9.5, -2)} Z" fill="${o.shirt}" stroke="${OUTLINE}" stroke-width="1"/>`;
  const num = rot(P(root.x, root.y - 13));
  h += `<text x="${f1(num.x)}" y="${f1(num.y)}" font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="12" fill="${o.trim}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${f1(roll)} ${f1(num.x)} ${f1(num.y)})">${o.number}</text>`;
  const neck = rot(P(root.x, root.y - 26)), hd = rot(P(root.x, root.y - 37));
  h += limb([neck, P(hd.x, hd.y + 6)], o.skin, 5.4);
  h += `<circle cx="${f1(hd.x)}" cy="${f1(hd.y)}" r="10.5" fill="${o.skin}" stroke="${OUTLINE}" stroke-width=".8"/>` + hairBack(hd, 10.5, o.hair);
  return h;
}

function hairBack(c: Pt, R: number, col: string): string {
  const dark = "rgba(0,0,0,.28)";
  let h = `<path d="M${f1(c.x - R * 1.06)},${f1(c.y + R * 0.35)} Q${f1(c.x - R * 1.2)},${f1(c.y - R * 1.25)} ${f1(c.x)},${f1(c.y - R * 1.22)} Q${f1(c.x + R * 1.2)},${f1(c.y - R * 1.25)} ${f1(c.x + R * 1.06)},${f1(c.y + R * 0.35)} Q${f1(c.x)},${f1(c.y + R * 0.75)} ${f1(c.x - R * 1.06)},${f1(c.y + R * 0.35)} Z" fill="${col}"/>`;
  for (let i = -2; i <= 2; i++) h += `<path d="M${f1(c.x + i * R * 0.32)},${f1(c.y - R)} Q${f1(c.x + i * R * 0.38)},${f1(c.y - R * 0.2)} ${f1(c.x + i * R * 0.3)},${f1(c.y + R * 0.4)}" stroke="${dark}" stroke-width="${f1(R * 0.07)}" fill="none"/>`;
  return h;
}

// ── Ball ──
const PENT = (r: number) => Array.from({ length: 5 }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; return P(Math.cos(a) * r, Math.sin(a) * r); });

/** Gradient definitions the ball uses (once per scene). */
export const ballDefs = (id: string) =>
  `<defs><radialGradient id="${id}pb" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".75" stop-color="#e9edf2"/><stop offset="1" stop-color="#b9c1cc"/></radialGradient>` +
  `<radialGradient id="${id}ps" cx=".38" cy=".32" r=".8"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>`;

export function ballSvg(c: Pt, R: number, spin: number, id: string, alpha = 1): string {
  const pt = (q: Pt) => `${f1(q.x)},${f1(q.y)}`;
  const clip = `${id}bc${Math.round(R * 10)}`;
  let g = `<g transform="translate(${f1(c.x)},${f1(c.y)})" opacity="${alpha.toFixed(2)}">`;
  g += `<circle r="${f1(R)}" fill="url(#${id}pb)"/>`;
  g += `<clipPath id="${clip}"><circle r="${f1(R)}"/></clipPath><g clip-path="url(#${clip})" transform="rotate(${f1(spin)})">`;
  const inner = PENT(R * 0.36);
  g += `<polygon points="${inner.map(pt).join(" ")}" fill="#1b1f27"/>`;
  for (const v of inner) {
    const d = Math.hypot(v.x, v.y), u = P(v.x / d, v.y / d), o = P(u.x * R * 1.02, u.y * R * 1.02);
    g += `<path d="M${pt(v)} L${pt(P(u.x * R * 0.72, u.y * R * 0.72))}" stroke="#2a2f38" stroke-width="${f1(R * 0.07)}"/>`;
    const a0 = Math.atan2(u.y, u.x) + Math.PI / 5;
    const outer = Array.from({ length: 5 }, (_, k) => { const a = a0 + (k * 2 * Math.PI) / 5; return P(o.x + Math.cos(a) * R * 0.34, o.y + Math.sin(a) * R * 0.34); });
    g += `<polygon points="${outer.map(pt).join(" ")}" fill="#1b1f27"/>`;
  }
  g += `</g><circle r="${f1(R)}" fill="url(#${id}ps)"/>`;
  g += `<ellipse cx="${f1(-R * 0.35)}" cy="${f1(-R * 0.4)}" rx="${f1(R * 0.32)}" ry="${f1(R * 0.2)}" fill="#fff" opacity=".7" transform="rotate(-30 ${f1(-R * 0.35)} ${f1(-R * 0.4)})"/>`;
  g += `<circle r="${f1(R)}" fill="none" stroke="rgba(10,14,22,.8)" stroke-width="${f1(Math.max(0.5, R * 0.09))}"/></g>`;
  return g;
}

export interface BallState { p: Pt; s: number; shadow: Pt; spin: number; u: number; held?: boolean }

export function ballAt(t: number, plan: RigPlan | null, K: KeeperState): BallState {
  if (!plan || t < plan.kick) return { p: BALL0, s: 1, shadow: P(BALL0.x, BALL0.y + 3), spin: 0, u: 0 };
  const dur = plan.dur, u = clamp((t - plan.kick) / dur, 0, 1), to = plan.ballTo;
  const after = t - plan.kick - dur;
  if (plan.post && after > 0) {
    const v = clamp(after / 0.8, 0, 1), sg = Math.sign(to.x - SCENE.GX) || 1, out = P(to.x - sg * 34, 222);
    const bounce = Math.abs(Math.sin(v * Math.PI * 2)) * (1 - v) * 18;
    return { p: P(lerp(to.x, out.x, v), lerp(to.y, out.y, Math.min(1, v * 1.4)) - bounce * (v > 0.25 ? 1 : 0)), s: lerp(0.5, 0.8, v), shadow: P(lerp(to.x, out.x, v), lerp(SCENE.LINE_Y + 4, out.y + 3, v)), spin: -700 * v, u: 1 };
  }
  if (plan.miss && after > 0) {
    // Wide or over: the ball carries on and drops behind the goal.
    const v = clamp(after / 0.5, 0, 1);
    return { p: P(to.x + (to.x - SCENE.GX) * 0.25 * v, to.y - 6 * v), s: lerp(0.5, 0.38, v), shadow: P(to.x, SCENE.LINE_Y - 8), spin: 900 + 300 * v, u: 1 };
  }
  if (!plan.saved && !plan.post && after > 0) {
    const v = clamp(after / 0.5, 0, 1), restY = SCENE.LINE_Y - 19, bounce = Math.abs(Math.sin(v * Math.PI * 2.2)) * (1 - v) * 10;
    const y = lerp(to.y, restY, Math.min(1, v * 1.6)) - bounce * (v > 0.3 ? 1 : 0);
    return { p: P(to.x + Math.sign(to.x - SCENE.GX) * 2 * v, y), s: 0.46, shadow: P(to.x, restY + 2), spin: 900 + 300 * v, u: 1 };
  }
  const shadow = P(lerp(BALL0.x, to.x, u), lerp(BALL0.y + 3, SCENE.LINE_Y + 4, u));
  if (plan.saved && t - plan.kick >= dur * plan.catchAt) {
    const hands = along(K.fk.AL.hand, K.fk.AR.hand, 0.5);
    return { p: hands, s: 0.52, shadow: P(hands.x, SCENE.LINE_Y + 4), spin: 0, u: 1, held: true };
  }
  const e = 1 - Math.pow(1 - u, 1.5), ctrl = P((BALL0.x + to.x) / 2 + plan.curve, (BALL0.y + to.y) / 2 - plan.arc);
  const p = P((1 - e) * (1 - e) * BALL0.x + 2 * (1 - e) * e * ctrl.x + e * e * to.x, (1 - e) * (1 - e) * BALL0.y + 2 * (1 - e) * e * ctrl.y + e * e * to.y);
  return { p, s: lerp(1, 0.5, e), shadow, spin: (plan.curve >= 0 ? 1 : -1) * 900 * (1 - Math.pow(1 - u, 2)), u };
}

/** The rig's plan for a kick the game decided: run-up, dive, flight, what happens at the end. */
export function rigPlan(o: KickOutcome, runUpS: number, flightS: number): RigPlan {
  const [row, col] = o.dive.split("-") as ["low" | "high", "left" | "mid" | "right"];
  const side: -1 | 0 | 1 = col === "left" ? -1 : col === "right" ? 1 : 0;
  const ballTo = goalToPx({ x: clamp(o.ball.x, -1.6, 1.6), y: clamp(o.ball.y, 0, 1.5) });
  const diveTo = goalToPx({ x: side * 0.72, y: row === "high" ? 0.75 : 0.25 });
  const saved = o.result === "saved";
  const bs = Math.sign(ballTo.x - SCENE.GX);
  return {
    kick: runUpS,
    dive: runUpS + (saved ? -0.04 : 0.06),
    side,
    ballTo,
    diveTo: saved ? ballTo : diveTo,
    saved,
    post: o.result === "post",
    miss: o.result === "miss",
    dur: flightS,
    curve: bs * 10,
    arc: o.ball.y < 0.2 ? 8 : 26,
    short: saved ? 0 : 36,
    catchAt: 0.7,
  };
}

/** The net as one path (rows then columns), bulging where a goal went in. */
export function netSvg(bulge: Pt | null, age: number): string {
  const left = SCENE.GX - SCENE.HALF_W + 6, right = SCENE.GX + SCENE.HALF_W - 6, bottom = SCENE.LINE_Y - SCENE.NET_DEPTH * 0.4, top = SCENE.LINE_Y - SCENE.GOAL_H + 6;
  const NX = SCENE.NET_X, NY = SCENE.NET_Y;
  const pt = (i: number, j: number) => {
    const x = left + (i / NX) * (right - left), y = bottom - (j / NY) * (bottom - top);
    if (!bulge || age < 0) return P(x, y);
    const d2 = ((x - bulge.x) ** 2 + (y - bulge.y) ** 2) / 900, amp = 5 * Math.exp(-d2) * Math.exp(-age * 2.4) * Math.cos(age * 11);
    return P(x + (x - bulge.x) * amp * 0.012, y - amp * 0.6 + (y - bulge.y) * amp * 0.01);
  };
  let d = "";
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { const q = pt(i, j); d += (i ? "L" : "M") + f1(q.x) + "," + f1(q.y); }
  for (let i = 0; i <= NX; i++) for (let j = 0; j <= NY; j++) { const q = pt(i, j); d += (j ? "L" : "M") + f1(q.x) + "," + f1(q.y); }
  return `<path d="${d}" stroke="#ffffff" stroke-opacity=".42" stroke-width=".55" fill="none"/>`;
}

/** The posts and the bar seen from behind. */
export function goalFrameSvg(): string {
  const l = SCENE.GX - SCENE.HALF_W, r = SCENE.GX + SCENE.HALF_W, top = SCENE.LINE_Y - SCENE.GOAL_H;
  return `<ellipse cx="${SCENE.GX}" cy="${SCENE.LINE_Y + 2}" rx="${SCENE.HALF_W + 6}" ry="3" fill="#000" opacity=".22"/>` +
    `<rect x="${l - 3}" y="${top}" width="6" height="${SCENE.GOAL_H}" rx="2" fill="#f4f6fa" stroke="${OUTLINE}" stroke-width=".6"/>` +
    `<rect x="${r - 3}" y="${top}" width="6" height="${SCENE.GOAL_H}" rx="2" fill="#f4f6fa" stroke="${OUTLINE}" stroke-width=".6"/>` +
    `<rect x="${l - 3}" y="${top - 3}" width="${SCENE.HALF_W * 2 + 6}" height="6" rx="2" fill="#f4f6fa" stroke="${OUTLINE}" stroke-width=".6"/>`;
}

export type PenaltyWeather = "day" | "night" | "rain" | "fog" | "snow";

/** Which painted backdrop a penalty uses. */
export function penaltyBackdropId(weather: PenaltyWeather): string {
  return `penalty-bg-${weather}`;
}

/** Everything the rig draws at scene time `t` (seconds since the shot started; null plan = waiting). */
export function rigScene(t: number, now: number, plan: RigPlan | null, k: KeeperLook, tk: TakerLook, id: string): string {
  const K = keeperAt(t, plan, now), T = takerAt(t, plan, now), b = ballAt(t, plan, K);
  let ball = `<ellipse cx="${f1(b.shadow.x)}" cy="${f1(b.shadow.y)}" rx="${f1(5.5 * b.s)}" ry="${f1(1.8 * b.s)}" fill="#000" opacity="${(0.32 * (b.held ? 0.6 : 1)).toFixed(2)}"/>`;
  if (plan && t > plan.kick && !b.held && b.u < 0.55) {
    for (let i = 3; i >= 1; i--) {
      const tb = ballAt(t - i * 0.018, plan, K);
      if (tb.u > 0) ball += ballSvg(tb.p, 6.4 * tb.s, tb.spin, id, 0.12 * (4 - i) * (1 - b.u / 0.55));
    }
  }
  ball += ballSvg(b.p, 6.4 * b.s, b.spin, id);
  const inAir = !!plan && t > plan.kick;
  if (plan?.post) {
    const it = t - plan.kick - plan.dur;
    if (it > 0 && it < 0.25) ball += `<circle cx="${f1(plan.ballTo.x)}" cy="${f1(plan.ballTo.y)}" r="${f1(4 + it * 40)}" fill="none" stroke="#fff" stroke-width="1.5" opacity="${f1(1 - it / 0.25)}"/>`;
  }
  const hitT = plan && !plan.saved && !plan.post && !plan.miss ? t - plan.kick - plan.dur : -1;
  return ballDefs(id) + netSvg(hitT >= 0 && plan ? plan.ballTo : null, hitT) + goalFrameSvg() + drawKeeper(K, k, id) +
    (inAir ? ball : "") + drawTaker(T, tk) + (inAir ? "" : ball);
}

