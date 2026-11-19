import rolesData from "@/Data/roles.json";
import { DEFAULT_DP_WEIGHTS, DEFAULT_MENTAL_WEIGHTS, type MentalWeights, type RoleDPWeights } from "@/GameEngine/PlayerDevelopment";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import type { RosterPlayer } from "@/types/playerTypes";

const ROLES = rolesData as unknown as Record<string, { dpWeights?: RoleDPWeights; mentalWeights?: MentalWeights }>;

/**
 * DP weights of the player's natural detailed role (`positions.md`). `positions[0]` is only the line
 * ("Defender", "Midfielder"...) in the world data, so reading it would give every outfield player the default.
 */
export function dpWeightsFor(player: RosterPlayer): RoleDPWeights {
  return ROLES[preferredRole(player)]?.dpWeights ?? DEFAULT_DP_WEIGHTS;
}

/** Split of the mental DP pool for the player's natural role (`roles.json → mentalWeights`, `mental.md`). */
export function mentalWeightsFor(player: RosterPlayer): MentalWeights {
  return ROLES[preferredRole(player)]?.mentalWeights ?? DEFAULT_MENTAL_WEIGHTS;
}

/**
 * Playing out of position adapts a player slowly (tester report, 2026-11-16): the match DP of a player who played
 * a slot other than his natural position goes `MATCH_SHARE` to that slot's weights and the rest to his own. The
 * total DP never changes, only where it goes. Much slower than individual training at that position, which sends
 * all of the training DP there (with the area focus on top).
 */
export const POSITION_ADAPT = { MATCH_SHARE: 0.25 } as const;

/** Match DP weights of a player who played `role` (absent, unknown or his natural one = his own weights). */
export function matchDpWeights(player: RosterPlayer, role?: string): RoleDPWeights {
  const own = dpWeightsFor(player);
  const slot = role ? ROLES[role]?.dpWeights : undefined;
  if (!slot || role === preferredRole(player)) return own;
  const s = POSITION_ADAPT.MATCH_SHARE;
  const out = { ...own };
  for (const k of Object.keys(out) as (keyof RoleDPWeights)[]) out[k] = (1 - s) * (own[k] ?? 0) + s * (slot[k] ?? 0);
  return out;
}

/**
 * The slot role each player of a side played: the starters' slots, then a substitute takes the slot of the player
 * he replaced (in the order of the substitutions). Roster ids.
 */
export function playedRoles(
  lineup: readonly string[],
  slotRoles: readonly string[],
  substitutions: readonly { playerOutId: string; playerInId: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  lineup.forEach((id, i) => { if (id && slotRoles[i]) out[id] = slotRoles[i]!; });
  for (const s of substitutions) if (out[s.playerOutId] && !out[s.playerInId]) out[s.playerInId] = out[s.playerOutId]!;
  return out;
}
