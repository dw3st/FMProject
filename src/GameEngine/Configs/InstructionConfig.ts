/**
 * Team and player instructions in the engine (rebuild stage 20, the 4c proposal; `tactical-config.md` → "Stage 20").
 *
 * The per-team store follows the pattern of `AttackConfig.ts` / `DefenseConfig.ts`: `applyTeamAttackConfig` writes it
 * (the resolved levels of `src/Domain/tactics/teamInstructions.ts`), the consumers read small multipliers from it.
 * Two kinds of value:
 * - `instrDelta(team, key)` — the level minus the style's template (× the group's familiarity), for the new
 *   instructions: the template is the game as it was, so it reads 0 there;
 * - `instrExtra(team, key)` — the step beyond the axis value at ±2 (−1 / 0 / +1), for the instructions that are the
 *   old axes (their −1 / 0 / +1 already pick the axis value).
 * Every effect is a multiplier of 1 (or an addition of 0) at 0, and the consumers read nothing new then (no draw).
 * `INSTRUCTION_OVERRIDES='{"SHOT_STEP":1.3}'` (env, read once at load) tunes the numbers.
 */
import { registerEngineMemory } from '@/GameEngine/Support/EngineMemory';
import type { GamePlayer, TeamId } from '@/GameEngine/types';
import type { PlayFocus, TacticalStyle } from '@/types/tacticsTypes';
import {
  GROUP_OF, axisExtraOf, styleTemplate, type InstructionGroup, type InstructionKey, type InstructionLevels,
  type ResolvedInstructions,
} from '@/Domain/tactics/teamInstructions';
import { DECISION_FLAGS } from '@/GameEngine/Configs/DecisionConfig';

export const INSTR = {
  // ── With the ball (multiplier steps per level of difference from the template) ──
  /** Shoot on sight: the shot / chip × SHOT_STEP^(d/2) (FM: one notch of three = ×1.25). */
  SHOT_STEP: 1.25,
  /** Dribble more: dribble, cut inside, round the keeper, spin × (1 + DRIBBLE · d). */
  DRIBBLE: 0.075,
  /** Tempo: hold, shield, turn × (1 − TEMPO_HOLD · d); carry and sprint × (1 + TEMPO_CARRY · d) (FM: almost nothing). */
  TEMPO_HOLD: 0.05,
  TEMPO_CARRY: 0.025,
  /** Pass into space: a through ball × (1 + SPACE_TB · d), a pass to feet × (1 − SPACE_FEET · d). */
  SPACE_TB: 0.06,
  SPACE_FEET: 0.03,
  /** Focus of play: a pass, through ball or carry into the chosen band × FOCUS. */
  FOCUS: 1.08,
  /** The bands (yd from the centre line y 37): a flank is beyond FLANK_YD, the centre within CENTRE_YD. */
  FOCUS_FLANK_YD: 12,
  FOCUS_CENTRE_YD: 12,
  /** Crossing: early (d < 0) = a cross from more than CROSS_NEAR_YD before the end line × (1 + CROSS_EARLY · |d|),
   *  the byline run × (1 − CROSS_EARLY_BYLINE · |d|); byline (d > 0) the reverse. */
  CROSS_EARLY: 0.06,
  CROSS_EARLY_BYLINE: 0.05,
  CROSS_NEAR_YD: 12,
  CROSS_NEAR_BONUS: 0.03,
  /** Passing beyond direct / short (±2): a long ball or lofted pass × (1 + PASS_EXTRA · extra). */
  PASS_EXTRA: 0.06,
  /** Freedom: positional freedom 0.5 + FREEDOM · d (FM: expressive frees the forwards); hold_space of MID / FWD
   *  × (1 − FREEDOM_HOLD · d). */
  FREEDOM: 0.075,
  FREEDOM_HOLD: 0.06,
  /** Keeper distribution: his long ball × (1 + GK_LONG · d) (×0.6 / ×1.4 at ±2). */
  GK_LONG: 0.2,
  /** Overlap (d > 0) / underlap (d < 0) of the full-backs: the attacking anchor + OVERLAP_DX · d yd ahead, or
   *  UNDERLAP_IN · |d| yd inside; their make_run × (1 + FLANK_RUN · |d|). Half the role variants' offsets. */
  OVERLAP_DX: 3,
  UNDERLAP_IN: 3.5,
  FLANK_RUN: 0.08,
  /** Width beyond wide / narrow (±2): attacking width + WIDTH_EXTRA · extra (0.6 is the formation as drawn). */
  WIDTH_EXTRA: 0.03,
  /** Saved mentality: carry threshold − MENT_CARRY · m; hold × (1 − MENT_HOLD · m); + MENT_SHIFT · m on the deltas
   *  of line, engagement, tempo and on winning the ball (a bundle, as FM's). */
  MENT_CARRY: 0.025,
  MENT_HOLD: 0.05,
  MENT_SHIFT: 0.5,

  // ── Transition (windows of game seconds after the ball changes side) ──
  /** Seconds after winning the ball that `onWin` acts; after losing it that `onLoss` acts. */
  WIN_WINDOW_S: 6,
  LOSS_WINDOW_S: 5,
  /** onLoss: press_holder × (1 + LOSS_PRESS · d), step_into_carry_lane × (1 + LOSS_STEP · d), hold_shape × (1 − LOSS_HOLD · d). */
  LOSS_PRESS: 0.15,
  LOSS_STEP: 0.08,
  LOSS_HOLD: 0.05,
  /** onWin: carry, sprint, through ball, long ball × (1 + WIN_FORWARD · d); hold, turn, shield × (1 − WIN_HOLD · d);
   *  off the ball make_run × (1 + WIN_RUN · d), hold_space × (1 − WIN_STAY · d). */
  WIN_FORWARD: 0.05,
  WIN_HOLD: 0.06,
  WIN_RUN: 0.12,
  WIN_STAY: 0.05,
  /** Any style: the counter-attack / press-now intent fires with this chance per level of difference (≤ 2 levels). */
  INTENT_PER_LEVEL: 0.2,

  // ── Without the ball ──
  /** Engagement: the press range (yd) of the axis value + ENGAGE_RANGE_YD · extra; the calm press in the
   *  opponent's own third × (1 + ENGAGE_OWN · e), in the middle × (1 + ENGAGE_MID · e), e = extra + delta of mentality. */
  ENGAGE_RANGE_YD: 2,
  ENGAGE_OWN: 0.2,
  ENGAGE_MID: 0.1,
  /** Pressing beyond the axis (±2): press_holder × (1 + PRESS_EXTRA · extra). */
  PRESS_EXTRA: 0.12,
  /** Line beyond deep / high (±2): DEFENSIVE_LINE_HEIGHT + LINE_EXTRA · (extra + mentality shift). */
  LINE_EXTRA: 0.05,
  /** Tackling beyond (±2): TACKLE_AGGRESSION + TACKLE_EXTRA · extra; staying on feet skips a tackle chance
   *  TACKLE_SKIP · |d| (d < 0); getting stuck in reaches TACKLE_REACH_YD · d further (d > 0). */
  TACKLE_EXTRA: 0.1,
  TACKLE_SKIP: 0.05,
  TACKLE_REACH_YD: 0.15,
  /** Defensive width beyond (±2): HORIZONTAL_COMPACTNESS − DEFWIDTH_EXTRA · extra. */
  DEFWIDTH_EXTRA: 0.08,
  /** Trap (inside d < 0, outside d > 0): the block's anchor shifts TRAP_SHIFT_YD · d toward the centre (outside, the
   *  wing left open) or the touchline (inside) with the ball wide; step_into_carry_lane × (1 + TRAP_STEP · |d|) when
   *  the holder is in the trap's zone (wide for outside, central for inside). */
  TRAP_SHIFT_YD: 1.5,
  TRAP_STEP: 0.08,
  TRAP_WIDE_YD: 20,
  TRAP_CENTRE_YD: 12,
  /** Crosses (stop d < 0, invite d > 0): a wide holder within CROSS_ZONE_YD of our end line — wide defenders'
   *  press_holder × (1 − CROSSES_PRESS · d), centre-backs' hold_shape × (1 + CROSSES_HOLD · d). */
  CROSSES_PRESS: 0.1,
  CROSSES_HOLD: 0.06,
  CROSSES_ZONE_YD: 35,
  CROSSES_WIDE_YD: 18,

  /** A delta is clamped to this (a template at −1 moved to +2 is 3 levels away). */
  MAX_DELTA: 2.5,
};

try {
  const raw = typeof process !== 'undefined' ? process.env?.INSTRUCTION_OVERRIDES : undefined;
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(INSTR) as (keyof typeof INSTR)[]) {
      if (typeof parsed[k] === 'number') (INSTR as Record<string, number>)[k] = parsed[k] as number;
    }
  }
} catch { /* ignore a malformed override */ }

// ── Per-team store ────────────────────────────────────────────────────────────

interface TeamInstructionState {
  style: TacticalStyle;
  levels: InstructionLevels;
  template: InstructionLevels;
  focus: PlayFocus;
  mentality: number;
  /** Familiarity scale of each group (stage 4c-7): 1 = full effect. */
  fam: Record<InstructionGroup, number>;
}

function templateState(style: TacticalStyle): TeamInstructionState {
  const t = styleTemplate(style);
  return { style, levels: { ...t.levels }, template: { ...t.levels }, focus: t.focus, mentality: 0, fam: { inPossession: 1, transition: 1, outOfPossession: 1 } };
}

const TEAM: Record<TeamId, TeamInstructionState> = { A: templateState('balanced'), B: templateState('balanced') };

/** Bumped on every write of a team's instructions: readers that cache derived values (`DefenseConfig.ts`) key on it. */
const VERSION: Record<TeamId, number> = { A: 0, B: 0 };
export function instrVersion(team: TeamId): number { return VERSION[team]; }

/** Write a team's instructions (called by `applyTeamAttackConfig`; nothing given = the style's template). */
export function setTeamInstructions(
  team: TeamId,
  r: ResolvedInstructions,
  fam?: Partial<Record<InstructionGroup, number>>,
): void {
  TEAM[team] = {
    style: r.style, levels: { ...r.levels }, template: { ...r.template }, focus: r.focus, mentality: r.mentality,
    fam: { inPossession: fam?.inPossession ?? 1, transition: fam?.transition ?? 1, outOfPossession: fam?.outOfPossession ?? 1 },
  };
  VERSION[team]++;
}

/** Change only the levels and the mentality during a match (the AI's rule): the axes stay as applied. */
export function setTeamInstructionLevels(team: TeamId, levels: Partial<InstructionLevels>, mentality: number): void {
  const st = TEAM[team];
  st.levels = { ...st.levels, ...levels };
  st.mentality = mentality;
  VERSION[team]++;
}

/** The levels a team plays now (for the UI of `/test` and the lab). */
export function getTeamInstructions(team: TeamId): Readonly<TeamInstructionState> {
  return TEAM[team];
}

const MENT_KEYS: ReadonlySet<InstructionKey> = new Set(['line', 'engagement', 'tempo', 'onWin']);

/** Level minus template × the group's familiarity, + the mentality's share; 0 with the flag off. */
export function instrDelta(team: TeamId, key: InstructionKey): number {
  if (!DECISION_FLAGS.TEAM_INSTRUCTIONS) return 0;
  const st = TEAM[team];
  let d = (st.levels[key] - st.template[key]) * st.fam[GROUP_OF[key]];
  if (st.mentality !== 0 && MENT_KEYS.has(key)) d += INSTR.MENT_SHIFT * st.mentality;
  return Math.max(-INSTR.MAX_DELTA, Math.min(INSTR.MAX_DELTA, d));
}

/** The step beyond an axis value at ±2 (−1 / 0 / +1) × the group's familiarity; 0 with the flag off. */
export function instrExtra(team: TeamId, key: InstructionKey): number {
  if (!DECISION_FLAGS.TEAM_INSTRUCTIONS) return 0;
  const st = TEAM[team];
  return axisExtraOf(st.levels[key]) * st.fam[GROUP_OF[key]];
}

/** The saved mentality level (0 with the flag off). */
export function instrMentality(team: TeamId): number {
  return DECISION_FLAGS.TEAM_INSTRUCTIONS ? TEAM[team].mentality : 0;
}

export function instrFocus(team: TeamId): PlayFocus {
  return DECISION_FLAGS.TEAM_INSTRUCTIONS ? TEAM[team].focus : 'mixed';
}

/** A player's own level of a player instruction (slot), as a delta from the team's template; the team's otherwise. */
export function playerDelta(player: GamePlayer, key: 'shooting' | 'dribbling' | 'crossing' | 'freedom'): number {
  if (!DECISION_FLAGS.TEAM_INSTRUCTIONS) return 0;
  const own = key === 'freedom' ? player.instruction?.positioning : player.instruction?.[key];
  if (own === undefined) return instrDelta(player.team, key);
  const st = TEAM[player.team];
  const d = (own - st.template[key]) * st.fam[GROUP_OF[key]];
  return Math.max(-INSTR.MAX_DELTA, Math.min(INSTR.MAX_DELTA, d));
}

// ── Transition clock (written by the tick loop) ──────────────────────────────

let _onBall: TeamId | null = null;
let _possessionTime = Infinity;
/** The last side that had the ball (a loose ball keeps it) and when each side last lost it (match time). */
let _lastOwner: TeamId | null = null;
const _lostAt: Record<TeamId, number> = { A: -Infinity, B: -Infinity };

/**
 * The team on the ball and how long it has had it (game seconds); `null` = nobody (a loose ball, a restart). Returns
 * the change of owner, if any: the side that won it and the seconds since it last lost it (the counter-press regain).
 */
export function setPossessionClock(team: TeamId | null, possessionTime: number, matchTime = 0): { won: TeamId; sinceLost: number } | null {
  _onBall = team;
  _possessionTime = possessionTime;
  if (team === null || team === _lastOwner) return null;
  const prev = _lastOwner;
  _lastOwner = team;
  if (prev === null) return null;
  _lostAt[prev] = matchTime;
  return { won: team, sinceLost: matchTime - _lostAt[team] };
}

/** 'won' while the team has had the ball less than WIN_WINDOW_S, 'lost' while the other has had it less than LOSS_WINDOW_S. */
export function transitionOf(team: TeamId): 'won' | 'lost' | null {
  if (_onBall === null) return null;
  if (_onBall === team) return _possessionTime < INSTR.WIN_WINDOW_S ? 'won' : null;
  return _possessionTime < INSTR.LOSS_WINDOW_S ? 'lost' : null;
}

/** Seconds the team has had the ball (Infinity when it has not got it). */
export function secondsOnBall(team: TeamId): number {
  return _onBall === team ? _possessionTime : Infinity;
}

/** An empty clock (a new match). */
export function resetInstructionState(): void {
  _onBall = null;
  _possessionTime = Infinity;
  _lastOwner = null;
  _lostAt.A = -Infinity;
  _lostAt.B = -Infinity;
}

// Live-mode snapshots (stage 19): the instruction store and the transition clock are match state. Importing the
// store bumps the version so the cached derived configs (`DefenseConfig.ts`) are rebuilt.
registerEngineMemory('InstructionConfig.TEAM', {
  export: () => structuredClone(TEAM),
  import: (v) => {
    const t = structuredClone(v as typeof TEAM);
    TEAM.A = t.A;
    TEAM.B = t.B;
    VERSION.A++;
    VERSION.B++;
  },
});
registerEngineMemory('InstructionConfig.clock', {
  export: () => ({ onBall: _onBall, time: _possessionTime, last: _lastOwner, lostA: _lostAt.A, lostB: _lostAt.B }),
  import: (v) => {
    const c = v as { onBall: TeamId | null; time: number; last?: TeamId | null; lostA?: number; lostB?: number };
    _onBall = c.onBall;
    _possessionTime = c.time;
    _lastOwner = c.last ?? null;
    _lostAt.A = c.lostA ?? -Infinity;
    _lostAt.B = c.lostB ?? -Infinity;
  },
});

// ── Holder: one multiplier per candidate (`DecisionTree.ts` → `fmHolderChoice`) ──

export interface HolderCandidateInfo {
  /** FM category (0 pass, 1 kick, 2 turn, 3 hold, 4 carry) and the candidate kind. */
  cat: number;
  kind: string;
  /** Where the ball goes (pass / cell / carry 8 yd ahead); null = in place. */
  targetY: number | null;
  /** Yards from the holder to the end line he attacks. */
  toEnd: number;
  /** A pass that goes backward (progress ≤ 0.3). */
  backward: boolean;
}

const DRIBBLE_KINDS = new Set(['dribble', 'cut_inside', 'round_keeper', 'spin']);
const HOLD_KINDS = new Set(['hold', 'shield', 'turn']);
const CARRY_KINDS = new Set(['carry', 'sprint']);

/** In a band of the pitch for the focus of play, from the attacking side's point of view (its left is low y going +x). */
export function inFocusBand(focus: PlayFocus, y: number, attackDir: 1 | -1): boolean {
  const off = (y - 37) * attackDir; // < 0 = the team's left
  switch (focus) {
    case 'left': return off < -INSTR.FOCUS_FLANK_YD;
    case 'right': return off > INSTR.FOCUS_FLANK_YD;
    case 'wings': return Math.abs(off) > INSTR.FOCUS_FLANK_YD;
    case 'center': return Math.abs(off) < INSTR.FOCUS_CENTRE_YD;
    default: return false;
  }
}

/**
 * The instructions' multiplier on one holder candidate (its category multiplier, so a candidate already at value 1
 * still moves). 1 with every instruction at the template.
 */
export function holderInstructionMult(player: GamePlayer, c: HolderCandidateInfo): number {
  if (!DECISION_FLAGS.TEAM_INSTRUCTIONS) return 1;
  const team = player.team;
  let m = 1;
  const kind = c.kind;
  // Shooting (player level first).
  if (c.cat === 1) {
    const d = playerDelta(player, 'shooting');
    if (d !== 0) m *= INSTR.SHOT_STEP ** (d / 2);
  }
  if (DRIBBLE_KINDS.has(kind)) {
    const d = playerDelta(player, 'dribbling');
    if (d !== 0) m *= 1 + INSTR.DRIBBLE * d;
  }
  const tempo = instrDelta(team, 'tempo');
  if (tempo !== 0) {
    if (HOLD_KINDS.has(kind)) m *= 1 - INSTR.TEMPO_HOLD * tempo;
    else if (CARRY_KINDS.has(kind)) m *= 1 + INSTR.TEMPO_CARRY * tempo;
  }
  const ment = instrMentality(team);
  if (ment !== 0 && (kind === 'hold' || kind === 'shield')) m *= 1 - INSTR.MENT_HOLD * ment;
  const space = instrDelta(team, 'passTarget');
  if (space !== 0) {
    if (kind === 'through_ball') m *= 1 + INSTR.SPACE_TB * space;
    else if (kind === 'pass' || kind === 'pass_lofted') m *= 1 - INSTR.SPACE_FEET * space;
  }
  const passEx = instrExtra(team, 'passing');
  if (passEx !== 0 && (kind === 'long_ball' || kind === 'pass_lofted')) m *= 1 + INSTR.PASS_EXTRA * passEx;
  const cross = playerDelta(player, 'crossing');
  if (cross !== 0) {
    const near = c.toEnd <= INSTR.CROSS_NEAR_YD;
    if (kind === 'cross') {
      if (cross < 0) m *= near ? 1 : 1 + INSTR.CROSS_EARLY * -cross;
      else m *= near ? 1 + INSTR.CROSS_NEAR_BONUS * cross : 1 - INSTR.CROSS_EARLY_BYLINE * cross;
    } else if (kind === 'byline') {
      m *= cross < 0 ? 1 - INSTR.CROSS_EARLY_BYLINE * -cross : 1 + INSTR.CROSS_EARLY * cross;
    }
  }
  const focus = instrFocus(team);
  if (focus !== 'mixed' && c.targetY !== null && (c.cat === 0 || c.cat === 4) && kind !== 'cross' && kind !== 'long_ball'
      && inFocusBand(focus, c.targetY, player.attackDir)) {
    m *= INSTR.FOCUS;
  }
  if (transitionOf(team) === 'won') {
    const w = instrDelta(team, 'onWin');
    if (w !== 0) {
      if (CARRY_KINDS.has(kind) || kind === 'through_ball' || kind === 'long_ball') m *= 1 + INSTR.WIN_FORWARD * w;
      else if (HOLD_KINDS.has(kind) || (c.backward && c.cat === 0)) m *= 1 - INSTR.WIN_HOLD * w;
    }
  }
  return Math.max(0.05, m);
}
