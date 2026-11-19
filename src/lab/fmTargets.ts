/**
 * FM27 target metrics (engine rebuild stage 4b, `.claude/rules/game-engine/fm-numbers.md`): one collector fed with every
 * tick of a match (`simulateMatch(..., { onTick })`), state-based so it needs no listener on the engine. Pure apart from
 * the accumulator it fills. Distances in yards; FM's metre bands converted (1 m = 1.0936 yd).
 */
import type { GameState, GamePlayer, TeamId } from "@/GameEngine/types";
import type { PlayerDecision } from "@/GameEngine/Domain/DecisionTree";
import { holderPressure } from "@/GameEngine/Domain/Pressure";
import { isLivePhase } from "@/GameEngine/Domain/gameState";
import { PITCH_LENGTH, PITCH_WIDTH, GOAL_Y_MIN, GOAL_Y_MAX } from "@/GameEngine/Domain/pitch";
import { getMainRole } from "@/Domain/roles";

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
  realSeconds: number;
}

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
    shotDist: SHOT_LABELS.map(() => 0), shots: 0, realSeconds: 0,
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
}

/** FM category of a holder decision. */
export function holderCategory(d: PlayerDecision): HolderCat {
  switch (d.type) {
    case "carry": return d.move === "shield" || d.step === "hold" ? "hold" : d.step === "turn" ? "turn" : "carry";
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
/** FM's default "take up position" (0x58): holding the shape, marking, supporting; the rest are short actions. */
const isDefaultIntent = (t: string) => t === "hold_shape" || t === "idle" || t === "track_mark" || t === "support_run";
const runKey = (t: string) => (isDefaultIntent(t) ? "default" : t);

interface PendingPass { kind: string; team: TeamId; from: number; intended: number | null; dist: number; lofted: boolean; pressure: number; held: boolean }
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
    pending = null;
  };

  const tick = (s: GameState) => {
    acc.ticks++;
    realT += dt;
    if (!isLivePhase(s.matchPhase)) { prev = s; return; }
    acc.realSeconds += dt;
    const held = !s.pass && !s.looseBall && !s.shot;
    // ── passes ──
    if (s.pass && (!prev || !prev.pass || prev.pass.fromId !== s.pass.fromId || s.pass.t < prev.pass.t)) {
      if (s.pass.kind !== "clearance") {
        const src = (prev ?? s).players.find(p => p.id === s.pass!.fromId) ?? s.players.find(p => p.id === s.pass!.fromId)!;
        const opps = (prev ?? s).players.filter(p => p.team !== src.team);
        const lofted = s.pass.kind === "cross" || s.pass.kind === "long_ball" || !!s.pass.lofted;
        pending = { kind: s.pass.lofted ? 'lofted' : s.pass.kind, team: src.team, from: src.id, intended: s.pass.toId ?? s.pass.intendedRunnerId, dist: s.pass.distance, lofted, pressure: holderPressure(src.x, src.y, opps), held: false };
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
      const key = runKey(d.type);
      if (!r || r.type !== key) {
        if (r) (r.type === "default" ? acc.holdDefault : acc.holdShort)[r.line].push(realT - r.since);
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
    acc.matches++;
    for (const r of runs.values()) (r.type === "default" ? acc.holdDefault : acc.holdShort)[r.line].push(realT - r.since);
    runs.clear();
  };
  void PITCH_WIDTH;
  return { tick, finish };
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]!; };
export const pct = (o: Outcome3) => { const n = o[0] + o[1] + o[2]; return n ? (100 * o[0]) / n : 0; };
