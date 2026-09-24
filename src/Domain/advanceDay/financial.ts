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
