/**
 * Instruction matrix (Etapa 27, `.claude/rules/game/player-instructions.md`) — pure data and
 * summaries, no engine import (shared by `scripts/instruction-matrix.ts` and the lab's `/matrix`
 * "Instructions" mode).
 *
 * A task plays one formation with the SAME club on both sides: side X with an instruction set
 * (role variant on the symmetric slots of a role, pressing, a random package, man-marking), side Y
 * with the default (or the same set, in the mirror). Each side tracks a list of slots (the slots the
 * instruction changes; for man-marking, the marked target's slot) so the variant's signature is the
 * X slots against the very same Y slots in the same matches.
 */

/** Per-slot counters, summed over the tracked slots of one side. */
export interface SlotAgg {
  passes: number;
  passesReceived: number;
  shots: number;
  shotsInBox: number;
  goals: number;
  crosses: number;
  tackles: number;
  aerialDuels: number;
  /** Ticks the slot player spent pressing (decision `press`). */
  pressTicks: number;
  /** Ticks the slot player carried the ball (holder with decision `carry`). */
  carryTicks: number;
  /** Sum / count of the slot player's x in the attacking frame while his team has the ball (not holding it). */
  posXSum: number;
  /** Sum of |y − 37| while his team has the ball (not holding it). */
  posWidthSum: number;
  posSamples: number;
  /** Sum of (own x − mean x of the other back-line defenders), attacking frame, while defending. */
  lineDeltaSum: number;
  lineSamples: number;
  /** End-of-match energy of the slot players on the pitch at full time. */
  endEnergySum: number;
  endEnergyN: number;
  /** Minutes the slot players spent man-marked, and their touches/shots/goals while marked. */
  markedMinutes: number;
  markedShots: number;
}

export interface SideAgg {
  goals: number;
  shots: number;
  xg: number;
  slots: SlotAgg;
}

export interface InstrPairRaw {
  key: string;
  formation: string;
  /** `edge` = X instructed vs Y default; `mirror` = both sides with the same set; `base` = default mirror. */
  kind: "edge" | "mirror" | "base";
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  x: SideAgg;
  y: SideAgg;
}

export function emptySlotAgg(): SlotAgg {
  return {
    passes: 0, passesReceived: 0, shots: 0, shotsInBox: 0, goals: 0, crosses: 0, tackles: 0,
    aerialDuels: 0, pressTicks: 0, carryTicks: 0, posXSum: 0, posWidthSum: 0, posSamples: 0,
    lineDeltaSum: 0, lineSamples: 0, endEnergySum: 0, endEnergyN: 0, markedMinutes: 0, markedShots: 0,
  };
}

export function emptySideAgg(): SideAgg {
  return { goals: 0, shots: 0, xg: 0, slots: emptySlotAgg() };
}

export function emptyInstrPair(key: string, formation: string, kind: InstrPairRaw["kind"]): InstrPairRaw {
  return { key, formation, kind, matches: 0, wins: 0, draws: 0, losses: 0, x: emptySideAgg(), y: emptySideAgg() };
}

function addSlot(a: SlotAgg, b: SlotAgg): SlotAgg {
  const out = { ...a };
  for (const k of Object.keys(b) as (keyof SlotAgg)[]) out[k] = a[k] + b[k];
  return out;
}

function addSideAgg(a: SideAgg, b: SideAgg): SideAgg {
  return { goals: a.goals + b.goals, shots: a.shots + b.shots, xg: a.xg + b.xg, slots: addSlot(a.slots, b.slots) };
}

export function addInstrPair(a: InstrPairRaw, b: InstrPairRaw): InstrPairRaw {
  return {
    ...a,
    matches: a.matches + b.matches,
    wins: a.wins + b.wins, draws: a.draws + b.draws, losses: a.losses + b.losses,
    x: addSideAgg(a.x, b.x),
    y: addSideAgg(a.y, b.y),
  };
}

/** Merges pairs with the same key and kind (rounds summed from several files). */
export function mergeInstrPairs(pairs: InstrPairRaw[]): InstrPairRaw[] {
  const map = new Map<string, InstrPairRaw>();
  for (const p of pairs) {
    const k = `${p.kind}|${p.key}|${p.formation}`;
    map.set(k, map.has(k) ? addInstrPair(map.get(k)!, p) : p);
  }
  return [...map.values()];
}

/** Per-match slot metrics of one side (averages per match; positions per sample). */
export interface SlotView {
  passes: number;
  passesReceived: number;
  shots: number;
  shotsInBox: number;
  goals: number;
  crosses: number;
  tackles: number;
  aerialDuels: number;
  pressTicks: number;
  carryTicks: number;
  posX: number;
  width: number;
  lineDelta: number;
  endEnergy: number;
  markedMinutes: number;
}

export function slotView(s: SlotAgg, matches: number): SlotView {
  const m = Math.max(1, matches);
  return {
    passes: s.passes / m,
    passesReceived: s.passesReceived / m,
    shots: s.shots / m,
    shotsInBox: s.shotsInBox / m,
    goals: s.goals / m,
    crosses: s.crosses / m,
    tackles: s.tackles / m,
    aerialDuels: s.aerialDuels / m,
    pressTicks: s.pressTicks / m,
    carryTicks: s.carryTicks / m,
    posX: s.posSamples > 0 ? s.posXSum / s.posSamples : 0,
    width: s.posSamples > 0 ? s.posWidthSum / s.posSamples : 0,
    lineDelta: s.lineSamples > 0 ? s.lineDeltaSum / s.lineSamples : 0,
    endEnergy: s.endEnergyN > 0 ? s.endEnergySum / s.endEnergyN : 0,
    markedMinutes: s.markedMinutes / m,
  };
}

/** Summary of one pair: edge (V% − D% of X, p.p.), goals/shots per match per side, slot views. */
export interface InstrSummary {
  key: string;
  formation: string;
  kind: InstrPairRaw["kind"];
  matches: number;
  edge: number;
  goalsX: number;
  goalsY: number;
  shotsX: number;
  shotsY: number;
  /** Goals + shots per match of both sides together (the volume, for mirror / base pairs). */
  goals: number;
  shots: number;
  slotX: SlotView;
  slotY: SlotView;
}

export function summarizeInstr(p: InstrPairRaw): InstrSummary {
  const m = Math.max(1, p.matches);
  return {
    key: p.key,
    formation: p.formation,
    kind: p.kind,
    matches: p.matches,
    edge: (100 * (p.wins - p.losses)) / m,
    goalsX: p.x.goals / m,
    goalsY: p.y.goals / m,
    shotsX: p.x.shots / m,
    shotsY: p.y.shots / m,
    goals: (p.x.goals + p.y.goals) / m,
    shots: (p.x.shots + p.y.shots) / m,
    slotX: slotView(p.x.slots, p.matches),
    slotY: slotView(p.y.slots, p.matches),
  };
}

/** Relative change a vs b (fraction; 0 when b is 0). */
export function rel(a: number, b: number): number {
  return b === 0 ? 0 : a / b - 1;
}
