import type { PlayerRole } from '@/GameEngine/types';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/GameEngine/Domain/pitch';

/** A formation slot as stored in formation JSONs — absolute coords in yards. */
export interface FormationShape {
  id: string;
  attacking: { role: string; x: number; y: number }[];
  defending?: { role: string; x: number; y: number }[];
}

/** A resolved slot with role and display position (0–100 scale). */
export interface FormationSlot {
  role: PlayerRole;
  x: number;
  y: number;
}

/**
 * Expand a formation's slot array into display positions (0–100 scale).
 *
 * Coordinate mapping (engine → display):
 *   engine X (0→115, depth)  → display Y (100→0, top = attack end)
 *   engine Y (0→74, left–right) → display X (0→100)
 */
export function getFormationSlots(formation: FormationShape, phase: 'attacking' | 'defending' = 'attacking'): FormationSlot[] {
  const slots = phase === 'attacking' || !formation.defending
    ? formation.attacking
    : formation.defending!;

  return slots.map((slot) => ({
    role: slot.role as PlayerRole,
    x: (slot.y / PITCH_WIDTH) * 100,
    y: 100 - (slot.x / PITCH_LENGTH) * 100,
  }));
}
