import { getStarPlayers } from "@/backend/starsIndex";
import { breaksStarLimit, STAR_LIMIT } from "@/Domain/squad/starLimit";
import type { Squad } from "@/types/playerTypes";

/** The world's top players today (the gold stars of `getStarPlayers`): the same list the screens show. */
export async function topIdsOf(saveId: string): Promise<Set<string>> {
  const stars = await getStarPlayers(saveId);
  return new Set(Object.entries(stars ?? {}).filter(([, k]) => k === "gold").map(([id]) => id));
}

/** 409 `starLimit` when the human club cannot bring `playerId` in (`STAR_LIMIT`); null when it can. */
export async function starLimitResponse(saveId: string, buyer: Pick<Squad, "players">, playerId: string): Promise<Response | null> {
  return breaksStarLimit(buyer, playerId, await topIdsOf(saveId))
    ? Response.json({ error: "starLimit", max: STAR_LIMIT.MAX }, { status: 409 })
    : null;
}
