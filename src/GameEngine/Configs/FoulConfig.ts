/**
 * FoulConfig — tuning for fouls, cards and in-match penalties (Etapa 12,
 * `docs/superpowers/specs/2026-10-02-fouls-cards-design.md` §1–4, `.claude/rules/game-engine/fouls.md`).
 *
 * Calibrated with `bun scripts/fouls-calibrate.ts` against the targets (per match, both teams):
 * fouls 10–14, yellows ~3, reds 0.1–0.15, penalties 0.2–0.3.
 */
import { applyEnvOverrides } from '@/GameEngine/Support/EnvOverrides';

export const FOUL_CONFIG = {
  // ── Foul chance (`foulChance`) ──────────────────────────────────────────────
  /** Base foul chance for a resolved tackle attempt (side angle, neutral aggression/skill/energy). */
  // Stage 21 (`fm-numbers.md` → "Etapa 21"): tackle 0.75 → 0.2, dribble 0.55 → 0.1, duel 0.4 → 0.12, aerial 0.06 →
  // 0.03, contact rate 0.25 → 0.06: fouls 88 → ~25 a match (FM 19). With 90 minutes of physics every duel kind was
  // ~4× FM's rate per minute.
  TACKLE_BASE: 0.2,
  /** Base foul chance for a resolved 1v1 dribble duel (the defender is the possible offender). */
  DRIBBLE_BASE: 0.1,
  /** Base foul chance for a contested loose-ball duel. */
  DUEL_BASE: 0.12,
  /** Base foul chance of a contact moment on the holder (stage 13): `FM.CONTACT_BASE`. */
  /** Base foul chance for an aerial duel (`.claude/rules/game-engine/aerial.md`) — either player may be the offender. */
  AERIAL_BASE: 0.03,
  /** Multiplier when the tackle itself won the ball — most fouls come from mistimed (failed) challenges. */
  TACKLE_WON_MULT: 0.15,
  /** Approach-angle multipliers (`classifyPosition` of the tackler relative to the holder). */
  ANGLE_MULT: { front: 0.7, side: 1.0, behind: 1.8 },
  /** `TACKLE_AGGRESSION` (team pressing style) around which the aggression multiplier is neutral. */
  AGGRESSION_REF: 0.4,
  /** Multiplier = 1 + AGGRESSION_WEIGHT × (aggression − AGGRESSION_REF): low_block 0.85, high_press 1.25. */
  AGGRESSION_WEIGHT: 1.0,
  /** Multiplier = 1 + LOW_TACKLING_WEIGHT × (0.5 − tackling): a poor tackler (0.2) fouls 18% more. */
  LOW_TACKLING_WEIGHT: 0.6,
  /** Energy below which fatigue raises the foul chance. */
  ENERGY_REF: 70,
  /** Multiplier = 1 + LOW_ENERGY_WEIGHT × max(0, (ENERGY_REF − energy) / ENERGY_REF). */
  LOW_ENERGY_WEIGHT: 0.6,
  /** A player already on a yellow is more careful. */
  ON_YELLOW_MULT: 0.15,
  /**
   * Inside the defending team's own penalty area defenders hold back (a foul there is a penalty).
   * Tuned so penalties land at ~0.2–0.3 per match. 0.13 → 0.3 with aerial play (Etapa 13): crosses
   * replace many carries into the box, which had halved the penalties (`aerial.md`).
   */
  IN_BOX_MULT: 0.3,
  /** A challenge is never a certain foul (a desperate lunge from behind by a tired poor tackler caps here). */
  MAX_CHANCE: 0.9,

  // ── Cards (`cardRoll`) ──────────────────────────────────────────────────────
  /** Yellow-card chance for a plain foul (front/side, no clear chance). */
  YELLOW_BASE: 0.17,
  /** Straight-red chance for a plain foul. */
  RED_BASE: 0.0008,
  /** Card-severity multipliers for a challenge from behind. */
  BEHIND_YELLOW_MULT: 1.4,
  BEHIND_RED_MULT: 2,
  /** Card-severity multipliers when the fouled player had a clear run on goal (DOGSO). */
  CLEAR_CHANCE_YELLOW_MULT: 1.8,
  CLEAR_CHANCE_RED_MULT: 8,
  /** Card-severity multipliers for a player already on a yellow (the referee's patience is shorter). */
  ON_YELLOW_YELLOW_MULT: 1.15,
  ON_YELLOW_RED_MULT: 1.0,
  /** Cap on the card chances so the roll never saturates. */
  MAX_YELLOW: 0.85,
  MAX_RED: 0.6,
  /**
   * Personality (Etapa 26): the temperament card multipliers are divided by this (t ≠ 0) so the
   * world's card volume stays where it was calibrated (hot-heads foul more and are booked more per
   * foul, which lifts the reds, mostly second yellows, ~13%). 1,04 keeps yellows and reds within ±5% (measured, `personality.md`).
   */
  TEMPERAMENT_CARD_NORM: 1.04,

  // ── Clear chance (`isClearChance`) ──────────────────────────────────────────
  /** The fouled player must be within this distance (yards) of the goal he attacks. */
  CLEAR_CHANCE_MAX_DIST: 35,
  /** Half-width (yards) of the corridor ahead of the fouled player that must hold no outfield defender. */
  CLEAR_CHANCE_CORRIDOR: 8,

  // ── Restarts ────────────────────────────────────────────────────────────────
  /**
   * Free kick: game-seconds of dead ball (the physical freeze is this / clockScale, `restartFreeze`). Stage 2: the
   * 0.4 s freeze of the compressed clock × 18, the game time it already took.
   */
  FREE_KICK_COUNTDOWN: 7.2,
  /** A free kick within this many yards of the goal it attacks uses the freeKick_Attack/_Defend layouts. */
  DANGEROUS_FREE_KICK_DIST: 25,
  /** Penalty: game-seconds of dead ball before the kick is resolved (2 s × 18, stage 2). */
  PENALTY_COUNTDOWN: 36,
  /** Penalty spot distance from the goal line (yards). */
  PENALTY_SPOT_DIST: 12,

  // ── FM fouls (stage 13 of the engine rebuild, `FM_FOULS` flag, `fouls.md` → "FM fouls") ──────────────────────
  FM: {
    /** Contact foul (`contact`): an opponent this close (yd) to the holder, out of recovery, leans on him. */
    CONTACT_RANGE: 1.6,
    /** Contact moments per second of play while somebody is that close. Each one is a foul check of kind `contact`. */
    CONTACT_RATE: 0.06,
    /** Base foul chance of a contact moment (then the usual angle, aggression, technique, energy… multipliers). */
    CONTACT_BASE: 0.35,
    /** × on the contact rate by what the holder is doing: carrying at speed, just received, holding / turning. */
    CONTEXT_MULT: { carry: 1, reception: 1.2, hold: 0.7 },
    /** Share of the contact fouls committed by the holder on the man leaning on him (FM: the fouling team's own
     *  carry or hold, 14% of the fouls, R8). */
    HOLDER_OFFENDER_SHARE: 0.14,
    /** FM card per foul (R9: 0.16 yellow per foul). The yellow chance is YELLOW_BASE × severity; severity = 1 for a
     *  plain foul, × BEHIND_MULT from behind, × PROMISING_MULT when it stops a promising attack. YELLOW_BASE is
     *  0.16 over the severity of an assumed foul mix (25% from behind, 15% stopping an attack): 0.16 / 1.24. */
    YELLOW_BASE: 0.13,
    BEHIND_MULT: 1.5,
    PROMISING_MULT: 2.0,
    /** A promising attack: the fouled player on the ball, at most this far from the goal he attacks, past the
     *  offender (the offender is level or behind). */
    PROMISING_DIST: 45,
  },
} as const;

applyEnvOverrides(FOUL_CONFIG, 'FOUL_OVERRIDES');
