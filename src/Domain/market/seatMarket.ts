import type { MarketState, SeatMarketState, WorldMarketState } from "@/types/transferMarketTypes";

export function emptySeatMarket(): SeatMarketState {
  return { playerSellList: [] };
}

export function emptyWorldMarket(): WorldMarketState {
  return { shuffledTeamIds: [], rotationIndex: 0, profiles: {} };
}

/**
 * The market as the domain functions read it: the world's rotation + one seat's fields. Null only when
 * neither file exists (a market written by a route before the first tick has no rotation yet).
 */
export function joinMarket(world: WorldMarketState | null, seat: SeatMarketState | null): MarketState | null {
  if (!world && !seat) return null;
  return { ...(world ?? emptyWorldMarket()), ...(seat ?? emptySeatMarket()) };
}

export function splitMarket(market: MarketState): { world: WorldMarketState; seat: SeatMarketState } {
  const { shuffledTeamIds, rotationIndex, profiles, ...seat } = market;
  return { world: { shuffledTeamIds, rotationIndex, profiles }, seat };
}
