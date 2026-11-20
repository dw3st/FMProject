/**
 * AttackingPositioning — target-position computation for players when their team
 * has the ball.
 *
 * Influences applied (in order):
 *   1. Formation slot for the attacking phase (role anchor)
 *   2. Ball influence — nearby players drift toward the ball's Y/X
 *   3. Spacing — push away from close teammates to avoid crowding
 *   4. Positional freedom — blend anchor with dynamic target
 *   5. Offside awareness — try (imperfectly) to stay behind the offside line
 *
 * No side effects. No gameState imports (avoids circular deps).
 */

import { DECISION_FLAGS } from '@/GameEngine/Configs/DecisionConfig';
import { FM_NUMBERS } from '@/GameEngine/Configs/FmNumbersConfig';
import { getMainRole } from '@/Domain/roles';
import { fmKeeperTarget, keeperAttackingTarget } from '@/GameEngine/Domain/Keeper';
import { KEEPER_CONFIG } from '@/GameEngine/Configs/KeeperConfig';
import type { GamePlayer, Formation } from '@/GameEngine/types';
import { slotBasePosition } from '@/GameEngine/FormationSlots';
import { ATTACK_CONFIG, POSSESSION_PUSH_UP, PUSH_UP_ROLE_BIAS, getTeamAttackWidth } from '@/GameEngine/Configs/AttackConfig';
import type { TeamId } from '@/GameEngine/types';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/GameEngine/Domain/pitch';
import { fmShapePoint, shapeFormationOf } from '@/GameEngine/Domain/TeamShape';
import { TEAM_SHAPE } from '@/GameEngine/Configs/ShapeConfig';

/**
 * The attacking slot of a player adjusted to the moment:
 *  1. Team width (`getTeamAttackWidth`, the `width` axis): the lateral spread of the slots around
 *     the pitch centre line is scaled by width / normal width — `normal` is the formation as drawn,
 *     `narrow` pulls every slot toward y 37, `wide` pushes them toward the touchlines.
 *  2. Box convergence: forward slots (x ≥ 70 in the attacking frame) close in on the goal as the
 *     ball advances into the final third (`BOX_CONVERGENCE` at the ball 100 yds up the pitch).
 * Used by every attacking anchor (positioning, off-ball runs, hold_space) so the shape stays one.
 */
/** Slots (and ball positions) from this attacking-frame x take part in the box convergence. */
const BOX_CONVERGENCE_FROM_X = 70;
/** Yards of ball advance over which the convergence ramps to its full value. */
const BOX_CONVERGENCE_SPAN   = 30;

/**
 * The block slides with the ball (stage 4b, `fm-numbers.md`): in possession the whole shape moves up IN_ADVANCE_YD
 * plus IN_PUSH × (ball depth − halfway) — a uniform shift, never a squeeze toward the ball. 0 with the flag off.
 */
export function blockShiftX(
  player: { attackDir: 1 | -1; role?: string; team?: TeamId; basePosition?: { x: number; y: number } },
  ballPos: { x: number; y: number },
): number {
  // FM's block (stage 15): the shift is where the shape puts his slot, against the slot itself.
  if (DECISION_FLAGS.FM_SHAPE && TEAM_SHAPE.APPLY_IN && player.team && player.basePosition) {
    const f = shapeFormationOf(player.team);
    if (f) return fmShapePoint(player.basePosition, player, ballPos, 'attacking', f).x - player.basePosition.x;
  }
  if (!DECISION_FLAGS.SLIDING_BLOCK) return 0;
  const relBall = player.attackDir === 1 ? ballPos.x : PITCH_LENGTH - ballPos.x;
  // The back of the team moves up most; the front already stands on the other side's line, and pushing it
  // further only crowds the ball (stage 4b, round 2).
  const main = player.role ? getMainRole(player.role) : 'Midfielder';
  const line = main === 'Defender' || main === 'GK' ? FM_NUMBERS.IN_SHIFT_BY_LINE.DEF
    : main === 'Forward' ? FM_NUMBERS.IN_SHIFT_BY_LINE.FWD : FM_NUMBERS.IN_SHIFT_BY_LINE.MID;
  return player.attackDir * line * (FM_NUMBERS.IN_ADVANCE_YD + FM_NUMBERS.IN_PUSH * (relBall - PITCH_LENGTH / 2));
}

export function attackingAnchor(
  base: { x: number; y: number },
  player: { team: TeamId; attackDir: 1 | -1; role?: string },
  ballPos: { x: number; y: number },
): { x: number; y: number } {
  const centre = PITCH_WIDTH / 2;
  const relBase = player.attackDir === 1 ? base.x : PITCH_LENGTH - base.x;
  const tacticWidth = getTeamAttackWidth(player.team) / ATTACK_CONFIG.ATTACK_WIDTH;
  const f = DECISION_FLAGS.FM_SHAPE && TEAM_SHAPE.APPLY_IN ? shapeFormationOf(player.team) : undefined;
  let x: number;
  let y: number;
  if (f) {
    // FM's block (stage 15, `team-shape.md`): back line at FM's depth for the ball, span and width of FM's shape.
    const p = fmShapePoint(base, player, ballPos, 'attacking', f, 0.6, tacticWidth);
    x = p.x; y = p.y;
  } else {
    const spread = tacticWidth * (DECISION_FLAGS.SLIDING_BLOCK ? FM_NUMBERS.IN_WIDTH : 1);
    y = centre + (base.y - centre) * spread;
    // The block slides with the ball (stage 4b, `fm-numbers.md`): in possession the whole shape moves up behind it.
    x = Math.max(1, Math.min(PITCH_LENGTH - 1, base.x + blockShiftX(player, ballPos)));
  }
  if (relBase >= BOX_CONVERGENCE_FROM_X) {
    const relBall = player.attackDir === 1 ? ballPos.x : PITCH_LENGTH - ballPos.x;
    const t = Math.max(0, Math.min(1, (relBall - BOX_CONVERGENCE_FROM_X) / BOX_CONVERGENCE_SPAN));
    y += (centre - y) * ATTACK_CONFIG.BOX_CONVERGENCE * t;
  }
  return { x, y: Math.max(1, Math.min(PITCH_WIDTH - 1, y)) };
}

export function computeAttackingPosition(
  player: GamePlayer,
  ballPos: { x: number; y: number },
  allPlayers: GamePlayer[],
  formation: Formation,
  offsideLine: number | null,
  possessionTime: number = 0,
): { x: number; y: number } {
  // The keeper steps up with the play instead of holding his slot (`Keeper.ts`).
  // Stage 11: FM's keeper steps up with his team's ball by the band of its distance (`Keeper.ts`).
  if (player.role === 'GK' && DECISION_FLAGS.FM_KEEPER) return fmKeeperTarget(player, ballPos, true);
  if (player.role === 'GK' && KEEPER_CONFIG.ATTACK_ENABLED) return keeperAttackingTarget(player, ballPos);
  const { ballSupportScale, bounds } = player;

  const base    = attackingAnchor(slotBasePosition(player, formation, 'attacking'), player, ballPos);
  const anchorX = base.x;
  const anchorY = base.y;

  let rawX = anchorX;
  let rawY = anchorY;

  // ── Ball influence — pull toward ball support position ───────────────────
  const distToBall = Math.sqrt(
    (ballPos.x - player.x) ** 2 + (ballPos.y - player.y) ** 2,
  );
  const influenceRange  = ATTACK_CONFIG.SUPPORT_DISTANCE * 2;
  const proximityFactor = Math.max(0, 1 - distToBall / influenceRange);
  const influenceWeight = ballSupportScale * ATTACK_CONFIG.BALL_INFLUENCE_WEIGHT * proximityFactor;

  rawY += (ballPos.y - anchorY) * influenceWeight;
  rawX += (ballPos.x - anchorX) * influenceWeight * 0.25;

  // ── Spacing — push away from close teammates ─────────────────────────────
  const teammates = allPlayers.filter(p => p.team === player.team && p.id !== player.id);
  let pushX = 0;
  let pushY = 0;
  for (const tm of teammates) {
    const dx   = player.x - tm.x;
    const dy   = player.y - tm.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.1 || dist >= ATTACK_CONFIG.SUPPORT_DISTANCE) continue;
    const strength = (ATTACK_CONFIG.SUPPORT_DISTANCE - dist) / ATTACK_CONFIG.SUPPORT_DISTANCE;
    pushX += (dx / dist) * strength;
    pushY += (dy / dist) * strength;
  }
  rawX += pushX * ATTACK_CONFIG.SPACING_WEIGHT;
  rawY += pushY * ATTACK_CONFIG.SPACING_WEIGHT;

  // ── Positional freedom — blend anchor with dynamic target ────────────────
  rawX = anchorX + (rawX - anchorX) * ATTACK_CONFIG.POSITIONAL_FREEDOM;
  rawY = anchorY + (rawY - anchorY) * ATTACK_CONFIG.POSITIONAL_FREEDOM;

  // ── Possession push-up — sustained possession drives the defensive line up ─
  // Linear ramp: 50% effect at 5 s, full effect at 10 s.
  // Defenders push furthest; forwards are already in their attacking zone.
  const pushUpT    = Math.min(1, possessionTime / POSSESSION_PUSH_UP.BASE_SECONDS);
  const pushUpBias = PUSH_UP_ROLE_BIAS[player.role] ?? 0;
  // FM's block (stage 15) already puts the back line where it plays with the ball: no possession push-up on top.
  if (pushUpBias > 0 && pushUpT > 0 && !(DECISION_FLAGS.FM_SHAPE && TEAM_SHAPE.APPLY_IN && shapeFormationOf(player.team))) {
    rawX += player.attackDir * pushUpT * POSSESSION_PUSH_UP.MAX_YARDS * pushUpBias;
  }

  // ── Offside awareness — try to stay behind the offside line ─────────────
  if (offsideLine !== null) {
    const fwd     = player.attackDir;
    const safeX   = offsideLine - fwd * ATTACK_CONFIG.OFFSIDE_MARGIN;
    const overrun = (rawX - safeX) * fwd;

    if (overrun > 0) {
      rawX -= overrun * ATTACK_CONFIG.OFFSIDE_AWARENESS * fwd;
    }
  }

  return {
    x: Math.max(0, Math.min(PITCH_LENGTH, rawX)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, rawY)),
  };
}
