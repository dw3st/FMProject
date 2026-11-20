/**
 * Stage 21 calibration (`fm-numbers.md` → "Etapa 21"): how often a defender in tackle range actually commits to the
 * tackle. FM's defender decides to tackle (or stays on his feet and jockeys) with a chance that grows with his tackling;
 * the engine used to tackle every time a defender reached 2 yd, ~6× FM's tackles won and ~4.5× its fouls.
 *
 * Per tackle check (one per tick while the shared cooldown is 0): the closest defender in range commits with
 * COMMIT_BASE × chance^COMMIT_POW (chance = the tackle's success chance, `tackleChanceOf`), so he commits mostly when
 * he would win it. Not committing costs nothing (no cooldown, no stamina): he keeps
 * pressing and may commit on a later tick.
 *
 * Overrides: `TACKLE_OVERRIDES='{"COMMIT_BASE":0.2}'` (env, read once at load).
 */
import { applyEnvOverrides } from '@/GameEngine/Support/EnvOverrides';

export const TACKLE_CONFIG = {
  COMMIT_BASE: 0.2,
  COMMIT_POW: 3,
};

applyEnvOverrides(TACKLE_CONFIG, 'TACKLE_OVERRIDES');
