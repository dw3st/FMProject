import { calcMatchdayRevenue, calcWeeklyDelta } from "@/backend/FinancialService";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

/**
 * Money change for the player's club on this advance-day tick:
 * weekly P/L on Mondays, plus home matchday ticket revenue when applicable.
 */
export function computeAdvanceDayMoneyDelta(args: {
  currentDate: string;
  todayFixtures: Fixture[];
  playerSquadId: string | undefined;
  playerSquad: Squad | null;
}): number {
  const { currentDate, todayFixtures, playerSquadId, playerSquad } = args;
  const dayOfWeek = new Date(currentDate + "T12:00:00").getDay();
  const isWeeklyTick = dayOfWeek === 1;

  let moneyDelta = 0;

  if (
    isWeeklyTick ||
    (playerSquadId && todayFixtures.some((f) => f.home === playerSquadId))
  ) {
    if (playerSquad) {
      if (isWeeklyTick) {
        moneyDelta += calcWeeklyDelta(playerSquad);
      }
      if (playerSquadId) {
        for (const fixture of todayFixtures) {
          if (fixture.home === playerSquadId) {
            moneyDelta += calcMatchdayRevenue(playerSquad);
          }
        }
      }
    }
  }

  return moneyDelta;
}

/**
 * Resolve the human-controlled club's squad id from league standings.
 *
 * `playerClubSlug` is save meta `clubId`, which may be the numeric `squadId` (e.g. "135")
 * or the standings text slug (e.g. "cruzeiro"). Older code only compared the map value
 * (always the text slug) to meta — so numeric ids never matched and league sims ignored
 * user tactics.
 */
export function resolvePlayerSquadId(
  standingsForLeague: Array<{ squadId: string; slug?: string }> | undefined,
  idToClubSlug: Map<string, string> | undefined,
  playerClubSlug: string,
): string | undefined {
  if (!standingsForLeague?.length) return undefined;
  for (const row of standingsForLeague) {
    if (row.squadId === playerClubSlug) return row.squadId;
    if (row.slug === playerClubSlug) return row.squadId;
    if (idToClubSlug?.get(row.squadId) === playerClubSlug) return row.squadId;
  }
  return undefined;
}
