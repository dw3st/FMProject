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
import type { OopRoleId, PressLevel, RoleVariantId, SlotInstruction } from '@/types/tacticsTypes';

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
  /** Stays back at attacking box set pieces too: never in the box, the edge or the short option (8.8.9). */
  staysBack?: true;
}

export const ROLE_VARIANTS: Record<RoleVariantId, RoleVariant> = {
  // ── Full-backs ────────────────────────────────────────────────────────────
  fb_overlap: {
    roles: ['LB', 'RB'],
    engine: {
      bounds: { maxX: 85 },
      offBallIntentWeights: { make_run: 0.35, hold_space: 0.45 },
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
    staysBack: true,
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
    staysBack: true,
  },
  // ── Centre-backs ──────────────────────────────────────────────────────────
  cb_stopper: {
    roles: ['CB'],
    engine: {
      defensiveIntentWeights: { track_mark: 0.85, press_holder: 0.55, step_into_carry_lane: 0.55, hold_shape: 0.55 },
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
      bounds: { maxX: 60 },
      offBallIntentWeights: { make_run: 0, hold_space: 0.8, offer_support: 0.7 },
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
    engine: { offBallIntentWeights: { make_run: 0.85 }, passTargetWeight: 0.6 },
    anchor: { attack: { dx: 0, dyIn: 9 } },
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
const PRESS_LEVEL_MULT: Record<PressLevel, { press_holder: number; step_into_carry_lane: number }> = {
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
  // Stage 20 (4c-6): duty, the role out of possession (when it fits the slot) and the player's own levels.
  const duty = instr.duty && instr.duty !== 'support' ? instr.duty : undefined;
  const oop = instr.oop && oopFitsRole(instr.oop, role) ? instr.oop : undefined;
  const levels: Partial<Pick<SlotInstruction, PlayerLevelKey>> = {};
  for (const k of PLAYER_LEVEL_KEYS) if (instr[k] !== undefined) levels[k] = instr[k];
  if (!variant && !press && !duty && !oop && Object.keys(levels).length === 0) return undefined;
  return {
    ...(variant ? { variant } : {}), ...(press ? { press } : {}), ...(duty ? { duty } : {}), ...(oop ? { oop } : {}), ...levels,
  };
}

/** The player instructions a slot can carry (stage 20; five levels like the team's). */
export const PLAYER_LEVEL_KEYS = ['shooting', 'dribbling', 'crossing', 'positioning'] as const;
export type PlayerLevelKey = typeof PLAYER_LEVEL_KEYS[number];

/**
 * Roles out of possession (stage 20, 4c-6): what a slot does without the ball, on top of its role — multipliers on its
 * defensive intent weights and a shift of its defending anchor (yards along the attacking direction).
 */
export const OOP_ROLES: Record<OopRoleId, {
  roles: readonly string[];
  weights: Partial<Record<'hold_shape' | 'track_mark' | 'press_holder' | 'step_into_carry_lane', number>>;
  defendDx?: number;
}> = {
  fb_press:  { roles: ['LB', 'RB', 'LWB', 'RWB'], weights: { press_holder: 1.3, step_into_carry_lane: 1.15 } },
  fb_stay:   { roles: ['LB', 'RB', 'LWB', 'RWB'], weights: { hold_shape: 1.25, press_holder: 0.7 } },
  cb_step:   { roles: ['CB'], weights: { step_into_carry_lane: 1.3, press_holder: 1.15 } },
  cb_cover:  { roles: ['CB'], weights: { hold_shape: 1.2, press_holder: 0.75 }, defendDx: -2 },
  dm_screen: { roles: ['CDM', 'CM'], weights: { hold_shape: 1.25, track_mark: 1.1, press_holder: 0.8 } },
  cm_press:  { roles: ['CDM', 'CM', 'CAM'], weights: { press_holder: 1.3 } },
  w_track:   { roles: ['LW', 'RW', 'LM', 'RM'], weights: { track_mark: 1.3 }, defendDx: -4 },
  w_stay:    { roles: ['LW', 'RW', 'LM', 'RM'], weights: { hold_shape: 0.8, track_mark: 0.7 }, defendDx: 6 },
  st_press:  { roles: ['ST', 'CAM'], weights: { press_holder: 1.35 } },
  st_rest:   { roles: ['ST'], weights: { press_holder: 0.6, hold_shape: 1.1 } },
};

export function isOopRoleId(v: unknown): v is OopRoleId {
  return typeof v === 'string' && Object.hasOwn(OOP_ROLES, v);
}

export function oopFitsRole(id: OopRoleId, role: string): boolean {
  return OOP_ROLES[id]?.roles.includes(role) ?? false;
}

/** The out-of-possession roles a slot's role accepts. */
export function oopRolesForRole(role: string): OopRoleId[] {
  return (Object.keys(OOP_ROLES) as OopRoleId[]).filter((id) => oopFitsRole(id, role));
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
  if (!eff || (!eff.variant && !eff.press && !eff.oop)) return base;
  const v = eff.variant ? ROLE_VARIANTS[eff.variant].engine : {};
  const pm = PRESS_LEVEL_MULT[eff.press ?? 'normal'];
  const def = { ...base.defensiveIntentWeights, ...v.defensiveIntentWeights };
  if (eff.oop) {
    for (const [k, m] of Object.entries(OOP_ROLES[eff.oop].weights) as [keyof typeof def, number][]) def[k] = def[k] * m;
  }
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
  const a = instr?.variant ? ROLE_VARIANTS[instr.variant]?.anchor : undefined;
  const off = phase === 'attacking' ? a?.attack : a?.defend;
  const oopDx = phase === 'defending' && instr?.oop ? OOP_ROLES[instr.oop]?.defendDx ?? 0 : 0;
  if (!oopDx) return off;
  return { dx: (off?.dx ?? 0) + oopDx, dyIn: off?.dyIn ?? 0 };
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
