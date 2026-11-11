import { fameShare } from "@/Domain/managers/assets";
import { saveService } from "@/backend/SaveService";

/**
 * What the human manager brings to a wage demand: his Negotiation attribute (`.claude/rules/game/achievements.md`) and
 * the fame of his belongings (`fameShare`, 8.9.39).
 */
export async function managerDemandCtx(saveId: string, seatId: string): Promise<{ negotiation: number; fame: number }> {
  const [achievements, seat] = await Promise.all([saveService.getAchievements(saveId, seatId), saveService.getSeat(saveId, seatId)]);
  return { negotiation: achievements.attributes.negotiation, fame: fameShare(seat?.managerAssets) };
}
