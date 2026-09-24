import rolesJson from '@/Data/roles.json';
import type { PlayerRole } from '@/GameEngine/types';

/** Engine tuning for a pitch role — extends `roles.json` `engine` block. */
export interface RoleEngineTuning {
  ballSupportScale: number;
  yRange: number;
  bounds: { minX: number; maxX: number };
  /** 0..1 — tendency to carry when on the ball (DecisionTree). */
  carryBias: number;
  /** 0..1 — off-ball attacking movement / create-space threshold (OffBallMovement). */
  offBallBias: number;
  /** Added to team carry weights for off-ball lane scoring (clamped per weight). */
  offBallCarryDeltas: {
    clearance: number;
    progress: number;
    angle: number;
    crowd: number;
    dropLaneBias: number;
    widthBias: number;
  };
  /**
   * −1..1 — tendency to pass when on the ball (DecisionTree.evalPass), the pass
   * mirror of carryBias. × PASS_CONFIG.ROLE_BIAS_WEIGHT is added to the pass
   * action raw score. Midfielders circulate (> 0); centre-backs / full-backs
   * recycle less and carry or play forward instead (< 0). 0 = neutral.
   */
  passBias: number;
  /**
   * 0..1 — how much this role is a preferred pass target (PassLanes receiver
   * role fit). 0.5 = neutral; midfielders > 0.5 are the circulation hub, CB/GK
   * < 0.5 are last-resort recycling targets. Scaled by the team's
   * RECEIVER_ROLE_WEIGHT (build_up style).
   */
  passTargetWeight: number;
  /** Base weights for off-ball intent selection — scaled by tactic multipliers and context. */
  offBallIntentWeights: {
    offer_support: number;
    hold_space:    number;
    make_run:      number;
  };
  /** Base weights for defensive intent selection — scaled by tactic multipliers and context. */
  defensiveIntentWeights: {
    hold_shape:           number;
    track_mark:           number;
    press_holder:         number;
    step_into_carry_lane: number;
  };
}

const roles = rolesJson as Record<PlayerRole, { mainRole: string; engine: RoleEngineTuning }>;

export function roleEngine(role: PlayerRole): RoleEngineTuning {
  return roles[role].engine;
}

/** Main role ("GK" | "Defender" | "Midfielder" | "Forward") of a detailed role, from roles.json. */
export function mainRoleOf(role: PlayerRole): string {
  return roles[role].mainRole;
}
