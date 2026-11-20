/**
 * DefenseConfig — per-team weights and thresholds for defensive shape.
 *
 * Covers: pressing_style, defensive_line, width.
 * build_up (passing / attack) lives in AttackConfig.ts.
 *
 * Consumers should call getDefenseConfig(team) rather than the legacy singleton.
 */

import type { TeamId } from '@/GameEngine/types';
import type { PressingStyle, DefensiveLine, TeamWidth, TacticalStyle, TacticalAxes, Mentality } from '@/types/tacticsTypes';
import { shiftAxesByMentality, DEFAULT_MENTALITY } from '@/types/tacticsTypes';
import type { TeamInstructions } from '@/types/tacticsTypes';
import { axesOfLevels, bucketOf, pressingStyleOf, resolveInstructions } from '@/Domain/tactics/teamInstructions';
import { DECISION_FLAGS } from '@/GameEngine/Configs/DecisionConfig';
import { INSTR, instrExtra, instrMentality, instrVersion } from '@/GameEngine/Configs/InstructionConfig';
import type { FamiliarityLevels } from '@/types/familiarityTypes';
import { familiarityFactor } from '@/Domain/familiarity/familiarity';
import {
  STYLE_FAMILIARITY_EFFECTS, HIGH_LINE_TRAP_EFFECT, HIGH_PRESS_STAMINA_MULT, applyAdd,
} from '@/GameEngine/Configs/FamiliarityConfig';
import { registerEngineMemory, recordPart } from '@/GameEngine/Support/EngineMemory';

// ── Default values ────────────────────────────────────────────────────────────

const DEFAULTS = {
  /** 0..1 — how deep the team defends. 0 = own box, 1 = high line. */
  DEFENSIVE_LINE_HEIGHT:  0.5,
  /** 0..1 — how far up the field players trigger pressing shape. */
  PRESSING_LINE_HEIGHT:   0.55,

  /** 0..1 — how much the block narrows toward the pitch center Y when defending. */
  HORIZONTAL_COMPACTNESS: 0.6,
  /** 0..1 — how tightly the defensive lines stack vertically. */
  VERTICAL_COMPACTNESS:   0.6,

  /** 0..1 — probability modifier for step-out pressing (applied in DecisionTree). */
  PRESS_INTENSITY:         0.5,
  /** Yds/s — max speed burst from acceleration when actively pressing (scales by 0..1 accel). */
  PRESS_ACCEL_SPEED_BOOST: 0.8,  // reduced 20% — matches CARRY_ACCEL_SPEED_BOOST
  /** 0..1 — aggression level for tackle attempts (applied in DecisionTree). */
  TACKLE_AGGRESSION:       0.4,
  /** Multiplier on the stamina cost of a `press` action (a high press tires the team more). */
  PRESS_STAMINA_MULT:      1,

  /** 0..1 — how strongly the block follows the ball's lateral (Y) position. */
  BLOCK_SHIFT_WEIGHT: 0.8,
  /** 0..1 — how much defenders shift X toward blocking central passing lanes. */
  LANE_BLOCK_WEIGHT:  0.4,

  /** 0..1 — max pull strength toward mark when threat is highest (opponent near own goal). */
  MARK_PULL_MAX: 0.90,
  /** 0..1 — min pull strength toward mark when threat is lowest (opponent far from goal). */
  MARK_PULL_MIN: 0.30,
  /** 0..1 — where on the ball→mark lane to position when threat is high (1 = at the mark). */
  MARK_LANE_T_CLOSE: 0.75,
  /** 0..1 — where on the ball→mark lane to position when threat is low (0 = at the ball). */
  MARK_LANE_T_FAR: 0.30,
  /** Yards from own goal at which threat reaches 0. */
  THREAT_HORIZON: 100,
};

export type DefenseConfigValues = { [K in keyof typeof DEFAULTS]: number };

/**
 * Man-marking (player instructions, `.claude/rules/game/player-instructions.md`): the tuning a
 * marker defends with while his team is out of possession. The only new constants of Etapa 27 —
 * a new mechanic, not a bias on top of an existing weight.
 */
export const MAN_MARK_CONFIG = {
  /** Floor on the marked target's threat: the marker stays tight even far from his own goal. */
  THREAT_FLOOR: 0.7,
  /** Marker's `track_mark` intent weight (replaces the role's). */
  TRACK_MARK_WEIGHT: 0.9,
  /** Marker's `hold_shape` intent weight (replaces the role's); `press_holder` stays the role's. */
  HOLD_SHAPE_WEIGHT: 0.3,
  /** Yards added to each side of the marker's X bounds (Y = full width: he follows the target). */
  X_BOUNDS_EXTENSION: 10,
  /**
   * Yards the marker stands from his target, goal-side and toward the ball (between the target and
   * both his own goal and the ball). The zonal lane-cut (`computeTrackMarkTarget`) leaves ~9 yds.
   */
  TIGHT_DISTANCE: 1,
  /**
   * 0..1 — how much the marker leans toward the ball rather than toward his own goal. Ball-side
   * puts him on the passing line to his target, where he can intercept (`resolveInterception`).
   */
  BALL_SIDE: 0.3,
  /** Yards the marker reads ahead along his target's run (toward the target's own target position). */
  ANTICIPATION: 4,
  /**
   * With his team on the ball the marker never goes past a point this many yards goal-side of his
   * target: he stays home for the turnover instead of joining the attack.
   */
  STAY_HOME_GAP: 12,
  /** 0..1 — how far he leans across toward the target's y while capped by the stay-home point. */
  STAY_HOME_Y_PULL: 0.7,
};

// ── Per-team storage ──────────────────────────────────────────────────────────

const TEAM_CONFIGS: Record<TeamId, DefenseConfigValues> = {
  A: { ...DEFAULTS },
  B: { ...DEFAULTS },
};

/** Stores the raw tactic key strings for each team so intent selection can look them up. */
const TEAM_TACTIC_KEYS: Record<TeamId, {
  /** Pressing intensity's axis value (the intent multipliers, the marking). */
  pressingStyle: PressingStyle;
  defensiveLine: DefensiveLine;
  /** Line of engagement's axis value (where the press starts: the press range), stage 20. */
  engagementStyle: PressingStyle;
}> = {
  A: { pressingStyle: 'mid_block', defensiveLine: 'normal', engagementStyle: 'mid_block' },
  B: { pressingStyle: 'mid_block', defensiveLine: 'normal', engagementStyle: 'mid_block' },
};

/** Returns the raw tactic key strings for intent multiplier lookup. */
export function getDefenseTacticKeys(team: TeamId) {
  return TEAM_TACTIC_KEYS[team];
}

/**
 * The steps beyond the axis values (stage 20, 4c-2): the instructions at ±2 and the saved mentality move the line,
 * the tackling and the defensive width a little. Cached per team on the instruction store's version.
 */
const TEAM_WITH_EXTRAS: Record<TeamId, { version: number; base: DefenseConfigValues | null; cfg: DefenseConfigValues }> = {
  A: { version: -1, base: null, cfg: { ...DEFAULTS } },
  B: { version: -1, base: null, cfg: { ...DEFAULTS } },
};

function withInstructionExtras(team: TeamId): DefenseConfigValues {
  const c = TEAM_WITH_EXTRAS[team];
  const v = instrVersion(team);
  if (c.version === v && c.base === TEAM_CONFIGS[team]) return c.cfg;
  const base = TEAM_CONFIGS[team];
  const lineE = instrExtra(team, 'line') + INSTR.MENT_SHIFT * instrMentality(team);
  c.cfg = {
    ...base,
    DEFENSIVE_LINE_HEIGHT: Math.max(0, Math.min(1, base.DEFENSIVE_LINE_HEIGHT + INSTR.LINE_EXTRA * lineE)),
    TACKLE_AGGRESSION: Math.max(0, Math.min(1, base.TACKLE_AGGRESSION + INSTR.TACKLE_EXTRA * instrExtra(team, 'tackling'))),
    HORIZONTAL_COMPACTNESS: Math.max(0, Math.min(1, base.HORIZONTAL_COMPACTNESS - INSTR.DEFWIDTH_EXTRA * instrExtra(team, 'defWidth'))),
  };
  c.version = v;
  c.base = base;
  return c.cfg;
}

/** Returns the defensive config for the given team. */
export function getDefenseConfig(team: TeamId): DefenseConfigValues {
  if (!DECISION_FLAGS.TEAM_INSTRUCTIONS) return TEAM_CONFIGS[team];
  return withInstructionExtras(team);
}

// ── TacticalAxes → engine values ──────────────────────────────────────────────

/** The engagement and tackling halves of the pressing map (stage 20): the same values `pressing_style` gave. */
const PRESSING_LINE_OF: Record<PressingStyle, number> = { low_block: 0.28, mid_block: 0.55, high_press: 0.80 };
const TACKLE_AGGRESSION_OF: Record<PressingStyle, number> = { low_block: 0.25, mid_block: 0.40, high_press: 0.65 };

function mapAxesToDefense(t: TacticalAxes): Partial<DefenseConfigValues> {
  const pressingMap: Record<PressingStyle, Partial<DefenseConfigValues>> = {
    // MARK_LANE_T: how far along ball→mark line the defender positions (0=at ball, 1=at mark)
    // MARK_PULL:   how strongly they commit to that position vs shape anchor
    // low_block  → sits deep and rarely presses, but marks like mid_block (8.8.33: staying far from the mark left attackers free)
    // high_press → tight man-marking, very close to mark (large laneT)
    low_block:  { PRESSING_LINE_HEIGHT: 0.28, PRESS_INTENSITY: 0.20, TACKLE_AGGRESSION: 0.25, PRESS_STAMINA_MULT: 1,
                  MARK_LANE_T_FAR: 0.30, MARK_LANE_T_CLOSE: 0.65, MARK_PULL_MIN: 0.40, MARK_PULL_MAX: 0.88 },
    mid_block:  { PRESSING_LINE_HEIGHT: 0.55, PRESS_INTENSITY: 0.50, TACKLE_AGGRESSION: 0.40, PRESS_STAMINA_MULT: 1,
                  MARK_LANE_T_FAR: 0.30, MARK_LANE_T_CLOSE: 0.65, MARK_PULL_MIN: 0.40, MARK_PULL_MAX: 0.88 },
    high_press: { PRESSING_LINE_HEIGHT: 0.80, PRESS_INTENSITY: 0.85, TACKLE_AGGRESSION: 0.65, PRESS_STAMINA_MULT: HIGH_PRESS_STAMINA_MULT,
                  MARK_LANE_T_FAR: 0.60, MARK_LANE_T_CLOSE: 0.95, MARK_PULL_MIN: 0.65, MARK_PULL_MAX: 0.95 },
  };
  const lineMap: Record<DefensiveLine, Partial<DefenseConfigValues>> = {
    deep:   { DEFENSIVE_LINE_HEIGHT: 0.40 },
    normal: { DEFENSIVE_LINE_HEIGHT: 0.60 },
    high:   { DEFENSIVE_LINE_HEIGHT: 0.75 },
  };
  const widthMap: Record<TeamWidth, Partial<DefenseConfigValues>> = {
    narrow: { HORIZONTAL_COMPACTNESS: 0.80, BLOCK_SHIFT_WEIGHT: 0.70 },
    normal: { HORIZONTAL_COMPACTNESS: 0.60, BLOCK_SHIFT_WEIGHT: 0.80 },
    wide:   { HORIZONTAL_COMPACTNESS: 0.30, BLOCK_SHIFT_WEIGHT: 0.90 },
  };
  return {
    ...pressingMap[t.pressing_style],
    ...lineMap[t.defensive_line],
    ...widthMap[t.width],
  };
}

/**
 * Apply defense-side tactics (derived from a TacticalStyle) to the given team.
 * `mentality` is a temporary live-match shift (see tacticsTypes.ts); it never
 * changes what `getDefenseTacticKeys` reports as the team's pressing_style /
 * defensive_line for intent-multiplier lookups other than the shifted values
 * themselves — IntentDetection's own style gate reads `getTeamTacticalStyle`
 * (AttackConfig.ts), which mentality does not touch.
 *
 * `familiarity` (style training, `FamiliarityConfig.ts`) nudges the weights the style already
 * drives; absent or 50 = no change. `high_line_trap` only counts with a high line.
 */
export function applyTeamTacticsConfig(
  team: TeamId,
  style: TacticalStyle,
  mentality: Mentality = DEFAULT_MENTALITY,
  axesOverride?: Partial<TacticalAxes>,
  familiarity?: FamiliarityLevels,
  instructions?: TeamInstructions,
  mentalityLevel?: number,
): void {
  // Stage 20: the defending side's axes from the instruction levels (defensive width, pressing, line).
  const resolved = resolveInstructions(style, axesOverride, instructions, mentalityLevel);
  const axes = shiftAxesByMentality(axesOfLevels(resolved.levels).defense, mentality);
  // 4c-2: pressing_style splits into engagement (press range), intensity (the intent table, marking, stamina) and
  // tackling (aggression); the live mentality steps the three alike, as it stepped pressing_style.
  const liveStep = mentality === 'attacking' ? 1 : mentality === 'defensive' ? -1 : 0;
  const stepped = (level: number) => pressingStyleOf(Math.max(0, Math.min(2, bucketOf(level) + liveStep)) - 1);
  const engagementStyle = stepped(resolved.levels.engagement);
  const tacklingStyle = stepped(resolved.levels.tackling);
  TEAM_CONFIGS[team] = { ...TEAM_CONFIGS[team], ...mapAxesToDefense(axes) };
  TEAM_CONFIGS[team].PRESSING_LINE_HEIGHT = PRESSING_LINE_OF[engagementStyle];
  TEAM_CONFIGS[team].TACKLE_AGGRESSION = TACKLE_AGGRESSION_OF[tacklingStyle];
  applyAdd(TEAM_CONFIGS[team], STYLE_FAMILIARITY_EFFECTS[style].defenseAdd, familiarityFactor(familiarity?.[style]));
  if (axes.defensive_line === 'high') {
    applyAdd(TEAM_CONFIGS[team], HIGH_LINE_TRAP_EFFECT.defenseAdd, familiarityFactor(familiarity?.high_line_trap));
  }
  TEAM_TACTIC_KEYS[team].pressingStyle = axes.pressing_style;
  TEAM_TACTIC_KEYS[team].engagementStyle = engagementStyle;
  TEAM_TACTIC_KEYS[team].defensiveLine = axes.defensive_line;
}


// Stage 19 (`live-modes.md`): the per-team configs travel with a mid-match snapshot.
registerEngineMemory('DefenseConfig.TEAM_CONFIGS', recordPart(TEAM_CONFIGS as unknown as Record<string, unknown>));
registerEngineMemory('DefenseConfig.TEAM_TACTIC_KEYS', recordPart(TEAM_TACTIC_KEYS as unknown as Record<string, unknown>));
