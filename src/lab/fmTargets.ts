/**
 * FM27 target metrics (engine rebuild stage 4b, `.claude/rules/game-engine/fm-numbers.md`): one collector fed with every
 * tick of a match (`simulateMatch(..., { onTick })`), state-based so it needs no listener on the engine. Pure apart from
 * the accumulator it fills. Distances in yards; FM's metre bands converted (1 m = 1.0936 yd).
 */
import { offBallIntentOf } from "@/GameEngine/Domain/OffBallMovement";
import type { GameState, GamePlayer, TeamId } from "@/GameEngine/types";
import type { PlayerDecision } from "@/GameEngine/Domain/DecisionTree";
import { holderPressure } from "@/GameEngine/Domain/Pressure";
import { isLivePhase, matchMinute } from "@/GameEngine/Domain/gameState";
import { PITCH_LENGTH, PITCH_WIDTH, GOAL_Y_MIN, GOAL_Y_MAX } from "@/GameEngine/Domain/pitch";
import { getMainRole } from "@/Domain/roles";
import type { PerMatchView } from "@/lab/types";

const YD = 1.0936;
/** FM's pass bands in metres (report 7): 0–5, 5–9, 9–13, 13–18, 18–22, 22–27, 27–31, 31–35, 35+. */
export const FM_BANDS_M = [5, 9, 13, 18, 22, 27, 31, 35] as const;
export const BAND_LABELS = ["0–5", "5–9", "9–13", "13–18", "18–22", "22–27", "27–31", "31–35", "35+"] as const;
/** Pressure bands of the pass table: 0, 1–15, 15–30, 30–50, 50+. */
export const PRESSURE_LABELS = ["0", "1–15", "15–30", "30–50", "50+"] as const;
export const SHOT_LABELS = ["0–6", "6–12", "12–18", "18–24", "24–30", "30–36", "36+"] as const;
export const LINES = ["GK", "DEF", "MID", "FWD"] as const;
export type Line = (typeof LINES)[number];
export const HOLDER_CATS = ["carry", "pass", "turn", "hold", "kick"] as const;
export type HolderCat = (typeof HOLDER_CATS)[number];

/** Outcome counts: intended receiver, another teammate, opponent. */
export type Outcome3 = [number, number, number];
const o3 = (): Outcome3 => [0, 0, 0];

export interface FmTargetTotals {
  matches: number;
  ticks: number;
  passBand: Outcome3[];
  passLoft: { ground: Outcome3; lofted: Outcome3 };
  passPressure: Outcome3[];
  passAll: Outcome3;
  /** By pass kind (regular / through / cross / long_ball) and the regular passes by band. */
  passKind: Record<string, Outcome3>;
  passBandRegular: Outcome3[];
  holderCat: Record<HolderCat, number>;
  holderCatByThird: Record<HolderCat, number>[];
  holderDecisions: number;
  /** Holder stints (receive → release) with at least one decision; their decisions and duration (s). */
  possessions: number;
  possessionDecisions: number;
  possessionHist: number[];
  /** Live seconds sampled with a known holder (ball held), and the presser distribution (0, 1, 2+). */
  pressSamples: number;
  pressers: [number, number, number];
  nearByThird: { n: number; sum: number }[];
  /** Shape samples per phase: 0 in possession, 1 out of possession. Sums in yards. */
  shape: { n: number; back: number; length: number; width: number; gapBM: number; gapMF: number; front: number }[];
  /** Off-ball target step per line and phase (sum, n), and per line the default / short hold runs (seconds). */
  step: Record<Line, { sum: number; n: number }[]>;
  holdDefault: Record<Line, number[]>;
  holdShort: Record<Line, number[]>;
  shotDist: number[];
  shots: number;
  /** Stage 6 (`xg.md`): every shot's xG (the `shot` event) in bins of 1 / XG_HIST_BINS. */
  shotXgHist: number[];
  realSeconds: number;
  /** Sum over matches of the outfield median energy at `CONDITION_MINUTES` (n per minute), and the keepers' at the end. */
  condition: { sum: number; n: number }[];
  keeperEnd: { sum: number; n: number };
  /**
   * Stage 3 (`ball-3d.md`): the 3D ball's flights (`state.ball`) — peak and the height where the flight ended (first
   * contact or landing), metres, per kind (cross, corner, long = long balls and clearances); air time (s).
   */
  ballPeak: Record<BallGroup, number[]>;
  ballContact: Record<BallGroup, number[]>;
  ballAirSeconds: number;
  /**
   * Stage 4 (`pass-physics.md`), physical passes only: outcome by launch vz band (`VZ_LABELS`), launch |v| and vz (m/s)
   * by launch-distance band (`LAUNCH_LABELS`), flight to the intended receiver (s) by distance band (`FLIGHT_LABELS`),
   * and the distance (m) between where a high ball lands and where it was aimed.
   */
  passVz: Outcome3[];
  launchSpeed: number[][];
  launchVz: number[][];
  flight: number[][];
  landingErr: Record<LandingGroup, number[]>;
  /**
   * Stage 5 (`interception.md`): passes whose next holder was an opponent, split like report 7 by the time from the
   * kick: early (within FM's expected flight 0.43 + 0.05·d s + one FM tick, read as an in-flight interception) or late
   * (a loose ball, or lost after reception).
   */
  lossEarly: number;
  lossLate: number;
  /**
   * Stage 7 (`shot-and-save.md`): where each shot ended (`SHOT_END`: goal, saved, blocked, off target incl. woodwork) by
   * the distance from where it was struck to the aimed point (`SHOT_M_LABELS`, metres, report 8 §2.1's bands).
   */
  shotEnds: number[][];
}

/** Stage 7: shot distance bands (m, report 8 §2.1) and FM's goal share of the shots in each (%). */
export const SHOT_M_LABELS = ["0–8", "8–12", "12–16", "16–20", "20–25", "25+"] as const;
export const FM_GOAL_BY_DIST = [21, 11, 12, 13, 3, 0] as const;
/** Share of shots by distance band (R8 §2.1, n 180: 24 / 36 / 42 / 38 / 32 / 8). */
export const FM_SHOT_DIST_SHARE = [13, 20, 23, 21, 18, 4] as const;
export const SHOT_END = ["goal", "saved", "blocked", "off"] as const;
export type ShotEnd = (typeof SHOT_END)[number];
const shotMBand = (dM: number) => (dM < 8 ? 0 : dM < 12 ? 1 : dM < 16 ? 2 : dM < 20 ? 3 : dM < 25 ? 4 : 5);
/** One shot's end by its distance (yd). */
export function addShotEnd(t: FmTargetTotals, distYd: number, end: ShotEnd): void {
  t.shotEnds[shotMBand(distYd / YD)]![SHOT_END.indexOf(end)]!++;
}

/** R7: share of the possession losses after a pass that happen in flight (early) against later (%). */
export const FM_LOSS_SPLIT = { early: 56, late: 44 } as const;
/** One FM decision tick (s): ticks ≈ 1.8 + 0.21·d against t ≈ 0.43 + 0.05·d s gives ~0.24 s. */
const FM_TICK_S = 0.24;

/** FM's launch-vz bands (m/s, report 7) and the share to the intended receiver in each. */
export const VZ_LABELS = ["≤1", "1–3", "3–6", "6–10", ">10"] as const;
export const FM_PASS_VZ = [92, 90, 79, 32, 30] as const;
/** FM's launch table (report 6): distance bands (m), median launch |v| and vz (m/s). */
export const LAUNCH_LABELS = ["0–10", "10–20", "20–30", "30–45", "45+"] as const;
export const FM_LAUNCH = { speed: [9.7, 14.2, 19.6, 24.5, 31.3], vz: [0.85, 1.8, 4.7, 10.2, 14.3] } as const;
/** Flight to the receiver's decision (report 7): bands (m) and FM's fit t ≈ 0.43 + 0.05·d s at the band centres. */
export const FLIGHT_LABELS = ["0–8", "8–13", "13–18", "18–23", "23–30", "30+"] as const;
export const FM_FLIGHT_S = [0.65, 0.95, 1.18, 1.45, 1.75, 2.4] as const;
/** Landing / first contact against the decided target (m, R9 §3): median and p90. */
export const LANDING_GROUPS = ["cross", "corner", "long", "lofted"] as const;
export type LandingGroup = (typeof LANDING_GROUPS)[number];
export const FM_LANDING: Record<LandingGroup, [number, number]> = { cross: [6.8, 12], corner: [4.9, 19], long: [4.6, 11], lofted: [7.4, 17] };
const vzBand = (vzM: number) => (vzM <= 1 ? 0 : vzM <= 3 ? 1 : vzM <= 6 ? 2 : vzM <= 10 ? 3 : 4);
const launchBand = (dM: number) => (dM < 10 ? 0 : dM < 20 ? 1 : dM < 30 ? 2 : dM < 45 ? 3 : 4);
const flightBand = (dM: number) => (dM < 8 ? 0 : dM < 13 ? 1 : dM < 18 ? 2 : dM < 23 ? 3 : dM < 30 ? 4 : 5);
const landingGroupOf = (type: string): LandingGroup | null =>
  type === "cross" ? "cross" : type === "corner" ? "corner" : type === "long" || type === "clearance" ? "long" : type === "high" || type === "chip" || type === "through_high" ? "lofted" : null;

export const BALL_GROUPS = ["cross", "corner", "long"] as const;
export type BallGroup = (typeof BALL_GROUPS)[number];
/** R9 §3: median peak and contact height (m) of crosses, corners and long balls / clearances. */
export const FM_BALL: Record<BallGroup, { peak: number; contact: number }> = {
  cross: { peak: 4.0, contact: 1.8 },
  corner: { peak: 5.6, contact: 2.2 },
  long: { peak: 4.4, contact: 1.4 },
};

export function emptyFmTargets(): FmTargetTotals {
  const lineRec = <T>(f: () => T) => ({ GK: f(), DEF: f(), MID: f(), FWD: f() });
  return {
    matches: 0, ticks: 0,
    passBand: FM_BANDS_M.map(o3).concat([o3()]), passLoft: { ground: o3(), lofted: o3() },
    passPressure: PRESSURE_LABELS.map(o3), passAll: o3(), passKind: {}, passBandRegular: FM_BANDS_M.map(o3).concat([o3()]),
    holderCat: { carry: 0, pass: 0, turn: 0, hold: 0, kick: 0 },
    holderCatByThird: [0, 1, 2].map(() => ({ carry: 0, pass: 0, turn: 0, hold: 0, kick: 0 })),
    holderDecisions: 0, possessions: 0, possessionDecisions: 0, possessionHist: new Array(40).fill(0),
    pressSamples: 0, pressers: [0, 0, 0], nearByThird: [0, 1, 2].map(() => ({ n: 0, sum: 0 })),
    shape: [0, 1].map(() => ({ n: 0, back: 0, length: 0, width: 0, gapBM: 0, gapMF: 0, front: 0 })),
    step: lineRec(() => [{ sum: 0, n: 0 }, { sum: 0, n: 0 }]),
    holdDefault: lineRec(() => [] as number[]), holdShort: lineRec(() => [] as number[]),
    shotDist: SHOT_LABELS.map(() => 0), shots: 0, shotXgHist: new Array(XG_HIST_BINS).fill(0), realSeconds: 0,
    condition: CONDITION_MINUTES.map(() => ({ sum: 0, n: 0 })), keeperEnd: { sum: 0, n: 0 },
    ballPeak: { cross: [], corner: [], long: [] }, ballContact: { cross: [], corner: [], long: [] }, ballAirSeconds: 0,
    passVz: VZ_LABELS.map(o3), launchSpeed: LAUNCH_LABELS.map(() => []), launchVz: LAUNCH_LABELS.map(() => []),
    flight: FLIGHT_LABELS.map(() => []), landingErr: { cross: [], corner: [], long: [], lofted: [] },
    lossEarly: 0, lossLate: 0,
    shotEnds: SHOT_M_LABELS.map(() => SHOT_END.map(() => 0)),
  };
}

export function mergeFmTargets(dst: FmTargetTotals, src: FmTargetTotals): void {
  const add3 = (a: Outcome3, b: Outcome3) => { for (let i = 0; i < 3; i++) a[i]! += b[i]!; };
  dst.matches += src.matches; dst.ticks += src.ticks; dst.realSeconds += src.realSeconds;
  src.passBand.forEach((b, i) => add3(dst.passBand[i]!, b));
  add3(dst.passLoft.ground, src.passLoft.ground); add3(dst.passLoft.lofted, src.passLoft.lofted);
  src.passPressure.forEach((b, i) => add3(dst.passPressure[i]!, b));
  add3(dst.passAll, src.passAll);
  for (const [k, v] of Object.entries(src.passKind)) add3(dst.passKind[k] ??= o3(), v);
  src.passBandRegular.forEach((b, i) => add3(dst.passBandRegular[i]!, b));
  for (const k of HOLDER_CATS) { dst.holderCat[k] += src.holderCat[k]; for (let t = 0; t < 3; t++) dst.holderCatByThird[t]![k] += src.holderCatByThird[t]![k]; }
  dst.holderDecisions += src.holderDecisions; dst.possessions += src.possessions; dst.possessionDecisions += src.possessionDecisions;
  src.possessionHist.forEach((v, i) => { dst.possessionHist[i]! += v; });
  dst.pressSamples += src.pressSamples; for (let i = 0; i < 3; i++) dst.pressers[i]! += src.pressers[i]!;
  src.nearByThird.forEach((v, i) => { dst.nearByThird[i]!.n += v.n; dst.nearByThird[i]!.sum += v.sum; });
  src.shape.forEach((v, i) => { const d = dst.shape[i]!; d.n += v.n; d.back += v.back; d.length += v.length; d.width += v.width; d.gapBM += v.gapBM; d.gapMF += v.gapMF; d.front += v.front; });
  for (const l of LINES) {
    for (let p = 0; p < 2; p++) { dst.step[l][p]!.sum += src.step[l][p]!.sum; dst.step[l][p]!.n += src.step[l][p]!.n; }
    dst.holdDefault[l].push(...src.holdDefault[l]); dst.holdShort[l].push(...src.holdShort[l]);
  }
  src.shotDist.forEach((v, i) => { dst.shotDist[i]! += v; }); dst.shots += src.shots;
  (src.shotEnds ?? []).forEach((row, i) => row.forEach((v, j) => { dst.shotEnds[i]![j]! += v; }));
  src.shotXgHist.forEach((v, i) => { dst.shotXgHist[i]! += v; });
  src.condition.forEach((v, i) => { dst.condition[i]!.sum += v.sum; dst.condition[i]!.n += v.n; });
  dst.keeperEnd.sum += src.keeperEnd.sum; dst.keeperEnd.n += src.keeperEnd.n;
  for (const g of BALL_GROUPS) { dst.ballPeak[g].push(...(src.ballPeak?.[g] ?? [])); dst.ballContact[g].push(...(src.ballContact?.[g] ?? [])); }
  dst.ballAirSeconds += src.ballAirSeconds ?? 0;
  src.passVz?.forEach((b, i) => add3(dst.passVz[i]!, b));
  src.launchSpeed?.forEach((v, i) => dst.launchSpeed[i]!.push(...v));
  src.launchVz?.forEach((v, i) => dst.launchVz[i]!.push(...v));
  src.flight?.forEach((v, i) => dst.flight[i]!.push(...v));
  for (const g of LANDING_GROUPS) dst.landingErr[g].push(...(src.landingErr?.[g] ?? []));
  dst.lossEarly += src.lossEarly ?? 0; dst.lossLate += src.lossLate ?? 0;
}

const ballGroupOf = (kind: string): BallGroup | null =>
  kind === "cross" ? "cross" : kind === "corner" ? "corner" : kind === "long_ball" || kind === "clearance" ? "long" : null;

/** FM category of a holder decision. */
export function holderCategory(d: PlayerDecision): HolderCat {
  switch (d.type) {
    case "carry": return d.move === "shield" || d.step === "hold" || d.step === "flag" ? "hold" : d.step === "turn" || d.step === "spin" ? "turn" : "carry";
    case "dribble": return "carry";
    case "shoot": return "kick";
    default: return "pass";
  }
}

const lineOf = (p: GamePlayer): Line => {
  if (p.role === "GK") return "GK";
  const m = getMainRole(p.role);
  return m === "Defender" ? "DEF" : m === "Forward" ? "FWD" : m === "GK" ? "GK" : "MID";
};
/** Distance from the team's own goal line. */
const fromOwnGoal = (p: GamePlayer) => (p.attackDir === 1 ? p.x : PITCH_LENGTH - p.x);
/** 0 own third, 1 middle, 2 final (of the player's attack). */
const thirdOf = (p: GamePlayer) => Math.min(2, Math.floor(fromOwnGoal(p) / (PITCH_LENGTH / 3)));
const bandOfYd = (d: number) => { const m = d / YD; let i = 0; while (i < FM_BANDS_M.length && m >= FM_BANDS_M[i]!) i++; return i; };
const pressureBand = (p: number) => (p <= 0 ? 0 : p < 15 ? 1 : p < 30 ? 2 : p < 50 ? 3 : 4);
/**
 * FM's default "take up position" (0x58) against its short actions (0x53 shape / marking, 0x5c support, 0x5a runs…,
 * report 7): holding the shape or the space is the default; marking, stepping into a lane, offering, a run, making
 * space, pressing are short (stage 15: an off-ball `support_run` is classed by its intent).
 */
const runKey = (p: GamePlayer, t: string) => {
  if (t === "hold_shape" || t === "idle") return "default";
  if (t === "support_run") { const i = offBallIntentOf(p.id); return i === "hold_space" || i === undefined ? "default" : i; }
  // Pressing, tackling and chasing a loose ball are FM's pressing managers and ball events, not off-ball actions:
  // they end a run but are not counted themselves.
  if (t === "press" || t === "tackle" || t === "chase_loose_ball") return "other";
  return t;
};
/** Record a finished run (the "other" kinds are not off-ball actions). */
const pushRun = (acc: FmTargetTotals, r: HoldRun, end: number) => {
  if (r.type === "other") return;
  (r.type === "default" ? acc.holdDefault : acc.holdShort)[r.line].push(end - r.since);
};

interface PendingPass { kind: string; team: TeamId; from: number; intended: number | null; dist: number; lofted: boolean; pressure: number; held: boolean; t0: number; vzM: number | null }
interface Stint { id: number; t0: number; decisions: number }
interface HoldRun { type: string; since: number; line: Line }

/** One collector per match: call `tick(state)` after every tick, `finish()` at the end. */
export function fmTargetCollector(acc: FmTargetTotals, dt = 0.2) {
  let prev: GameState | null = null;
  let pending: PendingPass | null = null;
  let stint: Stint | null = null;
  let sinceSample = 0;
  let realT = 0;
  const runs = new Map<number, HoldRun>();
  const conditionDone = new Set<number>();
  let last: GameState | null = null;

  const closeStint = () => {
    if (stint && stint.decisions > 0) {
      acc.possessions++; acc.possessionDecisions += stint.decisions;
      const dur = realT - stint.t0;
      acc.possessionHist[Math.min(acc.possessionHist.length - 1, Math.floor(dur / 0.2))]!++;
    }
    stint = null;
  };
  const resolvePass = (s: GameState, receiverId: number) => {
    if (!pending) return;
    const r = s.players.find(p => p.id === receiverId);
    const k = !r ? 2 : r.team !== pending.team ? 2 : receiverId === pending.intended ? 0 : 1;
    const bump = (o: Outcome3) => { o[k]!++; };
    bump(acc.passAll); bump(acc.passBand[bandOfYd(pending.dist)]!); bump(pending.lofted ? acc.passLoft.lofted : acc.passLoft.ground);
    bump(acc.passPressure[pressureBand(pending.pressure)]!);
    bump(acc.passKind[pending.kind] ??= o3());
    if (pending.kind === 'regular') bump(acc.passBandRegular[bandOfYd(pending.dist)]!);
    if (k === 2) {
      const expected = 0.43 + 0.05 * (pending.dist / YD) + FM_TICK_S;
      if (realT - pending.t0 <= expected) acc.lossEarly++; else acc.lossLate++;
    }
    if (pending.vzM !== null) {
      bump(acc.passVz[vzBand(pending.vzM)]!);
      if (k === 0) acc.flight[flightBand(pending.dist / YD)]!.push(realT - pending.t0);
    }
    pending = null;
  };

  const tick = (s: GameState) => {
    acc.ticks++;
    realT += dt;
    last = s;
    if (!isLivePhase(s.matchPhase)) { prev = s; return; }
    // ── condition by minute (report 9 §6); 90' is read at the end ──
    const minute = matchMinute(s);
    CONDITION_MINUTES.forEach((m, i) => {
      if (m === 90 || minute < m || conditionDone.has(m)) return;
      conditionDone.add(m);
      const c = acc.condition[i]!; c.sum += median(s.players.filter(p => p.role !== "GK").map(p => p.energy)); c.n++;
    });
    acc.realSeconds += dt;
    // ── the 3D ball (stage 3): a flight that ended gives its peak and the height it ended at ──
    const cb = s.ball;
    if (cb && cb.z > 0.1) acc.ballAirSeconds += dt;
    if (cb?.ended && cb.ended.phase === "pass") {
      const g = ballGroupOf(cb.ended.kind);
      if (g) { acc.ballPeak[g].push(cb.ended.peak / YD); acc.ballContact[g].push(cb.ended.z / YD); }
    }
    const held = !s.pass && !s.looseBall && !s.shot;
    // ── passes ──
    if (s.pass && (!prev || !prev.pass || prev.pass.fromId !== s.pass.fromId || s.pass.t < prev.pass.t)) {
      const ph = s.pass.physics;
      if (ph) {
        // Stage 4: the launch against FM's table, and where a high ball lands against where it was aimed.
        const dAim = Math.hypot(ph.aimX - ph.ox, ph.aimY - ph.oy) / YD;
        acc.launchSpeed[launchBand(dAim)]!.push(ph.speed / YD); acc.launchVz[launchBand(dAim)]!.push(ph.vz / YD);
        const g = landingGroupOf(ph.type);
        if (g && (g !== "lofted" || s.pass.kind === "cross" || s.pass.kind === "long_ball" || s.pass.kind === "clearance")) {
          acc.landingErr[g].push(Math.hypot(s.pass.toX - ph.aimX, s.pass.toY - ph.aimY) / YD);
        }
      }
      if (s.pass.kind !== "clearance") {
        const src = (prev ?? s).players.find(p => p.id === s.pass!.fromId) ?? s.players.find(p => p.id === s.pass!.fromId)!;
        const opps = (prev ?? s).players.filter(p => p.team !== src.team);
        const lofted = s.pass.kind === "cross" || s.pass.kind === "long_ball" || !!s.pass.lofted;
        pending = { kind: s.pass.lofted ? 'lofted' : s.pass.kind, team: src.team, from: src.id, intended: s.pass.toId ?? s.pass.intendedRunnerId, dist: s.pass.distance, lofted, pressure: holderPressure(src.x, src.y, opps), held: false, t0: realT, vzM: ph ? ph.vz / YD : null };
      }
    }
    if (pending && held && s.ballHolderId !== pending.from) resolvePass(s, s.ballHolderId);
    else if (pending && held && s.ballHolderId === pending.from && prev && (prev.pass || prev.looseBall)) resolvePass(s, s.ballHolderId);
    // ── holder decisions and stints ──
    const released = !!prev && !prev.pass && !prev.shot && !prev.looseBall && ((!!s.pass && s.pass.fromId === s.ballHolderId) || !!s.shot);
    if ((held || released) && !s.setPiece && !prev?.setPiece) {
      const h = s.players.find(p => p.id === s.ballHolderId);
      if (h) {
        if (!stint || stint.id !== h.id) { closeStint(); stint = { id: h.id, t0: realT, decisions: 0 }; }
        const d = s.decisions[h.id];
        const pd = prev?.decisions[h.id];
        if (d && (d !== pd || prev?.ballHolderId !== h.id) && h.role !== "GK") {
          const c = holderCategory(d);
          acc.holderCat[c]++; acc.holderCatByThird[thirdOf(h)]![c]++; acc.holderDecisions++; stint.decisions++;
        }
      }
    } else if (!held) {
      closeStint();
    }
    // ── shots ──
    if (s.shot && !(prev?.shot)) {
      const sh = s.players.find(p => p.id === s.shot!.shooterId);
      if (sh) {
        const gx = sh.attackDir === 1 ? PITCH_LENGTH : 0;
        const d = Math.hypot(gx - s.shot.fromX, Math.max(GOAL_Y_MIN, Math.min(GOAL_Y_MAX, s.shot.fromY)) - s.shot.fromY);
        acc.shotDist[Math.min(SHOT_LABELS.length - 1, Math.floor(d / 6))]!++; acc.shots++;
      }
    }
    // ── hold runs of off-ball / defensive decisions ──
    for (const p of s.players) {
      if (p.id === s.ballHolderId && held) { runs.delete(p.id); continue; }
      const d = s.decisions[p.id];
      if (!d) continue;
      const r = runs.get(p.id);
      const key = runKey(p, d.type);
      if (!r || r.type !== key) {
        if (r) pushRun(acc, r, realT);
        runs.set(p.id, { type: key, since: realT, line: lineOf(p) });
      }
    }
    // ── per-second samples ──
    sinceSample += dt;
    if (sinceSample >= 1 - 1e-9) {
      sinceSample = 0;
      const h = s.players.find(p => p.id === s.ballHolderId);
      if (h && held && !s.setPiece) {
        acc.pressSamples++;
        let pr = 0; let near = 0;
        for (const o of s.players) {
          if (o.team === h.team) continue;
          if (Math.hypot(o.targetPosition.x - h.x, o.targetPosition.y - h.y) <= 3 * YD) pr++;
          if (Math.hypot(o.x - h.x, o.y - h.y) <= 10 * YD) near++;
        }
        acc.pressers[Math.min(2, pr)]!++;
        const nt = acc.nearByThird[thirdOf(h)]!; nt.n++; nt.sum += near;
      }
      const possTeam: TeamId | null = s.setPiece || s.looseBall ? null : h ? h.team : null;
      if (possTeam) {
        for (const team of ["A", "B"] as TeamId[]) {
          const of = s.players.filter(p => p.team === team && p.role !== "GK");
          if (of.length < 8) continue;
          const depth = of.map(fromOwnGoal).sort((a, b) => a - b);
          const ys = of.map(p => p.y);
          const back = mean(depth.slice(0, 4)); const front = mean(depth.slice(-2)); const mid = mean(depth.slice(4, -2));
          const sh = acc.shape[team === possTeam ? 0 : 1]!;
          sh.n++; sh.back += back; sh.front += front; sh.length += depth[depth.length - 1]! - depth[0]!;
          sh.width += Math.max(...ys) - Math.min(...ys); sh.gapBM += mid - back; sh.gapMF += front - mid;
          for (const p of s.players) {
            if (p.team !== team || (p.id === s.ballHolderId && held)) continue;
            const st = acc.step[lineOf(p)][team === possTeam ? 0 : 1]!;
            st.sum += Math.hypot(p.targetPosition.x - p.x, p.targetPosition.y - p.y); st.n++;
          }
        }
      }
    }
    prev = s;
  };
  const finish = () => {
    closeStint();
    if (last) {
      const c = acc.condition[CONDITION_MINUTES.indexOf(90)]!;
      c.sum += median(last.players.filter(p => p.role !== "GK").map(p => p.energy)); c.n++;
      for (const k of last.players.filter(p => p.role === "GK")) { acc.keeperEnd.sum += k.energy; acc.keeperEnd.n++; }
    }
    acc.matches++;
    for (const r of runs.values()) pushRun(acc, r, realT);
    runs.clear();
  };
  void PITCH_WIDTH;
  return { tick, finish };
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]!; };
export const pct = (o: Outcome3) => { const n = o[0] + o[1] + o[2]; return n ? (100 * o[0]) / n : 0; };

// ── FM targets (engine rebuild stage 0). Per match, both teams. R9 = the official stats of two device matches
// (`fm-engine-report-9.md` §1, §6, §8); R7 = report 7 (passes by band, holder mix, shape); L = low-confidence figures
// of the gap list. Read by `scripts/fm-targets.ts`, the /test panel (`FmTargetsPanel`) and the /lab `PairDetail`. ──

/** Minutes of the condition samples (report 9 §6). */
export const CONDITION_MINUTES = [15, 30, 45, 60, 75, 90] as const;

export type FmConfidence = "H" | "M" | "L";
export type FmMatchKey =
  | "goals" | "shots" | "shotsOnTargetPct" | "shotsBlockedPct" | "longShotsPct" | "xg" | "xgPerShot" | "xgMedian"
  | "clearChances" | "conversionPct" | "savedPct" | "offTargetPct"
  | "corners" | "throwIns" | "passesAttempted" | "passCompletionPct" | "crosses" | "crossCompletionPct"
  | "aerialDuelsWon" | "tacklesWon" | "interceptions" | "dribbles" | "fouls" | "yellowCards" | "yellowsPerFoul"
  | "redCards" | "offsides" | "penalties";

export interface FmMatchTarget { key: FmMatchKey; label: string; fm: number; pct?: true; confidence: FmConfidence; source: "R9" | "R6" | "L" }

/** The per-match volume targets (R9 §8 and the gap list's volume list). */
export const FM_MATCH_TARGETS: readonly FmMatchTarget[] = [
  { key: "goals",              label: "Goals",                 fm: 1.5,  confidence: "M", source: "R9" },
  { key: "shots",              label: "Shots",                 fm: 21.5, confidence: "H", source: "R9" },
  { key: "shotsOnTargetPct",   label: "On target % of shots",  fm: 35, pct: true, confidence: "H", source: "R9" },
  { key: "shotsBlockedPct",    label: "Blocked % of shots",    fm: 38, pct: true, confidence: "M", source: "R9" },
  { key: "longShotsPct",       label: "Long-range % (18+ yd)", fm: 46, pct: true, confidence: "M", source: "R9" },
  { key: "xg",                 label: "xG",                    fm: 3.3,  confidence: "M", source: "R9" },
  { key: "xgPerShot",          label: "xG per shot",           fm: 0.15, confidence: "M", source: "R9" },
  { key: "xgMedian",           label: "xG per shot, median",   fm: 0.03, confidence: "M", source: "R6" },
  { key: "clearChances",       label: "Clear-cut chances",     fm: 3.5,  confidence: "M", source: "R9" },
  { key: "conversionPct",      label: "Goals % of shots",      fm: 7, pct: true, confidence: "M", source: "R9" },
  { key: "savedPct",           label: "Saved % of on target",  fm: 80, pct: true, confidence: "M", source: "R9" },
  { key: "offTargetPct",       label: "Off target % of shots", fm: 27, pct: true, confidence: "M", source: "R9" },
  { key: "corners",            label: "Corners",               fm: 12.5, confidence: "H", source: "R9" },
  { key: "throwIns",           label: "Throw-ins",             fm: 23,   confidence: "L", source: "L" },
  { key: "passesAttempted",    label: "Passes (all kinds)",    fm: 978,  confidence: "H", source: "R9" },
  { key: "passCompletionPct",  label: "Pass completion %",     fm: 86, pct: true, confidence: "H", source: "R9" },
  { key: "crosses",            label: "Crosses",               fm: 64,   confidence: "M", source: "R9" },
  { key: "crossCompletionPct", label: "Cross completion %",    fm: 19, pct: true, confidence: "M", source: "R9" },
  { key: "aerialDuelsWon",     label: "Headers won",           fm: 27,   confidence: "M", source: "R9" },
  { key: "tacklesWon",         label: "Tackles won",           fm: 17,   confidence: "M", source: "R9" },
  { key: "interceptions",      label: "Interceptions",         fm: 59,   confidence: "M", source: "R9" },
  { key: "dribbles",           label: "Dribbles",              fm: 20,   confidence: "L", source: "R9" },
  { key: "fouls",              label: "Fouls",                 fm: 19,   confidence: "M", source: "R9" },
  { key: "yellowCards",        label: "Yellow cards",          fm: 3,    confidence: "L", source: "R9" },
  { key: "yellowsPerFoul",     label: "Yellows per foul",      fm: 0.16, confidence: "L", source: "R9" },
  { key: "redCards",           label: "Red cards",             fm: 0,    confidence: "L", source: "R9" },
  { key: "offsides",           label: "Offsides",              fm: 8,    confidence: "M", source: "R9" },
  { key: "penalties",          label: "Penalties",             fm: 0.2,  confidence: "L", source: "L" },
];

/** FM's outfield median condition at `CONDITION_MINUTES` (R9 §6, middle of the two matches); keepers at full time. */
export const FM_CONDITION = [87, 86.5, 77.5, 72.5, 75, 73.5] as const;
export const FM_KEEPER_END = 96.5;
/** R7: pass to the intended receiver by `BAND_LABELS` (%), overall / ground / lofted, by `PRESSURE_LABELS`. */
export const FM_PASS_BAND = [94, 92, 90, 85, 87, 79, 36, 21, 29] as const;
export const FM_PASS_OVERALL = { all: 82, ground: 92, lofted: 31 } as const;
export const FM_PASS_PRESSURE = [74, 91, 85, 79, 67] as const;
/** R7: holder decision mix (%), all and by third. */
export const FM_HOLDER_MIX: Record<"all" | "own" | "middle" | "final", Partial<Record<HolderCat, number>>> = {
  all: { carry: 44, pass: 34, turn: 12, hold: 9, kick: 1 },
  own: { carry: 26, pass: 37, turn: 23, hold: 14 },
  middle: { carry: 50, pass: 33, turn: 10, hold: 7 },
  final: { carry: 51, pass: 32, turn: 7, hold: 6, kick: 4 },
};
/** R7: decisions per live second and per possession; time on ball median / p90 (s). */
export const FM_TIMING = { perSecond: 0.65, perPossession: "2.5–3", onBallMedian: "0.7–1.0", onBallP90: "2–3.4" } as const;
/** R7: dedicated pressers 0 / 1 / 2+ (%); opponents within 10 m of the holder by his third. */
export const FM_PRESSERS = [75, 20, 5] as const;
export const FM_NEAR_HOLDER = [0.85, 1.8, 3.1] as const;
/** R7: shape in / out of possession (yd): back line, length, width, back→mid, mid→front, front line. */
export const FM_SHAPE = [[58, 39, 40, 19, 10, 87], [24, 35, 37, 14, 12.5, 50]] as const;

/**
 * Stage 13 (R8 §3, R9 §5): where the fouls are (fouled team's view: own / middle / final third, %), what the fouled
 * player was doing (carry ≥ 44%, his team's pass 17%, turn or hold 9%), and FM's per-second rates over a 93-minute
 * match (5580 s of play, the comparison while our match still has ~5 min of physics).
 */
export const FM_FOULS = {
  thirds: [21, 43, 36] as const,
  carry: 44, reception: 17, hold: 9,
  matchSeconds: 5580,
  foulsPerMatch: 19, offsidesPerMatch: 8, yellowsPerMatch: 3,
} as const;

/** Match counts the targets are computed from: the two teams' `Statistics.ts` totals summed. */
export interface FmMatchCounts {
  goals: number; shots: number; shotsOnTarget: number; shotsBlocked: number; xg: number;
  /** Stage 6 (`xg.md`): shots with xG ≥ 0.15 / ≥ 0.30. */
  chances: number; clearChances: number;
  corners: number; throwIns: number;
  passesAttempted: number; passesCompleted: number; throughBallsAttempted: number; throughBallsCompleted: number;
  crosses: number; crossesCompleted: number; longBalls: number; longBallsCompleted: number;
  aerialDuelsWon: number; tackles: number; interceptions: number; dribblesWon: number;
  fouls: number; yellowCards: number; redCards: number; offsides: number; penaltiesAwarded: number;
  /** Stage 13: fouls suffered by third (fouled team's view) and by what he was doing; contact fouls; line misreads. */
  foulsWonOwnThird?: number; foulsWonMidThird?: number; foulsWonFinalThird?: number;
  foulsWonCarrying?: number; foulsWonReceiving?: number; foulsWonHolding?: number;
  contactFouls?: number; lineMisreads?: number;
  /** Stage 16: concentration lapses (defending, off the ball), mind-changed defensive intents and dropped marks. */
  mindLapsesDefence?: number; mindLapsesOffBall?: number; mindDefenseShifts?: number; mindMarkDrops?: number;
  /** Shots from 18+ yd of the goal mouth, when a collector counted them (`longShotsOf`); else absent. */
  longShots?: number;
  /** Median xG per shot, when a collector kept the histogram (`xgMedianOf`); else absent. */
  xgMedian?: number;
  /** Stage 7 (`shot-and-save.md`): shots saved and off target (woodwork included), and the rest of the shot counters. */
  shotsSaved?: number; shotsOffTarget?: number; shotsWoodwork?: number; shotsDeflected?: number;
  saves?: number; savesGood?: number; savesDifficult?: number;
  shotPower?: number; shotPlaced?: number; shotLob?: number; shotChip?: number; shotVolley?: number; shotHeaderLaunch?: number; shotFreeKick?: number;
  shotSpeedSum?: number; shotLaunchN?: number;
  /** Stage 9: strike distance sum (m), shots from outside the box, low launches (vz ≤ 3 m/s). */
  shotDistSumM?: number; shotsOutsideBox?: number; shotsLowLaunch?: number;
}

export const FM_COUNT_KEYS = [
  "goals", "shots", "shotsOnTarget", "shotsBlocked", "xg", "chances", "clearChances", "corners", "throwIns",
  "passesAttempted", "passesCompleted", "throughBallsAttempted", "throughBallsCompleted",
  "crosses", "crossesCompleted", "longBalls", "longBallsCompleted",
  "aerialDuelsWon", "tackles", "interceptions", "dribblesWon",
  "fouls", "yellowCards", "redCards", "offsides", "penaltiesAwarded",
  "foulsWonOwnThird", "foulsWonMidThird", "foulsWonFinalThird", "foulsWonCarrying", "foulsWonReceiving", "foulsWonHolding",
  "contactFouls", "lineMisreads",
  "shotsSaved", "shotsOffTarget", "shotsWoodwork", "shotsDeflected", "saves", "savesGood", "savesDifficult",
  "shotPower", "shotPlaced", "shotLob", "shotChip", "shotVolley", "shotHeaderLaunch", "shotFreeKick", "shotSpeedSum", "shotLaunchN",
  "shotDistSumM", "shotsOutsideBox", "shotsLowLaunch", "mindLapsesDefence", "mindLapsesOffBall", "mindDefenseShifts", "mindMarkDrops",
] as const satisfies readonly (keyof FmMatchCounts)[];

/** Both teams' stats summed (any object with the `Statistics.ts` field names; a missing field counts 0). */
export function fmCountsOf(a: object, b: object): FmMatchCounts {
  const out: Record<string, number> = {};
  for (const k of FM_COUNT_KEYS) out[k] = Number((a as Record<string, unknown>)[k] ?? 0) + Number((b as Record<string, unknown>)[k] ?? 0);
  return out as unknown as FmMatchCounts;
}

/** Counts summed over `n` matches → per-match mean. */
export function perMatchCounts(sum: FmMatchCounts, n: number): FmMatchCounts {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(sum)) out[k] = n > 0 ? (v as number) / n : 0;
  return out as unknown as FmMatchCounts;
}

/** Our value of each target from one match's counts (or a per-match mean); null when we don't measure it. */
export function fmMatchValues(c: FmMatchCounts): Record<FmMatchKey, number | null> {
  const ratio = (x: number, y: number) => (y > 0 ? x / y : null);
  const pc = (x: number, y: number) => (y > 0 ? (100 * x) / y : null);
  const all = c.passesAttempted + c.throughBallsAttempted + c.crosses + c.longBalls;
  const done = c.passesCompleted + c.throughBallsCompleted + c.crossesCompleted + c.longBallsCompleted;
  return {
    goals: c.goals, shots: c.shots,
    shotsOnTargetPct: pc(c.shotsOnTarget, c.shots), shotsBlockedPct: pc(c.shotsBlocked, c.shots),
    longShotsPct: c.longShots === undefined ? null : pc(c.longShots, c.shots),
    xg: c.xg, xgPerShot: ratio(c.xg, c.shots), xgMedian: c.xgMedian ?? null, clearChances: c.clearChances,
    conversionPct: pc(c.goals, c.shots),
    savedPct: c.shotsSaved === undefined ? null : pc(c.shotsSaved, c.shotsOnTarget),
    offTargetPct: c.shotsOffTarget === undefined ? null : pc(c.shotsOffTarget, c.shots),
    corners: c.corners, throwIns: c.throwIns,
    passesAttempted: all, passCompletionPct: pc(done, all),
    crosses: c.crosses, crossCompletionPct: pc(c.crossesCompleted, c.crosses),
    aerialDuelsWon: c.aerialDuelsWon, tacklesWon: c.tackles, interceptions: c.interceptions, dribbles: c.dribblesWon,
    fouls: c.fouls, yellowCards: c.yellowCards, yellowsPerFoul: ratio(c.yellowCards, c.fouls), redCards: c.redCards,
    offsides: c.offsides, penalties: c.penaltiesAwarded,
  };
}

/** One row per target: label, our value, FM's (formatted), and the ratio ours / FM (null when not comparable). */
export interface FmTargetRow { target: FmMatchTarget; ours: string; fm: string; ratio: number | null }
export function fmTargetRows(c: FmMatchCounts): FmTargetRow[] {
  const v = fmMatchValues(c);
  return FM_MATCH_TARGETS.map(t => {
    const ours = v[t.key];
    return { target: t, ours: fmFormat(t, ours), fm: fmFormat(t, t.fm), ratio: ours === null || t.fm === 0 ? null : ours / t.fm };
  });
}

/** Display of one value: counts with 1–2 decimals, percentages with a % sign. */
export function fmFormat(t: FmMatchTarget, v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (t.pct) return `${v.toFixed(1)}%`;
  return Math.abs(v) < 1 && v !== 0 ? v.toFixed(2) : v.toFixed(1);
}

/** Bins of the shot-xG histogram (`FmTargetTotals.shotXgHist`). */
export const XG_HIST_BINS = 200;

/** Adds one shot's xG to the histogram. */
export function addShotXg(t: FmTargetTotals, xg: number): void {
  t.shotXgHist[Math.min(XG_HIST_BINS - 1, Math.max(0, Math.floor(xg * XG_HIST_BINS)))]!++;
}

/** Median shot xG of the histogram (bin centre); null with no shot. */
export function xgMedianOf(t: FmTargetTotals): number | null {
  const tot = t.shotXgHist.reduce((a, b) => a + b, 0);
  if (!tot) return null;
  let c = 0;
  for (let i = 0; i < t.shotXgHist.length; i++) { c += t.shotXgHist[i]!; if (c >= tot / 2) return (i + 0.5) / XG_HIST_BINS; }
  return null;
}

/** Shots from 18+ yd in a collector's distance histogram (bins of 6 yd). */
export function longShotsOf(t: FmTargetTotals): number {
  return t.shotDist.slice(3).reduce((a, b) => a + b, 0);
}

/** Both sides' per-match means of a /lab pair (`PerMatchView`) as FM match counts (the `PairDetail` panel). */
export function fmCountsFromViews(a: PerMatchView, b: PerMatchView): FmMatchCounts {
  const one = (v: PerMatchView): FmMatchCounts => ({
    goals: v.avgGoals, shots: v.avgShots, shotsOnTarget: v.avgShotsOnTarget, shotsBlocked: v.avgShotsBlocked, xg: v.avgXg,
    chances: v.avgChances, clearChances: v.avgClearChances,
    corners: v.avgCorners, throwIns: v.avgThrowIns,
    passesAttempted: v.avgPassesAttempted, passesCompleted: v.avgPassesCompleted,
    throughBallsAttempted: v.avgThroughBalls, throughBallsCompleted: (v.avgThroughBalls * v.throughBallCompletionPct) / 100,
    crosses: v.avgCrosses, crossesCompleted: (v.avgCrosses * v.crossCompletionPct) / 100,
    longBalls: v.avgLongBalls, longBallsCompleted: v.avgLongBallsCompleted,
    aerialDuelsWon: v.avgAerialDuelsWon, tackles: v.avgTackles, interceptions: v.avgInterceptions, dribblesWon: v.avgDribblesWon,
    fouls: v.avgFouls, yellowCards: v.avgYellowCards, redCards: v.avgRedCards, offsides: v.avgOffsides,
    penaltiesAwarded: v.avgPenaltiesAwarded,
    shotsSaved: v.avgShotsSaved, shotsOffTarget: v.avgShotsOffTarget,
  });
  return fmCountsOf(one(a), one(b));
}
