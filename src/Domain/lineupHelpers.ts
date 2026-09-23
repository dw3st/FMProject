import type { RosterPlayer } from "@/types/playerTypes";
import type { FormationSlot } from "@/types/formationSlots";
import { Player } from "@/Domain/Player";
import { getMainRole } from "@/GameInterface/positionHelpers";

/**
 * Auto-fills a lineup from available players for a given set of formation slots.
 *
 * Priority per slot:
 *  1. Players whose `positions` list includes the exact slot role (best score first).
 *  2. Any remaining unassigned player, scored by the slot's weighted score.
 *
 * Exported separately so non-player teams (AI squads) can reuse the same logic.
 */
export function autoFillLineup(slots: FormationSlot[], players: RosterPlayer[]): string[] {
  const used = new Set<string>();
  const result: string[] = new Array(slots.length).fill("");

  // First pass: assign the best role-matched player to each slot (exact code, or same main role).
  for (let i = 0; i < slots.length; i++) {
    const role = slots[i]!.role;
    const roleMain = getMainRole(role);
    const candidates = players
      .filter(
        (p) =>
          !used.has(p.id) &&
          (p.positions.includes(role) || getMainRole(p.positions[0] ?? "CM") === roleMain),
      )
      .sort((a, b) => Player.weightedScore(b.stats, role) - Player.weightedScore(a.stats, role));

    if (candidates[0]) {
      result[i] = candidates[0].id;
      used.add(candidates[0].id);
    }
  }

  // Second pass: fill any remaining slots with the best available player by slot score.
  for (let i = 0; i < slots.length; i++) {
    if (result[i]) continue;
    const role = slots[i]!.role;
    const remaining = players
      .filter((p) => !used.has(p.id))
      .sort((a, b) => Player.weightedScore(b.stats, role) - Player.weightedScore(a.stats, role));

    if (remaining[0]) {
      result[i] = remaining[0].id;
      used.add(remaining[0].id);
    }
  }

  return result;
}

/**
 * Like `autoFillLineup` but factors in `seasonLog.fitness` so fatigued players
 * are deprioritised for starting positions. Used by AI clubs for initial lineup selection.
 *
 * Score blend: 70 % weighted stat score + 30 % fitness (0–100 normalised to 0–1 scale).
 */
export function autoFillLineupWithEnergy(slots: FormationSlot[], players: RosterPlayer[]): string[] {
  const used = new Set<string>();
  const result: string[] = new Array(slots.length).fill('');

  function blendedScore(p: RosterPlayer, role: string): number {
    const stat    = Player.weightedScore(p.stats, role);
    const fitness = (p.seasonLog?.fitness ?? 100) / 100;
    return stat * 0.7 + fitness * 10 * 0.3; // fitness scaled to same ~0–10 range
  }

  // First pass: best role-matched player per slot
  for (let i = 0; i < slots.length; i++) {
    const role = slots[i]!.role;
    const roleMain = getMainRole(role);
    const candidates = players
      .filter(
        (p) =>
          !used.has(p.id) &&
          (p.positions.includes(role) || getMainRole(p.positions[0] ?? 'CM') === roleMain),
      )
      .sort((a, b) => blendedScore(b, role) - blendedScore(a, role));

    if (candidates[0]) {
      result[i] = candidates[0].id;
      used.add(candidates[0].id);
    }
  }

  // Second pass: fill remaining slots
  for (let i = 0; i < slots.length; i++) {
    if (result[i]) continue;
    const role = slots[i]!.role;
    const remaining = players
      .filter((p) => !used.has(p.id))
      .sort((a, b) => blendedScore(b, role) - blendedScore(a, role));

    if (remaining[0]) {
      result[i] = remaining[0].id;
      used.add(remaining[0].id);
    }
  }

  return result;
}

/**
 * Returns true when the player's primary role does not match the slot's role at the main-role level
 * (GK / Defender / Midfielder / Forward). Detailed codes (CB vs LB) no longer matter — only whether
 * the slot and the player's main position are in the same band.
 */
export function isOutOfPosition(player: RosterPlayer, slotRole: string): boolean {
  const primary = player.positions[0] ?? "CM";
  return getMainRole(primary) !== getMainRole(slotRole);
}

/**
 * Indices 0–10 match formation slot indices. Saved lineup IDs are placed first; any empty slots are
 * filled from remaining players in squad order (same idea as auto-fill gaps).
 */
export function buildSlotAlignedLineup(
  players: RosterPlayer[],
  lineupIds: string[],
): (RosterPlayer | undefined)[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const ordered: (RosterPlayer | undefined)[] = new Array(11).fill(undefined);
  const used = new Set<string>();

  for (let i = 0; i < Math.min(lineupIds.length, 11); i++) {
    const id = lineupIds[i];
    if (id) {
      const p = byId.get(id);
      if (p) {
        ordered[i] = p;
        used.add(id);
      }
    }
  }

  const remaining = players.filter((p) => !used.has(p.id));
  let ri = 0;
  for (let i = 0; i < 11; i++) {
    if (!ordered[i] && ri < remaining.length) {
      ordered[i] = remaining[ri];
      used.add(remaining[ri]!.id);
      ri++;
    }
  }
  return ordered;
}

/** Higher = better fit for the slot: exact position code → same main-role band → mismatch. */
export function slotRoleFitRank(player: RosterPlayer, slotRole: string): number {
  if (player.positions.includes(slotRole)) return 2;
  if (getMainRole(player.positions[0] ?? "CM") === getMainRole(slotRole)) return 1;
  return 0;
}
