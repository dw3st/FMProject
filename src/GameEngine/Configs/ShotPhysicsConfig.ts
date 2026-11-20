/**
 * The shot by its trajectory (engine rebuild stage 7, `.claude/rules/game-engine/shot-and-save.md` → "Stage 7").
 *
 * The goal comes from the ball against the keeper and the defenders, not from a dice on the xG. FM gives the form of
 * the launch error (base 105 for shots against 95 for passes, the speed term of its geometry, report 5 §2.5 / report 6)
 * and the outcome shares (report 9: 35% on target, 38% blocked, 80% of the shots on target saved). The speeds, the keeper's
 * reaction and reach and the block reach are design values of the model (FM's are not read): not fitted to a match
 * volume. Metres where marked (`_M`, `_MS`), else yards and seconds. `SHOT_PHYSICS_OVERRIDES` (env, read once at
 * load) changes any of them.
 */
export const SHOT_PHYSICS = {
  // ── Launch speed by technique (m/s): base + skill × span ──
  POWER_BASE_MS: 24, POWER_SKILL_MS: 6,
  PLACED_BASE_MS: 17, PLACED_SKILL_MS: 4,
  VOLLEY_BASE_MS: 22, VOLLEY_SKILL_MS: 6,
  HEADER_BASE_MS: 10, HEADER_SKILL_MS: 6,

  // ── Technique choice (situation, one draw where two fit) ──
  /** Placed (side-foot to the corner) only this close (yd); chance = PLACED_BASE + PLACED_SKILL × finishing. */
  PLACED_MAX_YD: 18,
  PLACED_BASE: 0.35, PLACED_SKILL: 0.4,
  /** The ball this high or more at the strike (yd) is a volley (FM's xG volley threshold is 0.2 m). */
  VOLLEY_Z: 0.22,
  /** A lob (cobertura) over a keeper this far off his line (yd), from at least LOB_MIN_YD, with him LOB_KEEPER_GAP+ yd ahead. */
  LOB_KEEPER_OFF: 8, LOB_MIN_YD: 16, LOB_MAX_YD: 38, LOB_KEEPER_GAP: 6,
  /** A chip / lob clears the keeper's hands by this much (yd) where he stands; it crosses the line at LOB_LINE_Z. */
  LOB_CLEAR_YD: 0.4, LOB_LINE_Z: 1.8,

  // ── Aim (FM: corner and height by technique and situation) ──
  /** Aim inside the post (m): AIM_INSIDE_M + (1 − skill) × AIM_INSIDE_SKILL_M (a weaker finisher aims safer). */
  AIM_INSIDE_M: 0.4, AIM_INSIDE_SKILL_M: 0.4,
  /** Crossing height at the line (m): low and high. */
  LOW_Z_M: 0.3, HIGH_Z_M: 1.85,
  /** Chance of aiming high, by technique. */
  HIGH_POWER: 0.35, HIGH_PLACED: 0.12, HIGH_VOLLEY: 0.45, HIGH_HEADER: 0.25, HIGH_FREE_KICK: 0.7,
  /** Chance of picking the side with the bigger gap past the keeper: FAR_SIDE_BASE + FAR_SIDE_SKILL × skill. */
  FAR_SIDE_BASE: 0.6, FAR_SIDE_SKILL: 0.35,

  // ── Launch error (FM form: (1 − s/50)·(base/10 + P + G), base 105 for shots, 95 for passes) ──
  /** FM's base errors: shots and the pass base the 4b angle and speed errors are anchored to. */
  BASE_SHOT: 98, BASE_PASS: 95, // stage 21: BASE_SHOT 105 → 98, on target 45 → 35% of the shots (FM 35%)
  /** FM's set-piece base (a direct free kick is a set-piece kick: 85, no pressure). */
  BASE_SET_PIECE: 85,
  /** FM's geometry term G ∋ 0.5·|launch velocity| (m/s): the shot error against a pass of the same distance. */
  SPEED_TERM: 0.5,
  /** Technique margin lost on a volley (the FM margin is per technique; a volley is harder than a ground shot). */
  VOLLEY_MARGIN: 10,

  // ── Keeper (design: reaction, dive and hands) ──
  /** Seconds before he moves to the shot: REACT_BASE − REACT_REFLEX × reflexes. */
  // Stage 21 (`fm-numbers.md` → "Etapa 21"): reaction 0.3 → 0.2, dive 4 → 7, hands 0.9 → 1.5, stop 0.9 → 0.98, edge
  // 0.5 → 0.3, speed 0.02 → 0.01: the keeper saves ~85% of the shots on target (FM 80%), was 46%.
  REACT_BASE: 0.2, REACT_REFLEX: 0.15,
  /** Dive speed (yd/s): DIVE_BASE + DIVE_SKILL × diving. */
  DIVE_BASE: 7, DIVE_SKILL: 4,
  /** Hands from his centre (yd): HAND_BASE + HAND_SKILL × diving, up to HAND_MAX_Z high. */
  HAND_BASE: 1.5, HAND_SKILL: 0.5, HAND_MAX_Z: 3.0,
  /** He leaves a ball predicted to miss the frame by more than this (yd) and does not dive. */
  LEAVE_MARGIN: 0.4,
  /** Stop chance = STOP_BASE + STOP_SKILL × (handling − 0.5) − STOP_EDGE × offset² − STOP_SPEED × (speed − STOP_FREE_MS)⁺. */
  STOP_BASE: 0.98, STOP_SKILL: 0.2, STOP_EDGE: 0.3, STOP_SPEED: 0.01, STOP_FREE_MS: 18, STOP_MIN: 0.05, STOP_MAX: 0.98,
  /** A touched ball he does not stop runs on: speed × FINGERTIP_KEEP, turned up to FINGERTIP_DEG. */
  FINGERTIP_KEEP: 0.75, FINGERTIP_DEG: 12,
  /** Save grades: difficult from this offset or speed (m/s), good from these. */
  GRADE_DIFFICULT_OFFSET: 0.65, GRADE_DIFFICULT_MS: 27, GRADE_GOOD_OFFSET: 0.35, GRADE_GOOD_MS: 22,

  // ── Blocks (stage 5's physical interception applied to the shot) ──
  /** Seconds before a defender reacts to the strike; then he lunges at LUNGE_SPEED (yd/s). */
  BLOCK_REACTION_S: 0.15, LUNGE_SPEED: 4.5,
  /** Body + leg across the ball (yd): BLOCK_BODY + BLOCK_TACKLE × tackling; up to BLOCK_MAX_Z high (a jumping body). */
  BLOCK_BODY: 0.5, BLOCK_TACKLE: 0.5, BLOCK_MAX_Z: 2.2,
  /** Defenders planned to lunge at a shot (the earliest). */
  MAX_BLOCKERS: 3,
  /** A block: controlled (CONTROL_BASE + CONTROL_TOUCH × first touch, × the speed factor), deflected on toward goal, or rebounds. */
  BLOCK_CONTROL_BASE: 0.08, BLOCK_CONTROL_TOUCH: 0.15, DEFLECT_ON: 0.25,
  /** A deflection on keeps this share of the speed, turned up to this; a rebound this share, spread around the way back. */
  DEFLECT_KEEP: 0.7, DEFLECT_DEG: 25, REBOUND_KEEP_MIN: 0.25, REBOUND_KEEP_MAX: 0.5, REBOUND_DEG: 70,

  // ── Goal frame ──
  /** Post / bar + ball radius (yd): a ball this close hits the woodwork. */
  WOODWORK_YD: 0.19,
  /** The woodwork sends it back at this share of its speed. */
  WOODWORK_KEEP: 0.45,
  /** Sub-step of the shot's flight (s) and the longest flight before it is a loose ball. */
  SUBSTEP: 0.02, MAX_FLIGHT_S: 4,
};

try {
  const raw = typeof process !== 'undefined' ? process.env?.SHOT_PHYSICS_OVERRIDES : undefined;
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(SHOT_PHYSICS) as (keyof typeof SHOT_PHYSICS)[]) {
      const v = parsed[k];
      if (v !== undefined && typeof v === typeof SHOT_PHYSICS[k]) (SHOT_PHYSICS as Record<string, unknown>)[k] = v;
    }
  }
} catch { /* ignore a malformed override */ }
