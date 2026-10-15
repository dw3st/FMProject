import { SEAT_ID_PATTERN, SEAT_KEYS, type SeatState } from "@/types/seatTypes";

const SEAT_KEY_SET: ReadonlySet<string> = new Set<string>(SEAT_KEYS);

/** True for a key that lives in `seat.json` (not in the world meta). */
export function isSeatKey(key: string): key is keyof SeatState {
  return SEAT_KEY_SET.has(key);
}

/** The world meta merged with one seat: the shape the meta had before seats (plus `seatId`). */
export function metaForSeat<W extends object>(world: W, seatId: string, seat: SeatState): W & SeatState & { seatId: string } {
  return { ...world, ...seat, seatId };
}

/**
 * Splits a merged patch into the world part and the seat part. A key set to `undefined` is kept (it clears
 * the field when spread); `seatId` is dropped (it is never stored).
 */
export function splitSeatPatch(patch: object): { world: Record<string, unknown>; seat: Partial<SeatState> } {
  const world: Record<string, unknown> = {};
  const seat: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (key === "seatId") continue;
    (isSeatKey(key) ? seat : world)[key] = (patch as Record<string, unknown>)[key];
  }
  return { world, seat: seat as Partial<SeatState> };
}

const SEAT_MANAGER_PREFIX = "seat:";

/** Id of a seat's manager in `managers.json`. */
export function seatManagerId(seatId: string): string {
  return `${SEAT_MANAGER_PREFIX}${seatId}`;
}

/** The seat behind a manager id, or null for an AI / national-team manager. */
export function seatIdOfManager(managerId: string): string | null {
  return managerId.startsWith(SEAT_MANAGER_PREFIX) ? managerId.slice(SEAT_MANAGER_PREFIX.length) : null;
}

export function isValidSeatId(id: string): boolean {
  return SEAT_ID_PATTERN.test(id);
}
