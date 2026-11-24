/**
 * Stage 9 of the engine rebuild (`holder-choice.md` → "Stage 9"): FM's shot gate and the shot candidate's value.
 *
 * FM offers a shot candidate only within ~30 m of the goal in open play (farthest candidates measured 27–31 m) and
 * scales it × 0.75 in the box lane and × 0.667 outside it. The blockers are no longer read by the decision: the shot
 * is valued from the shooter's own geometry (the FM xG with only the keeper on the pitch), and the defenders in the
 * way block it physically in flight (stage 7). Not calibrated (stage 21).
 *
 * Overrides: `SHOT_GATE_OVERRIDES='{"GATE_M":25}'` (env, read once at load).
 */
export const SHOT_GATE = {
  /** No shot candidate beyond this distance (m) from the goal centre (FM: k · 30 m, k = 1 by default). */
  GATE_M: 30,
  /** The box lane (m): within BOX_DEPTH_M of the goal line and BOX_HALF_WIDTH_M of the goal's axis. */
  BOX_DEPTH_M: 16.459,
  BOX_HALF_WIDTH_M: 20.117,
  /** FM's gate factor on the shot value: in the box lane, and anywhere else within the gate. */
  IN_BOX_MULT: 0.75,
  OUT_BOX_MULT: 0.6667,
  /**
   * Value of the shot = factor × (VALUE_FLOOR + (1 − VALUE_FLOOR) × min(1, (clean xG / XG_REF)^VALUE_POW)). FM's value
   * function for a kick was not read; its measured kick values sit at or above 0.447 (FM's f24 saturated) although FM's
   * shots have a median xG of 0.03, so the value can't follow the xG closely. The floor and the power are the stand-in.
   */
  VALUE_FLOOR: 0,
  /** Stage 21: 0.5 → 1.5 (with 0.5 a 25–30 m shot was worth half a box shot: 63% of the shots came from beyond 25 m). */
  VALUE_POW: 1.5,
  /**
   * The xG a shot is measured against, the same for every role: FM's kick multiplier is always 1 (report 6), so no
   * per-role eagerness — only the shooting level (defenders "rarely", `shotLevelMult`) scales it.
   */
  /** Stage 21: 0.25 → 0.28. Very sensitive: 0.32 leaves 15% of the shots outside the box, 0.4 only 5%. */
  XG_REF: 0.26, // 2026-11-22: 0.29 → 0.26 (main six leagues at 2.74 goals, 25.5 shots; real 2.73)
  /**
   * Category multiplier of a kick relative to a carry: FM's kick multiplier is always 1.0 and a carry's median 0.36
   * (report 6), the same ratio stage 8 used for turn (× 2) and hold (× 1.14). Replaces the kick's 1 with the flag on.
   */
  /** Stage 21: 1 / 0.36 → 1.6 (the shot volume; lower values remove the long shots first: 1.3 → 16% outside the box). */
  KICK_MULT: 1.5, // R9 round: 1.6 → 1.5
  /**
   * The shooter's finishing scales the shot value: × (shootAccuracy / FINISH_REF)^FINISH_POW, within FINISH_MIN..MAX.
   * 2026-11-24: weak leagues shot twice as often as strong ones (Série C 25 shots a match, Premier 12) and scored more
   * (4.3 against 2.3): the value read only the geometry, so a poor finisher shot as eagerly as a good one.
   */
  FINISH_REF: 0.55,
  FINISH_POW: 1,
  FINISH_MIN: 0.35,
  FINISH_MAX: 1.25,
  /** Share of the holder's decisions with the shot among his options (1 = every decision; a one-on-one always). */
  LOOK_CHANCE: 1,
  /** The chip (holder move) only over a keeper this far off his line (yd) — FM's keeper stays on it (R8 §2.2). */
  CHIP_KEEPER_OFF_YD: 8,
};

try {
  const raw = typeof process !== 'undefined' ? process.env?.SHOT_GATE_OVERRIDES : undefined;
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(SHOT_GATE) as (keyof typeof SHOT_GATE)[]) {
      const v = parsed[k];
      if (typeof v === 'number') (SHOT_GATE as Record<string, number>)[k] = v;
    }
  }
} catch { /* ignore a malformed override */ }
