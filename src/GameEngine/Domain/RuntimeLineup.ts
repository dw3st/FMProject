/**
 * Runtime lineup — applies deterministic fatigue multipliers to `baseStats` from `teamLineup()`.
 * Does not call `teamLineup`; base stats are computed once per match / lineup change.
 */

import type { GamePlayer, GameState, PlayerStats } from '@/GameEngine/types';

/**
 * Energy drain per game-second (0–100 scale).
 * These were originally per-live-game-tick at ~60fps (0.3 game-seconds/tick).
 * Now stored as per-game-second so the drain is tick-rate-independent.
 * Reference: move was 0.004/tick ÷ 0.3 game-s/tick ≈ 0.0133/game-s.
 */
export const STAMINA_COST = {
  move:         0.0106,
  pass:         0.0267,
  shot:         0.1334,
  tackle:       0.1334,
  interception: 0.1334,
  gkSave:       0.2666,
  carry:        0.1334,
  press:        0.1600,
} as const;

export type StaminaAction = keyof typeof STAMINA_COST;

function clampEnergy(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/**
 * Fatigue curve config — change these to tune how hard low energy hits stats.
 *
 * Formula: factor = 1 - MAX_REDUCTION * (energyLost / 100) ^ CURVE_POWER
 *
 * CURVE_POWER < 1 makes the curve concave: the first energy lost hurts more than the last,
 * so a 90-energy player takes ~10% physical hit but a 10-energy player stays above 45%.
 *
 * Reference at 90 energy (10 energy lost):
 *   physical → 90% stats  (−10%)
 *   semi     → 94% stats  (−6%)
 *   tech     → 96% stats  (−4%)
 *
 * Reference at 10 energy (90 energy lost):
 *   physical → 45% stats
 *   semi     → 68% stats
 *   tech     → 82% stats
 */
export const FATIGUE_MAX_REDUCTION_PHYSICAL = 0.55;
export const FATIGUE_MAX_REDUCTION_SEMI     = 0.35;
export const FATIGUE_MAX_REDUCTION_TECH     = 0.20;
export const FATIGUE_CURVE_POWER            = 0.75;

function getFatigueFactor(energy: number, maxReduction: number): number {
  const lost = Math.max(0, Math.min(100, 100 - energy)) / 100; // 0..1
  return Math.max(0, 1 - maxReduction * Math.pow(lost, FATIGUE_CURVE_POWER));
}

/** @deprecated Use getFatigueFactor — kept only in case external code imports this. */
export function getReductionFactor(energyLost: number, step: number): number {
  const reduction = Math.floor(energyLost / step);
  return Math.max(0.1, 1 - reduction * 0.1);
}

/**
 * @param loadDrainMultiplier `drainMultiplier(seasonLog.load)` from `src/Domain/fitness/fitness.ts`
 *   — 1 with no accumulated load, up to 1.25 at `FITNESS.LOAD_HIGH`. Defaults to 1 (no penalty) for
 *   callers that don't track load (e.g. hand-built test players).
 */
export function consumeEnergy(
  energy: number,
  stamina: number,
  action: StaminaAction,
  dtGame: number,
  loadDrainMultiplier = 1,
): number {
  const base = STAMINA_COST[action];
  const reduction = stamina * 0.05; // 0–50%
  const cost = base * (1 - reduction) * dtGame * loadDrainMultiplier;
  return clampEnergy(energy - cost);
}

export function getRuntimeLineup(base: PlayerStats, player: Pick<GamePlayer, 'energy'>): PlayerStats {
  const physicalRed = getFatigueFactor(player.energy, FATIGUE_MAX_REDUCTION_PHYSICAL);
  const semiRed     = getFatigueFactor(player.energy, FATIGUE_MAX_REDUCTION_SEMI);
  const techRed     = getFatigueFactor(player.energy, FATIGUE_MAX_REDUCTION_TECH);

  return {
    withBall: {
      ...base.withBall,

      carrySpeed: base.withBall.carrySpeed * physicalRed,
      speed: base.withBall.speed * physicalRed,
      acceleration: base.withBall.acceleration * physicalRed,

      passingSkill: base.withBall.passingSkill * techRed,
      vision: base.withBall.vision * techRed,
      firstTouch: base.withBall.firstTouch * techRed,
      dribbling: base.withBall.dribbling * techRed,
    },

    withoutBall: {
      ...base.withoutBall,

      pressSpeed: base.withoutBall.pressSpeed * physicalRed,
      speed: base.withoutBall.speed * physicalRed,
      acceleration: base.withoutBall.acceleration * physicalRed,

      tackleChance: base.withoutBall.tackleChance * semiRed,
      tackling: base.withoutBall.tackling * semiRed,
      interceptionChance: base.withoutBall.interceptionChance * semiRed,
    },
  };
}

/**
 * Continuous fatigue (`docs/superpowers/specs/2026-09-27-stamina-design.md` §1 "Na partida"):
 * energy points below which `runtimeStats` is left untouched since the last recompute. Replaces
 * the old "every 10/20/40 energy points" step — `getRuntimeLineup` itself is already continuous,
 * this only controls how often the (comparatively expensive) recompute runs.
 */
export const FATIGUE_RECOMPUTE_THRESHOLD = 1;

/**
 * Decide whether a player's `runtimeStats` need recomputing for a fresh `energy` value, given the
 * energy last used to compute them (`fatigueBaselineEnergy`). Recomputes once `energy` has moved at
 * least `FATIGUE_RECOMPUTE_THRESHOLD` points from that baseline; otherwise returns the same
 * `runtimeStats` reference untouched so callers can skip the object-spread cost every tick.
 */
export function applyContinuousFatigue(
  baseStats: PlayerStats,
  runtimeStats: PlayerStats,
  energy: number,
  fatigueBaselineEnergy: number,
): { runtimeStats: PlayerStats; fatigueBaselineEnergy: number } {
  if (Math.abs(energy - fatigueBaselineEnergy) < FATIGUE_RECOMPUTE_THRESHOLD) {
    return { runtimeStats, fatigueBaselineEnergy };
  }
  return { runtimeStats: getRuntimeLineup(baseStats, { energy }), fatigueBaselineEnergy: energy };
}

/** Old saves / snapshots used `stats` instead of `baseStats` + `runtimeStats`. */
type LegacyGamePlayer = GamePlayer & { stats?: PlayerStats };

/**
 * Ensure lineup + stamina fields exist (e.g. after loading legacy JSON from localStorage).
 */
export function normalizeGamePlayer(p: GamePlayer): GamePlayer {
  if (
    p.runtimeStats != null &&
    p.baseStats != null &&
    typeof p.energy === 'number' &&
    typeof p.stamina === 'number'
  ) {
    return p;
  }
  const legacy = p as LegacyGamePlayer;
  const baseStats = legacy.baseStats ?? legacy.stats;
  if (!baseStats) return p;
  const energy = typeof legacy.energy === 'number' ? legacy.energy : 100;
  const stamina = typeof legacy.stamina === 'number' ? legacy.stamina : 7;
  return {
    ...legacy,
    baseStats,
    runtimeStats: getRuntimeLineup(baseStats, { energy }),
    energy,
    stamina,
  };
}

export function normalizeGamePlayers(players: GamePlayer[]): GamePlayer[] {
  return players.map(normalizeGamePlayer);
}

export function normalizeGameState(state: GameState): GameState {
  return {
    ...state,
    players:               normalizeGamePlayers(state.players),
    benchA:                normalizeGamePlayers(state.benchA ?? []),
    benchB:                normalizeGamePlayers(state.benchB ?? []),
    pendingSubsA:          state.pendingSubsA ?? [],
    pendingSubsB:          state.pendingSubsB ?? [],
    throughBallCellsCache: state.throughBallCellsCache ?? null,
  };
}

/** Apply one extra stamina hit (e.g. tackle burst) after the per-tick locomotion drain. */
export function applyStaminaCost(
  players: GamePlayer[],
  playerId: number,
  action: StaminaAction,
): GamePlayer[] {
  return players.map(p => {
    if (p.id !== playerId) return p;
    const pl = normalizeGamePlayer(p);
    if (pl.baseStats == null) return p;
    const energy = consumeEnergy(pl.energy, pl.stamina, action, 1.0, pl.drainMultiplier ?? 1);
    // A discrete action (tackle, save, interception) is rare enough that we always recompute,
    // rather than gating on FATIGUE_RECOMPUTE_THRESHOLD like the per-tick locomotion drain does.
    return {
      ...pl,
      energy,
      fatigueBaselineEnergy: energy,
      runtimeStats: getRuntimeLineup(pl.baseStats, { energy }),
    };
  });
}
