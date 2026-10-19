// The rivals feed I/O (multiplayer part 6): the day's human games into `rivalsFeed.json`. Pure rules: `@/Domain/rivals`.
import type { SaveService } from "@/backend/SaveService";
import { listSaveMembers } from "@/backend/auth/saveOwnership";
import { getSocialUser } from "@/backend/social/socialStore";
import { buildSeatResults, mergeFeed, type ResultSeat } from "@/Domain/rivals/results";
import type { SeatResult } from "@/types/rivalsTypes";
import type { SeatState } from "@/types/seatTypes";

/** Adds results to the feed (idempotent by id, newest first, capped). */
export async function appendRivalsFeed(service: SaveService, saveId: string, results: readonly SeatResult[]): Promise<void> {
  if (results.length === 0) return;
  const cur = await service.getRivalsFeed(saveId);
  const next = mergeFeed(cur, results);
  if (next.length === cur.length && next.every((r, i) => r.id === cur[i]!.id)) return;
  await service.writeRivalsFeed(saveId, next);
}

/**
 * The human clubs' games among the day's events (`outcome.payload.events`), written to the feed. Returns them all
 * (also the ones a re-run day already had), for `world_results`. The seats are the ones before the day ran.
 */
export async function recordDayResults(
  service: SaveService, saveId: string, date: string, events: unknown, seats: readonly { seatId: string; seat: SeatState }[],
): Promise<SeatResult[]> {
  const members = listSaveMembers(saveId);
  const resultSeats: ResultSeat[] = seats
    .filter(({ seat }) => !!seat.clubId && !seat.unemployed)
    .map(({ seatId, seat }) => {
      const m = members.find((x) => x.seatId === seatId);
      const nickname = (m ? getSocialUser(m.userId)?.nickname : null) ?? seat.manager?.name ?? "?";
      return { seatId, clubId: seat.clubId, nickname };
    });
  if (resultSeats.length === 0) return [];
  const index = await service.getSquadIndex(saveId);
  const seatName = new Map(seats.map(({ seat }) => [seat.clubId, seat.clubName]));
  const results = buildSeatResults({
    date, events, seats: resultSeats, clubName: (id) => index.byId(id)?.name ?? seatName.get(id) ?? id,
  });
  await appendRivalsFeed(service, saveId, results);
  return results;
}
