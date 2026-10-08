import rolesData from "@/Data/roles.json";
import { DEFAULT_DP_WEIGHTS, type RoleDPWeights } from "@/GameEngine/PlayerDevelopment";
import { preferredRole } from "@/Domain/positions/positionAptitude";
import type { RosterPlayer } from "@/types/playerTypes";

const ROLES = rolesData as unknown as Record<string, { dpWeights?: RoleDPWeights }>;

/**
 * DP weights of the player's natural detailed role (`positions.md`). `positions[0]` is only the line
 * ("Defender", "Midfielder"...) in the world data, so reading it would give every outfield player the default.
 */
export function dpWeightsFor(player: RosterPlayer): RoleDPWeights {
  return ROLES[preferredRole(player)]?.dpWeights ?? DEFAULT_DP_WEIGHTS;
}
