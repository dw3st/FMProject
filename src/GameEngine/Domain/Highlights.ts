/**
 * Highlight layer (stage 18, `.claude/rules/game-engine/highlights.md`): a pure classifier that turns a match's event
 * stream plus one small sample per tick into "lance" windows, each with a kind, a level and a start a few seconds
 * before what triggered it.
 *
 * - Levels nest: `main` (goals, clear chances, penalties, reds, a disallowed goal) ⊂ `extended` (+ shots, big saves,
 *   corners, dangerous free kicks, yellows, VAR checks, injuries) ⊂ `full` (+ crosses into the box, attacks that sit in
 *   the final third, offsides). A window carries the most important level of the triggers merged into it.
 * - Windows never overlap: a trigger inside an open window extends it (or only upgrades it, see `apply`); one shortly
 *   after a closed window of the same or lower importance reopens it.
 * - Times are sim seconds of live play (`HighlightConfig.ts`). No dice, no globals: the same input gives the same
 *   windows live and headless. The state is plain data (`cloneHighlightState`), for the replay of stage 19.
 *
 * Wiring (gameBus → triggers, `GameState` → `HighlightSample`) lives in `HighlightTracker.ts`.
 */
import { HIGHLIGHT_CONFIG, type HighlightConfig } from '@/GameEngine/Configs/HighlightConfig';
import type { TeamId } from '@/GameEngine/types';

export type HighlightLevel = 'main' | 'extended' | 'full';
export const HIGHLIGHT_LEVELS: readonly HighlightLevel[] = ['main', 'extended', 'full'];

export type HighlightTrigger =
  | 'goal' | 'penalty' | 'red_card' | 'goal_disallowed' | 'clear_chance'
  | 'big_save' | 'shot' | 'var' | 'injury' | 'yellow_card' | 'corner' | 'free_kick'
  | 'cross' | 'attack' | 'offside' | 'kickoff';

type PreRoll = 'spell' | 'set_piece' | 'incident' | 'period';

/** Level and pre-roll of each trigger; the order of the keys is the priority (first = most important). */
export const HIGHLIGHT_TRIGGERS: Readonly<Record<HighlightTrigger, { level: HighlightLevel; pre: PreRoll }>> = {
  goal:            { level: 'main',     pre: 'spell' },
  penalty:         { level: 'main',     pre: 'set_piece' },
  red_card:        { level: 'main',     pre: 'incident' },
  goal_disallowed: { level: 'main',     pre: 'incident' },
  clear_chance:    { level: 'main',     pre: 'spell' },
  big_save:        { level: 'extended', pre: 'spell' },
  shot:            { level: 'extended', pre: 'spell' },
  var:             { level: 'extended', pre: 'incident' },
  injury:          { level: 'extended', pre: 'incident' },
  yellow_card:     { level: 'extended', pre: 'incident' },
  corner:          { level: 'extended', pre: 'set_piece' },
  free_kick:       { level: 'extended', pre: 'set_piece' },
  cross:           { level: 'full',     pre: 'spell' },
  attack:          { level: 'full',     pre: 'spell' },
  offside:         { level: 'full',     pre: 'incident' },
  // The break and the kick-off of the second half and of each extra-time half: every level shows them.
  kickoff:         { level: 'main',     pre: 'period' },
};
const PRIORITY = Object.keys(HIGHLIGHT_TRIGGERS) as HighlightTrigger[];
const levelRank = (l: HighlightLevel): number => HIGHLIGHT_LEVELS.indexOf(l);
const prio = (k: HighlightTrigger): number => PRIORITY.indexOf(k);

export interface Highlight {
  id: number;
  /** The most important trigger of the window. */
  kind: HighlightTrigger;
  level: HighlightLevel;
  /** Side the lance is about (the attacking side, the side booked, the injured side…); null when unknown. */
  team: TeamId | null;
  /** Window in sim seconds of live play. */
  start: number;
  end: number;
  /** Match minute of the first trigger (display). */
  minute: number;
  /** Every trigger merged into the window, in order. */
  triggers: HighlightTrigger[];
}

/** One tick of the match as the classifier needs it. */
export interface HighlightSample {
  /** Sim seconds of the tick. */
  dt: number;
  /** The ball can be in play (the four live periods). */
  live: boolean;
  minute: number;
  /** Side in control of the ball (holder, passer, shooter, set-piece taker); null while the ball is loose. */
  possession: TeamId | null;
  ballX: number;
  ballY: number;
  /** Direction team A attacks (+1 = towards x = 115). */
  attackDirA: 1 | -1;
  /** A restart freeze is on (set piece countdown, VAR review). */
  deadBall: boolean;
}

interface OpenWindow extends Highlight {
  /** Time of the last trigger that extended the window. */
  lastT: number;
  /** Side whose spell the window follows (turnover closes it); null for incidents. */
  spellTeam: TeamId | null;
  /** Fixed close time (after a goal). */
  closeAt: number | null;
}

export interface HighlightState {
  clock: number;
  liveSeconds: number;
  minute: number;
  nextId: number;
  closed: Highlight[];
  open: OpenWindow | null;
  pending: Array<{ trigger: HighlightTrigger; team: TeamId | null }>;
  poss: { team: TeamId | null; since: number };
  deadSince: number | null;
  /** Final-third / box time of the current spell, and the spell (its `poss.since`) an attack already fired for. */
  thirdSince: number | null;
  boxSince: number | null;
  firedSpell: number | null;
  /** Clock where the current period began (the end of the one before: the break is at that clock). */
  periodStart?: number;
  /** The last tick was a dead phase (half time, the extra-time break). */
  dead?: boolean;
}

export function createHighlightState(): HighlightState {
  return {
    clock: 0, liveSeconds: 0, minute: 0, nextId: 1, closed: [], open: null, pending: [],
    poss: { team: null, since: 0 }, deadSince: null, thirdSince: null, boxSince: null, firedSpell: null,
  };
}

/** Deep copy (plain data). */
export function cloneHighlightState(s: HighlightState): HighlightState {
  return structuredClone(s);
}

/** Queues a trigger; it is placed at the end of the tick it was emitted in (`highlightTick`). */
export function highlightEvent(s: HighlightState, trigger: HighlightTrigger, team: TeamId | null): void {
  s.pending.push({ trigger, team });
}

function startOf(s: HighlightState, trigger: HighlightTrigger, team: TeamId | null, cfg: HighlightConfig): number {
  const t = s.clock;
  const pre = HIGHLIGHT_TRIGGERS[trigger].pre;
  let start: number;
  if (pre === 'set_piece') start = t - cfg.SET_PIECE_PRE_S;
  else if (pre === 'incident') start = t - cfg.INCIDENT_PRE_S;
  else if (pre === 'period') start = s.periodStart ?? t;
  else {
    const anchor = team !== null && s.poss.team === team ? s.poss.since - cfg.SPELL_LEAD_S : t - cfg.PRE_MAX_S / 2;
    start = Math.min(t - cfg.PRE_MIN_S, Math.max(t - cfg.PRE_MAX_S, anchor));
  }
  return Math.max(0, start);
}

function closeOpen(s: HighlightState, end: number): void {
  const w = s.open;
  if (!w) return;
  const { lastT: _l, spellTeam: _s, closeAt: _c, ...h } = w;
  s.closed.push({ ...h, end: Math.max(h.start, Math.min(end, s.clock)) });
  s.open = null;
}

function upgrade(w: OpenWindow, trigger: HighlightTrigger, team: TeamId | null): void {
  const info = HIGHLIGHT_TRIGGERS[trigger];
  if (levelRank(info.level) < levelRank(w.level)) w.level = info.level;
  if (prio(trigger) < prio(w.kind)) { w.kind = trigger; if (team !== null) w.team = team; }
  w.triggers.push(trigger);
}

function apply(s: HighlightState, trigger: HighlightTrigger, team: TeamId | null, cfg: HighlightConfig): void {
  const info = HIGHLIGHT_TRIGGERS[trigger];
  const spellTeam = info.pre === 'spell' && team !== null ? team : null;
  const start = startOf(s, trigger, team, cfg);
  const w = s.open;
  if (w) {
    // A less important trigger inside an open window only rides along (it never stretches a goal's window).
    if (levelRank(info.level) > levelRank(w.level)) { w.triggers.push(trigger); return; }
    upgrade(w, trigger, team);
    const floor = s.closed.length ? s.closed[s.closed.length - 1]!.end : 0;
    w.start = Math.min(w.start, Math.max(start, floor));
    w.lastT = s.clock;
    if (spellTeam) w.spellTeam = spellTeam;
  } else {
    const prev = s.closed[s.closed.length - 1];
    // The kick-off lance never reopens the last lance of the half (it would lift it to the main level).
    if (prev && trigger !== 'kickoff' && start <= prev.end + cfg.MERGE_GAP_S && levelRank(info.level) <= levelRank(prev.level)) {
      s.closed.pop();
      const re: OpenWindow = { ...prev, triggers: [...prev.triggers], lastT: s.clock, spellTeam, closeAt: null };
      upgrade(re, trigger, team);
      s.open = re;
    } else {
      s.open = {
        id: s.nextId++, kind: trigger, level: info.level, team, start: Math.max(start, prev?.end ?? 0), end: s.clock,
        minute: s.minute, triggers: [trigger], lastT: s.clock, spellTeam, closeAt: null,
      };
    }
  }
  if (trigger === 'goal') s.open!.closeAt = s.clock + cfg.POST_GOAL_S;
}

function inFinalThird(x: number, dir: 1 | -1, cfg: HighlightConfig): boolean {
  return dir === 1 ? x >= 115 - cfg.FINAL_THIRD_YD : x <= cfg.FINAL_THIRD_YD;
}
function inBox(x: number, y: number, dir: 1 | -1, cfg: HighlightConfig): boolean {
  const depth = dir === 1 ? 115 - x : x;
  return depth <= cfg.BOX_DEPTH_YD && Math.abs(y - 37) <= cfg.BOX_HALF_WIDTH_YD;
}

/** Advances the classifier by one tick; the triggers queued since the last tick are placed at this tick's end. */
export function highlightTick(s: HighlightState, x: HighlightSample, cfg: HighlightConfig = HIGHLIGHT_CONFIG): void {
  if (!x.live) {
    // Half-time, full time: the open lance ends where the play stopped; triggers of a dead phase are dropped.
    if (s.open && s.open.closeAt === null) closeOpen(s, s.clock);
    else if (s.open) closeOpen(s, s.open.closeAt!);
    s.pending = [];
    s.deadSince = null;
    s.thirdSince = s.boxSince = null;
    s.dead = true;
    return;
  }
  // A period after a break begins: a lance from the break (the page plays the half-time show) to the kick-off.
  const resumed = s.dead === true && s.liveSeconds > 0;
  if (resumed) { s.periodStart = s.clock; s.pending.unshift({ trigger: 'kickoff', team: null }); }
  s.dead = false;
  s.clock += x.dt;
  s.liveSeconds += x.dt;
  s.minute = x.minute;
  const t = s.clock;

  if (x.possession !== null && x.possession !== s.poss.team) {
    s.poss = { team: x.possession, since: t };
    s.thirdSince = s.boxSince = null;
  }
  if (x.deadBall) { if (s.deadSince === null) s.deadSince = t; } else s.deadSince = null;

  const pending = s.pending;
  s.pending = [];
  for (const p of pending) apply(s, p.trigger, p.team, cfg);

  // Full level: an attack that sits in the final third (or reaches the box), once per spell.
  const team = s.poss.team;
  if (team !== null && !x.deadBall) {
    const dir = (team === 'A' ? x.attackDirA : -x.attackDirA) as 1 | -1;
    if (inFinalThird(x.ballX, dir, cfg)) s.thirdSince ??= t; else s.thirdSince = null;
    if (inBox(x.ballX, x.ballY, dir, cfg)) s.boxSince ??= t; else s.boxSince = null;
    const sat = (s.thirdSince !== null && t - s.thirdSince >= cfg.ATTACK_FINAL_THIRD_S)
      || (s.boxSince !== null && t - s.boxSince >= cfg.ATTACK_BOX_S);
    if (sat && s.firedSpell !== s.poss.since) {
      s.firedSpell = s.poss.since;
      apply(s, 'attack', team, cfg);
    }
  }

  const w = s.open;
  if (!w) return;
  if (w.closeAt !== null) { if (t >= w.closeAt) closeOpen(s, w.closeAt); return; }
  if (t >= w.lastT + cfg.POST_MAX_S) { closeOpen(s, w.lastT + cfg.POST_MAX_S); return; }
  if (t < w.lastT + cfg.POST_MIN_S) return;
  const floor = w.lastT + cfg.POST_MIN_S;
  if (s.deadSince !== null && s.deadSince > w.lastT && t >= s.deadSince + cfg.DEAD_TAIL_S) {
    closeOpen(s, Math.max(floor, s.deadSince + cfg.DEAD_TAIL_S));
    return;
  }
  const lost = s.poss.team !== null && s.poss.since > w.lastT && (w.spellTeam === null || s.poss.team !== w.spellTeam);
  if (lost && t - s.poss.since >= cfg.LOSS_HOLD_S) closeOpen(s, Math.max(floor, s.poss.since + cfg.TURNOVER_TAIL_S));
}

/** Closed windows plus the open one (closed at the current clock), in order. */
export function highlightsOf(s: HighlightState): Highlight[] {
  const out = s.closed.map(h => ({ ...h, triggers: [...h.triggers] }));
  if (s.open) {
    const { lastT: _l, spellTeam: _s, closeAt: _c, ...h } = s.open;
    out.push({ ...h, triggers: [...h.triggers], end: Math.max(h.start, s.clock) });
  }
  return out;
}

/** Windows shown at `level` (the levels nest: `full` shows everything). */
export function highlightsAtLevel(list: readonly Highlight[], level: HighlightLevel): Highlight[] {
  return list.filter(h => levelRank(h.level) <= levelRank(level));
}

export interface HighlightLevelSummary { count: number; seconds: number; share: number }

/** Lances and seconds shown at each level (cumulative), and the share of the live play they cover. */
export function summarizeHighlights(list: readonly Highlight[], liveSeconds: number): Record<HighlightLevel, HighlightLevelSummary> {
  const out = {} as Record<HighlightLevel, HighlightLevelSummary>;
  for (const level of HIGHLIGHT_LEVELS) {
    const at = highlightsAtLevel(list, level);
    const seconds = at.reduce((a, h) => a + (h.end - h.start), 0);
    out[level] = { count: at.length, seconds, share: liveSeconds > 0 ? seconds / liveSeconds : 0 };
  }
  return out;
}

/** The first window at `level` that starts after `clock` (the "next lance"), or null. */
export function nextHighlight(list: readonly Highlight[], clock: number, level: HighlightLevel): Highlight | null {
  return highlightsAtLevel(list, level).find(h => h.start > clock + 1e-6) ?? null;
}
