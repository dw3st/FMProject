/**
 * RoleVariantConfig — player instructions per formation slot (Etapa 27,
 * `.claude/rules/game/player-instructions.md`).
 *
 * A role variant is a set of ALTERNATIVE values for fields the engine already reads from the
 * `roles.json` `engine` block (bounds, biases, intent weights) plus an optional shift of the slot's
 * anchor (the same geometry a formation JSON defines). No new bias fields: a variant only replaces
 * values. Individual pressing scales the two defensive press weights the style already scales.
 *
 * `resolveSlotTuning(role)` with no instruction returns the SAME object as `roleEngine(role)`, so
 * the default is the identity by construction.
 */

import type { PlayerRole } from '@/GameEngine/types';
import { roleEngine, type RoleEngineTuning } from '@/GameEngine/Domain/roleEngineData';
import type { PressLevel, RoleVariantId, SlotInstruction } from '@/types/tacticsTypes';

/** Anchor shift in yards: `dx` > 0 = toward the opponent's goal, `dyIn` > 0 = toward y 37. */
export interface AnchorOffset {
  dx:   number;
  dyIn: number;
}

/** A variant's overrides. `engine` values REPLACE the role's; nested objects are merged per key. */
export interface RoleVariant {
  roles: PlayerRole[];
  engine: {
    bounds?:                 Partial<RoleEngineTuning['bounds']>;
    carryBias?:              number;
    offBallBias?:            number;
    passBias?:               number;
    passTargetWeight?:       number;
    offBallIntentWeights?:   Partial<RoleEngineTuning['offBallIntentWeights']>;
    defensiveIntentWeights?: Partial<RoleEngineTuning['defensiveIntentWeights']>;
  };
  anchor?: { attack?: AnchorOffset; defend?: AnchorOffset };
}

export const ROLE_VARIANTS: Record<RoleVariantId, RoleVariant> = {
  // ── Full-backs ────────────────────────────────────────────────────────────
  fb_overlap: {
    roles: ['LB', 'RB'],
    engine: {
      bounds: { maxX: 85 },
      offBallIntentWeights: { make_run: 0.45, hold_space: 0.35 },
      carryBias: 0.6,
      offBallBias: 0.35,
    },
    anchor: { attack: { dx: 12, dyIn: 0 } },
  },
  fb_hold: {
    roles: ['LB', 'RB'],
    engine: {
      bounds: { maxX: 50 },
      offBallIntentWeights: { make_run: 0.05, hold_space: 0.8 },
      carryBias: 0.2,
    },
    anchor: { attack: { dx: -8, dyIn: 0 } },
  },
  fb_inverted: {
    roles: ['LB', 'RB'],
    engine: {
      offBallIntentWeights: { offer_support: 0.8, hold_space: 0.5, make_run: 0.1 },
      passBias: 0.5,
      passTargetWeight: 0.7,
    },
    anchor: { attack: { dx: 0, dyIn: 14 } },
  },
  // ── Wing-backs ────────────────────────────────────────────────────────────
  wb_attack: {
    roles: ['LWB', 'RWB'],
    engine: { bounds: { maxX: 100 }, offBallIntentWeights: { make_run: 0.55 } },
    anchor: { attack: { dx: 12, dyIn: 0 } },
  },
  wb_defend: {
    roles: ['LWB', 'RWB'],
    engine: { bounds: { maxX: 70 }, offBallIntentWeights: { make_run: 0.1, hold_space: 0.8 } },
    anchor: { attack: { dx: -11, dyIn: 0 } },
  },
  // ── Centre-backs ──────────────────────────────────────────────────────────
  cb_stopper: {
    roles: ['CB'],
    engine: {
      defensiveIntentWeights: { track_mark: 0.85, press_holder: 0.6, step_into_carry_lane: 0.6, hold_shape: 0.55 },
    },
  },
  cb_cover: {
    roles: ['CB'],
    engine: { defensiveIntentWeights: { hold_shape: 0.8, press_holder: 0.4 } },
    anchor: { defend: { dx: -3, dyIn: 0 } },
  },
  cb_ball: {
    roles: ['CB'],
    engine: {
      carryBias: 0.35,
      passBias: -0.15,
      bounds: { maxX: 60 },
      offBallIntentWeights: { offer_support: 0.45 },
    },
  },
  // ── Defensive midfielder ──────────────────────────────────────────────────
  dm_anchor: {
    roles: ['CDM'],
    engine: {
      bounds: { maxX: 55 },
      offBallIntentWeights: { make_run: 0, hold_space: 0.9, offer_support: 0.6 },
      defensiveIntentWeights: { hold_shape: 0.75, press_holder: 0.5 },
    },
    anchor: { attack: { dx: -5, dyIn: 0 } },
  },
  dm_box: {
    roles: ['CDM'],
    engine: { bounds: { maxX: 80 }, offBallIntentWeights: { make_run: 0.35 }, carryBias: 0.5 },
    anchor: { attack: { dx: 6, dyIn: 0 } },
  },
  // ── Central midfielder ────────────────────────────────────────────────────
  cm_link: {
    roles: ['CM'],
    engine: {
      offBallIntentWeights: { offer_support: 1.5, make_run: 0.15 },
      passBias: 1.4,
      carryBias: 0.35,
    },
    anchor: { attack: { dx: -6, dyIn: 0 } },
  },
  cm_box: {
    roles: ['CM'],
    engine: {
      offBallIntentWeights: { make_run: 0.5, offer_support: 1.0 },
      bounds: { maxX: 95 },
      defensiveIntentWeights: { press_holder: 0.75 },
    },
    anchor: { attack: { dx: 3, dyIn: 0 } },
  },
  // ── Attacking midfielder ──────────────────────────────────────────────────
  am_link: {
    roles: ['CAM'],
    engine: { offBallIntentWeights: { offer_support: 1.2, make_run: 0.3 }, passBias: 0.8 },
    anchor: { attack: { dx: -4, dyIn: 0 } },
  },
  am_shadow: {
    roles: ['CAM'],
    engine: { offBallIntentWeights: { make_run: 0.8, offer_support: 0.7 }, bounds: { maxX: 100 } },
    anchor: { attack: { dx: 6, dyIn: 0 } },
  },
  // ── Wide midfielder ───────────────────────────────────────────────────────
  wm_inside: {
    roles: ['LM', 'RM'],
    engine: { offBallIntentWeights: { offer_support: 0.75 }, passBias: 0.6 },
    anchor: { attack: { dx: 0, dyIn: 14 } },
  },
  // ── Winger ────────────────────────────────────────────────────────────────
  w_inside: {
    roles: ['LW', 'RW'],
    engine: { offBallIntentWeights: { make_run: 0.8 }, passTargetWeight: 0.6 },
    anchor: { attack: { dx: 0, dyIn: 11 } },
  },
  // ── Striker ───────────────────────────────────────────────────────────────
  st_poacher: {
    roles: ['ST'],
    engine: {
      bounds: { minX: 55 },
      offBallIntentWeights: { offer_support: 0.15, make_run: 0.9, hold_space: 0.5 },
      carryBias: 0.45,
      passBias: -0.5,
    },
    anchor: { attack: { dx: 4, dyIn: 0 } },
  },
  st_target: {
    roles: ['ST'],
    engine: {
      offBallIntentWeights: { offer_support: 0.55, make_run: 0.4, hold_space: 0.8 },
      passTargetWeight: 1.0,
      passBias: 0.3,
      carryBias: 0.35,
    },
    anchor: { attack: { dx: 3, dyIn: 0 } },
  },
};

export const ROLE_VARIANT_IDS = Object.keys(ROLE_VARIANTS) as RoleVariantId[];

/** Individual pressing: multipliers on the two press weights (`press_holder`, `step_into_carry_lane`). */
export const PRESS_LEVEL_MULT: Record<PressLevel, { press_holder: number; step_into_carry_lane: number }> = {
  less:   { press_holder: 0.6, step_into_carry_lane: 0.8 },
  normal: { press_holder: 1,   step_into_carry_lane: 1 },
  more:   { press_holder: 1.4, step_into_carry_lane: 1.15 },
};

export function isRoleVariantId(v: unknown): v is RoleVariantId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ROLE_VARIANTS, v);
}

/** Variants a slot role accepts (in catalog order). Empty for the goalkeeper. */
export function variantsForRole(role: string): RoleVariantId[] {
  return ROLE_VARIANT_IDS.filter(id => ROLE_VARIANTS[id].roles.includes(role as PlayerRole));
}

export function variantFitsRole(variant: RoleVariantId, role: string): boolean {
  return ROLE_VARIANTS[variant].roles.includes(role as PlayerRole);
}

/** True when the instruction changes nothing (absent variant, normal/absent pressing). */
export function isDefaultInstruction(instr: SlotInstruction | null | undefined): boolean {
  return !instr || (!instr.variant && (!instr.press || instr.press === 'normal'));
}

/**
 * The instruction a slot of `role` actually plays: a variant the role does not accept falls back
 * to the default (pressing stays; the goalkeeper takes no pressing). `undefined` = default.
 */
export function effectiveInstruction(
  role: string,
  instr: SlotInstruction | null | undefined,
): SlotInstruction | undefined {
  if (!instr || role === 'GK') return undefined;
  const variant = instr.variant && variantFitsRole(instr.variant, role) ? instr.variant : undefined;
  const press = instr.press && instr.press !== 'normal' ? instr.press : undefined;
  if (!variant && !press) return undefined;
  return { ...(variant ? { variant } : {}), ...(press ? { press } : {}) };
}

/**
 * Engine tuning of a slot: the role's `roles.json` tuning + the variant's values + the pressing
 * scale. The default instruction returns the very same object as `roleEngine(role)`.
 */
export function resolveSlotTuning(
  role: PlayerRole,
  instr: SlotInstruction | null | undefined,
): RoleEngineTuning {
  const base = roleEngine(role);
  const eff = effectiveInstruction(role, instr);
  if (!eff) return base;
  const v = eff.variant ? ROLE_VARIANTS[eff.variant].engine : {};
  const pm = PRESS_LEVEL_MULT[eff.press ?? 'normal'];
  const def = { ...base.defensiveIntentWeights, ...v.defensiveIntentWeights };
  return {
    ...base,
    ...(v.carryBias        !== undefined ? { carryBias:        v.carryBias }        : {}),
    ...(v.offBallBias      !== undefined ? { offBallBias:      v.offBallBias }      : {}),
    ...(v.passBias         !== undefined ? { passBias:         v.passBias }         : {}),
    ...(v.passTargetWeight !== undefined ? { passTargetWeight: v.passTargetWeight } : {}),
    bounds: { ...base.bounds, ...v.bounds },
    offBallIntentWeights: { ...base.offBallIntentWeights, ...v.offBallIntentWeights },
    defensiveIntentWeights: {
      ...def,
      press_holder:         def.press_holder * pm.press_holder,
      step_into_carry_lane: def.step_into_carry_lane * pm.step_into_carry_lane,
    },
  };
}

/** Anchor shift of an instruction for a phase (`undefined` = none). */
export function instructionAnchor(
  instr: SlotInstruction | null | undefined,
  phase: 'attacking' | 'defending',
): AnchorOffset | undefined {
  if (!instr?.variant) return undefined;
  const a = ROLE_VARIANTS[instr.variant]?.anchor;
  return phase === 'attacking' ? a?.attack : a?.defend;
}

const CENTRE_Y = 37;

/**
 * Shift a slot position (absolute coords) by an anchor offset: `dx` along the attacking direction,
 * `dyIn` toward the centre line (y 37; never past it), a negative `dyIn` toward the touchline.
 * Mirrored by side (y above / below 37) and by team (attackDir).
 */
export function applyAnchorOffset(
  pos: { x: number; y: number },
  offset: AnchorOffset | undefined,
  attackDir: 1 | -1,
): { x: number; y: number } {
  if (!offset || (offset.dx === 0 && offset.dyIn === 0)) return pos;
  const x = pos.x + offset.dx * attackDir;
  const toCentre = CENTRE_Y - pos.y;
  const side = Math.abs(toCentre) < 0.5 ? 0 : Math.sign(toCentre);
  let y = pos.y;
  if (side !== 0) {
    y = offset.dyIn > 0
      ? pos.y + side * Math.min(offset.dyIn, Math.abs(toCentre))
      : pos.y + side * offset.dyIn;
  }
  return { x: Math.max(1, Math.min(114, x)), y: Math.max(1, Math.min(73, y)) };
}
