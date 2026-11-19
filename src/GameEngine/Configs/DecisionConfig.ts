/**
 * FM-style decisions (`docs/superpowers/specs/2026-11-18-fm-style-decisions-design.md`, `.claude/rules/game-engine/decisions.md`).
 *
 * Phase 2 (instrumentation): every behaviour flag below is OFF and nothing in the engine reads them yet — they are the
 * switches later phases plug into (§5). A flag off makes no `Math.random` call, so a match is game-for-game identical
 * with a fixed engine seed. The telemetry (decision events, pressure, situation buckets) is pure and draws no dice.
 *
 * Overrides: `DECISION_OVERRIDES='{"HOLDER":true}'` (env, read once at load, scripts and workers) and
 * `simulateMatch(..., { decisions: { HOLDER: true } })` (per match; reset to the base flags when absent).
 */

/** Behaviour switches of the decision layer (phases 3–5). All false in phase 2. */
export interface DecisionFlags {
  /** Ball holder: gates, attribute test noise, lapses (§3). */
  HOLDER: boolean;
  /** Off-ball: noise on the intent scores, flair, lapse (§4). */
  OFFBALL: boolean;
  /** Defence: noise on the intent scores, lapse (§4). */
  DEFENSE: boolean;
  /** Anticipation stretches the carry-intercept lookahead (§4). */
  ANTICIPATION_PRESS: boolean;
  /** The second presser stops short (§4). */
  SECOND_PRESSER: boolean;
  /** Positioning target lags the shape anchor by a discipline τ (§4). */
  DISCIPLINE_LAG: boolean;
  /** Consistency caps stacked bonuses (§7 phase 5). */
  CONSISTENCY_CAP: boolean;
}

export const DEFAULT_DECISION_FLAGS: Readonly<DecisionFlags> = {
  HOLDER: false,
  OFFBALL: false,
  DEFENSE: false,
  ANTICIPATION_PRESS: false,
  SECOND_PRESSER: false,
  DISCIPLINE_LAG: false,
  CONSISTENCY_CAP: false,
};

/** Telemetry constants (pressure scalar and situation buckets). */
export const DECISION_TELEMETRY = {
  /** 1 yard in metres. FM measures in metres; our pitch is in yards. */
  M_PER_YD: 0.9144,
  /** FM's pressure radius: 12 m (≈ 13.12 yd). */
  PRESSURE_RADIUS_M: 12,
  /** FM's "nearest presser" threshold: 1 m (≈ 1.09 yd). Beyond it P = max(P / d0, (P + 1) / 2), d0 in metres. */
  NEAREST_M: 1,
  /** FM's contribution weight: 10 · ((R − d) / k)² / R. */
  WEIGHT: 10,
  /** k: free opponent 1, recovering one tick 2, recovering two ticks or more 3. */
  K_FREE: 1,
  K_RECOVERING_ONE: 2,
  K_RECOVERING_MORE: 3,
  /** One decision tick in real seconds (`DECISION_REF_DT`): `recoveryTime` above this = "≥ 2 ticks". */
  TICK_S: 0.2,
  /**
   * Situation bucket split of the pressure scalar (raw P, not normalised). Chosen at the measured median of the holder
   * pressure (premier_league + of_championship baseline, `decisions.md`).
   */
  PRESSURE_HIGH: 15,
  /** Wide channel: |y − 37| ≥ this (the outer quarters of the 74-yard pitch). */
  WIDE_FROM_CENTRE: 18.5,
  /** Decisions whose top two scores differ by less than this count as near-ties. */
  NEAR_TIE: 0.05,
} as const;

function readEnvOverrides(): Partial<DecisionFlags> {
  try {
    const raw = typeof process !== 'undefined' ? process.env?.DECISION_OVERRIDES : undefined;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<DecisionFlags> = {};
    for (const k of Object.keys(DEFAULT_DECISION_FLAGS) as (keyof DecisionFlags)[]) {
      if (typeof parsed[k] === 'boolean') out[k] = parsed[k] as boolean;
    }
    return out;
  } catch {
    return {};
  }
}

/** The flags a match starts from: the defaults with the env overrides. */
const BASE_FLAGS: Readonly<DecisionFlags> = { ...DEFAULT_DECISION_FLAGS, ...readEnvOverrides() };

/** The live flags (process-global like the other team configs). */
export const DECISION_FLAGS: DecisionFlags = { ...BASE_FLAGS };

/** Sets the flags of the next match: the base flags with `partial` on top (absent = the base). */
export function setDecisionFlags(partial?: Partial<DecisionFlags>): void {
  Object.assign(DECISION_FLAGS, BASE_FLAGS, partial ?? {});
}
