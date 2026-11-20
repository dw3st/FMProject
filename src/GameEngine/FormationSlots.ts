/**
 * FormationSlots — resolves absolute player positions from formation slot definitions.
 *
 * Each formation JSON defines attacking and defending slot arrays. Each slot names a role
 * and provides absolute x/y position (Team A reference frame). A team attacking −x uses that frame
 * turned 180° (both x and y mirrored), so left stays the team's own left.
 *
 * resolveBasePosition() is called every tick by Positioning.ts to get the phase-appropriate
 * anchor for a player.
 */

import type { Formation, FormationSlotDef, Phase } from '@/GameEngine/types';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/GameEngine/Domain/pitch';
import type { SlotInstruction } from '@/types/tacticsTypes';
import { applyAnchorOffset, instructionAnchor } from '@/GameEngine/Configs/RoleVariantConfig';
import type { TeamId } from '@/GameEngine/types';
import { DECISION_FLAGS } from '@/GameEngine/Configs/DecisionConfig';
import { INSTR, instrDelta } from '@/GameEngine/Configs/InstructionConfig';

/**
 * Compute the absolute field position for a player's formation slot in the given phase.
 *
 * Uses `attackDir` (not `team`) so the result is correct both at match start and after
 * half-time side switching (when Team A's attackDir becomes -1).
 *
 * @param slotIndex  The player's stable slot index (0–10).
 * @param attackDir  +1 = attacks toward x=115 (left-to-right); -1 = right-to-left.
 * @param formation  The formation containing attacking and defending slot arrays.
 * @param phase      Which shape to use.
 */
export function resolveBasePosition(
  slotIndex: number,
  attackDir: 1 | -1,
  formation: Formation,
  phase: Phase,
): { x: number; y: number } {
  const slots: FormationSlotDef[] = phase === 'attacking' ? formation.attacking : formation.defending;
  const slot = slots[slotIndex];
  if (!slot) return { x: 57, y: 37 };
  // A team attacking −x is Team A's frame turned 180° (x AND y), so its left winger plays on its
  // own left (#142); mirroring x only would put him on the other flank.
  return attackDir === -1
    ? { x: PITCH_LENGTH - slot.x, y: PITCH_WIDTH - slot.y }
    : { x: slot.x, y: slot.y };
}

/**
 * The slot position a player actually anchors on: `resolveBasePosition` shifted by the slot
 * instruction's role-variant anchor (`RoleVariantConfig`, player instructions). Without an
 * instruction this is exactly `resolveBasePosition`.
 */
export function slotBasePosition(
  player: { slotIndex: number; attackDir: 1 | -1; instruction?: SlotInstruction; team?: TeamId; role?: string },
  formation: Formation,
  phase: Phase,
): { x: number; y: number } {
  const base = resolveBasePosition(player.slotIndex, player.attackDir, formation, phase);
  const pos = applyAnchorOffset(base, instructionAnchor(player.instruction, phase), player.attackDir);
  return player.team ? applyInstructionAnchor(pos, player as { team: TeamId; role?: string; attackDir: 1 | -1; instruction?: SlotInstruction }, phase) : pos;
}

const FULL_BACKS = new Set(['LB', 'RB', 'LWB', 'RWB']);

/**
 * Stage 20 (4c-5/6): the team instructions that move a slot's anchor. With the ball, overlap pushes the full-backs up,
 * underlap tucks them in, and a slot's duty (defend / attack) pulls it back or pushes it up; without it, the pressing
 * trap shifts the block toward the centre (force outside) or the touchlines (force inside). Nothing at the template.
 */
function applyInstructionAnchor(
  pos: { x: number; y: number },
  p: { team: TeamId; role?: string; attackDir: 1 | -1; instruction?: SlotInstruction },
  phase: Phase,
): { x: number; y: number } {
  if (!DECISION_FLAGS.TEAM_INSTRUCTIONS) return pos;
  let dx = 0; let dyIn = 0;
  if (phase === 'attacking') {
    const fl = p.role && FULL_BACKS.has(p.role) ? instrDelta(p.team, 'flanks') : 0;
    if (fl > 0) dx += INSTR.OVERLAP_DX * fl;
    else if (fl < 0) dyIn += INSTR.UNDERLAP_IN * -fl;
    const duty = p.instruction?.duty;
    if (duty === 'attack') dx += INSTR.DUTY_DX;
    else if (duty === 'defend') dx -= INSTR.DUTY_DX;
  } else if (p.role && p.role !== 'GK') {
    // The pressing trap: forcing outside closes the centre (the block shifts in), forcing inside opens it.
    const tr = instrDelta(p.team, 'trap');
    if (tr !== 0) dyIn += INSTR.TRAP_SHIFT_YD * tr;
  }
  if (dx === 0 && dyIn === 0) return pos;
  return applyAnchorOffset(pos, { dx, dyIn }, p.attackDir);
}
